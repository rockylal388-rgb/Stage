import React, { useMemo, useRef } from 'react';
import { midiNoteToName } from '../audio/midiManager';

interface PerformanceKeyboardProps {
  baseOctave: number;
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
  variant?: 'full' | 'console';
}

const WHITE_OFFSETS = [0, 2, 4, 5, 7, 9, 11];
const BLACK_MAP: Record<number, number> = {
  0: 1,
  2: 3,
  5: 6,
  7: 8,
  9: 10,
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
  variant = 'full',
}) => {
  const pointerNotesRef = useRef<Map<number, number>>(new Map());
  const startMidi = (baseOctave + 1) * 12;

  const whiteKeys = useMemo(() => {
    const keys: {
      midi: number;
      offset: number;
      hasBlackRight: boolean;
      blackMidi?: number;
      blackOffset?: number;
    }[] = [];
    for (let oct = 0; oct < 2; oct++) {
      for (const semi of WHITE_OFFSETS) {
        const midi = startMidi + oct * 12 + semi;
        const blackSemi = BLACK_MAP[semi];
        keys.push({
          midi,
          offset: oct * 12 + semi,
          hasBlackRight: blackSemi !== undefined,
          blackMidi: blackSemi !== undefined ? startMidi + oct * 12 + blackSemi : undefined,
          blackOffset: blackSemi !== undefined ? oct * 12 + blackSemi : undefined,
        });
      }
    }
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

  const keyBed = (
    <div
      className={`relative w-full flex gap-[2px] bg-[#000000] p-1 border border-[rgba(236,236,236,0.14)] rounded-[2px] ${
        variant === 'console' ? 'h-24 sm:h-28' : 'h-36 sm:h-40'
      }`}
    >
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
              className={`w-full h-full rounded-b-[2px] flex flex-col justify-end items-center pb-1.5 transition-colors touch-none ${
                isActive
                  ? 'bg-[#ff4d00] text-[#0c0c0e]'
                  : isChartHighlighted
                    ? 'bg-[#ff4d00]/25 text-[#ececec] ring-2 ring-inset ring-[#ff4d00]'
                    : 'bg-[#ececec] hover:bg-white text-[#0c0c0e]/70'
              }`}
              aria-label={`Play ${midiNoteToName(wk.midi)}`}
            >
              <span className="text-[9px] font-mono font-semibold leading-none">
                {wk.offset % 12 === 0 ? midiNoteToName(wk.midi) : ''}
              </span>
              {hint && (
                <span className="text-[9px] font-mono opacity-60 mt-0.5 leading-none">{hint}</span>
              )}
            </button>

            {wk.hasBlackRight && wk.blackMidi !== undefined && (
              <button
                type="button"
                onPointerDown={(e) => handlePointerDown(e, wk.blackMidi!)}
                onPointerUp={(e) => handlePointerUp(e, wk.blackMidi!)}
                onPointerCancel={(e) => handlePointerUp(e, wk.blackMidi!)}
                onPointerLeave={(e) => handlePointerLeave(e, wk.blackMidi!)}
                className={`absolute top-0 right-0 translate-x-1/2 z-10 w-[62%] h-[60%] rounded-b-[2px] border border-[rgba(236,236,236,0.18)] flex flex-col justify-end items-center pb-1 transition-colors touch-none ${
                  activeNotes.has(wk.blackMidi)
                    ? 'bg-[#ff4d00] text-[#0c0c0e] border-[#ff4d00]'
                    : highlightedNotes?.has(wk.blackMidi)
                      ? 'bg-[#ff4d00]/55 text-[#ececec] border-[#ff4d00]'
                      : 'bg-[#000000] hover:bg-[#1f1f24] text-[rgba(236,236,236,0.5)]'
                }`}
                aria-label={`Play ${midiNoteToName(wk.blackMidi)}`}
              >
                {wk.blackOffset !== undefined && QWERTY_HINTS[wk.blackOffset] && (
                  <span className="text-[8px] font-mono leading-none">
                    {QWERTY_HINTS[wk.blackOffset]}
                  </span>
                )}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );

  if (variant === 'console') {
    return <div className="select-none">{keyBed}</div>;
  }

  return (
    <div className="bg-[#161618] border border-[rgba(236,236,236,0.12)] rounded-[2px] p-4 flex flex-col gap-3 select-none">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[rgba(236,236,236,0.54)] mr-1">
              Octave
            </span>
            <button
              type="button"
              onClick={() => onOctaveChange(Math.max(1, baseOctave - 1))}
              className="w-8 h-8 rounded-[2px] bg-[#0c0c0e] border border-[rgba(236,236,236,0.12)] text-xs font-mono hover:border-[#ececec] text-[#ececec] transition-colors"
              aria-label="Octave Down"
            >
              -
            </button>
            <span className="w-10 text-center text-xs font-mono font-semibold text-[#ff4d00] tabular-nums">
              C{baseOctave}
            </span>
            <button
              type="button"
              onClick={() => onOctaveChange(Math.min(5, baseOctave + 1))}
              className="w-8 h-8 rounded-[2px] bg-[#0c0c0e] border border-[rgba(236,236,236,0.12)] text-xs font-mono hover:border-[#ececec] text-[#ececec] transition-colors"
              aria-label="Octave Up"
            >
              +
            </button>
          </div>

          <div className="h-4 w-px bg-[rgba(236,236,236,0.12)]" />

          <button
            type="button"
            onClick={onToggleSustain}
            className={`px-3 py-1.5 rounded-[2px] font-mono text-[11px] uppercase tracking-[0.06em] border transition-colors whitespace-nowrap shrink-0 ${
              sustainOn
                ? 'bg-[#ff4d00] border-[#ff4d00] text-[#0c0c0e] font-semibold'
                : 'bg-[#0c0c0e] border-[rgba(236,236,236,0.12)] text-[rgba(236,236,236,0.75)] hover:border-[#ececec]'
            }`}
          >
            Sustain Hold {sustainOn ? 'On' : 'Off'}
          </button>

          <button
            type="button"
            onClick={onToggleChordMode}
            className={`px-3 py-1.5 rounded-[2px] font-mono text-[11px] uppercase tracking-[0.06em] border transition-colors whitespace-nowrap shrink-0 ${
              chordMode
                ? 'bg-[#ff4d00] border-[#ff4d00] text-[#0c0c0e] font-semibold'
                : 'bg-[#0c0c0e] border-[rgba(236,236,236,0.12)] text-[rgba(236,236,236,0.75)] hover:border-[#ececec]'
            }`}
          >
            1-Key Chords {chordMode ? 'On' : 'Off'}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <label
            htmlFor="scale-lock-select"
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-[rgba(236,236,236,0.54)]"
          >
            Scale Lock
          </label>
          <select
            id="scale-lock-select"
            value={scaleLock}
            onChange={(e) => onScaleLockChange(e.target.value)}
            className="bg-[#0c0c0e] border border-[rgba(236,236,236,0.12)] rounded-[2px] px-2.5 py-1.5 font-mono text-xs text-[#ececec] focus:outline-none focus:border-[#ff4d00]"
          >
            {Object.keys(SCALE_INTERVALS).map((sc) => (
              <option key={sc} value={sc}>
                {sc}
              </option>
            ))}
          </select>
        </div>
      </div>

      {keyBed}
    </div>
  );
};
