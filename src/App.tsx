import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MidiCCMap,
  MidiDeviceInfo,
  MidiLearnableParam,
  MidiMessageLog,
  PatchCategory,
  SynthPatch,
  TrendingSongEntry,
  VelocityCurve,
} from './types/synth';
import { FACTORY_PATCHES, TRENDING_SONGS } from './data/presets';
import { synthEngine } from './audio/synthEngine';
import { midiManager } from './audio/midiManager';
import { StageView } from './components/StageView';
import { SongChartsView } from './components/SongChartsView';
import { AiSoundLabView } from './components/AiSoundLabView';
import { InstrumentsView } from './components/InstrumentsView';
import { SCALE_INTERVALS } from './components/PerformanceKeyboard';

type AppTab = 'stage' | 'charts' | 'ai-lab' | 'instruments';

const DEFAULT_CC_MAP: MidiCCMap = {
  74: 'filterCutoff',
  71: 'filterResonance',
  73: 'ampAttack',
  72: 'ampRelease',
  91: 'reverbMix',
  93: 'chorusMix',
  94: 'delayMix',
  75: 'drive',
};

const QWERTY_TO_SEMITONE: Record<string, number> = {
  z: 0,
  s: 1,
  x: 2,
  d: 3,
  c: 4,
  v: 5,
  g: 6,
  b: 7,
  h: 8,
  n: 9,
  j: 10,
  m: 11,
  q: 12,
  '2': 13,
  w: 14,
  '3': 15,
  e: 16,
  r: 17,
  '5': 18,
  t: 19,
  '6': 20,
  y: 21,
  '7': 22,
  u: 23,
  i: 24,
};

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function quantizeToScale(note: number, scaleName: string): number {
  const intervals = SCALE_INTERVALS[scaleName];
  if (!intervals) return note;
  const pc = note % 12;
  if (intervals.includes(pc)) return note;
  for (let d = 1; d <= 3; d++) {
    if (intervals.includes((pc - d + 12) % 12)) return note - d;
    if (intervals.includes((pc + d) % 12)) return note + d;
  }
  return note;
}

