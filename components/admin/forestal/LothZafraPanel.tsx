"use client";

/**
 * LothZafraPanel — el reloj del plan: cuánto queda de vigencia, a qué ritmo se
 * está movilizando y si se llega. El saldo autorizado NO se acumula al período
 * siguiente, así que "atrasado" no es un aviso cosmético: es madera que se pierde.
 *
 * Todo derivado (vigencia + autorizado + movilizado): sin datos nuevos que
 * cargar ni tabla que mantener.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, TrendingUp } from "@buleje/design-system/icons";
import { CardTitle, DataTable } from "@buleje/design-system";
import { ZAFRA_ESTADO_LABEL, ZAFRA_ESTADO_TONE, type ZafraAnalisis } from "@/lib/forestal/loth-zafra";

const TONE_CLASS = {
  success: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  warning: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  error: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
  info: "text-[var(--text-secondary)]",
} as const;
const TONE_BG = {
  success: "bg-[var(--data-success-500)]",
  warning: "bg-[var(--data-warning-500)]",
  error: "bg-[var(--data-error-500)]",
  info: "bg-[var(--text-tertiary)]",
} as const;

export default function LothZafraPanel({ zafra }: { zafra: ZafraAnalisis }) {
  const tone = ZAFRA_ESTADO_TONE[zafra.estado];
  const Icono = zafra.estado === "vencida" ? AlertTriangle : zafra.estado === "atrasado" ? TrendingUp : CheckCircle2;

  /**
   * El cronograma se abre en el mes en curso, no entero.
   *
   * Son trece filas de las que casi siempre importa UNA —dónde estoy hoy— y el
   * bloque se llevaba un cuarto de pantalla para que alguien leyera un renglón.
   * Se muestran el mes actual y sus vecinos; el resto sigue estando a un click,
   * porque para planificar la zafra sí hace falta el cuadro completo.
   */
  const [todos, setTodos] = useState(false);
  const iActual = zafra.meses.findIndex((m) => m.actual);
  const mesesVisibles = useMemo(() => {
    if (todos || zafra.meses.length <= 5) return zafra.meses;
    /* Sin mes en curso (vigencia vencida o por empezar) se muestran los
       primeros: es el arranque del plan, que es lo que se estará mirando. */
    const centro = iActual >= 0 ? iActual : 0;
    const desde = Math.max(0, centro - 1);
    return zafra.meses.slice(desde, desde + 4);
  }, [todos, zafra.meses, iActual]);
  const hayOcultos = mesesVisibles.length < zafra.meses.length;

  return (
    <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[var(--rule-base)] px-4 py-3">
        <div>
          <CardTitle as="h3" className="text-sm font-black uppercase tracking-widest text-[var(--text-secondary)]">
            Zafra · avance contra la vigencia
          </CardTitle>
          <p className="mt-0.5 text-xs font-semibold text-[var(--text-tertiary)]">
            {zafra.diasTotales > 0
              ? `${zafra.diasTranscurridos} de ${zafra.diasTotales} días · quedan ${zafra.diasRestantes}`
              : "Sin vigencia cargada en el plan"}
          </p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wide ${TONE_CLASS[tone]}`}>
          <CalendarClock className="h-3.5 w-3.5" /> {ZAFRA_ESTADO_LABEL[zafra.estado]}
        </span>
      </header>

      <div className="space-y-4 p-4">
        {/* Barras: volumen vs tiempo */}
        <div className="space-y-2">
          <Barra label="Volumen movilizado" pct={zafra.avanceVolumenPct} tone={tone} />
          <Barra label="Tiempo consumido" pct={zafra.avanceTiempoPct} tone="info" />
        </div>

        <p className={`flex items-start gap-2 text-sm font-semibold ${TONE_CLASS[tone]}`}>
          <Icono className="mt-0.5 h-4 w-4 shrink-0" />
          {zafra.mensaje}
        </p>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Dato label="Saldo por movilizar" valor={`${zafra.saldoM3.toFixed(3)} m³`} />
          <Dato label="Ritmo actual" valor={`${zafra.ritmoActualM3Dia.toFixed(3)} m³/día`} />
          <Dato
            label="Ritmo requerido"
            valor={zafra.diasRestantes > 0 ? `${zafra.ritmoRequeridoM3Dia.toFixed(3)} m³/día` : "—"}
            sub={zafra.diasRestantes > 0 ? `para los ${zafra.diasRestantes} días que quedan` : "vigencia cerrada"}
          />
          <Dato
            label="Proyección al cierre"
            valor={`${zafra.proyeccionCierreM3.toFixed(2)} m³`}
            sub={zafra.riesgoNoMovilizadoM3 > 0 ? `${zafra.riesgoNoMovilizadoM3.toFixed(2)} m³ en riesgo` : "sin saldo en riesgo"}
            tone={zafra.riesgoNoMovilizadoM3 > 0 ? "warning" : "success"}
          />
        </div>

        {/* Cronograma mensual */}
        {zafra.meses.length > 0 && (
          <>
          <div className="overflow-x-auto rounded-xl border-2 border-[var(--rule-base)]">
            <DataTable className="w-full border-collapse text-sm">
              <thead className="bg-[var(--surface-canvas)]">
                <tr className="text-[length:var(--ts-2xs)] uppercase tracking-wide text-[var(--text-tertiary)]">
                  <th className="px-3 py-2 text-left font-bold">Mes</th>
                  <th className="px-3 py-2 text-right font-bold">Meta del mes (m³)</th>
                  <th className="px-3 py-2 text-right font-bold">Meta acumulada (m³)</th>
                  <th className="px-3 py-2 text-left font-bold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {mesesVisibles.map((m) => (
                  <tr
                    key={m.periodo}
                    className={`border-t border-[var(--rule-subtle)] ${m.actual ? "bg-[var(--brand-ink)]/8 font-bold" : ""}`}
                  >
                    <td className="px-3 py-1.5 capitalize text-[var(--text-primary)]">{m.label}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[var(--text-secondary)]">{m.metaMesM3.toFixed(3)}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[var(--text-secondary)]">{m.metaAcumuladaM3.toFixed(3)}</td>
                    <td className="px-3 py-1.5 text-xs font-semibold text-[var(--text-tertiary)]">
                      {m.actual ? "En curso" : m.transcurrido ? "Transcurrido" : "Por venir"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
          {hayOcultos && (
            <button
              type="button"
              onClick={() => setTodos((v) => !v)}
              className="mt-1 text-xs font-bold text-[var(--accent-ink)] underline-offset-2 hover:underline dark:text-[var(--accent)]"
            >
              {todos
                ? "Mostrar solo los meses cercanos"
                : `Ver los ${zafra.meses.length} meses del cronograma`}
            </button>
          )}
          </>
        )}
        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
          La meta mensual es un reparto lineal del volumen autorizado sobre la vigencia — sirve de referencia, no reemplaza el
          cronograma aprobado en el plan.
        </p>
      </div>
    </section>
  );
}

function Barra({ label, pct, tone }: { label: string; pct: number; tone: keyof typeof TONE_BG }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-bold">
        <span className="text-[var(--text-secondary)]">{label}</span>
        <span className={`font-mono tabular-nums ${TONE_CLASS[tone]}`}>{pct.toFixed(1)}%</span>
      </div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-[var(--surface-canvas)]">
        <div className={`h-full rounded-full ${TONE_BG[tone]}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

function Dato({ label, valor, sub, tone = "info" }: { label: string; valor: string; sub?: string; tone?: keyof typeof TONE_CLASS }) {
  return (
    <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</p>
      <p className={`font-mono text-lg font-black tabular-nums ${TONE_CLASS[tone]}`}>{valor}</p>
      {sub && <p className="text-xs font-semibold text-[var(--text-tertiary)]">{sub}</p>}
    </div>
  );
}
