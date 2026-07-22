"use client";

/**
 * CtpRadarRendimiento — cuánto producto sale por m³ de troza, corrida por
 * corrida, y cuáles se salen de lo normal.
 *
 * La lectura importante no es el número absoluto (depende de la unidad y del
 * producto) sino la COMPARACIÓN contra las corridas del mismo tipo: si todas
 * las de madera aserrada rinden ~0,5 m³/m³ y una rinde 0,15, esa corrida tiene
 * o un error de carga o madera que salió sin registrarse.
 *
 * El análisis vive en `lib/forestal/ctp-radar-rendimiento.ts` (puro, con tests),
 * que además se niega a comparar unidades distintas y a inventar una referencia
 * con menos de 3 corridas.
 */

import { AlertTriangle, Eye, Gauge, TrendingDown, TrendingUp } from "@buleje/design-system/icons";
import {
  alertasRendimiento,
  DESVIO_PCT,
  FLAG_LABEL,
  MIN_GRUPO,
  type RendimientoCorrida,
} from "@/lib/forestal/ctp-radar-rendimiento";

const TONO = {
  imposible: {
    card: "border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/12",
    texto: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
    barra: "bg-[var(--data-error-500)]",
  },
  bajo: {
    card: "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/12",
    texto: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
    barra: "bg-[var(--data-warning-500)]",
  },
  alto: {
    card: "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/12",
    texto: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
    barra: "bg-[var(--data-warning-500)]",
  },
  normal: {
    card: "border-[var(--rule-base)] bg-[var(--surface-raised)]",
    texto: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
    barra: "bg-[var(--data-success-500)]",
  },
  sin_referencia: {
    card: "border-[var(--rule-soft)] bg-[var(--surface-raised)]",
    texto: "text-[var(--text-tertiary)]",
    barra: "bg-[var(--rule-base)]",
  },
} as const;

const fmt = (n: number | null, d = 2): string => (n == null || !Number.isFinite(n) ? "—" : Number(n.toFixed(d)).toString());

export default function CtpRadarRendimiento({
  rs, onVerCorrida,
}: {
  rs: RendimientoCorrida[];
  onVerCorrida: (id: string) => void;
}) {
  if (rs.length === 0) {
    return <p className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] p-8 text-center text-sm text-[var(--text-tertiary)]">Sin corridas de producción en el período.</p>;
  }
  const alertas = alertasRendimiento(rs);
  const conRatio = rs.filter((r) => r.ratio != null);

  return (
    <div className="space-y-3">
      {alertas.length > 0 ? (
        <div className="rounded-2xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-4 dark:bg-[var(--data-warning-500)]/12">
          <p className="mb-1 flex items-center gap-2 font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            {alertas.length === 1 ? "Una corrida se sale de lo normal" : `${alertas.length} corridas se salen de lo normal`}
          </p>
          <p className="text-sm text-[var(--text-secondary)]">
            Comparadas contra la mediana de las corridas de su mismo producto y unidad. Un desvío de más del {DESVIO_PCT}% se marca; con menos de {MIN_GRUPO} corridas del tipo no se compara nada.
          </p>
        </div>
      ) : (
        <p className="rounded-2xl border-2 border-[var(--data-success-500)] bg-[var(--data-success-50)] p-3 text-sm font-semibold text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]">
          Ninguna corrida se desvía de sus pares en más del {DESVIO_PCT}%.
        </p>
      )}

      <ul className="space-y-2">
        {[...rs]
          .sort((a, b) => {
            const peso = { imposible: 0, bajo: 1, alto: 2, sin_referencia: 3, normal: 4 } as const;
            return peso[a.flag] - peso[b.flag] || a.lineNo - b.lineNo;
          })
          .map((r) => {
            const tono = TONO[r.flag];
            // Barra comparativa: el ratio de la corrida contra el mayor del período.
            const tope = Math.max(...conRatio.map((x) => x.ratio ?? 0), r.medianaGrupo ?? 0, 0.0001);
            const anchoPct = r.ratio != null ? Math.min(100, (r.ratio / tope) * 100) : 0;
            const medPct = r.medianaGrupo != null ? Math.min(100, (r.medianaGrupo / tope) * 100) : null;
            return (
              <li key={r.id} className={`rounded-2xl border-2 p-3 ${tono.card}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[var(--text-primary)]">
                      Corrida #{r.lineNo}
                      <span className="font-normal text-[var(--text-tertiary)]"> · {r.etiqueta}</span>
                    </p>
                    <p className="mt-0.5 font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                      {fmt(r.entradaM3)} m³ de troza → {fmt(r.salida)} {r.unidad || "u"}
                      {r.ratio != null && <span className="ml-2 font-bold text-[var(--text-primary)]">{fmt(r.ratio)} {r.unidad || "u"}/m³</span>}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full border-2 px-2.5 py-1 text-xs font-bold ${tono.card} ${tono.texto}`}>
                      {r.flag === "bajo" && <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />}
                      {r.flag === "alto" && <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />}
                      {(r.flag === "normal" || r.flag === "sin_referencia") && <Gauge className="h-3.5 w-3.5" aria-hidden="true" />}
                      {r.flag === "imposible" && <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
                      {FLAG_LABEL[r.flag]}
                      {r.desvioPct != null && r.flag !== "normal" && r.flag !== "sin_referencia" && (
                        <span className="font-mono tabular-nums">{r.desvioPct > 0 ? "+" : ""}{r.desvioPct}%</span>
                      )}
                    </span>
                    <button type="button" onClick={() => onVerCorrida(r.id)} title="Abrir la ficha de la corrida" className="inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]">
                      <Eye className="h-3.5 w-3.5" /> Ficha
                    </button>
                  </div>
                </div>

                {/* Barra + marca de la mediana del grupo: se ve de un vistazo
                    cuánto se aleja esta corrida de sus pares. */}
                {r.ratio != null && (
                  <div className="relative mt-2 h-3 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                    <div className={`h-full rounded-full ${tono.barra}`} style={{ width: `${anchoPct}%` }} />
                    {medPct != null && (
                      <span
                        className="absolute top-0 h-full w-0.5 bg-[var(--text-primary)] opacity-70"
                        style={{ left: `${medPct}%` }}
                        title={`Mediana de su tipo: ${fmt(r.medianaGrupo)} ${r.unidad || "u"}/m³`}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                )}
                {r.motivo && <p className="mt-1.5 text-xs text-[var(--text-secondary)]">{r.motivo}</p>}
              </li>
            );
          })}
      </ul>
      <p className="text-xs text-[var(--text-tertiary)]">
        La marca vertical es la mediana de las corridas del mismo producto y unidad. Rendimientos en unidades distintas (m³, pies tablares, kg) nunca se comparan entre sí.
      </p>
    </div>
  );
}
