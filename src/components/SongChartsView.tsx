import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TRENDING_SONGS } from '../data/presets';
import { BandGenre, ChordStep, SynthPatch, TrendingSongEntry } from '../types/synth';
import { midiNoteToName } from '../audio/midiManager';
import { synthEngine } from '../audio/synthEngine';
import { Play, Square, Music2, ArrowRight, Search, Plus, Loader2, Trash2 } from 'lucide-react';
import { PerformanceKeyboard } from './PerformanceKeyboard';

interface SongChartsViewProps {
  activePatchId: string;
  onLoadSongPatch: (patch: SynthPatch, bpm: number) => void;
  customSongs: TrendingSongEntry[];
  onAddCustomSong: (song: TrendingSongEntry) => void;
  onDeleteCustomSong: (id: string) => void;
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

const GENRES: ('All' | BandGenre)[] = [
  'All',
  'Rock & Alt',
  'Indie & Arena',
  'Synth-Pop',
  'Synthwave & 80s',
  'Electronic & Club',
  'Funk & Disco',
  'Classic Rock',
];

const CHROMATIC_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_TO_SHARP: Record<string, string> = {
  Db: 'C#',
  Eb: 'D#',
  Gb: 'F#',
  Ab: 'G#',
  Bb: 'A#',
};

function transposeRoot(root: string, semitones: number): string {
  const normalized = FLAT_TO_SHARP[root] || root;
  const idx = CHROMATIC_SHARP.indexOf(normalized);
  if (idx === -1) return root;
  return CHROMATIC_SHARP[(idx + semitones + 120) % 12];
}

function transposeChordSymbol(symbol: string, semitones: number): string {
  if (semitones === 0) return symbol;
  return symbol.replace(/\b([A-G][b#]?)/g, (match) => transposeRoot(match, semitones));
}

export const SongChartsView: React.FC<SongChartsViewProps> = ({
  activePatchId,
  onLoadSongPatch,
  customSongs,
  onAddCustomSong,
  onDeleteCustomSong,
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
  const allSongs = useMemo(() => [...customSongs, ...TRENDING_SONGS], [customSongs]);

  const [genreFilter, setGenreFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSongId, setSelectedSongId] = useState<string>(allSongs[0].id);
  const [transpose, setTranspose] = useState<number>(0);
  const [playingSectionIdx, setPlayingSectionIdx] = useState<number | null>(null);
  const [activeChordKey, setActiveChordKey] = useState<string | null>(null);
  const [highlightedNotes, setHighlightedNotes] = useState<Set<number>>(new Set());

  const [bandQuery, setBandQuery] = useState('');
  const [generatingBand, setGeneratingBand] = useState(false);
  const [bandError, setBandError] = useState<string | null>(null);

  const seqTimerRef = useRef<number | null>(null);
  const heldChordRef = useRef<number[]>([]);
  const transposeRef = useRef<number>(transpose);
  transposeRef.current = transpose;

  const selectedSong = useMemo(
    () => allSongs.find((s) => s.id === selectedSongId) || allSongs[0],
    [allSongs, selectedSongId]
  );

  const filteredSongs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allSongs.filter((s) => {
      const matchesGenre = genreFilter === 'All' || s.genre === genreFilter;
      const matchesSearch =
        !q ||
        s.bandName.toLowerCase().includes(q) ||
        s.title.toLowerCase().includes(q) ||
        s.artistOrStyle.toLowerCase().includes(q) ||
        s.soundRole.toLowerCase().includes(q) ||
        s.musicalKey.toLowerCase().includes(q);
      return matchesGenre && matchesSearch;
    });
  }, [allSongs, genreFilter, searchQuery]);

  const stopSequencer = () => {
    if (seqTimerRef.current) {
      window.clearTimeout(seqTimerRef.current);
      seqTimerRef.current = null;
    }
    heldChordRef.current.forEach((n) => synthEngine.noteOff(n));
    heldChordRef.current = [];
    setPlayingSectionIdx(null);
    setActiveChordKey(null);
  };

  useEffect(() => {
    return () => {
      if (seqTimerRef.current) {
        window.clearTimeout(seqTimerRef.current);
        seqTimerRef.current = null;
      }
      heldChordRef.current.forEach((n) => synthEngine.noteOff(n));
      heldChordRef.current = [];
    };
  }, []);

  const handleSelectSong = (song: TrendingSongEntry) => {
    stopSequencer();
    setSelectedSongId(song.id);
    setTranspose(0);
    setHighlightedNotes(new Set());
  };

  const handleGenerateBandChart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bandQuery.trim() || generatingBand) return;
    setGeneratingBand(true);
    setBandError(null);
    stopSequencer();

    try {
      await synthEngine.init();
      const res = await fetch('/api/ai/band-chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: bandQuery.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not generate band chart.');
      }
      const created = data.song as TrendingSongEntry;
      onAddCustomSong(created);
      setGenreFilter('All');
      setSearchQuery('');
      setSelectedSongId(created.id);
      setTranspose(0);
      setBandQuery('');
      onLoadSongPatch(created.patch, created.bpm);
    } catch (err) {
      setBandError(err instanceof Error ? err.message : 'Failed to create band chart.');
    } finally {
      setGeneratingBand(false);
    }
  };

