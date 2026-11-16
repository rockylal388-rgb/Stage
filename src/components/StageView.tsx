import React, { useMemo, useRef, useState } from 'react';
import {
  ArpeggiatorConfig,
  ArpPattern,
  ArpRate,
  FilterType,
  LfoTarget,
  MidiCCMap,
  MidiLearnableParam,
  OscWaveform,
  PatchCategory,
  SynthPatch,
} from '../types/synth';
import { synthEngine } from '../audio/synthEngine';
import { Oscilloscope } from './Oscilloscope';
import { PerformanceKeyboard, SCALE_INTERVALS } from './PerformanceKeyboard';
import { PatchBrowserModal } from './PatchBrowserModal';
import { Sliders, Volume2, Radio, BookmarkPlus, Library } from 'lucide-react';

interface StageViewProps {
  patch: SynthPatch;
  allPatches: SynthPatch[];
  stageSlots: (SynthPatch | null)[];
  activeSlotIndex: number | null;
  onSelectPatch: (p: SynthPatch) => void;
  onUpdatePatch: (updates: Partial<SynthPatch>) => void;
  onLoadSlot: (index: number) => void;
  onStoreToSlot: (index: number) => void;
  onSaveToLibrary: () => void;
  bpm: number;
  onBpmChange: (next: number) => void;
  onTapTempo: () => void;
  metronomeOn: boolean;
  onToggleMetronome: () => void;
  currentBeat: number;
  audioReady: boolean;
  activeNotes: Set<number>;
  baseOctave: number;
  onOctaveChange: (oct: number) => void;
  onNoteOn: (note: number, vel?: number) => void;
  onNoteOff: (note: number) => void;
  onTriggerChord: (notes: number[], down: boolean) => void;
  sustainOn: boolean;
  onToggleSustain: () => void;
  chordMode: boolean;
  onToggleChordMode: () => void;
  scaleLock: string;
  onScaleLockChange: (scale: string) => void;
  midiLearnParam: MidiLearnableParam | null;
  onSelectMidiLearnParam: (param: MidiLearnableParam | null) => void;
  midiCCMap: MidiCCMap;
  arpeggiator: ArpeggiatorConfig;
  onArpeggiatorChange: (updates: Partial<ArpeggiatorConfig>) => void;
  arpHighlightedNotes?: Set<number>;
  morphSlotIndex: number;
  onMorphSlotChange: (slotIdx: number) => void;
  morphAmount: number;
  onMorphAmountChange: (amount: number) => void;
}

const WAVEFORMS: OscWaveform[] = ['sine', 'triangle', 'sawtooth', 'square'];
const FILTERS: FilterType[] = ['lowpass', 'bandpass', 'highpass', 'notch'];
const LFO_TARGETS: LfoTarget[] = ['filter', 'pitch', 'amp'];
const ARP_RATES: ArpRate[] = ['1/4', '1/8', '1/8T', '1/16', '1/32'];
const ARP_PATTERNS: { value: ArpPattern; label: string }[] = [
  { value: 'up', label: 'Up' },
  { value: 'down', label: 'Down' },
  { value: 'up-down', label: 'Up/Dn' },
  { value: 'random', label: 'Random' },
];
const PATCH_CATEGORIES: ('All' | PatchCategory)[] = [
  'All',
  'Bass',
  'Lead',
  'Pad',
  'Pluck',
  'Keys',
  'Brass',
  'FX',
];
const EDITABLE_CATEGORIES: PatchCategory[] = ['Bass', 'Lead', 'Pad', 'Pluck', 'Keys', 'Brass', 'FX'];

const STAGE_PADS = [
  { label: 'i9 Root', sub: 'Am9', notes: [57, 60, 64, 67, 71] },
  { label: 'VImaj7', sub: 'Fmaj7', notes: [53, 57, 60, 64] },
  { label: 'IIIadd9', sub: 'Cadd9', notes: [48, 55, 60, 62, 64] },
  { label: 'VII6', sub: 'G6', notes: [55, 59, 62, 64] },
  { label: 'iv7', sub: 'Dm7', notes: [50, 53, 57, 60] },
  { label: 'v7', sub: 'Em7', notes: [52, 55, 59, 62] },
  { label: 'Sub Hit', sub: 'A1+A2', notes: [33, 45] },
  { label: 'Oct Fifth', sub: 'A3 E4 A4', notes: [57, 64, 69] },
];