function buildChordNotes(root: number, scaleName: string): number[] {
  const intervals = SCALE_INTERVALS[scaleName];
  if (!intervals) {
    return [root, root + 3, root + 7, root + 10];
  }
  const pc = root % 12;
  const idx = intervals.indexOf(pc);
  if (idx === -1) return [root, root + 4, root + 7];
  const getDegree = (step: number) => {
    const targetIdx = (idx + step) % intervals.length;
    const octaveShift = Math.floor((idx + step) / intervals.length) * 12;
    const baseOctaveMidi = Math.floor(root / 12) * 12;
    let candidate = baseOctaveMidi + intervals[targetIdx] + octaveShift;
    if (candidate < root) candidate += 12;
    return candidate;
  };
  return [root, getDegree(2), getDegree(4), getDegree(6)];
}

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('stage');
  const [audioReady, setAudioReady] = useState(false);

  const [userPatches, setUserPatches] = useState<SynthPatch[]>(() =>
    loadFromStorage<SynthPatch[]>('klangstage_user_patches', [])
  );

  const [customSongs, setCustomSongs] = useState<TrendingSongEntry[]>(() =>
    loadFromStorage<TrendingSongEntry[]>('klangstage_custom_songs', [])
  );

  const [stageSlots, setStageSlots] = useState<(SynthPatch | null)[]>(() =>
    loadFromStorage<(SynthPatch | null)[]>('klangstage_stage_slots', [
      FACTORY_PATCHES[0],
      FACTORY_PATCHES[1],
      FACTORY_PATCHES[2],
      FACTORY_PATCHES[3],
      FACTORY_PATCHES[4],
      TRENDING_SONGS[0].patch,
      TRENDING_SONGS[2].patch,
      null,
    ])
  );

  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(0);
  const [patch, setPatch] = useState<SynthPatch>(FACTORY_PATCHES[0]);
  const [bpm, setBpm] = useState<number>(120);
  const [metronomeOn, setMetronomeOn] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(0);

  const [baseOctave, setBaseOctave] = useState(3);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [sustainOn, setSustainOn] = useState(false);
  const [chordMode, setChordMode] = useState(false);
  const [scaleLock, setScaleLock] = useState('Chromatic');

  const [midiSupported, setMidiSupported] = useState<boolean>(midiManager.isSupported());
  const [midiError, setMidiError] = useState<string | null>(null);
  const [midiDevices, setMidiDevices] = useState<MidiDeviceInfo[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string | 'all'>('all');
  const [channelFilter, setChannelFilter] = useState<number | 'all'>('all');
  const [velocityCurve, setVelocityCurve] = useState<VelocityCurve>('linear');
  const [midiLogs, setMidiLogs] = useState<MidiMessageLog[]>([]);
  const [midiCCMap, setMidiCCMap] = useState<MidiCCMap>(() =>
    loadFromStorage<MidiCCMap>('klangstage_cc_map', DEFAULT_CC_MAP)
  );
  const [midiLearnParam, setMidiLearnParam] = useState<MidiLearnableParam | null>(null);

  const tapTimesRef = useRef<number[]>([]);
  const chordTriggersRef = useRef<Map<number, number[]>>(new Map());
  const scaleLockRef = useRef(scaleLock);
  const chordModeRef = useRef(chordMode);
  const midiLearnRef = useRef(midiLearnParam);
  const midiCCMapRef = useRef(midiCCMap);

  scaleLockRef.current = scaleLock;
  chordModeRef.current = chordMode;
  midiLearnRef.current = midiLearnParam;
  midiCCMapRef.current = midiCCMap;

  const allPatches = useMemo(() => {
    const songPatches = [...customSongs, ...TRENDING_SONGS].map((s) => s.patch);
    return [...FACTORY_PATCHES, ...songPatches, ...userPatches];
  }, [customSongs, userPatches]);

  useEffect(() => {
    synthEngine.setPatch(patch);
  }, [patch]);

  useEffect(() => {
    try {
      window.localStorage.setItem('klangstage_user_patches', JSON.stringify(userPatches));
    } catch {
      // ignore quota errors
    }
  }, [userPatches]);

  useEffect(() => {
    try {
      window.localStorage.setItem('klangstage_custom_songs', JSON.stringify(customSongs));
    } catch {
      // ignore quota errors
    }
  }, [customSongs]);

  useEffect(() => {
    try {
      window.localStorage.setItem('klangstage_stage_slots', JSON.stringify(stageSlots));
    } catch {
      // ignore quota errors
    }
  }, [stageSlots]);

  useEffect(() => {
    try {
      window.localStorage.setItem('klangstage_cc_map', JSON.stringify(midiCCMap));
    } catch {
      // ignore quota errors
    }
  }, [midiCCMap]);

  const ensureAudioReady = useCallback(async () => {
    await synthEngine.init();
    setAudioReady(synthEngine.isReady());
  }, []);

  const handleNoteOn = useCallback(async (rawNote: number, velocity = 100) => {
    const quantized = quantizeToScale(rawNote, scaleLockRef.current);
    const notesToPlay = chordModeRef.current
      ? buildChordNotes(quantized, scaleLockRef.current)
      : [quantized];

    chordTriggersRef.current.set(rawNote, notesToPlay);

    for (const n of notesToPlay) {
      await synthEngine.noteOn(n, velocity);
    }
    setAudioReady(synthEngine.isReady());
    setActiveNotes((prev) => {
      const next = new Set(prev);
      notesToPlay.forEach((n) => next.add(n));
      return next;
    });
  }, []);

  const handleNoteOff = useCallback((rawNote: number) => {
    const triggeredNotes = chordTriggersRef.current.get(rawNote);
    const notesToStop = triggeredNotes ?? [quantizeToScale(rawNote, scaleLockRef.current)];
    chordTriggersRef.current.delete(rawNote);

    notesToStop.forEach((n) => synthEngine.noteOff(n));
    setActiveNotes((prev) => {
      const next = new Set(prev);
      notesToStop.forEach((n) => next.delete(n));
      return next;
    });
  }, []);

  const handleTriggerChord = useCallback(async (notes: number[], down: boolean) => {
    if (down) {
      for (const n of notes) {
        await synthEngine.noteOn(n, 98);
      }
      setAudioReady(synthEngine.isReady());
      setActiveNotes((prev) => {
        const next = new Set(prev);
        notes.forEach((n) => next.add(n));
        return next;
      });
    } else {
      notes.forEach((n) => synthEngine.noteOff(n));
      setActiveNotes((prev) => {
        const next = new Set(prev);
        notes.forEach((n) => next.delete(n));
        return next;
      });
    }
  }, []);

  const handleUpdatePatch = useCallback((updates: Partial<SynthPatch>) => {
    setPatch((prev) => ({ ...prev, ...updates }));
  }, []);

  const applyMidiCCValue = useCallback(
    (param: MidiLearnableParam, rawValue: number) => {
      const norm = rawValue / 127;
      switch (param) {
        case 'filterCutoff': {
          const hz = Math.round(60 * Math.pow(16000 / 60, norm));
          handleUpdatePatch({ filterCutoff: hz });
          break;
        }
        case 'filterResonance':
          handleUpdatePatch({ filterResonance: Number((0.2 + norm * 14).toFixed(1)) });
          break;
        case 'osc2Level':
          handleUpdatePatch({ osc2Level: Number(norm.toFixed(2)) });
          break;
        case 'subLevel':
          handleUpdatePatch({ subLevel: Number(norm.toFixed(2)) });
          break;
        case 'ampAttack':
          handleUpdatePatch({ ampAttack: Number((0.004 + Math.pow(norm, 2) * 1.8).toFixed(3)) });
          break;
        case 'ampRelease':
          handleUpdatePatch({ ampRelease: Number((0.03 + Math.pow(norm, 2) * 3.2).toFixed(2)) });
          break;
        case 'drive':
          handleUpdatePatch({ drive: Number(norm.toFixed(2)) });
          break;
        case 'chorusMix':
          handleUpdatePatch({ chorusMix: Number(norm.toFixed(2)) });
          break;
        case 'delayMix':
          handleUpdatePatch({ delayMix: Number((norm * 0.85).toFixed(2)) });
          break;
        case 'reverbMix':
          handleUpdatePatch({ reverbMix: Number((norm * 0.88).toFixed(2)) });
          break;
        case 'lfoRate':
          handleUpdatePatch({ lfoRate: Number((0.1 + norm * 15).toFixed(1)) });
          break;
        case 'lfoDepth':
          handleUpdatePatch({ lfoDepth: Number(norm.toFixed(2)) });
          break;
      }
    },
    [handleUpdatePatch]
  );

  const connectMidi = useCallback(async () => {
    const res = await midiManager.connect({
      onNoteOn: (note, velocity) => {
        void handleNoteOn(note, velocity);
      },
      onNoteOff: (note) => {
        handleNoteOff(note);
      },
      onControlChange: (cc, value) => {
        if (cc === 64) {
          const down = value >= 64;
          setSustainOn(down);
          synthEngine.setSustain(down);
          return;
        }
        if (cc === 1) {
          synthEngine.setModWheel(value / 127);
          return;
        }
        if (midiLearnRef.current) {
          const targetParam = midiLearnRef.current;
          setMidiCCMap((prev) => {
            const cleaned: MidiCCMap = {};
            for (const [k, v] of Object.entries(prev)) {
              if (v !== targetParam) cleaned[Number(k)] = v;
            }
            cleaned[cc] = targetParam;
            return cleaned;
          });
          setMidiLearnParam(null);
          return;
        }
        const mappedParam = midiCCMapRef.current[cc];
        if (mappedParam) {
          applyMidiCCValue(mappedParam, value);
        }
      },
      onPitchBend: (semitones) => {
        synthEngine.setPitchBend(semitones);
      },
      onDevicesChanged: (devices) => {
        setMidiDevices(devices);
      },
      onMessageLog: (entry) => {
        setMidiLogs((prev) => [entry, ...prev].slice(0, 30));
      },
    });
    setMidiSupported(res.supported);
    setMidiError(res.error || null);
  }, [applyMidiCCValue, handleNoteOff, handleNoteOn]);

  useEffect(() => {
    void connectMidi();
  }, [connectMidi]);

  useEffect(() => {
    const downKeys = new Map<string, number>();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const key = e.key.toLowerCase();
      if (key === ' ') {
        e.preventDefault();
        setSustainOn(true);
        synthEngine.setSustain(true);
        return;
      }

      const semitone = QWERTY_TO_SEMITONE[key];
      if (semitone === undefined || downKeys.has(key)) return;
      const midi = (baseOctave + 1) * 12 + semitone;
      downKeys.set(key, midi);
      void handleNoteOn(midi, 102);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === ' ') {
        setSustainOn(false);
        synthEngine.setSustain(false);
        return;
      }
      const heldMidi = downKeys.get(key);
      if (heldMidi === undefined) return;
      downKeys.delete(key);
      handleNoteOff(heldMidi);
    };

    const onBlur = () => {
      downKeys.forEach((midi) => handleNoteOff(midi));
      downKeys.clear();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      downKeys.forEach((midi) => handleNoteOff(midi));
      downKeys.clear();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [baseOctave, handleNoteOff, handleNoteOn]);

  useEffect(() => {
    if (!metronomeOn) {
      setCurrentBeat(0);
      return;
    }
    let beat = 0;
    void synthEngine.playClick(true);
    setCurrentBeat(0);

    const intervalMs = Math.round((60 / bpm) * 1000);
    const id = window.setInterval(() => {
      beat = (beat + 1) % 4;
      setCurrentBeat(beat);
      void synthEngine.playClick(beat === 0);
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [metronomeOn, bpm]);

  const handleTapTempo = () => {
    const now = performance.now();
    const recent = tapTimesRef.current.filter((t) => now - t < 2200);
    recent.push(now);
    tapTimesRef.current = recent.slice(-5);

    if (recent.length >= 2) {
      let total = 0;
      for (let i = 1; i < recent.length; i++) {
        total += recent[i] - recent[i - 1];
      }
      const avgMs = total / (recent.length - 1);
      const nextBpm = Math.round(60000 / avgMs);
      setBpm(Math.max(40, Math.min(220, nextBpm)));
    }
  };

  const handleToggleSustain = () => {
    const next = !sustainOn;
    setSustainOn(next);
    synthEngine.setSustain(next);
  };

  const handlePanic = async () => {
    if (!audioReady) {
      await ensureAudioReady();
      return;
    }
    synthEngine.panic();
    chordTriggersRef.current.clear();
    setSustainOn(false);
    setActiveNotes(new Set());
  };

  const handleSavePatchCopy = (targetPatch: SynthPatch) => {
    const baseName = targetPatch.name.replace(/\s+\(Copy(?:\s+\d+)?\)$|\s+\(Edit\)$/i, '');
    const copy: SynthPatch = {
      ...targetPatch,
      id: `user-${Date.now()}`,
      name: `${baseName} (Copy)`,
      author: 'User',
    };
    setUserPatches((prev) => [copy, ...prev]);
    setPatch(copy);
  };

  const handleSavePatchToLibrary = (targetPatch: SynthPatch) => {
    const copy: SynthPatch = {
      ...targetPatch,
      id:
        targetPatch.id.startsWith('ai-') || targetPatch.id.startsWith('user-')
          ? targetPatch.id
          : `user-${Date.now()}`,
      name: targetPatch.name,
      author: targetPatch.author === 'AI Lab' ? 'AI Lab' : 'User',
    };
    setUserPatches((prev) => {
      const exists = prev.some((p) => p.id === copy.id);
      if (exists) return prev.map((p) => (p.id === copy.id ? copy : p));
      return [copy, ...prev];
    });
    setPatch(copy);
  };

  const handleStoreToSlot = (targetPatch: SynthPatch, idx: number) => {
    setStageSlots((prev) => {
      const next = [...prev];
      next[idx] = { ...targetPatch };
      return next;
    });
    setActiveSlotIndex(idx);
  };

  const handleLoadSlot = (idx: number) => {
    const slotPatch = stageSlots[idx];
    if (!slotPatch) return;
    setActiveSlotIndex(idx);
    setPatch(slotPatch);
    if (slotPatch.bpmHint) setBpm(slotPatch.bpmHint);
  };

  const handleLoadSongPatch = async (songPatch: SynthPatch, songBpm: number) => {
    await ensureAudioReady();
    setPatch(songPatch);
    setBpm(songBpm);
    setActiveSlotIndex(null);
  };

  return (
    <div className="min-h-screen bg-[#0c0c0e] text-[#ececec] flex flex-col">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="border-b-2 border-[#ececec] bg-[#0c0c0e] px-5 sm:px-6 py-3">
        <div className="w-full flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('stage')}
            className="font-display text-xl font-extrabold uppercase tracking-[-0.04em] text-[#ececec] whitespace-nowrap shrink-0 text-left"
          >
            KlangStage
          </button>

          {/* Zone 2: Clean Single-Line Navigation Links */}
          <nav className="flex items-center gap-6 overflow-x-auto" aria-label="Primary sections">
            {(
              [
                { id: 'stage', label: 'Stage' },
                { id: 'charts', label: 'Song Charts' },
                { id: 'ai-lab', label: 'AI Sound Lab' },
                { id: 'instruments', label: 'Instruments' },
              ] as const
            ).map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-1 font-mono text-[11px] uppercase tracking-[0.12em] border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'border-[#ff4d00] text-[#ececec]'
                      : 'border-transparent text-[rgba(236,236,236,0.54)] hover:text-[#ececec]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 Primary Action Button */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={handlePanic}
              className={`h-9 px-4 rounded-[2px] font-mono text-[11px] uppercase tracking-[0.08em] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                audioReady
                  ? 'bg-[#161618] border border-[rgba(236,236,236,0.28)] hover:border-[#ff4d00] text-[#ececec]'
                  : 'bg-[#ff4d00] hover:bg-[#ff621f] text-[#0c0c0e]'
              }`}
            >
              {audioReady ? 'All Notes Off' : 'Start Audio Engine'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      {activeTab === 'stage' ? (
        <div className="flex-1 flex flex-col min-h-0">
          <StageView
            patch={patch}
            allPatches={allPatches}
            stageSlots={stageSlots}
            activeSlotIndex={activeSlotIndex}
            onSelectPatch={(p) => {
              setPatch(p);
              setActiveSlotIndex(null);
            }}
            onUpdatePatch={handleUpdatePatch}
            onLoadSlot={handleLoadSlot}
            onStoreToSlot={(idx) => handleStoreToSlot(patch, idx)}
            onSaveToLibrary={() => handleSavePatchCopy(patch)}
            bpm={bpm}
            onBpmChange={setBpm}
            onTapTempo={handleTapTempo}
            metronomeOn={metronomeOn}
            onToggleMetronome={() => {
              void ensureAudioReady();
              setMetronomeOn((v) => !v);
            }}
            currentBeat={currentBeat}
            audioReady={audioReady}
            activeNotes={activeNotes}
            baseOctave={baseOctave}
            onOctaveChange={setBaseOctave}
            onNoteOn={handleNoteOn}
            onNoteOff={handleNoteOff}
            onTriggerChord={handleTriggerChord}
            sustainOn={sustainOn}
            onToggleSustain={handleToggleSustain}
            chordMode={chordMode}
            onToggleChordMode={() => setChordMode((v) => !v)}
            scaleLock={scaleLock}
            onScaleLockChange={setScaleLock}
            midiLearnParam={midiLearnParam}
            onSelectMidiLearnParam={setMidiLearnParam}
            midiCCMap={midiCCMap}
          />
        </div>
      ) : (
        <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-6 py-5">
          {activeTab === 'charts' && (
            <SongChartsView
              activePatchId={patch.id}
              onLoadSongPatch={handleLoadSongPatch}
              customSongs={customSongs}
              onAddCustomSong={(song) =>
                setCustomSongs((prev) => [song, ...prev.filter((s) => s.id !== song.id)])
              }
              onDeleteCustomSong={(id) =>
                setCustomSongs((prev) => prev.filter((s) => s.id !== id))
              }
              activeNotes={activeNotes}
              baseOctave={baseOctave}
              onOctaveChange={setBaseOctave}
              onNoteOn={handleNoteOn}
              onNoteOff={handleNoteOff}
              sustainOn={sustainOn}
              onToggleSustain={handleToggleSustain}
              chordMode={chordMode}
              onToggleChordMode={() => setChordMode((v) => !v)}
              scaleLock={scaleLock}
              onScaleLockChange={setScaleLock}
            />
          )}

          {activeTab === 'ai-lab' && (
            <AiSoundLabView
              onLoadPatch={(p) => {
                void ensureAudioReady();
                setPatch(p);
                setActiveSlotIndex(null);
              }}
              onSavePatch={handleSavePatchToLibrary}
              onUpdateUserPatchCategory={(id: string, category: PatchCategory) => {
                setUserPatches((prev) =>
                  prev.map((p) => (p.id === id ? { ...p, category } : p))
                );
                setPatch((prev) => (prev.id === id ? { ...prev, category } : prev));
              }}
              onDeleteUserPatch={(id) =>
                setUserPatches((prev) => prev.filter((p) => p.id !== id))
              }
              onStoreToSlot={handleStoreToSlot}
              userPatches={userPatches}
              activePatch={patch}
              activeNotes={activeNotes}
              baseOctave={baseOctave}
              onOctaveChange={setBaseOctave}
              onNoteOn={handleNoteOn}
              onNoteOff={handleNoteOff}
              sustainOn={sustainOn}
              onToggleSustain={handleToggleSustain}
              chordMode={chordMode}
              onToggleChordMode={() => setChordMode((v) => !v)}
              scaleLock={scaleLock}
              onScaleLockChange={setScaleLock}
            />
          )}

          {activeTab === 'instruments' && (
            <InstrumentsView
              audioReady={audioReady}
              onEnableAudio={ensureAudioReady}
              midiSupported={midiSupported}
              midiError={midiError}
              midiDevices={midiDevices}
              selectedInputId={selectedInputId}
              onSelectInputId={(id) => {
                setSelectedInputId(id);
                midiManager.setSelectedInput(id);
              }}
              channelFilter={channelFilter}
              onChannelFilterChange={(ch) => {
                setChannelFilter(ch);
                midiManager.setChannelFilter(ch);
              }}
              velocityCurve={velocityCurve}
              onVelocityCurveChange={(curve) => {
                setVelocityCurve(curve);
                midiManager.setVelocityCurve(curve);
              }}
              onRefreshMidi={connectMidi}
              midiLogs={midiLogs}
              onClearLogs={() => setMidiLogs([])}
              midiCCMap={midiCCMap}
              midiLearnParam={midiLearnParam}
              onSelectMidiLearnParam={setMidiLearnParam}
              onResetCCMap={() => setMidiCCMap(DEFAULT_CC_MAP)}
            />
          )}
        </main>
      )}
    </div>
  );
}
