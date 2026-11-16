import React, { useMemo, useState } from 'react';
import { ChordStep, PatchCategory, SynthPatch } from '../types/synth';
import { synthEngine } from '../audio/synthEngine';
import { midiNoteToName } from '../audio/midiManager';
import { Wand2, Play, BookmarkPlus, Trash2, Loader2, Search } from 'lucide-react';
import { PerformanceKeyboard } from './PerformanceKeyboard';

interface AiSoundLabViewProps {
  onLoadPatch: (patch: SynthPatch) => void;
  onSavePatch: (patch: SynthPatch) => void;
  onUpdateUserPatchCategory: (id: string, category: PatchCategory) => void;
  onDeleteUserPatch: (id: string) => void;
  onStoreToSlot: (patch: SynthPatch, slotIdx: number) => void;
  userPatches: SynthPatch[];
  activePatch: SynthPatch;
  activeNotes: Set<number>;
  baseOctave: number;
  onOctaveChange: (oct: number) => void;
  onNoteOn: (note: number, vel?: number) => void;
  onNoteOff: (note: number) => void;
  sustainOn: boolean;
  onToggleSustain: () => void;
  chordMode: boolean;
  onToggleChordMode: () => void;
  scaleLock: string;
  onScaleLockChange: (scale: string) => void;
}

const ROLES: ('Any' | PatchCategory)[] = [
  'Any',
  'Bass',
  'Lead',
  'Pad',
  'Pluck',
  'Keys',
  'Brass',
  'FX',
];
const LIBRARY_CATEGORIES: ('All' | PatchCategory)[] = [
  'All',
  'Bass',
  'Lead',
  'Pad',
  'Pluck',
  'Keys',
  'Brass',
  'FX',
];
const PATCH_CATEGORIES: PatchCategory[] = ['Bass', 'Lead', 'Pad', 'Pluck', 'Keys', 'Brass', 'FX'];

const EXAMPLE_PROMPTS = [
  'Warm detuned 80s tape brass pad that swells slowly with wide chorus and hall reverb',
  'Punchy UK garage FM bass with tight sub weight and snappy lowpass decay',
  'Crystalline glassy bell pluck with dotted-eighth stereo delay for synth-pop hooks',
  'Gritty melodic techno lead with biting filter resonance and analog drive',
];

