"use client";

/**
 * Una guía sin plan en «Atar lo que no tiene plan» (`LothPlanSinPlan`): su N°
 * (abre la guía), trozas y m³, el plan sugerido y «Atar» o «Crear el plan desde
 * la guía». Las celdas llevan `data-label`: en el celular es una tarjeta.
 */

import { FileCheck, Link2 } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { GuiaSuelta, SueltosDelLibro } from "@/lib/forestal/loth-saldo-plan-tipos";
import { Btn, I } from "./ctp-shared";

const NUM = "text-right font-mono tabular-nums";
const VIA = { titulo: "por el título", titular: "por el titular" } as const;

export default function FilaGuia({
  g,
  planes,
  planId,
  onPlan,
  onAtar,
  onCrear,
  onVerGuia,
}: {
  g: GuiaSuelta;
  planes: SueltosDelLibro["planes"];
  planId: string;
  onPlan: (id: string) => void;
  onAtar: () => void;
  onCrear: () => void;
  onVerGuia?: (gtfNumber: string) => void;
}) {
  /* Crear sólo si la guía cita un título y ningún plan del libro lo tiene (si lo tiene, se sugiere ése). */
  const puedeCrear = !!g.titulo && g.sugerido?.via !== "titulo";
  return (
    <tr data-testid="guia-sin-plan">
      <td data-label="Guía" className="font-semibold">
        {/* Un solo hijo: en la tarjeta del celular la celda es flex y partía el N° de su título. */}
        <span className="block min-w-0">
          {onVerGuia ? (
            <button
              type="button"
              onClick={() => onVerGuia(g.gtfNumber)}
              className="min-h-9 rounded-lg text-left font-mono text-[var(--accent-ink)] underline-offset-2 hover:underline"
              title="Abrir la guía en «Guías»"
            >
              GTF {g.gtfNumber}
            </button>
          ) : (
            <span className="font-mono">GTF {g.gtfNumber}</span>
          )}
          <span className="block text-xs font-normal text-[var(--text-tertiary)]">
            {[g.titulo, g.titular].filter(Boolean).join(" · ") || "Sin título ni titular"}
          </span>
        </span>
      </td>
      <td data-label="Trozas · m³" className={NUM}>
        {g.piezas} · {fmtM3(g.m3)}
      </td>
      <td data-label="Plan">
        <select
          aria-label={`Plan de la GTF ${g.gtfNumber}`}
          value={planId}
          onChange={(e) => onPlan(e.target.value)}
          className={`${I} min-w-44`}
        >
          <option value="">Elige un plan…</option>
          {planes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
              {g.sugerido?.planId === p.id ? ` (sugerido ${VIA[g.sugerido.via]})` : ""}
            </option>
          ))}
        </select>
      </td>
      <td data-label="Acción" className="text-right">
        <span className="inline-flex flex-wrap justify-end gap-2">
          <Btn
            size="sm"
            variant={planId ? "primary" : "secondary"}
            onClick={onAtar}
            disabled={!planId}
          >
            <Link2 className="h-4 w-4" aria-hidden="true" />
            Atar
          </Btn>
          {puedeCrear && (
            <Btn size="sm" variant={planId ? "secondary" : "primary"} onClick={onCrear}>
              <FileCheck className="h-4 w-4" aria-hidden="true" />
              Crear el plan desde la guía
            </Btn>
          )}
        </span>
      </td>
    </tr>
  );
}
