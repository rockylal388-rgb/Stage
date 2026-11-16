import { SynthPatch } from '../types/synth';

interface ActiveVoice {
  note: number;
  baseFreq: number;
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  osc1Uni: OscillatorNode | null;
  osc2Uni: OscillatorNode | null;
  subOsc: OscillatorNode;
  noiseSrc: AudioBufferSourceNode | null;
  filter: BiquadFilterNode;
  ampGain: GainNode;
  lfoPitchGain: GainNode;
  lfoFilterGain: GainNode;
  lfoAmpGain: GainNode;
  released: boolean;
  releaseTimeout?: number;
}

function midiToFreq(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

function makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const k = amount * 65;
  const nSamples = 44100;
  const buffer = new ArrayBuffer(nSamples * 4);
  const curve = new Float32Array(buffer);
  const deg = Math.PI / 180;
  for (let i = 0; i < nSamples; ++i) {
    const x = (i * 2) / nSamples - 1;
    if (k <= 0.01) {
      curve[i] = x;
    } else {
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
  }
  return curve;
}

function createImpulseResponse(ctx: AudioContext, duration: number, decay: number): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * duration));
  const impulse = ctx.createBuffer(2, length, sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const env = Math.pow(1 - t, decay);
      data[i] = (Math.random() * 2 - 1) * env;
    }
  }
  return impulse;
}

function createNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const length = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

export class LowLatencySynthEngine {
  private ctx: AudioContext | null = null;
  private patch: SynthPatch | null = null;
  private voices = new Map<number, ActiveVoice>();
  private sustainedNotes = new Set<number>();
  private sustainPedalDown = false;
  private lastPlayedNote: number | null = null;
  private pitchBendSemitones = 0;
  private modWheelAmount = 0;

  // Master audio graph nodes
  private voiceBus!: GainNode;
  private driveShaper!: WaveShaperNode;
  private dryGain!: GainNode;
  private chorusDelay!: DelayNode;
  private chorusLfo!: OscillatorNode;
  private chorusLfoGain!: GainNode;
  private chorusWet!: GainNode;
  private delayNode!: DelayNode;
  private delayFeedbackGain!: GainNode;
  private delayDampFilter!: BiquadFilterNode;
  private delayWet!: GainNode;
  private reverbNode!: ConvolverNode;
  private reverbWet!: GainNode;
  private compressor!: DynamicsCompressorNode;
  private masterGain!: GainNode;
  private analyser!: AnalyserNode;
  private globalLfo!: OscillatorNode;
  private noiseBuffer: AudioBuffer | null = null;
  private lastReverbDecay = 2.0;

  // External hardware audio input
  private extStream: MediaStream | null = null;
  private extSource: MediaStreamAudioSourceNode | null = null;
  private extGain: GainNode | null = null;

  public async init(): Promise<void> {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx({ latencyHint: 'interactive' });
      this.buildMasterGraph(this.ctx);
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    if (this.patch) {
      this.applyPatchToMaster(this.patch);
    }
  }