export const AiSoundLabView: React.FC<AiSoundLabViewProps> = ({
  onLoadPatch,
  onSavePatch,
  onUpdateUserPatchCategory,
  onDeleteUserPatch,
  onStoreToSlot,
  userPatches,
  activePatch,
  activeNotes,
  baseOctave,
  onOctaveChange,
  onNoteOn,
  onNoteOff,
  sustainOn,
  onToggleSustain,
  chordMode,
  onToggleChordMode,
  scaleLock,
  onScaleLockChange,
}) => {
  const [prompt, setPrompt] = useState('');
  const [role, setRole] = useState<'Any' | PatchCategory>('Any');
  const [mood, setMood] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedPatch, setGeneratedPatch] = useState<SynthPatch | null>(null);
  const [suggestedChords, setSuggestedChords] = useState<ChordStep[]>([]);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [slotSelect, setSlotSelect] = useState<number>(0);
  const [libraryCategory, setLibraryCategory] = useState<'All' | PatchCategory>('All');
  const [librarySearch, setLibrarySearch] = useState('');

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: userPatches.length };
    for (const cat of PATCH_CATEGORIES) {
      counts[cat] = 0;
    }
    for (const p of userPatches) {
      counts[p.category] = (counts[p.category] || 0) + 1;
    }
    return counts;
  }, [userPatches]);

  const filteredUserPatches = useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    return userPatches.filter((p) => {
      const matchesCat = libraryCategory === 'All' || p.category === libraryCategory;
      const matchesSearch =
        !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });
  }, [userPatches, libraryCategory, librarySearch]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || loading) return;

    setLoading(true);
    setError(null);
    setSavedNotice(null);

    try {
      await synthEngine.init();
      const res = await fetch('/api/ai/design-sound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), role, mood: mood.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to design sound.');
      }

      const nextPatch = data.patch as SynthPatch;
      const nextChords = (data.suggestedProgression || []) as ChordStep[];

      setGeneratedPatch(nextPatch);
      setSuggestedChords(nextChords);
      onLoadPatch(nextPatch);

      if (nextChords.length > 0 && nextChords[0].midiNotes.length > 0) {
        await synthEngine.playChord(nextChords[0].midiNotes, 1000, 96);
      } else {
        await synthEngine.playChord([57, 60, 64], 900, 96);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate sound.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGenerated = () => {
    if (!generatedPatch) return;
    onSavePatch(generatedPatch);
    setSavedNotice(`Saved "${generatedPatch.name}" to your custom patch library.`);
  };

  const handleAssignSlot = () => {
    if (!generatedPatch) return;
    onStoreToSlot(generatedPatch, slotSelect);
    setSavedNotice(`Assigned "${generatedPatch.name}" to Stage Slot ${slotSelect + 1}.`);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: AI Sound Designer Prompt Form */}
        <form
          onSubmit={handleGenerate}
          className="lg:col-span-5 bg-[#161618] border border-[rgba(236,236,236,0.12)] rounded-[2px] p-5 flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1 border-b border-[rgba(236,236,236,0.12)] pb-3">
            <h2 className="font-display text-sm font-extrabold uppercase tracking-[0.06em] text-[#ececec]">
              AI Sound Designer
            </h2>
            <p className="text-xs text-[rgba(236,236,236,0.6)] leading-relaxed">
              Describe the timbre, texture, or song vibe you want. The engine programs oscillators,
              filters, envelopes, LFO modulation, and stage FX directly into your live synth.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="ai-sound-prompt"
              className="font-mono text-[10px] uppercase tracking-[0.12em] text-[rgba(236,236,236,0.54)]"
            >
              Sound Description
            </label>
            <textarea
              id="ai-sound-prompt"
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., Lush warm analog synth pad like an 80s arena ballad with slow filter swell and tape chorus..."
              className="w-full rounded-[2px] bg-[#0c0c0e] border border-[rgba(236,236,236,0.14)] p-3 text-sm text-[#ececec] placeholder:text-[rgba(236,236,236,0.38)] focus:outline-none focus:border-[#ff4d00] resize-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[rgba(236,236,236,0.54)]">
              Instrument Role
            </span>
            <div className="flex flex-wrap gap-1 bg-[#0c0c0e] p-1 rounded-[2px] border border-[rgba(236,236,236,0.12)]">
              {ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`px-2.5 py-1 rounded-[2px] font-mono text-[10px] uppercase tracking-[0.06em] transition-colors whitespace-nowrap shrink-0 ${
                    role === r
                      ? 'bg-[#ff4d00] text-[#0c0c0e] font-semibold'
                      : 'text-[rgba(236,236,236,0.54)] hover:text-[#ececec]'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="ai-mood-input"
              className="font-mono text-[10px] uppercase tracking-[0.12em] text-[rgba(236,236,236,0.54)]"
            >
              Genre or Venue Context (Optional)
            </label>
            <input
              id="ai-mood-input"
              type="text"
              value={mood}
              onChange={(e) => setMood(e.target.value)}
              placeholder="e.g., Festival mainstage, intimate indie set, dark club"
              className="h-9 px-3 rounded-[2px] bg-[#0c0c0e] border border-[rgba(236,236,236,0.14)] text-xs text-[#ececec] placeholder:text-[rgba(236,236,236,0.38)] focus:outline-none focus:border-[#ff4d00]"
            />
          </div>

          {error && (
            <div className="rounded-[2px] border border-[#ff4d00] bg-[#ff4d00]/10 px-3 py-2.5 text-xs text-[#ececec]">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            className="h-10 px-4 rounded-[2px] bg-[#ff4d00] hover:bg-[#ff621f] disabled:opacity-50 disabled:cursor-not-allowed text-[#0c0c0e] font-mono text-xs font-bold uppercase tracking-[0.06em] flex items-center justify-center gap-2 transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Synthesizing Patch...</span>
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                <span>Generate &amp; Load Sound</span>
              </>
            )}
          </button>

          <div className="pt-2 border-t border-[rgba(236,236,236,0.12)] flex flex-col gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[rgba(236,236,236,0.54)]">
              Try a Quick Prompt
            </span>
            <div className="flex flex-col gap-1.5">
              {EXAMPLE_PROMPTS.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setPrompt(ex)}
                  className="text-left text-xs text-[rgba(236,236,236,0.58)] hover:text-[#ff4d00] transition-colors py-1 border-b border-[rgba(236,236,236,0.08)] last:border-b-0"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        </form>

        {/* Right: Generated Patch Architecture & Custom Library */}
        <div className="lg:col-span-7 flex flex-col gap-5">
          {/* Result Card */}
          <div className="bg-[#161618] border border-[rgba(236,236,236,0.12)] rounded-[2px] p-5 flex flex-col gap-4">
            {generatedPatch ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4 pb-3 border-b border-[rgba(236,236,236,0.12)]">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[rgba(236,236,236,0.54)]">
                      <span className="text-[#ff4d00]">{generatedPatch.category}</span>
                      <span aria-hidden="true">/</span>
                      <span className="tabular-nums">{generatedPatch.bpmHint || 120} BPM</span>
                      <span aria-hidden="true">/</span>
                      <span>Active in Engine</span>
                    </div>
                    <h3 className="text-xl font-display font-extrabold uppercase tracking-[-0.01em] text-[#ececec]">
                      {generatedPatch.name}
                    </h3>
                    <p className="text-xs text-[rgba(236,236,236,0.68)] leading-relaxed max-w-xl">
                      {generatedPatch.description}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => synthEngine.playChord([57, 60, 64, 67], 1100, 96)}
                      className="h-9 px-3.5 rounded-[2px] bg-[#0c0c0e] border border-[rgba(236,236,236,0.14)] hover:border-[#ececec] font-mono text-[11px] uppercase tracking-[0.06em] text-[#ececec] flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <Play className="w-3.5 h-3.5 text-[#ff4d00]" />
                      <span>Audition</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveGenerated}
                      className="h-9 px-3.5 rounded-[2px] bg-[#ff4d00] hover:bg-[#ff621f] text-[#0c0c0e] font-mono text-[11px] font-bold uppercase tracking-[0.06em] flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <BookmarkPlus className="w-3.5 h-3.5" />
                      <span>Save to Library</span>
                    </button>
                  </div>
                </div>

                {/* Patch Spec Readout */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-[#0c0c0e] border border-[rgba(236,236,236,0.12)] rounded-[2px] p-3 flex flex-col gap-1">
                    <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[rgba(236,236,236,0.5)]">
                      Oscillators
                    </span>
                    <span className="font-mono text-[#ececec] capitalize">
                      {generatedPatch.osc1Wave} + {generatedPatch.osc2Wave}
                    </span>
                    <span className="font-mono text-[11px] text-[rgba(236,236,236,0.54)] tabular-nums">
                      Sub {Math.round(generatedPatch.subLevel * 100)}% / Uni {generatedPatch.unisonDetune}ct
                    </span>
                  </div>
                  <div className="bg-[#0c0c0e] border border-[rgba(236,236,236,0.12)] rounded-[2px] p-3 flex flex-col gap-1">
                    <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[rgba(236,236,236,0.5)]">
                      Filter
                    </span>
                    <span className="font-mono text-[#ff4d00] tabular-nums">
                      {Math.round(generatedPatch.filterCutoff)} Hz
                    </span>
                    <span className="font-mono text-[11px] text-[rgba(236,236,236,0.54)] tabular-nums">
                      Q {generatedPatch.filterResonance.toFixed(1)} / {generatedPatch.filterType}
                    </span>
                  </div>
                  <div className="bg-[#0c0c0e] border border-[rgba(236,236,236,0.12)] rounded-[2px] p-3 flex flex-col gap-1">
                    <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[rgba(236,236,236,0.5)]">
                      Envelope (ADSR)
                    </span>
                    <span className="font-mono text-[#ececec] tabular-nums">
                      A {generatedPatch.ampAttack.toFixed(2)}s / R {generatedPatch.ampRelease.toFixed(2)}s
                    </span>
                    <span className="font-mono text-[11px] text-[rgba(236,236,236,0.54)] tabular-nums">
                      Sustain {Math.round(generatedPatch.ampSustain * 100)}%
                    </span>
                  </div>
                  <div className="bg-[#0c0c0e] border border-[rgba(236,236,236,0.12)] rounded-[2px] p-3 flex flex-col gap-1">
                    <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[rgba(236,236,236,0.5)]">
                      Stage FX
                    </span>
                    <span className="font-mono text-[#ececec] tabular-nums">
                      Rev {Math.round(generatedPatch.reverbMix * 100)}% / Dly {Math.round(generatedPatch.delayMix * 100)}%
                    </span>
                    <span className="font-mono text-[11px] text-[rgba(236,236,236,0.54)] tabular-nums">
                      Drive {Math.round(generatedPatch.drive * 100)}%
                    </span>
                  </div>
                </div>

                {/* Assign to Live Stage Slot */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[rgba(236,236,236,0.54)]">
                      Assign to Live Slot
                    </span>
                    <select
                      value={slotSelect}
                      onChange={(e) => setSlotSelect(Number(e.target.value))}
                      className="h-8 bg-[#0c0c0e] border border-[rgba(236,236,236,0.14)] rounded-[2px] px-2 text-xs font-mono text-[#ececec]"
                    >
                      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                        <option key={i} value={i}>
                          Slot {String(i + 1).padStart(2, '0')}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleAssignSlot}
                      className="h-8 px-3 rounded-[2px] bg-[#0c0c0e] border border-[rgba(236,236,236,0.14)] hover:border-[#ff4d00] font-mono text-[10px] uppercase tracking-[0.06em] text-[#ececec] transition-colors"
                    >
                      Assign
                    </button>
                  </div>
                  {savedNotice && <span className="font-mono text-xs text-[#ff4d00]">{savedNotice}</span>}
                </div>

                {suggestedChords.length > 0 && (
                  <div className="pt-3 border-t border-[rgba(236,236,236,0.12)] flex flex-col gap-2.5">
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[rgba(236,236,236,0.54)]">
                      Tailored Chord Progression (Click to Play)
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {suggestedChords.map((ch, idx) => (
                        <button
                          key={`${ch.symbol}-${idx}`}
                          type="button"
                          onClick={() => synthEngine.playChord(ch.midiNotes, 1100, 96)}
                          className="p-3 rounded-[2px] bg-[#0c0c0e] border border-[rgba(236,236,236,0.12)] hover:border-[#ff4d00] text-left flex flex-col gap-1 transition-colors"
                        >
                          <div className="flex items-baseline justify-between">
                            <span className="text-base font-display font-bold text-[#ececec]">
                              {ch.symbol}
                            </span>
                            <span className="text-[11px] font-mono text-[#ff4d00]">{ch.roman}</span>
                          </div>
                          <span className="text-[11px] font-mono text-[rgba(236,236,236,0.54)] truncate">
                            {ch.midiNotes.map(midiNoteToName).join(' ')}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="py-10 text-center flex flex-col items-center gap-2">
                <p className="font-display text-sm font-bold uppercase tracking-[0.04em] text-[#ececec]">
                  No AI patch synthesized in this session yet
                </p>
                <p className="text-xs text-[rgba(236,236,236,0.54)] max-w-md">
                  Enter a description on the left and click Generate &amp; Load Sound to craft a
                  custom synthesizer patch and audition it live.
                </p>
              </div>
            )}
          </div>

          {/* Saved Custom & AI Patch Library */}
          <div className="bg-[#161618] border border-[rgba(236,236,236,0.12)] rounded-[2px] p-5 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-xs font-extrabold uppercase tracking-[0.06em] text-[#ececec]">
                  Patch Library ({userPatches.length})
                </h3>
                <p className="text-xs text-[rgba(236,236,236,0.54)] mt-0.5">
                  Filter or re-categorize your saved custom and AI-generated sounds.
                </p>
              </div>
              {userPatches.length > 0 && (
                <div className="relative w-full sm:w-52">
                  <Search className="w-3.5 h-3.5 text-[rgba(236,236,236,0.45)] absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={librarySearch}
                    onChange={(e) => setLibrarySearch(e.target.value)}
                    placeholder="Filter saved sounds..."
                    className="w-full h-8 pl-8 pr-2.5 rounded-[2px] bg-[#0c0c0e] border border-[rgba(236,236,236,0.14)] text-xs text-[#ececec] placeholder:text-[rgba(236,236,236,0.38)] focus:outline-none focus:border-[#ff4d00]"
                  />
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1 bg-[#0c0c0e] p-1 rounded-[2px] border border-[rgba(236,236,236,0.12)]">
              {LIBRARY_CATEGORIES.map((cat) => {
                const count = categoryCounts[cat] || 0;
                const isActive = libraryCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setLibraryCategory(cat)}
                    className={`px-2.5 py-1 rounded-[2px] font-mono text-[10px] uppercase tracking-[0.06em] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'bg-[#ff4d00] text-[#0c0c0e] font-semibold'
                        : 'text-[rgba(236,236,236,0.54)] hover:text-[#ececec]'
                    }`}
                  >
                    <span>{cat}</span>
                    <span className="tabular-nums opacity-80">{count}</span>
                  </button>
                );
              })}
            </div>

            {userPatches.length === 0 ? (
              <p className="text-xs text-[rgba(236,236,236,0.54)] py-4">
                Your saved AI-generated sounds and customized Stage patches will appear here,
                organized by Bass, Lead, Pad, Pluck, Keys, Brass, and FX.
              </p>
            ) : filteredUserPatches.length === 0 ? (
              <p className="text-xs text-[rgba(236,236,236,0.54)] py-4">
                No saved patches in {libraryCategory === 'All' ? 'your library' : `the ${libraryCategory} category`} match your filter.
              </p>
            ) : (
              <div className="divide-y divide-[rgba(236,236,236,0.08)]">
                {filteredUserPatches.map((up) => {
                  const isCurrent = activePatch.id === up.id;
                  return (
                    <div
                      key={up.id}
                      className="py-3 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-[#ececec] truncate">
                            {up.name}
                          </span>
                          <span className="font-mono text-[10px] uppercase text-[#ff4d00] shrink-0">
                            {up.category} / {up.author || 'User'}
                          </span>
                        </div>
                        <p className="text-xs text-[rgba(236,236,236,0.54)] truncate">
                          {up.description}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <select
                          aria-label={`Category for ${up.name}`}
                          value={up.category}
                          onChange={(e) =>
                            onUpdateUserPatchCategory(up.id, e.target.value as PatchCategory)
                          }
                          className="h-8 bg-[#0c0c0e] border border-[rgba(236,236,236,0.14)] rounded-[2px] px-2 font-mono text-[11px] text-[#ececec] focus:outline-none focus:border-[#ff4d00]"
                        >
                          {PATCH_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={async () => {
                            onLoadPatch(up);
                            const testNote = up.category === 'Bass' ? [45] : [57, 60, 64];
                            await synthEngine.playChord(testNote, 750, 96);
                          }}
                          title="Audition sound"
                          aria-label={`Audition ${up.name}`}
                          className="h-8 w-8 rounded-[2px] bg-[#0c0c0e] border border-[rgba(236,236,236,0.14)] hover:border-[#ff4d00] text-[#ff4d00] flex items-center justify-center transition-colors"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onLoadPatch(up)}
                          className={`h-8 px-3 rounded-[2px] font-mono text-[10px] uppercase tracking-[0.06em] border transition-colors ${
                            isCurrent
                              ? 'bg-[#ff4d00] text-[#0c0c0e] border-[#ff4d00] font-bold'
                              : 'bg-[#0c0c0e] border-[rgba(236,236,236,0.14)] text-[#ececec] hover:border-[#ececec]'
                          }`}
                        >
                          {isCurrent ? 'Loaded' : 'Load'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteUserPatch(up.id)}
                          aria-label={`Delete ${up.name}`}
                          className="h-8 w-8 rounded-[2px] bg-[#0c0c0e] border border-[rgba(236,236,236,0.14)] hover:border-[#ff4d00] text-[rgba(236,236,236,0.54)] hover:text-[#ff4d00] flex items-center justify-center transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

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
