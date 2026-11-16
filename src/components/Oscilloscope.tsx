import React, { useEffect, useRef, useState } from 'react';
import { synthEngine } from '../audio/synthEngine';

interface OscilloscopeProps {
  audioReady: boolean;
}

export const Oscilloscope: React.FC<OscilloscopeProps> = ({ audioReady }) => {
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
      const targetW = Math.max(300, Math.floor(rect.width * dpr));
      const targetH = Math.max(100, Math.floor(rect.height * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const w = canvas.width;
      const h = canvas.height;

      ctx.fillStyle = '#0D1016';
      ctx.fillRect(0, 0, w, h);

      // Subtle hardware graticule grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.045)';
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

      // Center zero line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      const analyser = synthEngine.getAnalyser();
      if (analyser && audioReady) {
        if (mode === 'wave') {
          analyser.getByteTimeDomainData(timeData);
          ctx.lineWidth = 2 * dpr;
          ctx.strokeStyle = '#F59E0B';
          ctx.beginPath();

          // Find rising zero crossing for rock-steady waveform lock
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
          const barCount = 48;
          const barW = w / barCount;
          for (let i = 0; i < barCount; i++) {
            // Logarithmic-ish bin sampling for musical frequency spread
            const binIndex = Math.min(
              freqData.length - 1,
              Math.floor(Math.pow(i / barCount, 1.55) * (freqData.length * 0.45))
            );
            const val = freqData[binIndex] / 255;
            const barH = val * (h * 0.88);
            ctx.fillStyle = val > 0.78 ? '#F59E0B' : 'rgba(245, 158, 11, 0.55)';
            ctx.fillRect(i * barW + 1 * dpr, h - barH, Math.max(2, barW - 3 * dpr), barH);
          }
        }
      } else {
        // Flat idle trace
        ctx.lineWidth = 1.5 * dpr;
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
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
        <span className="text-xs font-medium text-neutral-400">Output Signal Monitor</span>
        <div className="flex items-center gap-1 bg-[#161922] p-0.5 rounded-md border border-[#242936]">
          <button
            type="button"
            onClick={() => setMode('wave')}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              mode === 'wave' ? 'bg-[#252A38] text-amber-400' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Waveform
          </button>
          <button
            type="button"
            onClick={() => setMode('spectrum')}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              mode === 'spectrum' ? 'bg-[#252A38] text-amber-400' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Spectrum
          </button>
        </div>
      </div>
      <div className="relative h-28 w-full rounded-lg overflow-hidden border border-[#232732] bg-[#0D1016]">
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>
    </div>
  );
};
