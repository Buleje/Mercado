"use client";

/**
 * reparto-filtro-largo — el editor de `largoFiltro` de un bloque: varios
 * largos a la vez, y de cada uno cuánto se lleva (completo o una parte).
 *
 * Salió de `ResumenReparto` porque dejó de ser "un input de texto": ahora es
 * una lista de chips (cada largo con su %) más el control para agregar uno
 * nuevo — demasiada lógica propia para vivir inline en una celda de tabla.
 */

import { useState } from "react";
import { X } from "@buleje/design-system/icons";
import type { FiltroLargo } from "@/lib/forestal/cubicacion-reparto";

/**
 * Chips + agregador para el filtro de largo de UN bloque.
 *
 * Cada largo se agrega en "completo" (100 %); tocar su chip despliega el
 * mini-editor para pasarlo a una proporción parcial o volverlo a completo.
 */
export function FiltroLargoCelda({ valor, onChange }: {
  valor: FiltroLargo[] | null | undefined;
  onChange: (next: FiltroLargo[] | null) => void;
}) {
  const lista = valor ?? [];
  const [nuevo, setNuevo] = useState("");
  const [editando, setEditando] = useState<number | null>(null);

  const agregar = () => {
    const n = Number(nuevo.trim().replace(",", "."));
    setNuevo("");
    if (!Number.isFinite(n) || n <= 0) return;
    if (lista.some((f) => Math.abs(f.largo - n) < 0.05)) return; // ya está
    onChange([...lista, { largo: n, pct: 100 }]);
  };

  const setPct = (largo: number, pct: number) => {
    const sano = Math.max(1, Math.min(100, Math.round(pct) || 100));
    onChange(lista.map((f) => (f.largo === largo ? { ...f, pct: sano } : f)));
  };

  const quitar = (largo: number) => {
    const next = lista.filter((f) => f.largo !== largo);
    onChange(next.length > 0 ? next : null);
    if (editando === largo) setEditando(null);
  };

  const activo = lista.find((f) => f.largo === editando);

  return (
    <div className="flex min-w-[160px] flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1">
        {lista.map((f) => (
          <span
            key={f.largo}
            className={`inline-flex items-center gap-1 rounded-full border-2 px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold transition-colors ${editando === f.largo
              ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
              : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)]"}`}
          >
            <button type="button" onClick={() => setEditando(editando === f.largo ? null : f.largo)} title="Tocar para pasarlo a parcial o volverlo completo">
              {f.largo}&apos; · {f.pct >= 100 ? "completo" : `${f.pct}%`}
            </button>
            <button type="button" onClick={() => quitar(f.largo)} aria-label={`Quitar el filtro de ${f.largo} pies`} className="text-[var(--text-tertiary)] hover:text-[var(--data-error-600)]">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value.replace(/[^\d.,]/g, ""))}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregar(); } }}
          onBlur={agregar}
          list="largos-disponibles"
          placeholder={lista.length === 0 ? "cualquiera" : "+ largo"}
          aria-label="Agregar un largo (pies) al filtro — elegí de la lista o escribí el tuyo"
          className="h-7 w-16 rounded-lg border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] px-1.5 text-right font-mono text-[length:var(--ts-2xs)] tabular-nums text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
        />
      </div>
      {activo && (
        <div className="flex items-center gap-1.5 rounded-lg bg-primary/5 px-1.5 py-1 text-[length:var(--ts-2xs)]">
          <button
            type="button"
            onClick={() => setPct(activo.largo, 100)}
            className={`rounded-full border-2 px-2 py-0.5 font-bold ${activo.pct >= 100 ? "border-[var(--accent)] bg-primary/15 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-tertiary)]"}`}
          >
            Completo
          </button>
          <span className="text-[var(--text-tertiary)]">o parcial</span>
          <input
            type="number"
            min={1}
            max={100}
            value={activo.pct}
            onChange={(e) => setPct(activo.largo, Number(e.target.value))}
            aria-label={`Porcentaje del pendiente de ${activo.largo} pies que se lleva este bloque`}
            className="h-6 w-12 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-1 text-right font-mono tabular-nums outline-none focus:border-[var(--accent)]"
          />
          <span className="text-[var(--text-tertiary)]">%</span>
        </div>
      )}
    </div>
  );
}