  const getTransposedNotes = (notes: number[]) => notes.map((n) => n + transpose);

  const auditionChord = async (chord: ChordStep, keyId: string, durationMs = 1150) => {
    const notes = getTransposedNotes(chord.midiNotes);
    setHighlightedNotes(new Set(notes));
    setActiveChordKey(keyId);
    await synthEngine.playChord(notes, durationMs, 96);
  };

  const startSectionPlayback = (sectionIndex: number) => {
    if (playingSectionIdx === sectionIndex) {
      stopSequencer();
      return;
    }
    stopSequencer();
    if (activePatchId !== selectedSong.patch.id) {
      onLoadSongPatch(selectedSong.patch, selectedSong.bpm);
    }

    const section = selectedSong.sections[sectionIndex];
    if (!section || section.chords.length === 0) return;

    setPlayingSectionIdx(sectionIndex);
    let stepIdx = 0;

    const tick = async () => {
      const chord = section.chords[stepIdx % section.chords.length];
      const keyId = `${sectionIndex}-${stepIdx % section.chords.length}`;
      const beatMs = (60 / selectedSong.bpm) * 1000;
      const chordMs = beatMs * chord.beats;

      heldChordRef.current.forEach((n) => synthEngine.noteOff(n));
      const notes = chord.midiNotes.map((n) => n + transposeRef.current);
      heldChordRef.current = notes;
      setHighlightedNotes(new Set(notes));
      setActiveChordKey(keyId);

      for (const n of notes) {
        await synthEngine.noteOn(n, 92);
      }

      stepIdx++;
      seqTimerRef.current = window.setTimeout(tick, chordMs);
    };

    void tick();
  };

  const isCustomSong = selectedSong.id.startsWith('band-ai-');