  private buildMasterGraph(ctx: AudioContext) {
    this.noiseBuffer = createNoiseBuffer(ctx);

    this.voiceBus = ctx.createGain();
    this.voiceBus.gain.value = 0.6;

    this.driveShaper = ctx.createWaveShaper();
    this.driveShaper.curve = makeDistortionCurve(0.15);
    this.driveShaper.oversample = '2x';

    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 1.0;

    // Stereo-feel Chorus
    this.chorusDelay = ctx.createDelay(0.1);
    this.chorusDelay.delayTime.value = 0.018;
    this.chorusLfo = ctx.createOscillator();
    this.chorusLfo.type = 'sine';
    this.chorusLfo.frequency.value = 0.85;
    this.chorusLfoGain = ctx.createGain();
    this.chorusLfoGain.gain.value = 0.004;
    this.chorusLfo.connect(this.chorusLfoGain);
    this.chorusLfoGain.connect(this.chorusDelay.delayTime);
    this.chorusLfo.start();
    this.chorusWet = ctx.createGain();
    this.chorusWet.gain.value = 0.25;

    // Warm Delay
    this.delayNode = ctx.createDelay(2.0);
    this.delayNode.delayTime.value = 0.375;
    this.delayFeedbackGain = ctx.createGain();
    this.delayFeedbackGain.gain.value = 0.35;
    this.delayDampFilter = ctx.createBiquadFilter();
    this.delayDampFilter.type = 'lowpass';
    this.delayDampFilter.frequency.value = 3400;
    this.delayWet = ctx.createGain();
    this.delayWet.gain.value = 0.25;

    this.delayNode.connect(this.delayDampFilter);
    this.delayDampFilter.connect(this.delayFeedbackGain);
    this.delayFeedbackGain.connect(this.delayNode);
    this.delayDampFilter.connect(this.delayWet);

    // Procedural Convolution Reverb
    this.reverbNode = ctx.createConvolver();
    this.reverbNode.buffer = createImpulseResponse(ctx, 2.2, 2.4);
    this.reverbWet = ctx.createGain();
    this.reverbWet.gain.value = 0.3;

    // Master Limiter + Gain + Analyser
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -10;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 6;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.15;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0.74;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.78;

    // Global LFO
    this.globalLfo = ctx.createOscillator();
    this.globalLfo.type = 'sine';
    this.globalLfo.frequency.value = 2.5;
    this.globalLfo.start();

    // Routing
    this.voiceBus.connect(this.driveShaper);
    this.driveShaper.connect(this.dryGain);
    this.driveShaper.connect(this.chorusDelay);
    this.chorusDelay.connect(this.chorusWet);

    this.driveShaper.connect(this.delayNode);
    this.driveShaper.connect(this.reverbNode);
    this.reverbNode.connect(this.reverbWet);

    this.dryGain.connect(this.compressor);
    this.chorusWet.connect(this.compressor);
    this.delayWet.connect(this.compressor);
    this.reverbWet.connect(this.compressor);

    this.compressor.connect(this.masterGain);
    this.masterGain.connect(this.analyser);
    this.analyser.connect(ctx.destination);
  }

  public isReady(): boolean {
    return Boolean(this.ctx && this.ctx.state === 'running');
  }

  public getLatencyMs(): { baseMs: number; outputMs: number; sampleRate: number } {
    if (!this.ctx) {
      return { baseMs: 0, outputMs: 0, sampleRate: 48000 };
    }
    const baseMs = Math.round((this.ctx.baseLatency || 0) * 10000) / 10;
    const outputMs = Math.round(((this.ctx as AudioContext & { outputLatency?: number }).outputLatency || 0) * 10000) / 10;
    return { baseMs, outputMs, sampleRate: this.ctx.sampleRate };
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser || null;
  }

  public setPatch(nextPatch: SynthPatch) {
    this.patch = nextPatch;
    if (this.ctx) {
      this.applyPatchToMaster(nextPatch);
      this.updateActiveVoicesLive(nextPatch);
    }
  }

  private applyPatchToMaster(p: SynthPatch) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.driveShaper.curve = makeDistortionCurve(p.drive);
    this.chorusWet.gain.setTargetAtTime(p.chorusMix * 0.75, now, 0.02);
    this.delayNode.delayTime.setTargetAtTime(p.delayTime, now, 0.03);
    this.delayFeedbackGain.gain.setTargetAtTime(p.delayFeedback, now, 0.02);
    this.delayWet.gain.setTargetAtTime(p.delayMix, now, 0.02);
    this.reverbWet.gain.setTargetAtTime(p.reverbMix, now, 0.02);
    this.masterGain.gain.setTargetAtTime(p.masterGain, now, 0.02);

    this.globalLfo.type = p.lfoWave;
    this.globalLfo.frequency.setTargetAtTime(p.lfoRate, now, 0.02);

