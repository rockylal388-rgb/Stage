export type OscWaveform = 'sine' | 'triangle' | 'sawtooth' | 'square';
export type FilterType = 'lowpass' | 'bandpass' | 'highpass' | 'notch';
export type LfoTarget = 'filter' | 'pitch' | 'amp';
export type PatchCategory = 'Lead' | 'Bass' | 'Pad' | 'Pluck' | 'Keys' | 'Brass' | 'FX';

export interface SynthPatch {
  id: string;
  name: string;
  category: PatchCategory;
  description: string;
  author?: 'Factory' | 'Songbook' | 'AI Lab' | 'User';
  bpmHint?: number;
  // Oscillator 1
  osc1Wave: OscWaveform;
  osc1Level: number; // 0..1
  osc1Octave: number; // -2..2
  osc1Detune: number; // -50..50 cents
  // Oscillator 2
  osc2Wave: OscWaveform;
  osc2Level: number; // 0..1
  osc2Semi: number; // -24..24 semitones
  osc2Detune: number; // -50..50 cents
  // Sub & Noise
  subLevel: number; // 0..1
  noiseLevel: number; // 0..0.5
  // Unison & Glide
  unisonDetune: number; // 0..40 cents stereo spread
  glide: number; // 0..0.5 seconds
  // Filter
  filterType: FilterType;
  filterCutoff: number; // 60..18000 Hz
  filterResonance: number; // 0.1..18 Q
  filterEnvAmount: number; // -6000..8000 Hz
  // Amp Envelope
  ampAttack: number; // 0.002..2.5s
  ampDecay: number; // 0.02..3.0s
  ampSustain: number; // 0..1
  ampRelease: number; // 0.02..4.0s
  // Filter Envelope
  filterAttack: number; // 0.002..2.0s
  filterDecay: number; // 0.02..3.0s
  filterSustain: number; // 0..1
  filterRelease: number; // 0.02..3.5s
  // LFO
  lfoWave: OscWaveform;
  lfoRate: number; // 0.1..18 Hz
  lfoDepth: number; // 0..1
  lfoTarget: LfoTarget;
  // FX Chain
  drive: number; // 0..1
  chorusMix: number; // 0..1
  delayMix: number; // 0..0.85
  delayTime: number; // 0.08..0.85s
  delayFeedback: number; // 0..0.75
  reverbMix: number; // 0..0.9
  reverbDecay: number; // 0.6..4.5s
  masterGain: number; // 0.2..1.0
}

export interface ChordStep {
  symbol: string; // e.g., "Fmaj7", "Am9"
  roman: string; // e.g., "IVmaj7", "vi9"
  beats: number; // e.g., 4
  midiNotes: number[]; // e.g., [53, 57, 60, 64]
  voicingHint?: string;
}

export interface SongSection {
  name: string; // e.g., "Intro", "Verse", "Chorus", "Bridge"
  chords: ChordStep[];
}

export type BandGenre =
  | 'Rock & Alt'
  | 'Indie & Arena'
  | 'Synth-Pop'
  | 'Synthwave & 80s'
  | 'Electronic & Club'
  | 'Funk & Disco'
  | 'Classic Rock';

export interface TrendingSongEntry {
  id: string;
  bandName: string;
  title: string;
  artistOrStyle: string;
  genre: BandGenre;
  year: string;
  bpm: number;
  musicalKey: string;
  timeSignature: string;
  soundRole: string;
  performanceNotes: string;
  patch: SynthPatch;
  sections: SongSection[];
}

export interface MidiDeviceInfo {
  id: string;
  name: string;
  manufacturer: string;
  state: 'connected' | 'disconnected';
  type: 'input' | 'output';
}

export interface MidiMessageLog {
  id: number;
  timestamp: string;
  deviceName: string;
  channel: number;
  type: 'Note On' | 'Note Off' | 'CC' | 'Pitch Bend' | 'Clock';
  detail: string;
}

export type VelocityCurve = 'linear' | 'soft' | 'hard' | 'fixed';

export type MidiLearnableParam =
  | 'filterCutoff'
  | 'filterResonance'
  | 'osc2Level'
  | 'subLevel'
  | 'ampAttack'
  | 'ampRelease'
  | 'drive'
  | 'chorusMix'
  | 'delayMix'
  | 'reverbMix'
  | 'lfoRate'
  | 'lfoDepth';

export type MidiCCMap = Partial<Record<number, MidiLearnableParam>>;
