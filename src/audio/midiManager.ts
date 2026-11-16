import { MidiDeviceInfo, MidiMessageLog, VelocityCurve } from '../types/synth';

export interface MidiCallbacks {
  onNoteOn: (note: number, velocity: number, deviceName: string, channel: number) => void;
  onNoteOff: (note: number, deviceName: string, channel: number) => void;
  onControlChange: (cc: number, value: number, deviceName: string, channel: number) => void;
  onPitchBend: (semitones: number, deviceName: string, channel: number) => void;
  onDevicesChanged: (devices: MidiDeviceInfo[]) => void;
  onMessageLog: (entry: MidiMessageLog) => void;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiNoteToName(note: number): string {
  const octave = Math.floor(note / 12) - 1;
  return `${NOTE_NAMES[note % 12]}${octave}`;
}

export function applyVelocityCurve(velocity: number, curve: VelocityCurve): number {
  const norm = Math.max(0, Math.min(1, velocity / 127));
  switch (curve) {
    case 'soft':
      return Math.round(Math.pow(norm, 0.65) * 127);
    case 'hard':
      return Math.round(Math.pow(norm, 1.65) * 127);
    case 'fixed':
      return 104;
    case 'linear':
    default:
      return velocity;
  }
}

export class WebMidiManager {
  private access: MIDIAccess | null = null;
  private callbacks: MidiCallbacks | null = null;
  private selectedInputId: string | 'all' = 'all';
  private channelFilter: number | 'all' = 'all';
  private velocityCurve: VelocityCurve = 'linear';
  private logCounter = 0;

  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
  }

  public async connect(callbacks: MidiCallbacks): Promise<{ supported: boolean; error?: string }> {
    this.callbacks = callbacks;
    if (!this.isSupported()) {
      return {
        supported: false,
        error: 'Web MIDI API is not available in this browser context. Use Chrome/Edge/Opera over HTTPS or localhost for hardware USB-MIDI.',
      };
    }

    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
      this.bindInputs();
      this.access.onstatechange = () => {
        this.bindInputs();
      };
      return { supported: true };
    } catch (err) {
      return {
        supported: true,
        error: err instanceof Error ? err.message : 'MIDI permission denied.',
      };
    }
  }

  public setSelectedInput(id: string | 'all') {
    this.selectedInputId = id;
  }

  public setChannelFilter(ch: number | 'all') {
    this.channelFilter = ch;
  }

  public setVelocityCurve(curve: VelocityCurve) {
    this.velocityCurve = curve;
  }

  private bindInputs() {
    if (!this.access || !this.callbacks) return;
    const devices: MidiDeviceInfo[] = [];

    this.access.inputs.forEach((input) => {
      devices.push({
        id: input.id,
        name: input.name || 'USB MIDI Input',
        manufacturer: input.manufacturer || 'Generic Hardware',
        state: input.state,
        type: 'input',
      });
      input.onmidimessage = (event) => this.handleMessage(input.id, input.name || 'MIDI Input', event);
    });

    this.access.outputs.forEach((output) => {
      devices.push({
        id: output.id,
        name: output.name || 'USB MIDI Output',
        manufacturer: output.manufacturer || 'Generic Hardware',
        state: output.state,
        type: 'output',
      });
    });

    this.callbacks.onDevicesChanged(devices);
  }

  private handleMessage(deviceId: string, deviceName: string, event: MIDIMessageEvent) {
    if (!this.callbacks || !event.data || event.data.length < 1) return;
    if (this.selectedInputId !== 'all' && this.selectedInputId !== deviceId) return;

    const status = event.data[0];
    const command = status & 0xf0;
    const channel = (status & 0x0f) + 1;

    if (command < 0xf0 && this.channelFilter !== 'all' && this.channelFilter !== channel) {
      return;
    }

    const d1 = event.data[1] ?? 0;
    const d2 = event.data[2] ?? 0;
    const now = new Date().toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    if (command === 0x90 && d2 > 0) {
      const curvedVel = applyVelocityCurve(d2, this.velocityCurve);
      this.callbacks.onNoteOn(d1, curvedVel, deviceName, channel);
      this.callbacks.onMessageLog({
        id: ++this.logCounter,
        timestamp: now,
        deviceName,
        channel,
        type: 'Note On',
        detail: `${midiNoteToName(d1)} · vel ${curvedVel}`,
      });
    } else if (command === 0x80 || (command === 0x90 && d2 === 0)) {
      this.callbacks.onNoteOff(d1, deviceName, channel);
      this.callbacks.onMessageLog({
        id: ++this.logCounter,
        timestamp: now,
        deviceName,
        channel,
        type: 'Note Off',
        detail: `${midiNoteToName(d1)}`,
      });
    } else if (command === 0xb0) {
      this.callbacks.onControlChange(d1, d2, deviceName, channel);
      this.callbacks.onMessageLog({
        id: ++this.logCounter,
        timestamp: now,
        deviceName,
        channel,
        type: 'CC',
        detail: `CC #${d1} · val ${d2}`,
      });
    } else if (command === 0xe0) {
      const raw14 = (d2 << 7) | d1;
      const normalized = (raw14 - 8192) / 8192;
      const semitones = normalized * 2;
      this.callbacks.onPitchBend(semitones, deviceName, channel);
      this.callbacks.onMessageLog({
        id: ++this.logCounter,
        timestamp: now,
        deviceName,
        channel,
        type: 'Pitch Bend',
        detail: `${semitones >= 0 ? '+' : ''}${semitones.toFixed(2)} st`,
      });
    }
  }

  public sendTestNoteOut(deviceId: string, note = 60) {
    if (!this.access) return;
    const out = this.access.outputs.get(deviceId);
    if (!out) return;
    out.send([0x90, note, 100]);
    window.setTimeout(() => {
      out.send([0x80, note, 0]);
    }, 300);
  }
}

export const midiManager = new WebMidiManager();
