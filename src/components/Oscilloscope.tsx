import React, { useEffect, useRef, useState } from 'react';
import { synthEngine } from '../audio/synthEngine';

interface OscilloscopeProps {
  audioReady: boolean;
  heightClass?: string;
}

export const Oscilloscope: React.FC<OscilloscopeProps> = ({
  audioReady,
  heightClass = 'h-36',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<'wave' | 'spectrum'>('wave');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const bufferLength = 1024;
    const timeData = new Uint8Array(bufferLength);
    const freqData = new Uint8Array(bufferLength);

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const targetW = Math.max(240, Math.floor(rect.width * dpr));
      const targetH = Math.max(90, Math.floor(rect.height * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const w = canvas.width;
      const h = canvas.height;

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, w, h);

      // Hardware graticule grid
      ctx.strokeStyle = 'rgba(236, 236, 236, 0.06)';
      ctx.lineWidth = 1;
      const cols = 8;
      const rows = 4;
      for (let i = 1; i < cols; i++) {
        const x = (w / cols) * i;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let j = 1; j < rows; j++) {
        const y = (h / rows) * j;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(236, 236, 236, 0.12)';
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      const analyser = synthEngine.getAnalyser();
      if (analyser && audioReady) {
        if (mode === 'wave') {
          analyser.getByteTimeDomainData(timeData);
          ctx.lineWidth = 2 * dpr;
          ctx.strokeStyle = '#ff4d00';
          ctx.beginPath();

          let trigger = 0;
          for (let i = 1; i < bufferLength / 2; i++) {
            if (timeData[i - 1] < 128 && timeData[i] >= 128) {
              trigger = i;
              break;
            }
          }

          const drawSamples = 512;
          const sliceWidth = w / drawSamples;
          for (let i = 0; i < drawSamples; i++) {
            const sample = timeData[trigger + i] ?? 128;
            const v = sample / 128.0;
            const y = (v * h) / 2;
            const x = i * sliceWidth;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        } else {
          analyser.getByteFrequencyData(freqData);
          const barCount = 40;
          const barW = w / barCount;
          for (let i = 0; i < barCount; i++) {
            const binIndex = Math.min(
              freqData.length - 1,
              Math.floor(Math.pow(i / barCount, 1.55) * (freqData.length * 0.45))
            );
            const val = freqData[binIndex] / 255;
            const barH = val * (h * 0.88);
            ctx.fillStyle = val > 0.72 ? '#ff4d00' : 'rgba(255, 77, 0, 0.55)';
            ctx.fillRect(i * barW + 1 * dpr, h - barH, Math.max(2, barW - 3 * dpr), barH);
          }
        }
      } else {
        ctx.lineWidth = 1.5 * dpr;
        ctx.strokeStyle = 'rgba(255, 77, 0, 0.4)';
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();
      }

      rafId = window.requestAnimationFrame(draw);
    };

    rafId = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(rafId);
  }, [audioReady, mode]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[rgba(236,236,236,0.52)]">
          Output Monitor
        </span>
        <div className="flex items-center gap-1 bg-[#0c0c0e] p-0.5 border border-[rgba(236,236,236,0.12)]">
          <button
            type="button"
            onClick={() => setMode('wave')}
            className={`px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors whitespace-nowrap shrink-0 ${
              mode === 'wave' ? 'bg-[#ff4d00] text-[#0c0c0e] font-semibold' : 'text-[rgba(236,236,236,0.6)] hover:text-[#ececec]'
            }`}
          >
            Wave
          </button>
          <button
            type="button"
            onClick={() => setMode('spectrum')}
            className={`px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors whitespace-nowrap shrink-0 ${
              mode === 'spectrum' ? 'bg-[#ff4d00] text-[#0c0c0e] font-semibold' : 'text-[rgba(236,236,236,0.6)] hover:text-[#ececec]'
            }`}
          >
            Spec
          </button>
        </div>
      </div>
      <div className={`relative ${heightClass} w-full overflow-hidden border border-[rgba(236,236,236,0.12)] bg-black`}>
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>
    </div>
  );
};
