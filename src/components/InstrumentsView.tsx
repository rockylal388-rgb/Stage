import React, { useState } from 'react';
import {
  MidiCCMap,
  MidiDeviceInfo,
  MidiLearnableParam,
  MidiMessageLog,
  VelocityCurve,
} from '../types/synth';
import { synthEngine } from '../audio/synthEngine';
import { midiManager } from '../audio/midiManager';
import { Usb, Mic, Volume2, RefreshCw, RotateCcw } from 'lucide-react';

interface InstrumentsViewProps {
  audioReady: boolean;
  onEnableAudio: () => Promise<void>;
  midiSupported: boolean;
  midiError: string | null;
  midiDevices: MidiDeviceInfo[];
  selectedInputId: string | 'all';
  onSelectInputId: (id: string | 'all') => void;
  channelFilter: number | 'all';
  onChannelFilterChange: (ch: number | 'all') => void;
  velocityCurve: VelocityCurve;
  onVelocityCurveChange: (curve: VelocityCurve) => void;
  onRefreshMidi: () => Promise<void>;
  midiLogs: MidiMessageLog[];
  onClearLogs: () => void;
  midiCCMap: MidiCCMap;
  midiLearnParam: MidiLearnableParam | null;
  onSelectMidiLearnParam: (param: MidiLearnableParam | null) => void;
  onResetCCMap: () => void;
}

const LEARNABLE_PARAMS: { key: MidiLearnableParam; label: string }[] = [
  { key: 'filterCutoff', label: 'Filter Cutoff' },
  { key: 'filterResonance', label: 'Filter Resonance' },
  { key: 'osc2Level', label: 'Oscillator 2 Mix' },
  { key: 'subLevel', label: 'Sub Bass Level' },
  { key: 'ampAttack', label: 'Amp Attack' },
  { key: 'ampRelease', label: 'Amp Release' },
  { key: 'drive', label: 'Analog Drive' },
  { key: 'chorusMix', label: 'Stereo Chorus' },
  { key: 'delayMix', label: 'Delay Wet Mix' },
  { key: 'reverbMix', label: 'Hall Reverb Mix' },
  { key: 'lfoRate', label: 'LFO Rate' },
  { key: 'lfoDepth', label: 'LFO Depth' },
];

