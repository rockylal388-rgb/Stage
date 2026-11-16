import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PatchCategory, SynthPatch } from '../types/synth';
import { synthEngine } from '../audio/synthEngine';
import { Play, Search, X, Library } from 'lucide-react';

interface PatchBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  allPatches: SynthPatch[];
  activePatchId: string;
  onSelectPatch: (patch: SynthPatch) => void;
}

const CATEGORIES: ('All' | PatchCategory)[] = [
  'All',
  'Bass',
  'Lead',
  'Pad',
  'Pluck',
  'Keys',
  'Brass',
  'FX',
];

const SOURCES = ['All', 'Factory', 'Songbook', 'AI Lab', 'User'] as const;
type SourceFilter = (typeof SOURCES)[number];

export const PatchBrowserModal: React.FC<PatchBrowserModalProps> = ({
  isOpen,
  onClose,
  allPatches,
  activePatchId,
  onSelectPatch,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'All' | PatchCategory>('All');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('All');
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const focusTimer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 20);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: 0 };
    for (const cat of CATEGORIES) {
      if (cat !== 'All') counts[cat] = 0;
    }
    const q = searchQuery.trim().toLowerCase();
    for (const p of allPatches) {
      const author = p.author || 'User';
      const matchesSource = sourceFilter === 'All' || author === sourceFilter;
      const matchesQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        author.toLowerCase().includes(q);
      if (matchesSource && matchesQuery) {
        counts.All += 1;
        counts[p.category] = (counts[p.category] || 0) + 1;
      }
    }
    return counts;
  }, [allPatches, searchQuery, sourceFilter]);

  const filteredPatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allPatches.filter((p) => {
      const author = p.author || 'User';
      const matchesCategory = categoryFilter === 'All' || p.category === categoryFilter;
      const matchesSource = sourceFilter === 'All' || author === sourceFilter;
      const matchesQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        author.toLowerCase().includes(q);
      return matchesCategory && matchesSource && matchesQuery;
    });
  }, [allPatches, categoryFilter, sourceFilter, searchQuery]);

  if (!isOpen) return null;

  const handlePreview = async (e: React.MouseEvent, targetPatch: SynthPatch) => {
    e.stopPropagation();
    onSelectPatch(targetPatch);
    await synthEngine.init();
    synthEngine.setPatch(targetPatch);
    const previewNotes = targetPatch.category === 'Bass' ? [45] : [57, 60, 64];
    await synthEngine.playChord(previewNotes, 800, 96);
  };

  const handleLoadAndClose = (targetPatch: SynthPatch) => {
    onSelectPatch(targetPatch);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-[2px] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="patch-browser-title"
      onClick={onClose}
    >
      <div
        className="bg-[#161618] border-2 border-[#ececec] rounded-[2px] w-full max-w-4xl max-h-[86vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-[rgba(236,236,236,0.14)] bg-[#0c0c0e] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Library className="w-4 h-4 text-[#ff4d00]" />
            <div>
              <h2
                id="patch-browser-title"
                className="font-display text-sm font-extrabold uppercase tracking-[0.06em] text-[#ececec]"
              >
                Patch Library Browser
              </h2>
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[rgba(236,236,236,0.5)]">
                {filteredPatches.length} of {allPatches.length} Patches Available
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3 bg-[#161618] border border-[rgba(236,236,236,0.18)] hover:border-[#ff4d00] rounded-[2px] font-mono text-[10px] uppercase tracking-[0.08em] text-[#ececec] flex items-center gap-1.5 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            <span>Close</span>
          </button>
        </div>

        {/* Search & Category / Source Filters */}
        <div className="p-4 border-b border-[rgba(236,236,236,0.12)] bg-[#161618] flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-3.5 h-3.5 text-[rgba(236,236,236,0.45)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search patches by name, character, or source..."
                className="w-full h-9 pl-9 pr-8 rounded-[2px] bg-[#0c0c0e] border border-[rgba(236,236,236,0.16)] text-xs text-[#ececec] placeholder:text-[rgba(236,236,236,0.4)] focus:outline-none focus:border-[#ff4d00]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[rgba(236,236,236,0.45)] hover:text-[#ececec]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 bg-[#0c0c0e] p-1 border border-[rgba(236,236,236,0.12)] rounded-[2px]">
              {SOURCES.map((src) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setSourceFilter(src)}
                  className={`px-2.5 py-1 rounded-[2px] font-mono text-[10px] uppercase tracking-[0.06em] transition-colors whitespace-nowrap ${
                    sourceFilter === src
                      ? 'bg-[#ececec] text-[#0c0c0e] font-bold'
                      : 'text-[rgba(236,236,236,0.54)] hover:text-[#ececec]'
                  }`}
                >
                  {src}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1 bg-[#0c0c0e] p-1 border border-[rgba(236,236,236,0.12)] rounded-[2px]">
            {CATEGORIES.map((cat) => {
              const isSelected = categoryFilter === cat;
              const count = categoryCounts[cat] || 0;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-2.5 py-1 rounded-[2px] font-mono text-[10px] uppercase tracking-[0.06em] flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                    isSelected
                      ? 'bg-[#ff4d00] text-[#0c0c0e] font-bold'
                      : 'text-[rgba(236,236,236,0.58)] hover:text-[#ececec]'
                  }`}
                >
                  <span>{cat}</span>
                  <span className="tabular-nums opacity-80">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Patch Directory */}
        <div className="flex-1 overflow-y-auto divide-y divide-[rgba(236,236,236,0.08)] bg-[#0c0c0e]">
          {filteredPatches.length === 0 ? (
            <div className="p-10 text-center flex flex-col items-center gap-2">
              <p className="font-display text-sm font-bold uppercase text-[#ececec]">
                No Patches Match Filter
              </p>
              <p className="text-xs text-[rgba(236,236,236,0.54)]">
                Try clearing your search query or switching to the All category tab.
              </p>
            </div>
          ) : (
            filteredPatches.map((p) => {
              const isActive = p.id === activePatchId;
              const cutoffText =
                p.filterCutoff >= 1000
                  ? `${(p.filterCutoff / 1000).toFixed(1)} kHz`
                  : `${Math.round(p.filterCutoff)} Hz`;

              return (
                <div
                  key={p.id}
                  onClick={() => handleLoadAndClose(p)}
                  className={`px-5 py-3.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-4 cursor-pointer transition-colors border-l-2 ${
                    isActive
                      ? 'bg-[#161618] border-l-[#ff4d00]'
                      : 'border-l-transparent hover:bg-[#161618]/75'
                  }`}
                >
                  <div className="min-w-0 flex-1 flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-[#ececec]">{p.name}</span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#ff4d00]">
                        {p.category}
                      </span>
                      <span className="font-mono text-[10px] uppercase text-[rgba(236,236,236,0.45)]">
                        / {p.author || 'User'}
                      </span>
                      {p.bpmHint && (
                        <span className="font-mono text-[10px] text-[rgba(236,236,236,0.45)] tabular-nums">
                          / {p.bpmHint} BPM
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[rgba(236,236,236,0.62)] line-clamp-1">
                      {p.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="hidden md:inline font-mono text-[10px] uppercase text-[rgba(236,236,236,0.45)] tabular-nums">
                      {p.osc1Wave}+{p.osc2Wave} · {cutoffText}
                    </span>

                    <button
                      type="button"
                      onClick={(e) => handlePreview(e, p)}
                      aria-label={`Audition ${p.name}`}
                      title="Audition sound"
                      className="h-8 px-2.5 rounded-[2px] bg-[#161618] border border-[rgba(236,236,236,0.16)] hover:border-[#ff4d00] font-mono text-[10px] uppercase text-[#ececec] flex items-center gap-1.5 transition-colors"
                    >
                      <Play className="w-3 h-3 text-[#ff4d00]" />
                      <span>Preview</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLoadAndClose(p);
                      }}
                      className={`h-8 px-3.5 rounded-[2px] font-mono text-[10px] uppercase tracking-[0.06em] border transition-colors ${
                        isActive
                          ? 'bg-[#ff4d00] border-[#ff4d00] text-[#0c0c0e] font-bold'
                          : 'bg-[#161618] border-[rgba(236,236,236,0.18)] text-[#ececec] hover:border-[#ececec]'
                      }`}
                    >
                      {isActive ? 'Loaded' : 'Load'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
