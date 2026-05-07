"use client";
import { SectionTitle } from "@buleje/design-system";
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect } from "react";
import { Save, Search, RotateCcw, Grid3X3 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────────

type Cell = {
  id: string; // "row-col"
  category: string | null;
};

// ── Constants ────────────────────────────────────────────────────────────────

const LS_KEY = "buleje_warehouse_layout";
const DEFAULT_ROWS = 4;
const DEFAULT_COLS = 6;

const CATEGORIES = [
  { name: "Abarrotes", color: "bg-[var(--data-warning-500)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]" },
  { name: "Bebidas", color: "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]" },
  { name: "Lacteos", color: "bg-[var(--data-warning-500)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]" },
  { name: "Limpieza", color: "bg-[var(--data-info-500)] text-[var(--data-info-500)] dark:bg-[var(--data-info-500)] dark:text-[var(--data-info-500)]" },
  { name: "Snacks", color: "bg-[var(--data-warning-500)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]" },
  { name: "Carnes", color: "bg-[var(--data-error-500)] text-[var(--data-error-500)] dark:bg-[var(--data-error-500)] dark:text-[var(--data-error-500)]" },
  { name: "Frutas", color: "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]" },
  { name: "Granos", color: "bg-stone-200 text-stone-800 dark:bg-stone-700 dark:text-stone-100" },
  { name: "Higiene", color: "bg-[var(--surface-sunken)] text-[var(--text-primary)] dark:bg-[var(--surface-sunken)] dark:text-[var(--text-primary)]" },
  { name: "Panaderia", color: "bg-[var(--surface-sunken)] text-[var(--text-primary)] dark:bg-[var(--surface-sunken)] dark:text-[var(--text-primary)]" },
  { name: "Congelados", color: "bg-[var(--data-info-500)] text-[var(--data-info-500)] dark:bg-[var(--data-info-500)] dark:text-[var(--data-info-500)]" },
  { name: "Otros", color: "bg-gray-200 text-[var(--text-primary)] dark:bg-gray-700 dark:text-gray-100" },
];

function catColor(name: string) {
  return (
    CATEGORIES.find((c) => c.name === name)?.color ??
    "bg-gray-100 text-[var(--text-secondary)] dark:bg-gray-800 dark:text-[var(--text-tertiary)]"
  );
}

// ── Initial grid ─────────────────────────────────────────────────────────────

function buildGrid(rows: number, cols: number, existing: Cell[]): Cell[] {
  const map: Record<string, Cell> = {};
  existing.forEach((c) => { map[c.id] = c; });
  const cells: Cell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = `${r}-${c}`;
      cells.push(map[id] ?? { id, category: null });
    }
  }
  return cells;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function WarehouseLayoutEditor() {
  const [rows, setRows] = useState(DEFAULT_ROWS);
  const [cols, setCols] = useState(DEFAULT_COLS);
  const [cells, setCells] = useState<Cell[]>(() => buildGrid(DEFAULT_ROWS, DEFAULT_COLS, []));
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [highlight, setHighlight] = useState<string | null>(null); // category to highlight
  const [saved, setSaved] = useState(false);

  // Load from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        setRows(data.rows ?? DEFAULT_ROWS);
        setCols(data.cols ?? DEFAULT_COLS);
        setCells(buildGrid(data.rows ?? DEFAULT_ROWS, data.cols ?? DEFAULT_COLS, data.cells ?? []));
      }
    } catch {}
  }, []);

  const handleSave = () => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ rows, cols, cells }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
  };

  const handleReset = () => {
    const fresh = buildGrid(rows, cols, []);
    setCells(fresh);
  };

  const paintCell = (cellId: string) => {
    setCells((prev) =>
      prev.map((c) =>
        c.id === cellId
          ? { ...c, category: selectedCat === c.category ? null : selectedCat }
          : c
      )
    );
  };

  // Drag from palette
  const handleDropOnCell = (cellId: string) => {
    if (dragId) {
      // drag from palette
      setCells((prev) =>
        prev.map((c) => (c.id === cellId ? { ...c, category: dragId } : c))
      );
    }
    setDragId(null);
  };

  // Find product location
  const handleSearch = () => {
    if (!search.trim()) {
      setHighlight(null);
      return;
    }
    const match = CATEGORIES.find((c) =>
      c.name.toLowerCase().includes(search.toLowerCase())
    );
    setHighlight(match?.name ?? null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <SectionTitle className="text-xl font-bold text-[var(--text-primary)]">
            Editor de Layout del Almacen
          </SectionTitle>
          <p className="text-sm text-[var(--text-tertiary)]">
            Asigna categorias a cada zona del almacen. Haz clic en una celda
            para pintarla.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 rounded-lg border border-[var(--rule-base)] px-3 py-2 text-sm text-[var(--text-secondary)] transition hover:bg-gray-50 dark:border-[var(--rule-base)] dark:text-[var(--text-tertiary)] dark:hover:bg-gray-800"
          >
            <RotateCcw className="h-4 w-4" />
            Resetear
          </button>
          <button
            onClick={handleSave}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white transition",
              saved ? "bg-[var(--accent-soft)]" : "bg-primary hover:bg-primary-dark"
            )}
          >
            <Save className="h-4 w-4" />
            {saved ? "Guardado" : "Guardar layout"}
          </button>
        </div>
      </div>

      {/* Find product */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (!e.target.value) setHighlight(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Buscar categoria (ej: Bebidas)..."
            className="w-full rounded-lg border border-[var(--rule-base)] bg-gray-50 py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none dark:border-[var(--rule-base)] dark:bg-gray-800 dark:text-white"
          />
        </div>
        <button
          onClick={handleSearch}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          Buscar
        </button>
        {highlight && (
          <button
            onClick={() => { setHighlight(null); setSearch(""); }}
            className="rounded-lg border border-[var(--rule-base)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-gray-50 dark:border-[var(--rule-base)] dark:hover:bg-gray-800"
          >
            Limpiar
          </button>
        )}
      </div>

      {highlight && (
        <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-4 py-2.5 dark:bg-primary/20">
          <Grid3X3 className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium text-primary dark:text-[var(--data-success-500)]">
            Las celdas resaltadas contienen: {highlight}
          </p>
        </div>
      )}

      {/* Category palette */}
      <div>
        <p className="mb-2 text-sm font-medium text-[var(--text-secondary)]">
          Paleta de categorias (selecciona una y haz clic en el mapa)
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCat(null)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium transition",
              selectedCat === null
                ? "border-gray-500 bg-gray-500 text-white"
                : "border-[var(--rule-base)] bg-gray-100 text-[var(--text-secondary)] hover:bg-gray-200 dark:border-[var(--rule-base)] dark:bg-gray-800 dark:text-[var(--text-tertiary)]"
            )}
          >
            Borrar
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.name}
              draggable
              onDragStart={() => setDragId(cat.name)}
              onClick={() => setSelectedCat(cat.name)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                selectedCat === cat.name
                  ? "ring-2 ring-primary ring-offset-1"
                  : "hover:opacity-80",
                cat.color,
                "border-transparent"
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)] bg-white p-4 dark:border-[var(--rule-base)] dark:bg-gray-900">
        <div className="mb-2 flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
          <span>Entrada</span>
          <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
          <span>Fondo</span>
        </div>
        <div
          className="grid gap-1.5"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(80px, 1fr))` }}
        >
          {cells.map((cell) => {
            const isHighlighted = highlight && cell.category === highlight;
            return (
              <div
                key={cell.id}
                onClick={() => paintCell(cell.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDropOnCell(cell.id)}
                className={cn(
                  "flex min-h-[64px] cursor-pointer select-none items-center justify-center rounded-lg border-2 text-xs font-medium transition",
                  cell.category
                    ? catColor(cell.category)
                    : "border-dashed border-[var(--rule-base)] bg-gray-50 text-[var(--text-tertiary)] dark:border-[var(--rule-base)] dark:bg-gray-800 dark:text-[var(--text-secondary)]",
                  isHighlighted &&
                    "ring-4 ring-[var(--data-warning-500)] ring-offset-1",
                  !cell.category && "border-[var(--rule-base)]"
                )}
              >
                {cell.category ?? "+"}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-center text-xs text-[var(--text-tertiary)]">
          Vista del almacen — {rows} filas x {cols} columnas
        </p>
      </div>

      {/* Grid size controls */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[var(--rule-base)] bg-gray-50 px-4 py-3 dark:border-[var(--rule-base)] dark:bg-gray-800/50">
        <p className="text-sm font-medium text-[var(--text-secondary)]">
          Tamano del mapa:
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-secondary)]">Filas</span>
          <input
            type="number"
            min={1}
            max={10}
            value={rows}
            onChange={(e) => {
              const r = Math.max(1, Math.min(10, Number(e.target.value)));
              setRows(r);
              setCells((prev) => buildGrid(r, cols, prev));
            }}
            className="w-16 rounded border border-[var(--rule-base)] bg-white px-2 py-1 text-sm focus:border-primary focus:outline-none dark:border-[var(--rule-base)] dark:bg-gray-900 dark:text-white"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-secondary)]">Columnas</span>
          <input
            type="number"
            min={1}
            max={12}
            value={cols}
            onChange={(e) => {
              const c = Math.max(1, Math.min(12, Number(e.target.value)));
              setCols(c);
              setCells((prev) => buildGrid(rows, c, prev));
            }}
            className="w-16 rounded border border-[var(--rule-base)] bg-white px-2 py-1 text-sm focus:border-primary focus:outline-none dark:border-[var(--rule-base)] dark:bg-gray-900 dark:text-white"
          />
        </div>
      </div>
    </div>
  );
}
