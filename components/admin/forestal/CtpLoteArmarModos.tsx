"use client";

/**
 * Cómo se arma el lote en «Programar un lote de aserrío»: con trozas del patio
 * (se eligen después), inventario sin trozas o pegando el Excel del SNIFFS
 * (en consumo). Va primero en el modal porque cambia qué pide el resto.
 */

import { Archive, Boxes, FileSpreadsheet } from "@buleje/design-system/icons";

export type ModoArmarLote = "trozas" | "inventario" | "excel";

const MODOS = [
  ["trozas", Boxes, "Con trozas del patio", "Se elige la madera después, en Consumos"],
  ["inventario", Archive, "Inventario (sin trozas)", "Existencia previa: declaras el volumen directo"],
  ["excel", FileSpreadsheet, "Pegar de Excel", "Lote del SNIFFS con sus trozas, en consumo"],
] as const;

export default function CtpLoteArmarModos({
  modo,
  onModo,
  disabled,
}: {
  modo: ModoArmarLote;
  onModo: (m: ModoArmarLote) => void;
  disabled?: boolean;
}) {
  return (
    <div role="tablist" aria-label="Cómo armar el lote" className="mb-3 flex flex-wrap gap-2">
      {MODOS.map(([m, Icon, titulo, sub]) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={modo === m}
          onClick={() => onModo(m)}
          disabled={disabled}
          className={`flex-1 rounded-xl border-2 px-3 min-h-10 text-left transition-colors ${
            modo === m ? "border-primary bg-primary/10" : "border-[var(--rule-base)] hover:border-primary/50"
          }`}
        >
          <span className="flex items-center gap-1.5 text-sm font-extrabold text-[var(--text-primary)]">
            <Icon className="h-4 w-4 shrink-0" aria-hidden /> {titulo}
          </span>
          <span className="block text-sm text-[var(--text-tertiary)]">{sub}</span>
        </button>
      ))}
    </div>
  );
}