  return (
    <div className="flex flex-col gap-5">
      {/* Add Any Band / Song + Genre Filter & Search Bar */}
      <div className="bg-[#161618] border border-[rgba(236,236,236,0.12)] rounded-[2px] p-4 flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-[rgba(236,236,236,0.45)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search band, song, key, sound..."
              className="w-full h-9 pl-9 pr-3 rounded-[2px] bg-[#0c0c0e] border border-[rgba(236,236,236,0.14)] text-xs text-[#ececec] placeholder:text-[rgba(236,236,236,0.4)] focus:outline-none focus:border-[#ff4d00]"
            />
          </div>

          <form
            onSubmit={handleGenerateBandChart}
            className="flex flex-wrap items-center gap-2 flex-1 sm:justify-end"
          >
            <input
              type="text"
              value={bandQuery}
              onChange={(e) => setBandQuery(e.target.value)}
              placeholder="Add any band or song (e.g. Arctic Monkeys, Take On Me)..."
              className="h-9 px-3 rounded-[2px] bg-[#0c0c0e] border border-[rgba(236,236,236,0.14)] text-xs text-[#ececec] placeholder:text-[rgba(236,236,236,0.4)] focus:outline-none focus:border-[#ff4d00] w-full sm:w-72"
            />
            <button
              type="submit"
              disabled={generatingBand || !bandQuery.trim()}
              className="h-9 px-3.5 rounded-[2px] bg-[#ff4d00] hover:bg-[#ff621f] disabled:opacity-50 disabled:cursor-not-allowed text-[#0c0c0e] font-mono text-[11px] font-bold uppercase tracking-[0.06em] flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              {generatingBand ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Building Chart...</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Band Chart</span>
                </>
              )}
            </button>
          </form>
        </div>

        {bandError && (
          <div className="rounded-[2px] border border-[#ff4d00] bg-[#ff4d00]/10 px-3 py-2 text-xs text-[#ececec]">
            {bandError}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1 bg-[#0c0c0e] p-1 rounded-[2px] border border-[rgba(236,236,236,0.12)]">
          {GENRES.map((genre) => (
            <button
              key={genre}
              type="button"
              onClick={() => setGenreFilter(genre)}
              className={`px-3 py-1.5 rounded-[2px] font-mono text-[10px] uppercase tracking-[0.06em] transition-colors whitespace-nowrap shrink-0 ${
                genreFilter === genre
                  ? 'bg-[#ff4d00] text-[#0c0c0e] font-semibold'
                  : 'text-[rgba(236,236,236,0.54)] hover:text-[#ececec]'
              }`}
            >
              {genre}
            </button>
          ))}
        </div>
      </div>

      {/* Main Split: Band & Song Directory (Left) + Inbuilt Chord Chart & Patch Loader (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-4 bg-[#161618] border border-[rgba(236,236,236,0.12)] rounded-[2px] overflow-hidden">
          <div className="px-4 py-3 border-b border-[rgba(236,236,236,0.12)] flex items-center justify-between">
            <h2 className="font-display text-xs font-extrabold uppercase tracking-[0.06em] text-[#ececec]">
              All Bands &amp; Song Sounds
            </h2>
            <span className="font-mono text-xs text-[#ff4d00] tabular-nums">
              {filteredSongs.length}
            </span>
          </div>

          {filteredSongs.length === 0 ? (
            <div className="p-6 text-center text-xs text-[rgba(236,236,236,0.54)] flex flex-col gap-2">
              <span>No band or song matched your search.</span>
              <span>
                Use &ldquo;Add Band Chart&rdquo; above to generate any band&apos;s sound and chord
                chart on demand.
              </span>
            </div>
          ) : (
            <div className="divide-y divide-[rgba(236,236,236,0.08)] max-h-[540px] overflow-y-auto">
              {filteredSongs.map((song) => {
                const isSelected = song.id === selectedSong.id;
                const isLoaded = activePatchId === song.patch.id;
                return (
                  <button
                    key={song.id}
                    type="button"
                    onClick={() => handleSelectSong(song)}
                    className={`w-full text-left px-4 py-3 transition-colors flex flex-col gap-0.5 border-l-2 ${
                      isSelected
                        ? 'bg-[#0c0c0e] border-l-[#ff4d00]'
                        : 'border-l-transparent hover:bg-[#0c0c0e]/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-[#ececec] truncate">
                        {song.bandName}
                      </span>
                      {isLoaded && (
                        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#ff4d00] shrink-0">
                          Loaded
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-[rgba(236,236,236,0.75)] truncate">
                      {song.title}
                    </span>
                    <div className="flex items-center gap-1.5 text-[11px] text-[rgba(236,236,236,0.48)] font-mono mt-0.5 tabular-nums">
                      <span>{song.bpm} BPM</span>
                      <span aria-hidden="true">/</span>
                      <span>{song.musicalKey}</span>
                      <span aria-hidden="true">/</span>
                      <span className="font-sans truncate">{song.genre}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Inbuilt Chord Chart & Performance Sheet */}
        <div className="lg:col-span-8 bg-[#161618] border border-[rgba(236,236,236,0.12)] rounded-[2px] p-5 flex flex-col gap-5">
          <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-[rgba(236,236,236,0.12)]">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[rgba(236,236,236,0.54)]">
                <span className="text-[#ececec] font-semibold">{selectedSong.bandName}</span>
                <span aria-hidden="true">/</span>
                <span>{selectedSong.genre}</span>
                <span aria-hidden="true">/</span>
                <span className="tabular-nums">{selectedSong.bpm} BPM</span>
                <span aria-hidden="true">/</span>
                <span>{selectedSong.timeSignature}</span>
              </div>
              <h2 className="text-2xl font-display font-extrabold uppercase tracking-[-0.02em] text-[#ececec]">
                {selectedSong.title}
              </h2>
              <p className="text-xs text-[rgba(236,236,236,0.72)]">
                {selectedSong.artistOrStyle} —{' '}
                <span className="text-[#ff4d00] font-medium">{selectedSong.soundRole}</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-1.5 bg-[#0c0c0e] border border-[rgba(236,236,236,0.14)] rounded-[2px] px-2.5 py-1.5">
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[rgba(236,236,236,0.54)] mr-1">
                  Transpose
                </span>
                <button
                  type="button"
                  onClick={() => setTranspose((t) => Math.max(-6, t - 1))}
                  className="w-6 h-6 rounded-[2px] hover:bg-[#161618] text-[#ececec] font-mono text-xs"
                >
                  -
                </button>
                <span className="w-8 text-center font-mono text-xs text-[#ff4d00] tabular-nums">
                  {transpose > 0 ? `+${transpose}` : transpose}
                </span>
                <button
                  type="button"
                  onClick={() => setTranspose((t) => Math.min(6, t + 1))}
                  className="w-6 h-6 rounded-[2px] hover:bg-[#161618] text-[#ececec] font-mono text-xs"
                >
                  +
                </button>
              </div>

              <button
                type="button"
                onClick={() => onLoadSongPatch(selectedSong.patch, selectedSong.bpm)}
                className="h-9 px-4 rounded-[2px] bg-[#ff4d00] hover:bg-[#ff621f] text-[#0c0c0e] font-mono text-[11px] font-bold uppercase tracking-[0.06em] flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
              >
                <Music2 className="w-3.5 h-3.5" />
                <span>
                  {activePatchId === selectedSong.patch.id ? 'Sound Loaded' : 'Load Sound & Tempo'}
                </span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              {isCustomSong && (
                <button
                  type="button"
                  onClick={() => {
                    stopSequencer();
                    onDeleteCustomSong(selectedSong.id);
                    setSelectedSongId(TRENDING_SONGS[0].id);
                  }}
                  aria-label="Remove custom band chart"
                  className="h-9 w-9 rounded-[2px] bg-[#0c0c0e] border border-[rgba(236,236,236,0.14)] hover:border-[#ff4d00] text-[rgba(236,236,236,0.54)] hover:text-[#ff4d00] flex items-center justify-center transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[rgba(236,236,236,0.75)] bg-[#0c0c0e] border border-[rgba(236,236,236,0.12)] rounded-[2px] px-4 py-3">
            <p className="leading-relaxed">{selectedSong.performanceNotes}</p>
            <span className="font-mono text-[11px] uppercase text-[#ff4d00] shrink-0">
              Key: {transposeChordSymbol(selectedSong.musicalKey, transpose)}
            </span>
          </div>

          <div className="flex flex-col gap-5">
            {selectedSong.sections.map((section, sIdx) => {
              const isPlaying = playingSectionIdx === sIdx;
              return (
                <div key={section.name} className="flex flex-col gap-3">
                  <div className="flex items-center justify-between border-b border-[rgba(236,236,236,0.1)] pb-2">
                    <h3 className="font-display text-xs font-extrabold uppercase tracking-[0.06em] text-[#ececec]">
                      {section.name}
                    </h3>
                    <button
                      type="button"
                      onClick={() => startSectionPlayback(sIdx)}
                      className={`h-8 px-3 rounded-[2px] border font-mono text-[10px] uppercase tracking-[0.06em] flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                        isPlaying
                          ? 'bg-[#ff4d00] text-[#0c0c0e] border-[#ff4d00] font-bold'
                          : 'bg-[#0c0c0e] border-[rgba(236,236,236,0.14)] text-[#ececec] hover:border-[#ff4d00]'
                      }`}
                    >
                      {isPlaying ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                      <span>{isPlaying ? 'Stop Loop' : 'Play Chord Chart'}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {section.chords.map((chord, cIdx) => {
                      const keyId = `${sIdx}-${cIdx}`;
                      const isActive = activeChordKey === keyId;
                      const transposedSymbol = transposeChordSymbol(chord.symbol, transpose);
                      const transposedNotes = getTransposedNotes(chord.midiNotes);
                      const noteNames = transposedNotes.map(midiNoteToName).join(' ');

                      return (
                        <button
                          key={keyId}
                          type="button"
                          onClick={() => {
                            if (activePatchId !== selectedSong.patch.id) {
                              onLoadSongPatch(selectedSong.patch, selectedSong.bpm);
                            }
                            void auditionChord(chord, keyId);
                          }}
                          className={`p-3.5 rounded-[2px] border text-left transition-colors flex flex-col justify-between gap-2 min-h-[92px] ${
                            isActive
                              ? 'bg-[#ff4d00]/15 border-[#ff4d00] text-[#ececec]'
                              : 'bg-[#0c0c0e] border-[rgba(236,236,236,0.12)] hover:border-[#ececec] text-[#ececec]'
                          }`}
                        >
                          <div className="flex items-baseline justify-between gap-2 w-full">
                            <span className="text-lg font-display font-extrabold text-[#ececec]">
                              {transposedSymbol}
                            </span>
                            <span className="text-[11px] font-mono text-[#ff4d00]">
                              {chord.roman}
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[11px] font-mono text-[rgba(236,236,236,0.6)] truncate">
                              {noteNames}
                            </span>
                            <span className="text-[10px] text-[rgba(236,236,236,0.42)] font-mono">
                              {chord.beats} beats · Click to play
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <PerformanceKeyboard
        baseOctave={baseOctave}
        onOctaveChange={onOctaveChange}
        activeNotes={activeNotes}
        highlightedNotes={highlightedNotes}
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
