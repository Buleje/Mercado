"use client";

/**
 * LothMapaToolbar — controles de capas del mapa del Libro TH: base cartográfica
 * (topográfica / satelital / calles), cuadrícula UTM, censo forestal y los
 * filtros por sección del libro. Presentacional: estado y datos viven en
 * `LothMapaView`.
 */

import { Eye, EyeOff, Grid3x3, Layers, TreePine } from "@buleje/design-system/icons";
import type { BasemapId } from "./LothMapaCanvas";
import { SECTION_COLOR, SECTION_LABEL } from "./loth-mapa-shared";

const BASEMAPS: { id: BasemapId; label: string }[] = [
  { id: "topo", label: "Topográfico" },
  { id: "sat", label: "Satélite" },
  { id: "street", label: "Calles" },
];

const CHIP = "inline-flex h-9 items-center gap-1.5 rounded-lg border-2 px-3 text-xs font-bold transition";

interface Props {
  basemap: BasemapId;
  onBasemap: (b: BasemapId) => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  censoCount: number;
  showCenso: boolean;
  onToggleCenso: () => void;
  sections: string[];
  hidden: Set<string>;
  onToggleSection: (s: string) => void;
}

export default function LothMapaToolbar({
  basemap,
  onBasemap,
  showGrid,
  onToggleGrid,
  censoCount,
  showCenso,
  onToggleCenso,
  sections,
  hidden,
  onToggleSection,
}: Props) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="inline-flex overflow-hidden rounded-lg border-2 border-[var(--rule-base)]">
          {BASEMAPS.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => onBasemap(b.id)}
              className={`inline-flex h-9 items-center gap-1.5 px-3 text-xs font-bold transition ${
                basemap === b.id
                  ? "bg-[var(--brand-ink)] text-white"
                  : "bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
              }`}
            >
              {basemap === b.id && <Layers className="h-3.5 w-3.5" />}
              {b.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onToggleGrid}
          aria-pressed={showGrid}
          className={`${CHIP} ${
            showGrid
              ? "border-[var(--brand-ink)] bg-[var(--brand-ink)] text-white"
              : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
          }`}
        >
          <Grid3x3 className="h-3.5 w-3.5" /> Cuadrícula
        </button>
        {censoCount > 0 && (
          <button
            type="button"
            onClick={onToggleCenso}
            aria-pressed={showCenso}
            className={`${CHIP} ${
              showCenso
                ? "border-transparent bg-[#15803d] text-white"
                : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
            }`}
          >
            <TreePine className="h-3.5 w-3.5" /> Censo ({censoCount})
          </button>
        )}
      </div>

      {sections.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {sections.map((s) => {
            const on = !hidden.has(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => onToggleSection(s)}
                aria-pressed={on}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold transition ${
                  on ? "border-transparent text-white" : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-tertiary)]"
                }`}
                style={on ? { backgroundColor: SECTION_COLOR[s] ?? "#334155" } : undefined}
              >
                {on ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                {SECTION_LABEL[s] ?? s}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
