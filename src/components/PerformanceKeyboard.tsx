import React, { useMemo, useRef } from 'react';
import { midiNoteToName } from '../audio/midiManager';

interface PerformanceKeyboardProps {
  baseOctave: number; // e.g., 3 means C3..B4 (2 octaves + C5)
  onOctaveChange: (next: number) => void;
  activeNotes: Set<number>;
  highlightedNotes?: Set<number>;
  onNoteOn: (note: number, velocity?: number) => void;
  onNoteOff: (note: number) => void;
  sustainOn: boolean;
  onToggleSustain: () => void;
  chordMode: boolean;
  onToggleChordMode: () => void;
  scaleLock: string;
  onScaleLockChange: (scale: string) => void;
}

const WHITE_OFFSETS = [0, 2, 4, 5, 7, 9, 11];
const BLACK_MAP: Record<number, number> = {
  0: 1, // C -> C#
  2: 3, // D -> D#
  5: 6, // F -> F#
  7: 8, // G -> G#
  9: 10, // A -> A#
};

const QWERTY_HINTS: Record<number, string> = {
  0: 'Z',
  1: 'S',
  2: 'X',
  3: 'D',
  4: 'C',
  5: 'V',
  6: 'G',
  7: 'B',
  8: 'H',
  9: 'N',
  10: 'J',
  11: 'M',
  12: 'Q',
  13: '2',
  14: 'W',
  15: '3',
  16: 'E',
  17: 'R',
  18: '5',
  19: 'T',
  20: '6',
  21: 'Y',
  22: '7',
  23: 'U',
  24: 'I',
};

export const SCALE_INTERVALS: Record<string, number[] | null> = {
  Chromatic: null,
  'C Major': [0, 2, 4, 5, 7, 9, 11],
  'A Minor': [0, 2, 3, 5, 7, 8, 10],
  'D Minor': [0, 2, 3, 5, 7, 9, 10],
  'F Minor': [0, 1, 3, 5, 7, 8, 10],
  'G Minor': [0, 2, 3, 5, 7, 8, 10],
  'Pentatonic Min': [0, 3, 5, 7, 10],
};

