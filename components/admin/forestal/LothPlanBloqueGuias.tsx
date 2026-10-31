"use client";

/**
 * Las guías de un bloque (Brandon 25-10): N.º de GTF, LT, especie, trozas, m³ y
 * su estado —en el libro, preliminar pendiente o anotada sin descontar—. La
 * misma lista va en la tarjeta del bloque, en «Sin bloque asignado» (con el
 * motivo) y en la ventana de la preliminar.
 */

import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { MOTIVO_SIN_BLOQUE, type EstadoGuiaDelBloque, type GuiaDelBloque, type MotivoSinBloque } from "@/lib/forestal/loth-plan-bloques-saldo";
import { textoDeLts } from "@/lib/forestal/loth-plan-preliminares";

const NUM = "font-mono tabular-nums";

export const ESTADO_GUIA: Record<EstadoGuiaDelBloque, { texto: string; pill: string }> = {
  registrada: {
    texto: "en el libro",
    pill: "bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]",
  },
  pendiente: {
    texto: "preliminar pendiente",
    pill: "bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]",
  },
  sin_descontar: { texto: "sin descontar", pill: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" },
};

export default function LothPlanBloqueGuias({
  guias,
  vacio = "Ninguna guía en este bloque todavía.",
}: {
  guias: readonly (GuiaDelBloque & { motivo?: MotivoSinBloque })[];
  vacio?: string;
}) {
  if (guias.length === 0) return <p className="text-sm text-[var(--text-secondary)]">{vacio}</p>;
  return (
    <ul data-testid="guias-del-bloque" className="divide-y divide-[var(--rule-soft)] text-sm">
      {guias.map((g) => {
        const e = ESTADO_GUIA[g.estado];
        return (
          <li key={g.key} data-estado={g.estado} className="space-y-0.5 py-1.5">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-mono font-semibold text-[var(--text-primary)]">{g.numeroGtf ? `GTF ${g.numeroGtf}` : "Sin N.º de guía"}</span>
              {g.numerosLt.length > 0 && <span className="text-[var(--text-secondary)]">LT {textoDeLts(g.numerosLt)}</span>}
              <span className={`rounded-md px-1.5 text-xs font-semibold ${e.pill}`}>{e.texto}</span>
            </p>
            <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-[var(--text-secondary)]">
              <span className="min-w-0">{g.especie}</span>
              <span className={NUM}>
                {g.trozas} {g.trozas === 1 ? "troza" : "trozas"} · {fmtM3(g.m3)} m³
              </span>
            </p>
            {g.motivo && <p className="text-xs text-[var(--text-tertiary)]">Sin bloque: {MOTIVO_SIN_BLOQUE[g.motivo]}.</p>}
          </li>
        );
      })}
    </ul>
  );
}
