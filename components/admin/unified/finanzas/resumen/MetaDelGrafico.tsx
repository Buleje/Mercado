"use client";

import { useState } from "react";
import { Target } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/currency";
import type { UsoMetaDeVentas } from "@/hooks/use-meta-de-ventas";

/**
 * La meta de ventas en la cabecera del gráfico: la que el negocio puso, o
 * «Pon tu meta» si no hay ninguna. Nunca una cifra de fábrica.
 */
export default function MetaDelGrafico({ meta, cargando, error, guardando, guardar }: UsoMetaDeVentas) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState("");
  const [fallo, setFallo] = useState(false);

  if (cargando || error) return null;

  if (meta) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--text-secondary)]" title={meta.name}>
        <Target className="h-3.5 w-3.5" aria-hidden /> Meta {formatCurrency(meta.target, { decimals: 0 })}
      </span>
    );
  }

  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => setEditando(true)}
        className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-dashed border-[var(--rule-strong)] px-2.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
      >
        <Target className="h-3.5 w-3.5" aria-hidden /> Pon tu meta
      </button>
    );
  }

  // El panel escribe los soles como «6,424.00» (coma de miles, punto decimal):
  // «1,500» es mil quinientos, no uno coma cinco.
  const monto = Number(valor.replace(/[,\s]/g, ""));

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setFallo(false);
    const ok = await guardar(monto);
    if (ok) setEditando(false);
    else setFallo(true);
  };

  return (
    <form onSubmit={enviar} className="inline-flex flex-wrap items-center gap-1.5">
      <label className="sr-only" htmlFor="meta-ventas-mes">Meta de ventas del mes en soles</label>
      <span className="text-xs text-[var(--text-secondary)]">S/</span>
      <input
        id="meta-ventas-mes"
        inputMode="decimal"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setEditando(false); } }}
        placeholder="Ventas del mes"
        className="h-9 w-32 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
        // El campo aparece por un clic explícito en «Pon tu meta»: el foco va ahí.
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
      />
      <button type="submit" disabled={guardando || !(monto > 0)} className="min-h-9 rounded-lg bg-[var(--accent-dark)] px-3 text-xs font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
        {guardando ? "Guardando…" : "Guardar"}
      </button>
      <button type="button" onClick={() => setEditando(false)} className="min-h-9 rounded-lg px-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">
        Cancelar
      </button>
      {fallo && <span role="alert" className="text-xs text-[var(--data-error-ink)]">No se pudo guardar. Reintenta.</span>}
    </form>
  );
}