export const PerformanceKeyboard: React.FC<PerformanceKeyboardProps> = ({
  baseOctave,
  onOctaveChange,
  activeNotes,
  highlightedNotes,
  onNoteOn,
  onNoteOff,
  sustainOn,
  onToggleSustain,
  chordMode,
  onToggleChordMode,
  scaleLock,
  onScaleLockChange,
}) => {
  const pointerNotesRef = useRef<Map<number, number>>(new Map());
  const startMidi = (baseOctave + 1) * 12; // e.g., octave 3 -> MIDI 48 (C3)

  const whiteKeys = useMemo(() => {
    const keys: { midi: number; offset: number; hasBlackRight: boolean; blackMidi?: number; blackOffset?: number }[] = [];
    for (let oct = 0; oct < 2; oct++) {
      for (const semi of WHITE_OFFSETS) {
        const offset = oct * 7 + WHITE_OFFSETS.indexOf(semi);
        const midi = startMidi + oct * 12 + semi;
        const blackSemi = BLACK_MAP[semi];
        keys.push({
          midi,
          offset: oct * 12 + semi,
          hasBlackRight: blackSemi !== undefined,
          blackMidi: blackSemi !== undefined ? startMidi + oct * 12 + blackSemi : undefined,
          blackOffset: blackSemi !== undefined ? oct * 12 + blackSemi : undefined,
        });
        void offset;
      }
    }
    // Top C
    keys.push({
      midi: startMidi + 24,
      offset: 24,
      hasBlackRight: false,
    });
    return keys;
  }, [startMidi]);

  const handlePointerDown = (e: React.PointerEvent, midi: number) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const relY = Math.max(0.25, Math.min(1, (e.clientY - rect.top) / rect.height));
    const velocity = Math.round(55 + relY * 72);
    pointerNotesRef.current.set(e.pointerId, midi);
    onNoteOn(midi, velocity);
  };

  const handlePointerUp = (e: React.PointerEvent, midi: number) => {
    e.preventDefault();
    const prev = pointerNotesRef.current.get(e.pointerId);
    if (prev !== undefined) {
      onNoteOff(prev);
      pointerNotesRef.current.delete(e.pointerId);
    } else {
      onNoteOff(midi);
    }
  };

  const handlePointerLeave = (e: React.PointerEvent, midi: number) => {
    if (pointerNotesRef.current.get(e.pointerId) === midi) {
      onNoteOff(midi);
      pointerNotesRef.current.delete(e.pointerId);
    }
  };

  return (
    <div className="bg-[#12151C] border border-[#232732] rounded-xl p-4 flex flex-col gap-3 select-none">
      {/* Keyboard Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-neutral-400 mr-1">Octave</span>
            <button
              type="button"
              onClick={() => onOctaveChange(Math.max(1, baseOctave - 1))}
              className="w-8 h-8 rounded-md bg-[#191D27] border border-[#2A303E] text-sm font-mono hover:border-neutral-500 text-neutral-200 transition-colors"
              aria-label="Octave Down"
            >
              -
            </button>
            <span className="w-10 text-center text-xs font-mono text-amber-400">
              C{baseOctave}
            </span>
            <button
              type="button"
              onClick={() => onOctaveChange(Math.min(5, baseOctave + 1))}
              className="w-8 h-8 rounded-md bg-[#191D27] border border-[#2A303E] text-sm font-mono hover:border-neutral-500 text-neutral-200 transition-colors"
              aria-label="Octave Up"
            >
              +
            </button>
          </div>

          <div className="h-4 w-px bg-[#262B36]" />

          <button
            type="button"
            onClick={onToggleSustain}
            className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
              sustainOn
                ? 'bg-amber-500/15 border-amber-500/60 text-amber-300'
                : 'bg-[#191D27] border-[#2A303E] text-neutral-300 hover:border-neutral-500'
            }`}
          >
            Sustain Hold {sustainOn ? 'On' : 'Off'}
          </button>

          <button
            type="button"
            onClick={onToggleChordMode}
            className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
              chordMode
                ? 'bg-amber-500/15 border-amber-500/60 text-amber-300'
                : 'bg-[#191D27] border-[#2A303E] text-neutral-300 hover:border-neutral-500'
            }`}
          >
            1-Key Chords {chordMode ? 'On' : 'Off'}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="scale-lock-select" className="text-xs text-neutral-400">
            Scale Lock
          </label>
          <select
            id="scale-lock-select"
            value={scaleLock}
            onChange={(e) => onScaleLockChange(e.target.value)}
            className="bg-[#191D27] border border-[#2A303E] rounded-md px-2.5 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
          >
            {Object.keys(SCALE_INTERVALS).map((sc) => (
              <option key={sc} value={sc}>
                {sc}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Interactive 2-Octave + C Piano Bed */}
      <div className="relative h-36 sm:h-40 w-full flex gap-[2px] bg-[#0B0D11] p-1.5 rounded-lg border border-[#20242E]">
        {whiteKeys.map((wk) => {
          const isActive = activeNotes.has(wk.midi);
          const isChartHighlighted = highlightedNotes?.has(wk.midi) ?? false;
          const hint = QWERTY_HINTS[wk.offset];

          return (
            <div key={wk.midi} className="relative flex-1 h-full">
              <button
                type="button"
                onPointerDown={(e) => handlePointerDown(e, wk.midi)}
                onPointerUp={(e) => handlePointerUp(e, wk.midi)}
                onPointerCancel={(e) => handlePointerUp(e, wk.midi)}
                onPointerLeave={(e) => handlePointerLeave(e, wk.midi)}
                className={`w-full h-full rounded-b-md flex flex-col justify-end items-center pb-2 transition-colors touch-none ${
                  isActive
                    ? 'bg-amber-400 text-[#0B0D11]'
                    : isChartHighlighted
                      ? 'bg-amber-100 text-[#0B0D11] ring-2 ring-inset ring-amber-500'
                      : 'bg-[#E5E7EB] hover:bg-[#F3F4F6] text-neutral-600'
                }`}
                aria-label={`Play ${midiNoteToName(wk.midi)}`}
              >
                <span className="text-[10px] font-mono font-semibold leading-none">
                  {wk.offset % 12 === 0 ? midiNoteToName(wk.midi) : ''}
                </span>
                {hint && (
                  <span className="text-[10px] font-mono opacity-60 mt-1 leading-none">
                    {hint}
                  </span>
                )}
              </button>

              {wk.hasBlackRight && wk.blackMidi !== undefined && (
                <button
                  type="button"
                  onPointerDown={(e) => handlePointerDown(e, wk.blackMidi!)}
                  onPointerUp={(e) => handlePointerUp(e, wk.blackMidi!)}
                  onPointerCancel={(e) => handlePointerUp(e, wk.blackMidi!)}
                  onPointerLeave={(e) => handlePointerLeave(e, wk.blackMidi!)}
                  className={`absolute top-0 right-0 translate-x-1/2 z-10 w-[62%] h-[60%] rounded-b-md border border-[#0B0D11] flex flex-col justify-end items-center pb-1.5 transition-colors touch-none ${
                    activeNotes.has(wk.blackMidi)
                      ? 'bg-amber-500 text-[#0B0D11]'
                      : highlightedNotes?.has(wk.blackMidi)
                        ? 'bg-amber-700 text-amber-100 ring-1 ring-amber-400'
                        : 'bg-[#191C24] hover:bg-[#252A36] text-neutral-400'
                  }`}
                  aria-label={`Play ${midiNoteToName(wk.blackMidi)}`}
                >
                  {wk.blackOffset !== undefined && QWERTY_HINTS[wk.blackOffset] && (
                    <span className="text-[9px] font-mono opacity-75 leading-none">
                      {QWERTY_HINTS[wk.blackOffset]}
                    </span>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