    if (Math.abs(p.reverbDecay - this.lastReverbDecay) > 0.35) {
      this.lastReverbDecay = p.reverbDecay;
      this.reverbNode.buffer = createImpulseResponse(this.ctx, Math.min(4.5, p.reverbDecay + 0.5), 2.2);
    }
  }

  private updateActiveVoicesLive(p: SynthPatch) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.voices.forEach((v) => {
      v.filter.type = p.filterType;
      const modCutoff = Math.min(18000, p.filterCutoff + this.modWheelAmount * 4500);
      v.filter.frequency.setTargetAtTime(modCutoff, now, 0.015);
      v.filter.Q.setTargetAtTime(p.filterResonance, now, 0.015);

      v.osc1.type = p.osc1Wave;
      v.osc2.type = p.osc2Wave;
      if (v.osc1Uni) v.osc1Uni.type = p.osc1Wave;
      if (v.osc2Uni) v.osc2Uni.type = p.osc2Wave;

      v.lfoFilterGain.gain.setTargetAtTime(
        p.lfoTarget === 'filter' ? (p.lfoDepth + this.modWheelAmount * 0.3) * 1400 : 0,
        now,
        0.02
      );
      v.lfoPitchGain.gain.setTargetAtTime(
        p.lfoTarget === 'pitch' ? (p.lfoDepth + this.modWheelAmount * 0.25) * 65 : 0,
        now,
        0.02
      );
      v.lfoAmpGain.gain.setTargetAtTime(p.lfoTarget === 'amp' ? p.lfoDepth * 0.35 : 0, now, 0.02);
    });
  }

  public async noteOn(note: number, velocity = 100): Promise<void> {
    if (!this.patch) return;
    await this.init();
    if (!this.ctx) return;

    // Retrigger cleanly if same note is already playing
    if (this.voices.has(note)) {
      this.destroyVoice(note);
    }

    // Voice stealing at 16 voices for rock-solid CPU headroom live
    if (this.voices.size >= 16) {
      const oldestKey = this.voices.keys().next().value;
      if (oldestKey !== undefined) {
        this.destroyVoice(oldestKey);
      }
    }

    const p = this.patch;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const velNorm = Math.max(0.08, Math.min(1, velocity / 127));

    const startFreq =
      this.lastPlayedNote !== null && p.glide > 0.002
        ? midiToFreq(this.lastPlayedNote)
        : midiToFreq(note);
    const targetFreq = midiToFreq(note);
    this.lastPlayedNote = note;

    const osc1FreqStart = startFreq * Math.pow(2, p.osc1Octave);
    const osc1FreqTarget = targetFreq * Math.pow(2, p.osc1Octave);

    const osc2FreqStart = startFreq * Math.pow(2, p.osc2Semi / 12);
    const osc2FreqTarget = targetFreq * Math.pow(2, p.osc2Semi / 12);

    const subFreqStart = startFreq * 0.5;
    const subFreqTarget = targetFreq * 0.5;

    const pitchBendCents = this.pitchBendSemitones * 100;

    // Oscillators
    const osc1 = ctx.createOscillator();
    osc1.type = p.osc1Wave;
    osc1.frequency.setValueAtTime(osc1FreqStart, now);
    if (p.glide > 0.002) {
      osc1.frequency.exponentialRampToValueAtTime(Math.max(20, osc1FreqTarget), now + p.glide);
    }
    osc1.detune.value = p.osc1Detune - p.unisonDetune * 0.5 + pitchBendCents;

    const osc2 = ctx.createOscillator();
    osc2.type = p.osc2Wave;
    osc2.frequency.setValueAtTime(osc2FreqStart, now);
    if (p.glide > 0.002) {
      osc2.frequency.exponentialRampToValueAtTime(Math.max(20, osc2FreqTarget), now + p.glide);
    }
    osc2.detune.value = p.osc2Detune + p.unisonDetune * 0.5 + pitchBendCents;

    let osc1Uni: OscillatorNode | null = null;
    let osc2Uni: OscillatorNode | null = null;

    if (p.unisonDetune > 2) {
      osc1Uni = ctx.createOscillator();
      osc1Uni.type = p.osc1Wave;
      osc1Uni.frequency.setValueAtTime(osc1FreqStart, now);
      if (p.glide > 0.002) {
        osc1Uni.frequency.exponentialRampToValueAtTime(Math.max(20, osc1FreqTarget), now + p.glide);
      }
      osc1Uni.detune.value = p.osc1Detune + p.unisonDetune * 0.85 + pitchBendCents;

      osc2Uni = ctx.createOscillator();
      osc2Uni.type = p.osc2Wave;
      osc2Uni.frequency.setValueAtTime(osc2FreqStart, now);
      if (p.glide > 0.002) {
        osc2Uni.frequency.exponentialRampToValueAtTime(Math.max(20, osc2FreqTarget), now + p.glide);
      }
      osc2Uni.detune.value = p.osc2Detune - p.unisonDetune * 0.85 + pitchBendCents;
    }

    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(subFreqStart, now);
    if (p.glide > 0.002) {
      subOsc.frequency.exponentialRampToValueAtTime(Math.max(20, subFreqTarget), now + p.glide);
    }
    subOsc.detune.value = pitchBendCents;

    // Mix Gains
    const g1 = ctx.createGain();
    g1.gain.value = p.osc1Level * (osc1Uni ? 0.38 : 0.65);
    const g2 = ctx.createGain();
    g2.gain.value = p.osc2Level * (osc2Uni ? 0.35 : 0.6);
    const gSub = ctx.createGain();
    gSub.gain.value = p.subLevel * 0.55;

    // Filter
    const filter = ctx.createBiquadFilter();
    filter.type = p.filterType;
    filter.Q.value = p.filterResonance;

    const baseCut = Math.min(18000, Math.max(40, p.filterCutoff + this.modWheelAmount * 4500));
    const peakCut = Math.min(18500, Math.max(60, baseCut + p.filterEnvAmount * velNorm));
    const sustainCut = Math.min(
      18500,
      Math.max(60, baseCut + p.filterEnvAmount * velNorm * p.filterSustain)
    );

    filter.frequency.setValueAtTime(baseCut, now);
    filter.frequency.linearRampToValueAtTime(peakCut, now + Math.max(0.002, p.filterAttack));
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(40, sustainCut),
      now + Math.max(0.002, p.filterAttack) + Math.max(0.01, p.filterDecay)
    );

    // Amp Envelope
    const ampGain = ctx.createGain();
    ampGain.gain.setValueAtTime(0.0001, now);
    ampGain.gain.linearRampToValueAtTime(velNorm, now + Math.max(0.002, p.ampAttack));
    ampGain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, velNorm * Math.max(0.001, p.ampSustain)),
      now + Math.max(0.002, p.ampAttack) + Math.max(0.01, p.ampDecay)
    );

    // LFO routing
    const lfoPitchGain = ctx.createGain();
    lfoPitchGain.gain.value =
      p.lfoTarget === 'pitch' ? (p.lfoDepth + this.modWheelAmount * 0.25) * 65 : 0;
    const lfoFilterGain = ctx.createGain();
    lfoFilterGain.gain.value =
      p.lfoTarget === 'filter' ? (p.lfoDepth + this.modWheelAmount * 0.3) * 1400 : 0;
    const lfoAmpGain = ctx.createGain();
    lfoAmpGain.gain.value = p.lfoTarget === 'amp' ? p.lfoDepth * 0.35 : 0;

    this.globalLfo.connect(lfoPitchGain);
    this.globalLfo.connect(lfoFilterGain);
    this.globalLfo.connect(lfoAmpGain);

    lfoPitchGain.connect(osc1.detune);
    lfoPitchGain.connect(osc2.detune);
    if (osc1Uni) lfoPitchGain.connect(osc1Uni.detune);
    if (osc2Uni) lfoPitchGain.connect(osc2Uni.detune);
    lfoFilterGain.connect(filter.frequency);
    lfoAmpGain.connect(ampGain.gain);

    // Noise
    let noiseSrc: AudioBufferSourceNode | null = null;
    if (p.noiseLevel > 0.005 && this.noiseBuffer) {
      noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = this.noiseBuffer;
      noiseSrc.loop = true;
      const gNoise = ctx.createGain();
      gNoise.gain.value = p.noiseLevel * 0.45;
      noiseSrc.connect(gNoise);
      gNoise.connect(filter);
      noiseSrc.start(now);
    }

    // Wire voice
    osc1.connect(g1);
    osc2.connect(g2);
    subOsc.connect(gSub);
    g1.connect(filter);
    g2.connect(filter);
    gSub.connect(filter);

    if (osc1Uni) {
      osc1Uni.connect(g1);
      osc1Uni.start(now);
    }
    if (osc2Uni) {
      osc2Uni.connect(g2);
      osc2Uni.start(now);
    }

    filter.connect(ampGain);
    ampGain.connect(this.voiceBus);

    osc1.start(now);
    osc2.start(now);
    subOsc.start(now);

    this.voices.set(note, {
      note,
      baseFreq: targetFreq,
      osc1,
      osc2,
      osc1Uni,
      osc2Uni,
      subOsc,
      noiseSrc,
      filter,
      ampGain,
      lfoPitchGain,
      lfoFilterGain,
      lfoAmpGain,
      released: false,
    });
  }

  public noteOff(note: number) {
    if (!this.ctx || !this.patch) return;
    if (this.sustainPedalDown) {
      this.sustainedNotes.add(note);
      return;
    }
    this.releaseVoice(note);
  }

  private releaseVoice(note: number) {
    if (!this.ctx || !this.patch) return;
    const voice = this.voices.get(note);
    if (!voice || voice.released) return;

    voice.released = true;
    const now = this.ctx.currentTime;
    const rel = Math.max(0.02, this.patch.ampRelease);
    const fRel = Math.max(0.02, this.patch.filterRelease);

    voice.ampGain.gain.cancelScheduledValues(now);
    voice.ampGain.gain.setValueAtTime(Math.max(0.0001, voice.ampGain.gain.value), now);
    voice.ampGain.gain.exponentialRampToValueAtTime(0.0001, now + rel);

    voice.filter.frequency.cancelScheduledValues(now);
    voice.filter.frequency.setValueAtTime(Math.max(40, voice.filter.frequency.value), now);
    voice.filter.frequency.exponentialRampToValueAtTime(
      Math.max(40, this.patch.filterCutoff),
      now + fRel
    );

    voice.releaseTimeout = window.setTimeout(() => {
      this.destroyVoice(note);
    }, rel * 1000 + 60);
  }

  private destroyVoice(note: number) {
    const v = this.voices.get(note);
    if (!v) return;
    if (v.releaseTimeout) {
      window.clearTimeout(v.releaseTimeout);
    }
    try {
      v.osc1.stop();
      v.osc2.stop();
      v.subOsc.stop();
      v.osc1Uni?.stop();
      v.osc2Uni?.stop();
      v.noiseSrc?.stop();
    } catch {
      // already stopped
    }
    try {
      v.osc1.disconnect();
      v.osc2.disconnect();
      v.subOsc.disconnect();
      v.osc1Uni?.disconnect();
      v.osc2Uni?.disconnect();
      v.noiseSrc?.disconnect();
      v.filter.disconnect();
      v.ampGain.disconnect();
      v.lfoPitchGain.disconnect();
      v.lfoFilterGain.disconnect();
      v.lfoAmpGain.disconnect();
    } catch {
      // ignore disconnect errors
    }
    this.voices.delete(note);
  }

  public setSustain(down: boolean) {
    this.sustainPedalDown = down;
    if (!down) {
      this.sustainedNotes.forEach((n) => this.releaseVoice(n));
      this.sustainedNotes.clear();
    }
  }

  public setPitchBend(semitones: number) {
    this.pitchBendSemitones = semitones;
    if (!this.ctx || !this.patch) return;
    const now = this.ctx.currentTime;
    const p = this.patch;
    const bendCents = semitones * 100;
    this.voices.forEach((v) => {
      v.osc1.detune.setTargetAtTime(p.osc1Detune - p.unisonDetune * 0.5 + bendCents, now, 0.008);
      v.osc2.detune.setTargetAtTime(p.osc2Detune + p.unisonDetune * 0.5 + bendCents, now, 0.008);
      v.subOsc.detune.setTargetAtTime(bendCents, now, 0.008);
    });
  }

  public setModWheel(normalized: number) {
    this.modWheelAmount = Math.max(0, Math.min(1, normalized));
    if (this.patch) {
      this.updateActiveVoicesLive(this.patch);
    }
  }

  public async playChord(notes: number[], durationMs = 1100, velocity = 95) {
    for (const n of notes) {
      await this.noteOn(n, velocity);
    }
    window.setTimeout(() => {
      for (const n of notes) {
        this.noteOff(n);
      }
    }, durationMs);
  }

  public async playClick(accent: boolean) {
    await this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(accent ? 1320 : 880, now);
    gain.gain.setValueAtTime(accent ? 0.22 : 0.13, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
    osc.connect(gain);
    gain.connect(this.compressor);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  public async connectExternalAudioInput(deviceId?: string): Promise<string> {
    await this.init();
    if (!this.ctx) throw new Error('Audio engine unavailable');

    this.disconnectExternalAudioInput();

    const constraints: MediaStreamConstraints = {
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const source = this.ctx.createMediaStreamSource(stream);
    const gain = this.ctx.createGain();
    gain.gain.value = 0.85;
    source.connect(gain);
    gain.connect(this.driveShaper);

    this.extStream = stream;
    this.extSource = source;
    this.extGain = gain;

    const track = stream.getAudioTracks()[0];
    return track?.label || 'External Audio Instrument';
  }

  public setExternalInputGain(level: number) {
    if (this.extGain && this.ctx) {
      this.extGain.gain.setTargetAtTime(Math.max(0, Math.min(1.5, level)), this.ctx.currentTime, 0.02);
    }
  }

  public disconnectExternalAudioInput() {
    if (this.extSource) {
      this.extSource.disconnect();
      this.extSource = null;
    }
    if (this.extGain) {
      this.extGain.disconnect();
      this.extGain = null;
    }
    if (this.extStream) {
      this.extStream.getTracks().forEach((t) => t.stop());
      this.extStream = null;
    }
  }

  public panic() {
    this.sustainPedalDown = false;
    this.sustainedNotes.clear();
    Array.from(this.voices.keys()).forEach((n) => this.destroyVoice(n));
  }
}

export const synthEngine = new LowLatencySynthEngine();
