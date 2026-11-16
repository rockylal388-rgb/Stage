import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArpeggiatorConfig,
  MasterEqSettings,
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

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function expLerp(a: number, b: number, t: number): number {
  const safeA = Math.max(40, a);
  const safeB = Math.max(40, b);
  return safeA * Math.pow(safeB / safeA, t);
}

function interpolatePatch(base: SynthPatch, target: SynthPatch | null, amount: number): SynthPatch {
  if (!target || amount <= 0.001) return base;
  const t = Math.max(0, Math.min(1, amount));
  const useTargetDiscrete = t >= 0.5;
  return {
    ...base,
    name: t > 0.02 ? `${base.name} × ${target.name}` : base.name,
    category: useTargetDiscrete ? target.category : base.category,
    osc1Wave: useTargetDiscrete ? target.osc1Wave : base.osc1Wave,
    osc1Level: Number(lerp(base.osc1Level, target.osc1Level, t).toFixed(2)),
    osc1Octave: Math.round(lerp(base.osc1Octave, target.osc1Octave, t)),
    osc1Detune: Number(lerp(base.osc1Detune, target.osc1Detune, t).toFixed(1)),
    osc2Wave: useTargetDiscrete ? target.osc2Wave : base.osc2Wave,
    osc2Level: Number(lerp(base.osc2Level, target.osc2Level, t).toFixed(2)),
    osc2Semi: Math.round(lerp(base.osc2Semi, target.osc2Semi, t)),
    osc2Detune: Number(lerp(base.osc2Detune, target.osc2Detune, t).toFixed(1)),
    subLevel: Number(lerp(base.subLevel, target.subLevel, t).toFixed(2)),
    noiseLevel: Number(lerp(base.noiseLevel, target.noiseLevel, t).toFixed(3)),
    unisonDetune: Math.round(lerp(base.unisonDetune, target.unisonDetune, t)),
    glide: Number(lerp(base.glide, target.glide, t).toFixed(3)),
    filterType: useTargetDiscrete ? target.filterType : base.filterType,
    filterCutoff: Math.round(expLerp(base.filterCutoff, target.filterCutoff, t)),
    filterResonance: Number(lerp(base.filterResonance, target.filterResonance, t).toFixed(1)),
    filterEnvAmount: Math.round(lerp(base.filterEnvAmount, target.filterEnvAmount, t)),
    ampAttack: Number(lerp(base.ampAttack, target.ampAttack, t).toFixed(3)),
    ampDecay: Number(lerp(base.ampDecay, target.ampDecay, t).toFixed(2)),
    ampSustain: Number(lerp(base.ampSustain, target.ampSustain, t).toFixed(2)),
    ampRelease: Number(lerp(base.ampRelease, target.ampRelease, t).toFixed(2)),
    filterAttack: Number(lerp(base.filterAttack, target.filterAttack, t).toFixed(3)),
    filterDecay: Number(lerp(base.filterDecay, target.filterDecay, t).toFixed(2)),
    filterSustain: Number(lerp(base.filterSustain, target.filterSustain, t).toFixed(2)),
    filterRelease: Number(lerp(base.filterRelease, target.filterRelease, t).toFixed(2)),
    lfoWave: useTargetDiscrete ? target.lfoWave : base.lfoWave,
    lfoRate: Number(lerp(base.lfoRate, target.lfoRate, t).toFixed(1)),
    lfoDepth: Number(lerp(base.lfoDepth, target.lfoDepth, t).toFixed(2)),
    lfoTarget: useTargetDiscrete ? target.lfoTarget : base.lfoTarget,
    drive: Number(lerp(base.drive, target.drive, t).toFixed(2)),
    chorusMix: Number(lerp(base.chorusMix, target.chorusMix, t).toFixed(2)),
    delayMix: Number(lerp(base.delayMix, target.delayMix, t).toFixed(2)),
    delayTime: Number(lerp(base.delayTime, target.delayTime, t).toFixed(3)),
    delayFeedback: Number(lerp(base.delayFeedback, target.delayFeedback, t).toFixed(2)),
    reverbMix: Number(lerp(base.reverbMix, target.reverbMix, t).toFixed(2)),
    reverbDecay: Number(lerp(base.reverbDecay, target.reverbDecay, t).toFixed(2)),
    masterGain: base.masterGain,
  };
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
  const [morphSlotIndex, setMorphSlotIndex] = useState<number>(1);
  const [morphAmount, setMorphAmount] = useState<number>(0);
  const [bpm, setBpm] = useState<number>(120);
  const [metronomeOn, setMetronomeOn] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(0);

  const [baseOctave, setBaseOctave] = useState(3);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [sustainOn, setSustainOn] = useState(false);
  const [chordMode, setChordMode] = useState(false);
  const [scaleLock, setScaleLock] = useState('Chromatic');
  const [arpeggiator, setArpeggiator] = useState<ArpeggiatorConfig>({
    enabled: false,
    pattern: 'up',
    rate: '1/8',
    octaves: 1,
  });
  const [arpStepNote, setArpStepNote] = useState<number | null>(null);
  const [masterEq, setMasterEq] = useState<MasterEqSettings>(() =>
    loadFromStorage<MasterEqSettings>('klangstage_master_eq', { low: 0, mid: 0, high: 0 })
  );
  const [eqDrawerOpen, setEqDrawerOpen] = useState(false);

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

  const morphTargetPatch = stageSlots[morphSlotIndex] ?? null;

  const effectivePatch = useMemo(
    () => interpolatePatch(patch, morphTargetPatch, morphAmount),
    [patch, morphTargetPatch, morphAmount]
  );

  useEffect(() => {
    synthEngine.setPatch(effectivePatch);
  }, [effectivePatch]);

  useEffect(() => {
    synthEngine.setBpm(bpm);
  }, [bpm]);

  useEffect(() => {
    synthEngine.setArpeggiator(arpeggiator);
  }, [arpeggiator]);

  useEffect(() => {
    synthEngine.setOnArpStep(setArpStepNote);
    return () => {
      synthEngine.setOnArpStep(null);
    };
  }, []);

  const arpHighlightedNotes = useMemo(
    () => (arpStepNote !== null ? new Set([arpStepNote]) : undefined),
    [arpStepNote]
  );

  useEffect(() => {
    synthEngine.setMasterEq(masterEq);
    try {
      window.localStorage.setItem('klangstage_master_eq', JSON.stringify(masterEq));
    } catch {
      // ignore quota errors
    }
  }, [masterEq]);

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
    setMorphAmount(0);
    if (morphSlotIndex === idx) {
      const nextTarget = stageSlots.findIndex((s, i) => s !== null && i !== idx);
      if (nextTarget !== -1) setMorphSlotIndex(nextTarget);
    }
    if (slotPatch.bpmHint) setBpm(slotPatch.bpmHint);
  };

  const handleLoadSongPatch = async (songPatch: SynthPatch, songBpm: number) => {
    await ensureAudioReady();
    setPatch(songPatch);
    setBpm(songBpm);
    setActiveSlotIndex(null);
    setMorphAmount(0);
  };

  const eqModified = masterEq.low !== 0 || masterEq.mid !== 0 || masterEq.high !== 0;

  const renderEqStrip = (compact = false) => (
    <div
      className={`flex items-center gap-3 bg-[#161618] border border-[rgba(236,236,236,0.14)] rounded-[2px] px-3 py-1.5 ${
        compact ? 'w-full justify-between flex-wrap' : ''
      }`}
      aria-label="Master 3-Band Equalizer"
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[rgba(236,236,236,0.54)] shrink-0">
        Master EQ
      </span>

      <div className="flex items-center gap-3 flex-wrap">
        {(
          [
            { key: 'low', label: 'Low', freq: '120Hz' },
            { key: 'mid', label: 'Mid', freq: '1.1kHz' },
            { key: 'high', label: 'High', freq: '5.2kHz' },
          ] as const
        ).map(({ key, label, freq }) => {
          const val = masterEq[key];
          return (
            <div key={key} className="flex items-center gap-1.5">
              <button
                type="button"
                onDoubleClick={() => setMasterEq((prev) => ({ ...prev, [key]: 0 }))}
                title={`${label} shelf/peak (${freq}) — double-click to reset`}
                className="font-mono text-[10px] uppercase text-[rgba(236,236,236,0.68)] hover:text-[#ececec] w-7 text-left shrink-0"
              >
                {label}
              </button>
              <input
                type="range"
                min={-12}
                max={12}
                step={0.5}
                value={val}
                aria-label={`Master EQ ${label}`}
                onChange={(e) =>
                  setMasterEq((prev) => ({ ...prev, [key]: parseFloat(e.target.value) }))
                }
                className="synth-slider w-12 sm:w-14"
              />
              <span
                className={`font-mono text-[10px] tabular-nums w-11 text-right shrink-0 ${
                  val !== 0 ? 'text-[#ff4d00]' : 'text-[rgba(236,236,236,0.45)]'
                }`}
              >
                {val > 0 ? '+' : ''}
                {Number.isInteger(val) ? val.toFixed(0) : val.toFixed(1)}dB
              </span>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setMasterEq({ low: 0, mid: 0, high: 0 })}
        disabled={!eqModified}
        className="px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em] border border-[rgba(236,236,236,0.16)] rounded-[2px] text-[rgba(236,236,236,0.72)] hover:border-[#ff4d00] disabled:opacity-35 disabled:hover:border-[rgba(236,236,236,0.16)] shrink-0 transition-colors"
      >
        Flat
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0c0c0e] text-[#ececec] flex flex-col">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="border-b-2 border-[#ececec] bg-[#0c0c0e] px-5 sm:px-6 py-3 flex flex-col gap-2.5">
        <div className="w-full flex items-center justify-between gap-6">
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

          {/* Zone 3: Master 3-Band EQ + Primary Action Button */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden xl:flex items-center">{renderEqStrip(false)}</div>

            <button
              type="button"
              onClick={() => setEqDrawerOpen((v) => !v)}
              aria-expanded={eqDrawerOpen}
              className={`xl:hidden h-9 px-3 rounded-[2px] font-mono text-[10px] uppercase tracking-[0.08em] border transition-colors whitespace-nowrap shrink-0 ${
                eqDrawerOpen || eqModified
                  ? 'bg-[#161618] border-[#ff4d00] text-[#ff4d00]'
                  : 'bg-[#161618] border-[rgba(236,236,236,0.18)] text-[#ececec]'
              }`}
            >
              EQ
            </button>

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

        {eqDrawerOpen && <div className="xl:hidden">{renderEqStrip(true)}</div>}
      </header>

      {/* Main Workspace */}
      {activeTab === 'stage' ? (
        <div className="flex-1 flex flex-col min-h-0">
          <StageView
            patch={effectivePatch}
            allPatches={allPatches}
            stageSlots={stageSlots}
            activeSlotIndex={activeSlotIndex}
            onSelectPatch={(p) => {
              setPatch(p);
              setActiveSlotIndex(null);
              setMorphAmount(0);
            }}
            onUpdatePatch={handleUpdatePatch}
            onLoadSlot={handleLoadSlot}
            onStoreToSlot={(idx) => handleStoreToSlot(effectivePatch, idx)}
            onSaveToLibrary={() => handleSavePatchCopy(effectivePatch)}
            morphSlotIndex={morphSlotIndex}
            onMorphSlotChange={setMorphSlotIndex}
            morphAmount={morphAmount}
            onMorphAmountChange={setMorphAmount}
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
            arpeggiator={arpeggiator}
            onArpeggiatorChange={(updates) => {
              if (updates.enabled) {
                void ensureAudioReady();
              }
              setArpeggiator((prev) => ({ ...prev, ...updates }));
            }}
            arpHighlightedNotes={arpHighlightedNotes}
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
