"use client";

/**
 * «Anotar D1 y D2»: elegir la guía y «Copiar a las vacías» un diámetro típico
 * (20-10, «diámetros de tus trozas»). Medido en Blas: 65 trozas de Tornillo en
 * 6 guías, ninguna con diámetro; tipear 130 casillas de a una no lo hace nadie.
 *
 * No guarda nada: llena las casillas VACÍAS de las piezas a la vista (la guía
 * elegida) y el usuario corrige las que difieren y mira «Cuadra» antes de
 * Guardar. Una punta que ya tiene dato no se toca.
 */

import { useState } from "react";
import { Copy } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { medidasDePieza } from "@/lib/forestal/trozas-patio-medidas";
import { Btn } from "./ctp-shared";
import { leerCm, medidaInvalida, type ValoresMedida } from "./ctp-trozas-medir-fila";
import type { TrozaPatioAPI } from "./hooks/use-trozas-patio";

/** Valor del selector para «todas las guías» (sin filtro). */
export const TODAS_LAS_GUIAS = "";

/** Las guías de la planilla con cuántas piezas tiene cada una, en orden de aparición. */
export function guiasDeLaPlanilla(piezas: readonly TrozaPatioAPI[]): { gtf: string; n: number }[] {
  const m = new Map<string, number>();
  for (const t of piezas) {
    const g = t.gtfNumber?.trim() || "Sin guía";
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return [...m].map(([gtf, n]) => ({ gtf, n }));
}

export const deLaGuia = (t: TrozaPatioAPI, gtf: string) =>
  gtf === TODAS_LAS_GUIAS || (t.gtfNumber?.trim() || "Sin guía") === gtf;

/** Pone `cm` en las casillas vacías (D1 y D2) de `piezas`; cuántas piezas cambiaron. */
export function copiarALasVacias(
  piezas: readonly TrozaPatioAPI[],
  valores: Record<string, ValoresMedida>,
  cm: string,
): { valores: Record<string, ValoresMedida>; tocadas: number } {
  const sig = { ...valores };
  let tocadas = 0;
  for (const t of piezas) {
    const ya = medidasDePieza(t);
    const act = sig[t.id] ?? { d1: "", d2: "" };
    const d1 = ya.d1 == null && act.d1.trim() === "" ? cm : act.d1;
    const d2 = ya.d2 == null && act.d2.trim() === "" ? cm : act.d2;
    if (d1 === act.d1 && d2 === act.d2) continue;
    sig[t.id] = { d1, d2 };
    tocadas += 1;
  }
  return { valores: sig, tocadas };
}

export default function CtpTrozasMedirCopiar({
  piezas, guia, onGuia, onCopiar,
}: {
  piezas: readonly TrozaPatioAPI[];
  guia: string;
  onGuia: (gtf: string) => void;
  /** Recibe el valor tipeado (ya validado). */
  onCopiar: (cm: string) => void;
}) {
  const [cm, setCm] = useState("");
  const guias = guiasDeLaPlanilla(piezas);
  const valor = leerCm(cm);
  const invalido = cm.trim() !== "" && (valor == null || medidaInvalida(valor));
  return (
    <div className="flex flex-wrap items-center gap-2">
      {guias.length > 1 && (
        <select
          aria-label="Guía"
          value={guia}
          onChange={(e) => onGuia(e.target.value)}
          className="h-10 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
        >
          <option value={TODAS_LAS_GUIAS}>Todas las guías ({piezas.length})</option>
          {guias.map((g) => (
            <option key={g.gtf} value={g.gtf}>{g.gtf} ({g.n})</option>
          ))}
        </select>
      )}
      <input
        aria-label="Diámetro típico en cm"
        inputMode="decimal"
        value={cm}
        onChange={(e) => setCm(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && valor != null && !invalido) {
            e.preventDefault();
            onCopiar(cm.trim());
          }
        }}
        placeholder="Ø típico (cm)"
        aria-invalid={invalido || undefined}
        className="h-10 w-32 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-right font-mono text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)] aria-[invalid]:border-[var(--data-error-ink)]"
      />
      <Btn disabled={valor == null || invalido} onClick={() => onCopiar(cm.trim())}>
        <Copy className="h-4 w-4" aria-hidden="true" /> Copiar a las vacías
      </Btn>
      <InfoTip
        title="Copiar un diámetro a todas"
        what="Pone ese diámetro en D1 y D2 de las piezas a la vista que no tienen dato. No guarda: corrige las que difieren y luego Guardar."
        affects="Lo que ya tiene diámetro no se toca. La columna Cuadra avisa si con ese diámetro el volumen se aparta más de 10 % del declarado."
        example="Guía 019-001-0000123, 12 trozas de Tornillo: tipeas 60, Copiar, y ajustas las 2 que en el papel dicen 72."
      />
    </div>
  );
}
