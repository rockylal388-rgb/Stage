import React, { useMemo, useState } from 'react';
import {
  FilterType,
  LfoTarget,
  MidiCCMap,
  MidiLearnableParam,
  OscWaveform,
  PatchCategory,
  SynthPatch,
} from '../types/synth';
import { Oscilloscope } from './Oscilloscope';
import { PerformanceKeyboard } from './PerformanceKeyboard';
import { Sliders, Volume2, Radio, BookmarkPlus } from 'lucide-react';

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
}

const WAVEFORMS: OscWaveform[] = ['sine', 'triangle', 'sawtooth', 'square'];
const FILTERS: FilterType[] = ['lowpass', 'bandpass', 'highpass', 'notch'];
const LFO_TARGETS: LfoTarget[] = ['filter', 'pitch', 'amp'];
const PATCH_CATEGORIES: ('All' | PatchCategory)[] = ['All', 'Bass', 'Lead', 'Pad', 'Pluck', 'Keys', 'Brass', 'FX'];
const EDITABLE_CATEGORIES: PatchCategory[] = ['Bass', 'Lead', 'Pad', 'Pluck', 'Keys', 'Brass', 'FX'];

const STAGE_PADS = [
  { label: 'i9 Root', sub: 'Am9', notes: [57, 60, 64, 67, 71] },
  { label: 'VImaj7', sub: 'Fmaj7', notes: [53, 57, 60, 64] },
  { label: 'IIIadd9', sub: 'Cadd9', notes: [48, 55, 60, 62, 64] },
  { label: 'VII6', sub: 'G6', notes: [55, 59, 62, 64] },
  { label: 'iv7', sub: 'Dm7', notes: [50, 53, 57, 60] },
  { label: 'v7', sub: 'Em7', notes: [52, 55, 59, 62] },
  { label: 'Sub Hit', sub: 'A1 + A2', notes: [33, 45] },
  { label: 'Octave Fifth', sub: 'A3 E4 A4', notes: [57, 64, 69] },
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
}) => {
  const [storingSlotMode, setStoringSlotMode] = useState(false);
  const [learnActive, setLearnActive] = useState(false);
  const [patchCategoryFilter, setPatchCategoryFilter] = useState<'All' | PatchCategory>('All');

  const filteredStagePatches = useMemo(() => {
    if (patchCategoryFilter === 'All') return allPatches;
    const matched = allPatches.filter((p) => p.category === patchCategoryFilter);
    // Keep currently active patch selectable so dropdown value stays synchronized
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
            <span className="text-xs text-neutral-300 truncate">{label}</span>
            {learnActive && learnable && (
              <button
                type="button"
                onClick={() => onSelectMidiLearnParam(isLearning ? null : learnable)}
                className={`px-1.5 py-0.5 text-[10px] font-mono rounded border transition-colors whitespace-nowrap shrink-0 ${
                  isLearning
                    ? 'bg-amber-500 text-[#0B0D11] border-amber-400 font-semibold'
                    : mappedCC !== null
                      ? 'bg-[#222734] text-amber-300 border-amber-500/40'
                      : 'bg-[#191D27] text-neutral-400 border-[#2D3342] hover:text-neutral-200'
                }`}
              >
                {isLearning ? 'Twist Knob...' : mappedCC !== null ? `CC ${mappedCC}` : 'Learn'}
              </button>
            )}
          </div>
          <span className="text-xs font-mono text-amber-400 shrink-0">{formatValue(value)}</span>
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
    <div className="flex flex-col gap-5">
      {/* Top Stage Bar: Quick Setlist Slots + Tempo / Metronome */}
      <div className="bg-[#12151C] border border-[#232732] rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-neutral-400 mr-1">Setlist Slots</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {stageSlots.map((slot, idx) => {
              const isActive = activeSlotIndex === idx;
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
                  title={slot ? `${idx + 1}: ${slot.name}` : `Empty Slot ${idx + 1}`}
                  className={`h-9 px-3 rounded-md text-xs font-medium border transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ${
                    storingSlotMode
                      ? 'bg-amber-500/15 border-amber-500 text-amber-200 hover:bg-amber-500/25'
                      : isActive
                        ? 'bg-amber-500 text-[#0B0D11] border-amber-400 font-semibold'
                        : slot
                          ? 'bg-[#191D27] border-[#292E3C] text-neutral-200 hover:border-neutral-500'
                          : 'bg-[#141720] border-[#20242E] text-neutral-500'
                  }`}
                >
                  <span className="font-mono text-[11px] opacity-75">{idx + 1}</span>
                  <span className="max-w-[96px] truncate">{slot ? slot.name : 'Empty'}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setStoringSlotMode((v) => !v)}
            className={`h-9 px-3 rounded-md text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
              storingSlotMode
                ? 'bg-amber-500 text-[#0B0D11] border-amber-400'
                : 'bg-[#191D27] border-[#2A303E] text-neutral-300 hover:border-neutral-500'
            }`}
          >
            {storingSlotMode ? 'Pick Slot...' : 'Store to Slot'}
          </button>
        </div>

        {/* Stage Tempo & Click */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-[#0D1016] border border-[#232732] rounded-lg px-2.5 py-1.5">
            <button
              type="button"
              onClick={() => onBpmChange(Math.max(40, bpm - 1))}
              className="w-6 h-6 rounded text-neutral-300 hover:bg-[#1D222E] font-mono text-sm"
              aria-label="Decrease BPM"
            >
              -
            </button>
            <div className="px-2 text-center">
              <span className="font-mono text-sm font-semibold text-neutral-100">{bpm}</span>
              <span className="text-[11px] text-neutral-400 ml-1">BPM</span>
            </div>
            <button
              type="button"
              onClick={() => onBpmChange(Math.min(220, bpm + 1))}
              className="w-6 h-6 rounded text-neutral-300 hover:bg-[#1D222E] font-mono text-sm"
              aria-label="Increase BPM"
            >
              +
            </button>
          </div>

          <button
            type="button"
            onClick={onTapTempo}
            className="h-9 px-3.5 rounded-lg bg-[#191D27] border border-[#2A303E] text-xs font-medium text-neutral-200 hover:border-amber-500/60 transition-colors whitespace-nowrap shrink-0"
          >
            Tap Tempo
          </button>

          <button
            type="button"
            onClick={onToggleMetronome}
            className={`h-9 px-3.5 rounded-lg border text-xs font-medium transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ${
              metronomeOn
                ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                : 'bg-[#191D27] border-[#2A303E] text-neutral-300 hover:border-neutral-500'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Click {metronomeOn ? `(${currentBeat + 1}/4)` : 'Off'}</span>
          </button>
        </div>
      </div>

      {/* Main Synthesizer & Sound Sculptor Workspace */}
      <div className="bg-[#12151C] border border-[#232732] rounded-xl p-5 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Active Patch Selection, Description, Oscilloscope */}
        <div className="lg:col-span-4 flex flex-col gap-5 lg:border-r lg:border-[#222631] lg:pr-6">
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="patch-select" className="text-xs font-medium text-neutral-400">
                Active Sound Patch
              </label>
              <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                <select
                  aria-label="Active patch category"
                  value={patch.category}
                  onChange={(e) => onUpdatePatch({ category: e.target.value as PatchCategory })}
                  className="bg-[#0D1016] border border-[#262B38] rounded px-1.5 py-0.5 text-[11px] text-amber-400 focus:outline-none focus:border-amber-500"
                >
                  {EDITABLE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <span>· {patch.author || 'Custom'}</span>
              </div>
            </div>

            {/* Category Filter Strip */}
            <div className="flex flex-wrap items-center gap-1 bg-[#0D1016] p-1 rounded-lg border border-[#222631]">
              {PATCH_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setPatchCategoryFilter(cat)}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                    patchCategoryFilter === cat
                      ? 'bg-[#252A38] text-amber-400'
                      : 'text-neutral-400 hover:text-neutral-200'
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
              className="w-full h-10 bg-[#0D1016] border border-[#2A303E] rounded-lg px-3 text-sm font-medium text-neutral-100 focus:outline-none focus:border-amber-500"
            >
              {filteredStagePatches.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.category})
                </option>
              ))}
            </select>
            <p className="text-xs text-neutral-400 leading-relaxed mt-0.5">{patch.description}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSaveToLibrary}
              className="flex-1 h-9 px-3 rounded-lg bg-[#191D27] border border-[#2A303E] hover:border-neutral-500 text-xs font-medium text-neutral-200 flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
            >
              <BookmarkPlus className="w-3.5 h-3.5 text-amber-400" />
              <span>Save Patch Copy</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const next = !learnActive;
                setLearnActive(next);
                if (!next) onSelectMidiLearnParam(null);
              }}
              className={`h-9 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                learnActive
                  ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                  : 'bg-[#191D27] border-[#2A303E] text-neutral-300 hover:border-neutral-500'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>MIDI Learn</span>
            </button>
          </div>

          <Oscilloscope audioReady={audioReady} />

          {/* Master Volume & Quick Audition */}
          <div className="pt-2 border-t border-[#222631] flex flex-col gap-3">
            {renderSlider(
              'Master Output Level',
              'masterGain',
              patch.masterGain,
              0.1,
              1.0,
              0.01,
              (v) => `${Math.round(v * 100)}%`
            )}
            <button
              type="button"
              onMouseDown={() => onTriggerChord([57, 60, 64, 67], true)}
              onMouseUp={() => onTriggerChord([57, 60, 64, 67], false)}
              onMouseLeave={() => onTriggerChord([57, 60, 64, 67], false)}
              className="h-9 px-4 rounded-lg bg-[#191D27] border border-[#2A303E] hover:border-amber-500/70 text-xs font-medium text-neutral-200 flex items-center justify-center gap-2 transition-colors"
            >
              <Volume2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Hold to Audition Sound (Am7)</span>
            </button>
          </div>
        </div>

        {/* Right Column: 3-Section Sound Sculpting Matrix */}
        <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Section 1: Oscillators */}
          <div className="flex flex-col gap-3.5">
            <h2 className="text-sm font-semibold text-neutral-100 pb-2 border-b border-[#222631]">
              Oscillators &amp; Pitch
            </h2>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-neutral-400">Oscillator 1 Wave</span>
              <div className="grid grid-cols-4 gap-1 bg-[#0D1016] p-1 rounded-md border border-[#232732]">
                {WAVEFORMS.map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => onUpdatePatch({ osc1Wave: w })}
                    className={`py-1 text-[11px] font-medium rounded capitalize transition-colors ${
                      patch.osc1Wave === w
                        ? 'bg-[#252A38] text-amber-400'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {w === 'sawtooth' ? 'Saw' : w === 'triangle' ? 'Tri' : w === 'square' ? 'Sqr' : 'Sin'}
                  </button>
                ))}
              </div>
            </div>

            {renderSlider('Osc 1 Level', 'osc1Level', patch.osc1Level, 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`)}
            {renderSlider('Osc 1 Octave', 'osc1Octave', patch.osc1Octave, -2, 2, 1, (v) => `${v > 0 ? '+' : ''}${v} oct`)}

            <div className="flex flex-col gap-1.5 pt-1">
              <span className="text-xs text-neutral-400">Oscillator 2 Wave</span>
              <div className="grid grid-cols-4 gap-1 bg-[#0D1016] p-1 rounded-md border border-[#232732]">
                {WAVEFORMS.map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => onUpdatePatch({ osc2Wave: w })}
                    className={`py-1 text-[11px] font-medium rounded capitalize transition-colors ${
                      patch.osc2Wave === w
                        ? 'bg-[#252A38] text-amber-400'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {w === 'sawtooth' ? 'Saw' : w === 'triangle' ? 'Tri' : w === 'square' ? 'Sqr' : 'Sin'}
                  </button>
                ))}
              </div>
            </div>

            {renderSlider('Osc 2 Mix', 'osc2Level', patch.osc2Level, 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`, 'osc2Level')}
            {renderSlider('Osc 2 Semitones', 'osc2Semi', patch.osc2Semi, -24, 24, 1, (v) => `${v > 0 ? '+' : ''}${v} st`)}
            {renderSlider('Sub Bass Osc', 'subLevel', patch.subLevel, 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`, 'subLevel')}
            {renderSlider('Unison Spread', 'unisonDetune', patch.unisonDetune, 0, 40, 1, (v) => `${v} ct`)}
            {renderSlider('Portamento Glide', 'glide', patch.glide, 0, 0.35, 0.005, (v) => `${Math.round(v * 1000)} ms`)}
          </div>

          {/* Section 2: Filter & Envelopes */}
          <div className="flex flex-col gap-3.5 md:border-l md:border-[#222631] md:pl-6">
            <h2 className="text-sm font-semibold text-neutral-100 pb-2 border-b border-[#222631]">
              Filter &amp; Envelope
            </h2>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-neutral-400">Filter Mode</span>
              <div className="grid grid-cols-4 gap-1 bg-[#0D1016] p-1 rounded-md border border-[#232732]">
                {FILTERS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => onUpdatePatch({ filterType: f })}
                    className={`py-1 text-[11px] font-medium rounded uppercase transition-colors ${
                      patch.filterType === f
                        ? 'bg-[#252A38] text-amber-400'
                        : 'text-neutral-400 hover:text-neutral-200'
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
            {renderSlider('Resonance (Q)', 'filterResonance', patch.filterResonance, 0.2, 16, 0.1, (v) => v.toFixed(1), 'filterResonance')}
            {renderSlider('Filter Env Depth', 'filterEnvAmount', patch.filterEnvAmount, -5000, 7500, 50, (v) => `${v > 0 ? '+' : ''}${Math.round(v)} Hz`)}
            {renderSlider('Amp Attack', 'ampAttack', patch.ampAttack, 0.002, 2.0, 0.005, (v) => `${v < 0.1 ? Math.round(v * 1000) + ' ms' : v.toFixed(2) + ' s'}`, 'ampAttack')}
            {renderSlider('Amp Decay', 'ampDecay', patch.ampDecay, 0.02, 2.5, 0.01, (v) => `${v.toFixed(2)} s`)}
            {renderSlider('Amp Sustain', 'ampSustain', patch.ampSustain, 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`)}
            {renderSlider('Amp Release', 'ampRelease', patch.ampRelease, 0.02, 3.5, 0.01, (v) => `${v.toFixed(2)} s`, 'ampRelease')}
          </div>

          {/* Section 3: LFO & Stage FX */}
          <div className="flex flex-col gap-3.5 md:border-l md:border-[#222631] md:pl-6">
            <h2 className="text-sm font-semibold text-neutral-100 pb-2 border-b border-[#222631]">
              Modulation &amp; Stage FX
            </h2>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-neutral-400">LFO Destination</span>
              <div className="grid grid-cols-3 gap-1 bg-[#0D1016] p-1 rounded-md border border-[#232732]">
                {LFO_TARGETS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onUpdatePatch({ lfoTarget: t })}
                    className={`py-1 text-[11px] font-medium rounded capitalize transition-colors ${
                      patch.lfoTarget === t
                        ? 'bg-[#252A38] text-amber-400'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {renderSlider('LFO Rate', 'lfoRate', patch.lfoRate, 0.1, 16, 0.1, (v) => `${v.toFixed(1)} Hz`, 'lfoRate')}
            {renderSlider('LFO Depth', 'lfoDepth', patch.lfoDepth, 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`, 'lfoDepth')}
            {renderSlider('Analog Drive', 'drive', patch.drive, 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`, 'drive')}
            {renderSlider('Stereo Chorus', 'chorusMix', patch.chorusMix, 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`, 'chorusMix')}
            {renderSlider('Delay Mix', 'delayMix', patch.delayMix, 0, 0.85, 0.01, (v) => `${Math.round(v * 100)}%`, 'delayMix')}
            {renderSlider('Delay Feedback', 'delayFeedback', patch.delayFeedback, 0, 0.72, 0.01, (v) => `${Math.round(v * 100)}%`)}
            {renderSlider('Hall Reverb', 'reverbMix', patch.reverbMix, 0, 0.88, 0.01, (v) => `${Math.round(v * 100)}%`, 'reverbMix')}
          </div>
        </div>
      </div>

      {/* Live Chord Trigger Pads */}
      <div className="bg-[#12151C] border border-[#232732] rounded-xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-neutral-400">Performance Chord &amp; Sub Trigger Pads</span>
          <span className="text-xs text-neutral-500">Press &amp; hold pads or play keys below</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
          {STAGE_PADS.map((pad) => (
            <button
              key={pad.label}
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                onTriggerChord(pad.notes, true);
              }}
              onPointerUp={() => onTriggerChord(pad.notes, false)}
              onPointerLeave={() => onTriggerChord(pad.notes, false)}
              onPointerCancel={() => onTriggerChord(pad.notes, false)}
              className="h-16 rounded-lg bg-[#171B24] border border-[#282D3B] hover:border-amber-500/70 active:bg-amber-500/20 active:border-amber-400 flex flex-col items-start justify-between p-2.5 text-left transition-colors touch-none"
            >
              <span className="text-xs font-semibold text-neutral-100">{pad.label}</span>
              <span className="text-[11px] font-mono text-amber-400/90">{pad.sub}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Performance Keyboard */}
      <PerformanceKeyboard
        baseOctave={baseOctave}
        onOctaveChange={onOctaveChange}
        activeNotes={activeNotes}
        onNoteOn={onNoteOn}
        onNoteOff={onNoteOff}
        sustainOn={sustainOn}
        onToggleSustain={onToggleSustain}
        chordMode={chordMode}
        onToggleChordMode={onToggleChordMode}
        scaleLock={scaleLock}
        onScaleLockChange={onScaleLockChange}
      />
    </div>
  );
};