export const StageView: React.FC<StageViewProps> = ({
  patch,
  allPatches,
  stageSlots,
  activeSlotIndex,
  onSelectPatch,
  onUpdatePatch,
  onLoadSlot,
  onStoreToSlot,
  onSaveToLibrary,
  bpm,
  onBpmChange,
  onTapTempo,
  metronomeOn,
  onToggleMetronome,
  currentBeat,
  audioReady,
  activeNotes,
  baseOctave,
  onOctaveChange,
  onNoteOn,
  onNoteOff,
  onTriggerChord,
  sustainOn,
  onToggleSustain,
  chordMode,
  onToggleChordMode,
  scaleLock,
  onScaleLockChange,
  midiLearnParam,
  onSelectMidiLearnParam,
  midiCCMap,
  arpeggiator,
  onArpeggiatorChange,
  arpHighlightedNotes,
  morphSlotIndex,
  onMorphSlotChange,
  morphAmount,
  onMorphAmountChange,
}) => {
  const [storingSlotMode, setStoringSlotMode] = useState(false);
  const [learnActive, setLearnActive] = useState(false);
  const [patchBrowserOpen, setPatchBrowserOpen] = useState(false);
  const [patchCategoryFilter, setPatchCategoryFilter] = useState<'All' | PatchCategory>('All');
  const pressedPadsRef = useRef<Set<string>>(new Set());
  const auditioningRef = useRef(false);

  const filteredStagePatches = useMemo(() => {
    if (patchCategoryFilter === 'All') return allPatches;
    const matched = allPatches.filter((p) => p.category === patchCategoryFilter);
    if (!matched.some((p) => p.id === patch.id)) {
      return [patch, ...matched];
    }
    return matched;
  }, [allPatches, patchCategoryFilter, patch]);

  const getMappedCC = (param: MidiLearnableParam): number | null => {
    for (const [cc, mapped] of Object.entries(midiCCMap)) {
      if (mapped === param) return Number(cc);
    }
    return null;
  };

  const latency = synthEngine.getLatencyMs();

  const renderSlider = (
    label: string,
    paramKey: keyof SynthPatch,
    value: number,
    min: number,
    max: number,
    step: number,
    formatValue: (v: number) => string,
    learnable?: MidiLearnableParam
  ) => {
    const isLearning = learnable && midiLearnParam === learnable;
    const mappedCC = learnable ? getMappedCC(learnable) : null;

    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[rgba(236,236,236,0.58)] truncate">
              {label}
            </span>
            {learnActive && learnable && (
              <button
                type="button"
                onClick={() => onSelectMidiLearnParam(isLearning ? null : learnable)}
                className={`px-1.5 py-0.5 text-[9px] font-mono uppercase rounded-[2px] border transition-colors whitespace-nowrap shrink-0 ${
                  isLearning
                    ? 'bg-[#ff4d00] text-[#0c0c0e] border-[#ff4d00] font-semibold'
                    : mappedCC !== null
                      ? 'bg-[#161618] text-[#ff4d00] border-[#ff4d00]/50'
                      : 'bg-[#161618] text-[rgba(236,236,236,0.54)] border-[rgba(236,236,236,0.16)] hover:text-[#ececec]'
                }`}
              >
                {isLearning ? 'Twist Knob' : mappedCC !== null ? `CC ${mappedCC}` : 'Learn'}
              </button>
            )}
          </div>
          <span className="font-mono text-[11px] text-[#ff4d00] tabular-nums shrink-0">
            {formatValue(value)}
          </span>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onUpdatePatch({ [paramKey]: parseFloat(e.target.value) })}
          className="synth-slider w-full"
          aria-label={label}
        />
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Main 3-Column Variation 2 Hardware Console */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_300px] flex-1 min-h-0">
        {/* Sidebar Left: Active Sound Patch & Output Monitor */}
        <aside className="bg-[#161618] border-b lg:border-b-0 lg:border-r border-[rgba(236,236,236,0.12)] p-5 flex flex-col gap-5">
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="patch-select"
                className="font-mono text-[10px] uppercase tracking-[0.15em] text-[rgba(236,236,236,0.54)]"
              >
                Active Sound Patch
              </label>
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-[rgba(236,236,236,0.54)]">
                <select
                  aria-label="Active patch category"
                  value={patch.category}
                  onChange={(e) => onUpdatePatch({ category: e.target.value as PatchCategory })}
                  className="bg-[#0c0c0e] border border-[rgba(236,236,236,0.14)] rounded-[2px] px-1.5 py-0.5 text-[10px] font-mono uppercase text-[#ff4d00] focus:outline-none focus:border-[#ff4d00]"
                >
                  {EDITABLE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <span>/ {patch.author || 'Custom'}</span>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1 bg-[#0c0c0e] p-1 border border-[rgba(236,236,236,0.12)] rounded-[2px]">
              {PATCH_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setPatchCategoryFilter(cat)}
                  className={`py-1 rounded-[2px] font-mono text-[10px] uppercase tracking-[0.06em] transition-colors ${
                    patchCategoryFilter === cat
                      ? 'bg-[#ff4d00] text-[#0c0c0e] font-semibold'
                      : 'text-[rgba(236,236,236,0.54)] hover:text-[#ececec]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <select
              id="patch-select"
              value={patch.id}
              onChange={(e) => {
                const found = allPatches.find((p) => p.id === e.target.value);
                if (found) onSelectPatch(found);
              }}
              className="w-full h-10 bg-[#0c0c0e] border border-[rgba(236,236,236,0.14)] rounded-[2px] px-3 font-mono text-xs text-[#ececec] focus:outline-none focus:border-[#ff4d00]"
            >
              {filteredStagePatches.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} [{p.category}]
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setPatchBrowserOpen(true)}
              className="w-full h-9 px-3 bg-[#0c0c0e] border border-[rgba(236,236,236,0.2)] hover:border-[#ff4d00] rounded-[2px] font-mono text-[10px] uppercase tracking-[0.08em] text-[#ececec] flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2">
                <Library className="w-3.5 h-3.5 text-[#ff4d00]" />
                <span>Browse All Patches</span>
              </span>
              <span className="text-[#ff4d00] tabular-nums">{allPatches.length}</span>
            </button>

            <p className="text-[13px] leading-relaxed text-[rgba(236,236,236,0.6)]">
              {patch.description}
            </p>
          </div>

          {/* Patch Morph (A -> Slot B) */}
          <div
            className={`bg-[#0c0c0e] border rounded-[2px] p-3 flex flex-col gap-2.5 transition-colors ${
              morphAmount > 0 && stageSlots[morphSlotIndex]
                ? 'border-[#ff4d00]'
                : 'border-[rgba(236,236,236,0.12)]'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="morph-target-slot"
                className="font-mono text-[10px] uppercase tracking-[0.15em] text-[rgba(236,236,236,0.54)]"
              >
                Patch Morph
              </label>
              <div className="flex items-center gap-2">
                {morphAmount > 0 && (
                  <button
                    type="button"
                    onClick={() => onMorphAmountChange(0)}
                    className="font-mono text-[9px] uppercase tracking-[0.08em] text-[rgba(236,236,236,0.6)] hover:text-[#ff4d00]"
                  >
                    Reset
                  </button>
                )}
                <span className="font-mono text-[11px] font-semibold text-[#ff4d00] tabular-nums">
                  {Math.round(morphAmount * 100)}%
                </span>
              </div>
            </div>

            <select
              id="morph-target-slot"
              value={morphSlotIndex}
              onChange={(e) => onMorphSlotChange(Number(e.target.value))}
              className="w-full h-8 bg-[#161618] border border-[rgba(236,236,236,0.14)] rounded-[2px] px-2 font-mono text-[11px] text-[#ececec] focus:outline-none focus:border-[#ff4d00]"
            >
              {stageSlots.map((slot, idx) => (
                <option key={idx} value={idx} disabled={!slot}>
                  Slot {String(idx + 1).padStart(2, '0')} — {slot ? slot.name : 'Empty'}
                </option>
              ))}
            </select>

            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={morphAmount}
              disabled={!stageSlots[morphSlotIndex]}
              onChange={(e) => onMorphAmountChange(parseFloat(e.target.value))}
              aria-label="Patch Morph Amount"
              className="synth-slider w-full disabled:opacity-40"
            />

            <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.1em] text-[rgba(236,236,236,0.42)]">
              <span>Current Patch</span>
              <span>
                {stageSlots[morphSlotIndex]
                  ? `Slot ${String(morphSlotIndex + 1).padStart(2, '0')}`
                  : 'No Target'}
              </span>
            </div>
          </div>

          <Oscilloscope audioReady={audioReady} heightClass="h-32" />

          <div className="flex flex-col gap-2 mt-auto">
            <button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                auditioningRef.current = true;
                onTriggerChord([57, 60, 64, 67], true);
              }}
              onPointerUp={() => {
                if (auditioningRef.current) {
                  auditioningRef.current = false;
                  onTriggerChord([57, 60, 64, 67], false);
                }
              }}
              onPointerLeave={() => {
                if (auditioningRef.current) {
                  auditioningRef.current = false;
                  onTriggerChord([57, 60, 64, 67], false);
                }
              }}
              onPointerCancel={() => {
                if (auditioningRef.current) {
                  auditioningRef.current = false;
                  onTriggerChord([57, 60, 64, 67], false);
                }
              }}
              className="w-full h-10 bg-[#ff4d00] hover:bg-[#ff621f] text-[#0c0c0e] font-mono text-xs font-bold uppercase tracking-[0.06em] rounded-[2px] flex items-center justify-center gap-2 transition-colors touch-none"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Hold to Audition (Am7)</span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onSaveToLibrary}
                className="h-9 px-2 bg-[#0c0c0e] border border-[rgba(236,236,236,0.14)] hover:border-[#ececec] rounded-[2px] font-mono text-[10px] uppercase tracking-[0.06em] text-[#ececec] flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <BookmarkPlus className="w-3 h-3 text-[#ff4d00]" />
                <span>Save Copy</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = !learnActive;
                  setLearnActive(next);
                  if (!next) onSelectMidiLearnParam(null);
                }}
                className={`h-9 px-2 border rounded-[2px] font-mono text-[10px] uppercase tracking-[0.06em] flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                  learnActive
                    ? 'bg-[#ff4d00] border-[#ff4d00] text-[#0c0c0e] font-semibold'
                    : 'bg-[#0c0c0e] border-[rgba(236,236,236,0.14)] text-[rgba(236,236,236,0.75)] hover:border-[#ececec]'
                }`}
              >
                <Sliders className="w-3 h-3" />
                <span>MIDI Learn</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Center Main: 3-Section Sound Sculptor + 8 Performance Chord Pads */}
        <main className="bg-[#0c0c0e] p-5 flex flex-col justify-between gap-6 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Section 1: Oscillators & Pitch */}
            <section className="flex flex-col gap-3.5">
              <h2 className="font-display text-xs font-extrabold uppercase tracking-[0.06em] text-[#ececec] border-b border-[rgba(236,236,236,0.12)] pb-2">
                Oscillators &amp; Pitch
              </h2>

              <div className="flex flex-col gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[rgba(236,236,236,0.54)]">
                  Oscillator 1 Wave
                </span>
                <div className="grid grid-cols-4 gap-1 bg-[#161618] p-1 border border-[rgba(236,236,236,0.12)] rounded-[2px]">
                  {WAVEFORMS.map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => onUpdatePatch({ osc1Wave: w })}
                      className={`py-1 font-mono text-[10px] uppercase rounded-[2px] transition-colors ${
                        patch.osc1Wave === w
                          ? 'bg-[#ff4d00] text-[#0c0c0e] font-semibold'
                          : 'text-[rgba(236,236,236,0.54)] hover:text-[#ececec]'
                      }`}
                    >
                      {w === 'sawtooth' ? 'Saw' : w === 'triangle' ? 'Tri' : w === 'square' ? 'Sqr' : 'Sin'}
                    </button>
                  ))}
                </div>
              </div>

              {renderSlider(
                'Osc 1 Level',
                'osc1Level',
                patch.osc1Level,
                0,
                1,
                0.01,
                (v) => `${Math.round(v * 100)}%`
              )}
              {renderSlider(
                'Osc 1 Octave',
                'osc1Octave',
                patch.osc1Octave,
                -2,
                2,
                1,
                (v) => `${v > 0 ? '+' : ''}${v} oct`
              )}

              <div className="flex flex-col gap-1.5 pt-1">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[rgba(236,236,236,0.54)]">
                  Oscillator 2 Wave
                </span>
                <div className="grid grid-cols-4 gap-1 bg-[#161618] p-1 border border-[rgba(236,236,236,0.12)] rounded-[2px]">
                  {WAVEFORMS.map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => onUpdatePatch({ osc2Wave: w })}
                      className={`py-1 font-mono text-[10px] uppercase rounded-[2px] transition-colors ${
                        patch.osc2Wave === w
                          ? 'bg-[#ff4d00] text-[#0c0c0e] font-semibold'
                          : 'text-[rgba(236,236,236,0.54)] hover:text-[#ececec]'
                      }`}
                    >
                      {w === 'sawtooth' ? 'Saw' : w === 'triangle' ? 'Tri' : w === 'square' ? 'Sqr' : 'Sin'}
                    </button>
                  ))}
                </div>
              </div>

              {renderSlider(
                'Osc 2 Mix',
                'osc2Level',
                patch.osc2Level,
                0,
                1,
                0.01,
                (v) => `${Math.round(v * 100)}%`,
                'osc2Level'
              )}
              {renderSlider(
                'Osc 2 Semitones',
                'osc2Semi',
                patch.osc2Semi,
                -24,
                24,
                1,
                (v) => `${v > 0 ? '+' : ''}${v} st`
              )}
              {renderSlider(
                'Sub Bass Osc',
                'subLevel',
                patch.subLevel,
                0,
                1,
                0.01,
                (v) => `${Math.round(v * 100)}%`,
                'subLevel'
              )}
              {renderSlider(
                'Unison Spread',
                'unisonDetune',
                patch.unisonDetune,
                0,
                40,
                1,
                (v) => `${v} ct`
              )}
              {renderSlider(
                'Portamento Glide',
                'glide',
                patch.glide,
                0,
                0.35,
                0.005,
                (v) => `${Math.round(v * 1000)} ms`
              )}
            </section>

            {/* Section 2: Filter & Envelope */}
            <section className="flex flex-col gap-3.5 md:border-l md:border-[rgba(236,236,236,0.12)] md:pl-6">
              <h2 className="font-display text-xs font-extrabold uppercase tracking-[0.06em] text-[#ececec] border-b border-[rgba(236,236,236,0.12)] pb-2">
                Filter &amp; Envelope
              </h2>

              <div className="flex flex-col gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[rgba(236,236,236,0.54)]">
                  Filter Mode
                </span>
                <div className="grid grid-cols-4 gap-1 bg-[#161618] p-1 border border-[rgba(236,236,236,0.12)] rounded-[2px]">
                  {FILTERS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => onUpdatePatch({ filterType: f })}
                      className={`py-1 font-mono text-[10px] uppercase rounded-[2px] transition-colors ${
                        patch.filterType === f
                          ? 'bg-[#ff4d00] text-[#0c0c0e] font-semibold'
                          : 'text-[rgba(236,236,236,0.54)] hover:text-[#ececec]'
                      }`}
                    >
                      {f === 'lowpass' ? 'LP' : f === 'bandpass' ? 'BP' : f === 'highpass' ? 'HP' : 'Nch'}
                    </button>
                  ))}
                </div>
              </div>

              {renderSlider(
                'Filter Cutoff',
                'filterCutoff',
                patch.filterCutoff,
                60,
                16000,
                10,
                (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${Math.round(v)} Hz`),
                'filterCutoff'
              )}
              {renderSlider(
                'Resonance (Q)',
                'filterResonance',
                patch.filterResonance,
                0.2,
                16,
                0.1,
                (v) => v.toFixed(1),
                'filterResonance'
              )}
              {renderSlider(
                'Filter Env Depth',
                'filterEnvAmount',
                patch.filterEnvAmount,
                -5000,
                7500,
                50,
                (v) => `${v > 0 ? '+' : ''}${Math.round(v)} Hz`
              )}
              {renderSlider(
                'Amp Attack',
                'ampAttack',
                patch.ampAttack,
                0.002,
                2.0,
                0.005,
                (v) => (v < 0.1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(2)} s`),
                'ampAttack'
              )}
              {renderSlider('Amp Decay', 'ampDecay', patch.ampDecay, 0.02, 2.5, 0.01, (v) => `${v.toFixed(2)} s`)}
              {renderSlider(
                'Amp Sustain',
                'ampSustain',
                patch.ampSustain,
                0,
                1,
                0.01,
                (v) => `${Math.round(v * 100)}%`
              )}
              {renderSlider(
                'Amp Release',
                'ampRelease',
                patch.ampRelease,
                0.02,
                3.5,
                0.01,
                (v) => `${v.toFixed(2)} s`,
                'ampRelease'
              )}
            </section>

            {/* Section 3: Modulation & FX */}
            <section className="flex flex-col gap-3.5 md:border-l md:border-[rgba(236,236,236,0.12)] md:pl-6">
              <h2 className="font-display text-xs font-extrabold uppercase tracking-[0.06em] text-[#ececec] border-b border-[rgba(236,236,236,0.12)] pb-2">
                Modulation &amp; FX
              </h2>

              <div className="flex flex-col gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[rgba(236,236,236,0.54)]">
                  LFO Destination
                </span>
                <div className="grid grid-cols-3 gap-1 bg-[#161618] p-1 border border-[rgba(236,236,236,0.12)] rounded-[2px]">
                  {LFO_TARGETS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => onUpdatePatch({ lfoTarget: t })}
                      className={`py-1 font-mono text-[10px] uppercase rounded-[2px] transition-colors ${
                        patch.lfoTarget === t
                          ? 'bg-[#ff4d00] text-[#0c0c0e] font-semibold'
                          : 'text-[rgba(236,236,236,0.54)] hover:text-[#ececec]'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {renderSlider(
                'LFO Rate',
                'lfoRate',
                patch.lfoRate,
                0.1,
                16,
                0.1,
                (v) => `${v.toFixed(1)} Hz`,
                'lfoRate'
              )}
              {renderSlider(
                'LFO Depth',
                'lfoDepth',
                patch.lfoDepth,
                0,
                1,
                0.01,
                (v) => `${Math.round(v * 100)}%`,
                'lfoDepth'
              )}
              {renderSlider(
                'Analog Drive',
                'drive',
                patch.drive,
                0,
                1,
                0.01,
                (v) => `${Math.round(v * 100)}%`,
                'drive'
              )}
              {renderSlider(
                'Stereo Chorus',
                'chorusMix',
                patch.chorusMix,
                0,
                1,
                0.01,
                (v) => `${Math.round(v * 100)}%`,
                'chorusMix'
              )}
              {renderSlider(
                'Delay Mix',
                'delayMix',
                patch.delayMix,
                0,
                0.85,
                0.01,
                (v) => `${Math.round(v * 100)}%`,
                'delayMix'
              )}
              {renderSlider(
                'Delay Feedback',
                'delayFeedback',
                patch.delayFeedback,
                0,
                0.72,
                0.01,
                (v) => `${Math.round(v * 100)}%`
              )}
              {renderSlider(
                'Hall Reverb',
                'reverbMix',
                patch.reverbMix,
                0,
                0.88,
                0.01,
                (v) => `${Math.round(v * 100)}%`,
                'reverbMix'
              )}
            </section>
          </div>

          {/* Live Chord Trigger Pads */}
          <div className="flex flex-col gap-2.5 pt-2 border-t border-[rgba(236,236,236,0.12)]">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[rgba(236,236,236,0.54)]">
                Performance Chord &amp; Sub Pads
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[rgba(236,236,236,0.4)]">
                Hold Pads or Play Keyboard Below
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {STAGE_PADS.map((pad) => (
                <button
                  key={pad.label}
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    pressedPadsRef.current.add(pad.label);
                    onTriggerChord(pad.notes, true);
                  }}
                  onPointerUp={() => {
                    if (pressedPadsRef.current.has(pad.label)) {
                      pressedPadsRef.current.delete(pad.label);
                      onTriggerChord(pad.notes, false);
                    }
                  }}
                  onPointerLeave={() => {
                    if (pressedPadsRef.current.has(pad.label)) {
                      pressedPadsRef.current.delete(pad.label);
                      onTriggerChord(pad.notes, false);
                    }
                  }}
                  onPointerCancel={() => {
                    if (pressedPadsRef.current.has(pad.label)) {
                      pressedPadsRef.current.delete(pad.label);
                      onTriggerChord(pad.notes, false);
                    }
                  }}
                  className="bg-[#161618] border border-[rgba(236,236,236,0.12)] hover:border-[#ff4d00] active:bg-[#ff4d00]/20 active:border-[#ff4d00] px-3 py-3 text-left flex items-baseline justify-between gap-2 rounded-[2px] transition-colors touch-none"
                >
                  <span className="text-xs font-semibold text-[#ececec]">{pad.label}</span>
                  <span className="font-mono text-[11px] text-[#ff4d00]">{pad.sub}</span>
                </button>
              ))}
            </div>
          </div>
        </main>

        {/* Sidebar Right: Setlist Slots, Tempo, Arpeggiator & Key Mapping */}
        <aside className="bg-[#161618] border-t lg:border-t-0 lg:border-l border-[rgba(236,236,236,0.12)] p-5 flex flex-col gap-5 lg:overflow-y-auto">
          {/* Setlist Slots */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[rgba(236,236,236,0.54)]">
                Setlist Slots (01–08)
              </span>
              <button
                type="button"
                onClick={() => setStoringSlotMode((v) => !v)}
                className={`px-2 py-0.5 font-mono text-[10px] uppercase border rounded-[2px] transition-colors ${
                  storingSlotMode
                    ? 'bg-[#ff4d00] border-[#ff4d00] text-[#0c0c0e] font-semibold'
                    : 'bg-[#0c0c0e] border-[rgba(236,236,236,0.16)] text-[rgba(236,236,236,0.75)] hover:border-[#ececec]'
                }`}
              >
                {storingSlotMode ? 'Pick Slot' : 'Store'}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-1">
              {stageSlots.map((slot, idx) => {
                const isActive = activeSlotIndex === idx;
                const slotNum = String(idx + 1).padStart(2, '0');
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      if (storingSlotMode) {
                        onStoreToSlot(idx);
                        setStoringSlotMode(false);
                      } else if (slot) {
                        onLoadSlot(idx);
                      }
                    }}
                    className={`w-full px-2.5 py-2 text-left text-xs border rounded-[2px] flex items-center justify-between gap-2 transition-colors ${
                      storingSlotMode
                        ? 'bg-[#ff4d00]/15 border-[#ff4d00] text-[#ececec]'
                        : isActive
                          ? 'bg-[#0c0c0e] border-[#ff4d00] text-[#ececec]'
                          : 'bg-[#0c0c0e] border-[rgba(236,236,236,0.12)] text-[rgba(236,236,236,0.58)] hover:border-[rgba(236,236,236,0.35)]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-mono text-[11px] font-semibold text-[#ff4d00] shrink-0">
                        {slotNum}
                      </span>
                      <span className="truncate font-medium">{slot ? slot.name : 'Empty Slot'}</span>
                    </div>
                    {slot && (
                      <span className="font-mono text-[9px] uppercase text-[rgba(236,236,236,0.4)] shrink-0">
                        {slot.category}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tempo Box */}
          <div className="bg-[#000000] border border-[#ff4d00] p-4 rounded-[2px] flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[rgba(236,236,236,0.54)]">
                Master Tempo
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onBpmChange(Math.max(40, bpm - 1))}
                  className="w-6 h-6 bg-[#161618] border border-[rgba(236,236,236,0.16)] text-[#ececec] font-mono text-xs hover:border-[#ff4d00]"
                  aria-label="Decrease BPM"
                >
                  -
                </button>
                <button
                  type="button"
                  onClick={() => onBpmChange(Math.min(220, bpm + 1))}
                  className="w-6 h-6 bg-[#161618] border border-[rgba(236,236,236,0.16)] text-[#ececec] font-mono text-xs hover:border-[#ff4d00]"
                  aria-label="Increase BPM"
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex items-baseline justify-center gap-2">
              <span className="font-mono text-4xl font-bold text-[#ff4d00] tabular-nums leading-none">
                {bpm}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[rgba(236,236,236,0.54)]">
                BPM
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onTapTempo}
                className="h-8 bg-[#161618] border border-[rgba(236,236,236,0.16)] hover:border-[#ececec] rounded-[2px] font-mono text-[10px] uppercase tracking-[0.1em] text-[#ececec] transition-colors"
              >
                Tap
              </button>
              <button
                type="button"
                onClick={onToggleMetronome}
                className={`h-8 border rounded-[2px] font-mono text-[10px] uppercase tracking-[0.06em] flex items-center justify-center gap-1.5 transition-colors ${
                  metronomeOn
                    ? 'bg-[#ff4d00] border-[#ff4d00] text-[#0c0c0e] font-semibold'
                    : 'bg-[#161618] border-[rgba(236,236,236,0.16)] text-[rgba(236,236,236,0.75)] hover:border-[#ececec]'
                }`}
              >
                <Radio className="w-3 h-3" />
                <span>{metronomeOn ? `Click ${currentBeat + 1}/4` : 'Click Off'}</span>
              </button>
            </div>
          </div>

          {/* Arpeggiator Module */}
          <div
            className={`bg-[#0c0c0e] border rounded-[2px] p-3.5 flex flex-col gap-3 transition-colors ${
              arpeggiator.enabled ? 'border-[#ff4d00]' : 'border-[rgba(236,236,236,0.12)]'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[rgba(236,236,236,0.54)]">
                Arpeggiator
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    onArpeggiatorChange({ octaves: arpeggiator.octaves === 1 ? 2 : 1 })
                  }
                  className="px-2 py-0.5 bg-[#161618] border border-[rgba(236,236,236,0.16)] hover:border-[#ececec] rounded-[2px] font-mono text-[10px] uppercase text-[rgba(236,236,236,0.8)] tabular-nums"
                  title="Toggle octave range"
                >
                  {arpeggiator.octaves} Oct
                </button>
                <button
                  type="button"
                  onClick={() => onArpeggiatorChange({ enabled: !arpeggiator.enabled })}
                  aria-pressed={arpeggiator.enabled}
                  className={`px-2.5 py-0.5 border rounded-[2px] font-mono text-[10px] uppercase tracking-[0.08em] transition-colors ${
                    arpeggiator.enabled
                      ? 'bg-[#ff4d00] border-[#ff4d00] text-[#0c0c0e] font-bold'
                      : 'bg-[#161618] border-[rgba(236,236,236,0.16)] text-[rgba(236,236,236,0.7)] hover:border-[#ececec]'
                  }`}
                >
                  {arpeggiator.enabled ? 'On' : 'Off'}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[rgba(236,236,236,0.45)]">
                Rate (BPM Sync)
              </span>
              <div className="grid grid-cols-5 gap-1 bg-[#161618] p-1 border border-[rgba(236,236,236,0.1)] rounded-[2px]">
                {ARP_RATES.map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => onArpeggiatorChange({ rate })}
                    className={`py-1 font-mono text-[10px] rounded-[2px] transition-colors ${
                      arpeggiator.rate === rate
                        ? 'bg-[#ff4d00] text-[#0c0c0e] font-bold'
                        : 'text-[rgba(236,236,236,0.58)] hover:text-[#ececec]'
                    }`}
                  >
                    {rate}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[rgba(236,236,236,0.45)]">
                Pattern
              </span>
              <div className="grid grid-cols-4 gap-1 bg-[#161618] p-1 border border-[rgba(236,236,236,0.1)] rounded-[2px]">
                {ARP_PATTERNS.map((pat) => (
                  <button
                    key={pat.value}
                    type="button"
                    onClick={() => onArpeggiatorChange({ pattern: pat.value })}
                    className={`py-1 font-mono text-[10px] uppercase rounded-[2px] transition-colors ${
                      arpeggiator.pattern === pat.value
                        ? 'bg-[#ff4d00] text-[#0c0c0e] font-bold'
                        : 'text-[rgba(236,236,236,0.58)] hover:text-[#ececec]'
                    }`}
                  >
                    {pat.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Scale Lock & Key Performance Controls */}
          <div className="flex flex-col gap-3 mt-auto">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="stage-scale-lock"
                className="font-mono text-[10px] uppercase tracking-[0.15em] text-[rgba(236,236,236,0.54)]"
              >
                Scale Lock
              </label>
              <select
                id="stage-scale-lock"
                value={scaleLock}
                onChange={(e) => onScaleLockChange(e.target.value)}
                className="w-full h-9 bg-[#0c0c0e] border border-[rgba(236,236,236,0.14)] rounded-[2px] px-2.5 font-mono text-xs text-[#ececec] focus:outline-none focus:border-[#ff4d00]"
              >
                {Object.keys(SCALE_INTERVALS).map((sc) => (
                  <option key={sc} value={sc}>
                    {sc}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between gap-2 bg-[#0c0c0e] border border-[rgba(236,236,236,0.12)] px-3 py-2 rounded-[2px]">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[rgba(236,236,236,0.54)]">
                Octave
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOctaveChange(Math.max(1, baseOctave - 1))}
                  className="w-6 h-6 bg-[#161618] border border-[rgba(236,236,236,0.16)] font-mono text-xs text-[#ececec] hover:border-[#ff4d00]"
                  aria-label="Octave Down"
                >
                  -
                </button>
                <span className="font-mono text-xs font-semibold text-[#ff4d00] w-7 text-center tabular-nums">
                  C{baseOctave}
                </span>
                <button
                  type="button"
                  onClick={() => onOctaveChange(Math.min(5, baseOctave + 1))}
                  className="w-6 h-6 bg-[#161618] border border-[rgba(236,236,236,0.16)] font-mono text-xs text-[#ececec] hover:border-[#ff4d00]"
                  aria-label="Octave Up"
                >
                  +
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onToggleChordMode}
                className={`h-9 border rounded-[2px] font-mono text-[10px] uppercase tracking-[0.06em] transition-colors ${
                  chordMode
                    ? 'bg-[#ff4d00] border-[#ff4d00] text-[#0c0c0e] font-semibold'
                    : 'bg-[#0c0c0e] border-[rgba(236,236,236,0.14)] text-[rgba(236,236,236,0.75)] hover:border-[#ececec]'
                }`}
              >
                1-Key Chords
              </button>
              <button
                type="button"
                onClick={onToggleSustain}
                className={`h-9 border rounded-[2px] font-mono text-[10px] uppercase tracking-[0.06em] transition-colors ${
                  sustainOn
                    ? 'bg-[#ff4d00] border-[#ff4d00] text-[#0c0c0e] font-semibold'
                    : 'bg-[#0c0c0e] border-[rgba(236,236,236,0.14)] text-[rgba(236,236,236,0.75)] hover:border-[#ececec]'
                }`}
              >
                Sustain Hold
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* Bottom Footer: Performance Keyboard + Master Output */}
      <footer className="border-t-2 border-[#ececec] bg-[#0c0c0e] px-5 py-3.5 grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] items-center gap-6">
        <PerformanceKeyboard
          baseOctave={baseOctave}
          onOctaveChange={onOctaveChange}
          activeNotes={activeNotes}
          highlightedNotes={arpHighlightedNotes}
          onNoteOn={onNoteOn}
          onNoteOff={onNoteOff}
          sustainOn={sustainOn}
          onToggleSustain={onToggleSustain}
          chordMode={chordMode}
          onToggleChordMode={onToggleChordMode}
          scaleLock={scaleLock}
          onScaleLockChange={onScaleLockChange}
          variant="console"
        />

        <div className="flex flex-col gap-3">
          {renderSlider(
            'Master Output Level',
            'masterGain',
            patch.masterGain,
            0.1,
            1.0,
            0.01,
            (v) => `${Math.round(v * 100)}%`
          )}
          <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-[rgba(236,236,236,0.54)]">
            <span className={audioReady ? 'text-[#ececec]' : 'text-[#ff4d00]'}>
              {audioReady ? 'Live Audio Ready' : 'Audio Standby — Press Key or Start'}
            </span>
            <span className="tabular-nums">
              {audioReady ? `${latency.baseMs}ms Base · ${(latency.sampleRate / 1000).toFixed(1)}kHz` : 'Interactive Mode'}
            </span>
          </div>
        </div>
      </footer>

      <PatchBrowserModal
        isOpen={patchBrowserOpen}
        onClose={() => setPatchBrowserOpen(false)}
        allPatches={allPatches}
        activePatchId={patch.id}
        onSelectPatch={onSelectPatch}
      />
    </div>
  );
};