export const InstrumentsView: React.FC<InstrumentsViewProps> = ({
  audioReady,
  onEnableAudio,
  midiSupported,
  midiError,
  midiDevices,
  selectedInputId,
  onSelectInputId,
  channelFilter,
  onChannelFilterChange,
  velocityCurve,
  onVelocityCurveChange,
  onRefreshMidi,
  midiLogs,
  onClearLogs,
  midiCCMap,
  midiLearnParam,
  onSelectMidiLearnParam,
  onResetCCMap,
}) => {
  const [extAudioName, setExtAudioName] = useState<string | null>(null);
  const [extAudioError, setExtAudioError] = useState<string | null>(null);
  const [extGain, setExtGain] = useState(0.85);

  const latency = synthEngine.getLatencyMs();
  const inputs = midiDevices.filter((d) => d.type === 'input');
  const outputs = midiDevices.filter((d) => d.type === 'output');

  const handleToggleExtAudio = async () => {
    if (extAudioName) {
      synthEngine.disconnectExternalAudioInput();
      setExtAudioName(null);
      setExtAudioError(null);
      return;
    }
    try {
      setExtAudioError(null);
      const label = await synthEngine.connectExternalAudioInput();
      setExtAudioName(label);
    } catch (err) {
      setExtAudioError(
        err instanceof Error ? err.message : 'Could not access external audio input.'
      );
    }
  };

  const getCCForParam = (param: MidiLearnableParam): number | null => {
    for (const [cc, p] of Object.entries(midiCCMap)) {
      if (p === param) return Number(cc);
    }
    return null;
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Row 1: Low-Latency Audio Engine + External Instrument Audio Input */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Audio Engine Diagnostics */}
        <div className="bg-[#12151C] border border-[#232732] rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#222631]">
            <h2 className="text-base font-display font-semibold text-neutral-100">
              Low-Latency Audio Output
            </h2>
            <span className={`text-xs font-medium ${audioReady ? 'text-emerald-400' : 'text-amber-400'}`}>
              {audioReady ? 'Running (Interactive)' : 'Standby'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="bg-[#0D1016] border border-[#202531] rounded-lg p-3 flex flex-col gap-1">
              <span className="text-neutral-400">Base Latency</span>
              <span className="font-mono text-base font-semibold text-neutral-100">
                {audioReady ? `${latency.baseMs} ms` : '—'}
              </span>
            </div>
            <div className="bg-[#0D1016] border border-[#202531] rounded-lg p-3 flex flex-col gap-1">
              <span className="text-neutral-400">Output Latency</span>
              <span className="font-mono text-base font-semibold text-neutral-100">
                {audioReady ? `${latency.outputMs} ms` : '—'}
              </span>
            </div>
            <div className="bg-[#0D1016] border border-[#202531] rounded-lg p-3 flex flex-col gap-1">
              <span className="text-neutral-400">Sample Rate</span>
              <span className="font-mono text-base font-semibold text-neutral-100">
                {(latency.sampleRate / 1000).toFixed(1)} kHz
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={async () => {
                await onEnableAudio();
                await synthEngine.playChord([60, 64, 67], 450, 90);
              }}
              className="h-9 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#0B0D11] text-xs font-semibold flex items-center gap-2 transition-colors"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>{audioReady ? 'Test Audio Tone' : 'Initialize Low-Latency Audio'}</span>
            </button>
            <p className="text-xs text-neutral-400">
              Uses Web Audio <span className="font-mono">interactive</span> scheduling hint for stage response.
            </p>
          </div>
        </div>

        {/* External Hardware Audio Interface Routing */}
        <div className="bg-[#12151C] border border-[#232732] rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#222631]">
            <h2 className="text-base font-display font-semibold text-neutral-100">
              External Audio Instrument Input
            </h2>
            <span className={`text-xs font-medium ${extAudioName ? 'text-emerald-400' : 'text-neutral-400'}`}>
              {extAudioName ? 'Live Routed' : 'Disconnected'}
            </span>
          </div>

          <p className="text-xs text-neutral-300 leading-relaxed">
            Route a hardware synthesizer, electric guitar, or audio interface line-in directly through
            KlangStage&apos;s Drive, Chorus, Delay, and Hall Reverb processor with echo cancellation
            disabled.
          </p>

          {extAudioError && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {extAudioError}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4">
            <button
              type="button"
              onClick={handleToggleExtAudio}
              className={`h-9 px-4 rounded-lg border text-xs font-medium flex items-center gap-2 transition-colors ${
                extAudioName
                  ? 'bg-red-500/15 border-red-500/50 text-red-300 hover:bg-red-500/25'
                  : 'bg-[#191D27] border-[#2A303E] text-neutral-100 hover:border-amber-500/60'
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span>{extAudioName ? `Disconnect (${extAudioName})` : 'Connect Audio Line-In'}</span>
            </button>

            <div className="flex items-center gap-3 min-w-[180px]">
              <span className="text-xs text-neutral-400">Input Gain</span>
              <input
                type="range"
                min={0}
                max={1.5}
                step={0.05}
                value={extGain}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setExtGain(val);
                  synthEngine.setExternalInputGain(val);
                }}
                className="synth-slider flex-1"
              />
              <span className="text-xs font-mono text-amber-400 w-10 text-right">
                {Math.round(extGain * 100)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Hardware MIDI Devices & Performance Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-6 bg-[#12151C] border border-[#232732] rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#222631]">
            <div className="flex items-center gap-2">
              <Usb className="w-4 h-4 text-amber-400" />
              <h2 className="text-base font-display font-semibold text-neutral-100">
                Hardware MIDI Controllers
              </h2>
            </div>
            <button
              type="button"
              onClick={onRefreshMidi}
              className="h-8 px-3 rounded-md bg-[#191D27] border border-[#2A303E] hover:border-amber-500/60 text-xs font-medium text-neutral-200 flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Scan Devices</span>
            </button>
          </div>

          {!midiSupported || midiError ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-200 leading-relaxed">
              {midiError ||
                'Web MIDI API is unavailable in this browser context. Use Chrome or Edge with USB-MIDI or Bluetooth MIDI connected.'}
            </div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="midi-input-select" className="text-xs text-neutral-400">
                MIDI Input Source
              </label>
              <select
                id="midi-input-select"
                value={selectedInputId}
                onChange={(e) => onSelectInputId(e.target.value)}
                className="h-9 bg-[#0D1016] border border-[#262B38] rounded-lg px-2.5 text-xs text-neutral-100"
              >
                <option value="all">All Connected Inputs ({inputs.length})</option>
                {inputs.map((inp) => (
                  <option key={inp.id} value={inp.id}>
                    {inp.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="midi-ch-select" className="text-xs text-neutral-400">
                MIDI Channel
              </label>
              <select
                id="midi-ch-select"
                value={channelFilter === 'all' ? 'all' : String(channelFilter)}
                onChange={(e) =>
                  onChannelFilterChange(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
                className="h-9 bg-[#0D1016] border border-[#262B38] rounded-lg px-2.5 text-xs text-neutral-100"
              >
                <option value="all">Omni (All 1–16)</option>
                {Array.from({ length: 16 }, (_, i) => i + 1).map((ch) => (
                  <option key={ch} value={ch}>
                    Channel {ch}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="midi-vel-select" className="text-xs text-neutral-400">
                Velocity Curve
              </label>
              <select
                id="midi-vel-select"
                value={velocityCurve}
                onChange={(e) => onVelocityCurveChange(e.target.value as VelocityCurve)}
                className="h-9 bg-[#0D1016] border border-[#262B38] rounded-lg px-2.5 text-xs text-neutral-100"
              >
                <option value="linear">Linear (Natural)</option>
                <option value="soft">Soft (Light Touch)</option>
                <option value="hard">Hard (Dynamic)</option>
                <option value="fixed">Fixed (Stage Organ 104)</option>
              </select>
            </div>
          </div>

          {/* Connected Hardware List */}
          <div className="flex flex-col gap-2 pt-1">
            <span className="text-xs font-medium text-neutral-400">Detected MIDI Ports</span>
            {midiDevices.length === 0 ? (
              <div className="rounded-lg bg-[#0D1016] border border-[#202531] p-4 text-xs text-neutral-400">
                No USB or virtual MIDI keyboards detected yet. Plug in any class-compliant MIDI
                keyboard, controller, or pad bank and click Scan Devices.
              </div>
            ) : (
              <div className="divide-y divide-[#1E222C] border border-[#202531] rounded-lg bg-[#0D1016]">
                {midiDevices.map((dev) => (
                  <div
                    key={`${dev.type}-${dev.id}`}
                    className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0 flex flex-col">
                      <span className="font-medium text-neutral-100 truncate">{dev.name}</span>
                      <span className="text-[11px] text-neutral-400">
                        {dev.type.toUpperCase()} · {dev.manufacturer}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[11px] font-medium ${
                          dev.state === 'connected' ? 'text-emerald-400' : 'text-neutral-500'
                        }`}
                      >
                        {dev.state}
                      </span>
                      {dev.type === 'output' && dev.state === 'connected' && (
                        <button
                          type="button"
                          onClick={() => midiManager.sendTestNoteOut(dev.id, 60)}
                          className="px-2 py-1 rounded bg-[#191D27] border border-[#2A303E] text-[11px] text-neutral-200 hover:border-amber-500/60"
                        >
                          Send C4
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {outputs.length === 0 && inputs.length > 0 && (
                  <div className="px-3.5 py-2 text-[11px] text-neutral-500">
                    MIDI Input active. Connect a hardware synth MIDI-In port to see MIDI Outputs.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* MIDI CC Learn Mapping Matrix */}
        <div className="lg:col-span-6 bg-[#12151C] border border-[#232732] rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#222631]">
            <div>
              <h2 className="text-base font-display font-semibold text-neutral-100">
                Hardware Knob &amp; CC Mapping
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Click Bind CC on any parameter, then turn a knob on your MIDI controller.
              </p>
            </div>
            <button
              type="button"
              onClick={onResetCCMap}
              className="h-8 px-3 rounded-md bg-[#191D27] border border-[#2A303E] hover:border-neutral-500 text-xs font-medium text-neutral-300 flex items-center gap-1.5 transition-colors shrink-0"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {LEARNABLE_PARAMS.map(({ key, label }) => {
              const cc = getCCForParam(key);
              const isWaiting = midiLearnParam === key;
              return (
                <div
                  key={key}
                  className="bg-[#0D1016] border border-[#202531] rounded-lg px-3 py-2.5 flex items-center justify-between gap-2"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-medium text-neutral-200 truncate">{label}</span>
                    <span className="text-[11px] font-mono text-neutral-400">
                      {cc !== null ? `Bound to CC #${cc}` : 'Unassigned'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectMidiLearnParam(isWaiting ? null : key)}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors whitespace-nowrap shrink-0 ${
                      isWaiting
                        ? 'bg-amber-500 text-[#0B0D11] border-amber-400 font-semibold'
                        : 'bg-[#191D27] border-[#2A303E] text-neutral-300 hover:border-amber-500/60'
                    }`}
                  >
                    {isWaiting ? 'Move Knob...' : 'Bind CC'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Row 3: Live Incoming Hardware MIDI Stream */}
      <div className="bg-[#12151C] border border-[#232732] rounded-xl p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-100">Incoming MIDI Activity</h2>
          <button
            type="button"
            onClick={onClearLogs}
            className="text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            Clear
          </button>
        </div>

        {midiLogs.length === 0 ? (
          <p className="text-xs text-neutral-400 py-3">
            No incoming hardware MIDI messages recorded yet. Play notes or twist knobs on a
            connected MIDI controller to inspect real-time events.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#222631] text-neutral-400">
                  <th className="py-2 pr-4 font-medium">Time</th>
                  <th className="py-2 pr-4 font-medium">Device</th>
                  <th className="py-2 pr-4 font-medium">Channel</th>
                  <th className="py-2 pr-4 font-medium">Event</th>
                  <th className="py-2 font-medium text-right">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A1E28] font-mono">
                {midiLogs.slice(0, 12).map((log) => (
                  <tr key={log.id} className="text-neutral-200">
                    <td className="py-2 pr-4 text-neutral-400">{log.timestamp}</td>
                    <td className="py-2 pr-4 font-sans truncate max-w-[180px]">{log.deviceName}</td>
                    <td className="py-2 pr-4">Ch {log.channel}</td>
                    <td className="py-2 pr-4 text-amber-400">{log.type}</td>
                    <td className="py-2 text-right">{log.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
