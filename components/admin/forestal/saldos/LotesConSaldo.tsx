"use client";

/**
 * Cuánta madera le queda a cada lote, y para cuándo prometió terminar.
 *
 * Saldos contestaba cuánto hay en el patio y de qué especie, pero no en qué
 * lote está parado. Y un lote NO es una carpeta: es madera apartada. Mientras
 * está en un lote abierto, esa troza no se ofrece para ninguna otra corrida —
 * así que un lote olvidado es volumen que el patio tiene y no puede usar.
 *
 * Las tres preguntas que contesta, en ese orden:
 *   · ¿cuánto le RESTA? — `volumenLibre`, las piezas que todavía no entraron a
 *     la sierra. Ojo: una troza atada a una corrida ANULADA volvió al patio y
 *     cuenta como libre (ADR-326 §6); por eso el cálculo sale de la lógica del
 *     módulo y no de contar `consumidaEnId IS NULL`, que da otro número.
 *   · ¿hace cuánto está parado? — `diasDeEspera`.
 *   · ¿se le pasó la fecha? — `finProceso` es lo que el lote declaró al SNIFFS
 *     (ADR-342). Vencido sólo aplica a lotes ABIERTOS: uno consumido ya terminó
 *     su proceso, pasara o no la fecha.
 *
 * Los lotes sin nada libre NO se esconden: un lote abierto y vacío es
 * justamente el que hay que cerrar, y esconderlo lo deja abierto para siempre.
 */

import { CardTitle, DataTable } from "@buleje/design-system";
import { AlertTriangle, Clock } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { limaDateKey } from "@/lib/utils";
import {
  DIAS_LOTE_ANEJO,
  diasDeEspera,
  loteVencido,
  piezasLibres,
  volumenLibre,
  type LoteAserrio,
} from "@/lib/forestal/lotes-aserrio";
import { Th } from "../ctp-section-shared";

/**
 * Días que faltan para `finProceso`. Negativo = ya se pasó. `null` = sin fecha.
 *
 * Se cuenta por día de CALENDARIO, no por horas: «vence hoy» tiene que decir 0
 * aunque falten tres horas.
 *
 * Y el día se lee según de dónde venga la fecha, que es donde esto se rompe:
 * un `finProceso` date-only («2026-10-01») ya viene en el día del negocio y
 * leerlo como instante lo corre a la noche del 30 en hora peruana — un día
 * menos de plazo. Un timestamp completo sí se convierte al día de Lima, que es
 * donde abre la planta. Mismo criterio que `claveDelDia` en el centro de IA.
 */
export function diasParaVencer(finProceso: string | Date | null | undefined, ahora: Date): number | null {
  if (!finProceso) return null;
  const clave =
    typeof finProceso === "string" && finProceso.length <= 10
      ? finProceso
      : limaDateKey(finProceso);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clave)) return null;
  const hoy = limaDateKey(ahora);
  const aMs = (k: string) => {
    const [a, m, d] = k.split("-").map(Number);
    return Date.UTC(a, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((aMs(clave) - aMs(hoy)) / 86_400_000);
}

const fecha = (v: string | Date | null | undefined): string =>
  v ? new Date(v).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "—";

function TextoPlazo({ dias, vencido }: { dias: number | null; vencido: boolean }) {
  if (dias == null) return <span className="text-[var(--text-tertiary)]">sin fecha</span>;
  if (vencido) {
    return (
      <span className="font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
        {Math.abs(dias)} {Math.abs(dias) === 1 ? "día" : "días"} vencido
      </span>
    );
  }
  if (dias === 0) return <span className="font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">vence hoy</span>;
  const apura = dias <= 3;
  return (
    <span className={apura ? "font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" : "text-[var(--text-secondary)]"}>
      quedan {dias} {dias === 1 ? "día" : "días"}
    </span>
  );
}

export default function LotesConSaldo({ lotes, ahora = new Date() }: { lotes: LoteAserrio[]; ahora?: Date }) {
  if (lotes.length === 0) return null;

  const filas = lotes
    .map((l) => {
      const libre = volumenLibre(l);
      const dias = diasParaVencer(l.finProceso, ahora);
      return {
        lote: l,
        libre,
        piezas: piezasLibres(l).length,
        espera: diasDeEspera(l, ahora),
        dias,
        vencido: loteVencido(l, ahora),
      };
    })
    /* Primero lo que apura: vencidos, después por lo que menos plazo le queda,
       y a igualdad de plazo el que más madera tiene parada. */
    .sort((a, b) => {
      if (a.vencido !== b.vencido) return a.vencido ? -1 : 1;
      const da = a.dias ?? 9_999;
      const db = b.dias ?? 9_999;
      if (da !== db) return da - db;
      return b.libre - a.libre;
    });

  const totalLibre = filas.reduce((s, f) => s + f.libre, 0);
  const vencidos = filas.filter((f) => f.vencido).length;
  const anejos = filas.filter((f) => !f.vencido && f.lote.status === "abierto" && (f.espera ?? 0) > DIAS_LOTE_ANEJO).length;

  return (
    <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[var(--rule-base)] px-4 py-3">
        <div>
          <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">
            Lo que resta en cada lote
          </CardTitle>
          <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
            Madera apartada en un lote: mientras esté ahí no se ofrece para otra corrida. El plazo es el que el lote
            declaró al SNIFFS.
          </p>
        </div>
        <div className="text-right">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Apartado en lotes
          </p>
          <p className="font-mono text-sm font-bold text-[var(--text-primary)]">{fmtM3(totalLibre)} m³</p>
        </div>
      </div>

      {(vencidos > 0 || anejos > 0) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--rule-soft)] px-4 py-2 text-xs">
          {vencidos > 0 && (
            <span className="inline-flex items-center gap-1.5 font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              {vencidos} {vencidos === 1 ? "lote pasó" : "lotes pasaron"} su fecha de fin de proceso
            </span>
          )}
          {anejos > 0 && (
            <span className="inline-flex items-center gap-1.5 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {anejos} {anejos === 1 ? "lleva" : "llevan"} más de {DIAS_LOTE_ANEJO} días sin aserrar
            </span>
          )}
        </div>
      )}

      <DataTable className="w-full text-sm">
        <thead className="bg-[var(--surface-sunken)]">
          <tr>
            <Th>Lote</Th>
            <Th>Especie</Th>
            <Th>Estado</Th>
            <Th className="text-right">Resta (m³)</Th>
            <Th className="text-right">Piezas</Th>
            <Th className="text-right">Parado</Th>
            <Th>Fin de proceso</Th>
            <Th>Plazo</Th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr
              key={f.lote.id}
              className={`border-t border-[var(--rule-soft)] ${
                f.vencido ? "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/10" : ""
              }`}
            >
              <td className="px-4 py-2 font-mono font-bold text-[var(--text-primary)]">{f.lote.code}</td>
              <td className="px-4 py-2 text-[var(--text-secondary)]">{f.lote.speciesCommon}</td>
              <td className="px-4 py-2 text-xs text-[var(--text-secondary)]">{f.lote.status}</td>
              <td className="px-4 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                {fmtM3(f.libre)}
              </td>
              <td className="px-4 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">{f.piezas}</td>
              <td className="px-4 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                {f.espera == null ? "—" : `${f.espera} d`}
              </td>
              <td className="px-4 py-2 font-mono text-xs text-[var(--text-secondary)]">{fecha(f.lote.finProceso)}</td>
              <td className="px-4 py-2 text-xs">
                <TextoPlazo dias={f.dias} vencido={f.vencido} />
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
