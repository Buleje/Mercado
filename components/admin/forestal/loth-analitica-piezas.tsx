"use client";

/**
 * Piezas de la pestaña Analítica del LO-TH.
 *
 * El panel anterior era una pila de cinco cajas del mismo peso visual: nada
 * decía qué mirar primero, y la "cascada" dibujaba como pérdida lo que en
 * realidad era una bifurcación (ver `lib/forestal/loth-analitica.ts`). Acá el
 * contenido se ordena en tres niveles: veredicto → flujo → detalle.
 */

import {
  AlertTriangle, ArrowDown, CheckCircle2, ChevronRight, ShieldAlert, type LucideIcon,
} from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import type {
  FlujoAprovechamiento, NodoTipo, RankingItem, Veredicto, VeredictoNivel,
} from "@/lib/forestal/loth-analitica";
import { tramosCosto } from "@/lib/forestal/loth-analitica";

export const fm = (n: number, dp = 2) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("es-PE", { minimumFractionDigits: dp, maximumFractionDigits: dp });

// ─── Veredicto ──────────────────────────────────────────────────────────────

const VEREDICTO_ESTILO: Record<VeredictoNivel, { card: string; texto: string; icon: LucideIcon }> = {
  ok: {
    card: "border-[var(--data-success-500)] bg-linear-to-br from-[var(--data-success-50)] to-[var(--surface-raised)] dark:from-[var(--data-success-500)]/12",
    texto: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
    icon: CheckCircle2,
  },
  atencion: {
    card: "border-[var(--data-warning-500)] bg-linear-to-br from-[var(--data-warning-50)] to-[var(--surface-raised)] dark:from-[var(--data-warning-500)]/12",
    texto: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
    icon: AlertTriangle,
  },
  riesgo: {
    card: "border-[var(--data-error-500)] bg-linear-to-br from-[var(--data-error-50)] to-[var(--surface-raised)] dark:from-[var(--data-error-500)]/12",
    texto: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
    icon: ShieldAlert,
  },
};

/** Lo primero que se lee: si el libro está para mostrar o para corregir. */
export function VeredictoBanner({ v }: { v: Veredicto }) {
  const e = VEREDICTO_ESTILO[v.nivel];
  const Icon = e.icon;
  return (
    <section className={`rounded-2xl border-2 p-5 shadow-[var(--shadow-sm)] ${e.card}`}>
      <div className="flex items-start gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--surface-raised)] ${e.texto}`}>
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <CardTitle as="h3" className={`text-lg leading-tight ${e.texto}`}>{v.titulo}</CardTitle>
          {v.motivos.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {v.motivos.map((m, i) => (
                <li key={i} className="flex gap-2 text-sm text-[var(--text-secondary)]">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${v.nivel === "riesgo" ? "bg-[var(--data-error-500)]" : "bg-[var(--data-warning-500)]"}`} />
                  {m}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Las operaciones cuadran con el plan autorizado y no hay especies fuera de la resolución.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── KPI con contexto ───────────────────────────────────────────────────────

export function Kpi({
  label, valor, sufijo, contexto, icon: Icon, tono = "neutral", barra,
}: {
  label: string;
  valor: string;
  sufijo?: string;
  contexto: string;
  icon: LucideIcon;
  tono?: "neutral" | "success" | "warning" | "error";
  /** 0–100: dibuja una barra de referencia bajo el número. */
  barra?: number | null;
}) {
  const color = {
    neutral: "text-[var(--text-primary)]",
    success: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
    warning: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
    error: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
  }[tono];
  const fill = {
    neutral: "bg-[var(--accent)]",
    success: "bg-[var(--data-success-500)]",
    warning: "bg-[var(--data-warning-500)]",
    error: "bg-[var(--data-error-500)]",
  }[tono];
  return (
    <div className="flex flex-col justify-between rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-sm)]">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[length:var(--ts-2xs)] font-bold uppercase leading-tight tracking-wide text-[var(--text-tertiary)]">{label}</span>
        <Icon className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
      </div>
      <div className="mt-2">
        <span className={`font-mono text-3xl font-extrabold tabular-nums leading-none ${color}`}>{valor}</span>
        {sufijo && <span className={`ml-1 text-base font-bold ${color}`}>{sufijo}</span>}
      </div>
      {barra != null && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
          <div className={`h-full rounded-full ${fill}`} style={{ width: `${Math.min(100, Math.max(0, barra))}%` }} />
        </div>
      )}
      <p className="mt-2 text-xs leading-snug text-[var(--text-tertiary)]">{contexto}</p>
    </div>
  );
}

// ─── Flujo del aprovechamiento ──────────────────────────────────────────────

const NODO_COLOR: Record<NodoTipo, string> = {
  origen: "var(--data-success-600)",
  transformacion: "var(--data-success-500)",
  rama: "var(--data-info-500)",
  salida: "var(--accent)",
};

/**
 * El recorrido de la madera, con la bifurcación dibujada como tal y las mermas
 * entre etapas. La sangría es la jerarquía: lo que sale de lo que.
 */
export function FlujoPanel({ f }: { f: FlujoAprovechamiento }) {
  const merma = (key: string) => f.mermas.find((m) => m.key === key);
  return (
    <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 shadow-[var(--shadow-sm)]">
      <header className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <CardTitle as="h3" className="text-base text-[var(--text-primary)]">¿Dónde terminó cada m³ del bosque?</CardTitle>
        <span className="font-mono text-xs font-bold tabular-nums text-[var(--text-tertiary)]">
          {fm(f.totalM3, 4)} m³ talados
        </span>
      </header>
      <p className="mb-4 text-xs text-[var(--text-tertiary)]">
        Las trozas se bifurcan: una parte se vende en rollo y otra entra a planta. Los porcentajes de cada rama son sobre lo trozado, no sobre el total.
      </p>

      <ol className="space-y-1">
        {f.nodos.map((n) => {
          const m = n.key === "trozado" ? merma("trozado") : n.key === "producto" ? merma("aserrio") : null;
          const ancho = Math.max(1.5, Math.min(100, (n.m3 / (f.totalM3 || 1)) * 100));
          return (
            <li key={n.key} style={{ marginInlineStart: `${n.nivel * 1.25}rem` }}>
              {/* Merma que ocurre ANTES de este nodo. */}
              {m && (
                <div className="mb-1 flex items-center gap-1.5 py-0.5 text-xs" title={m.explicacion}>
                  <ArrowDown className="h-3.5 w-3.5 shrink-0 text-[var(--data-warning-600)]" aria-hidden="true" />
                  <span className="font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                    −{fm(m.m3, 4)} m³
                  </span>
                  <span className="text-[var(--text-tertiary)]">{m.label.toLowerCase()} · {m.pct}%</span>
                </div>
              )}
              <div className="rounded-xl px-2 py-1.5 transition hover:bg-[var(--surface-sunken)]">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
                    {n.nivel >= 2 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />}
                    {n.label}
                    <span className="font-normal text-[var(--text-tertiary)]">· {n.detalle}</span>
                  </span>
                  <span className="shrink-0 font-mono text-sm tabular-nums">
                    <b className="text-[var(--text-primary)]">{fm(n.m3, 4)}</b>
                    <span className="text-[var(--text-tertiary)]"> m³</span>
                    {n.pctDelPadre != null && (
                      <span className="ml-2 rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-bold text-[var(--text-secondary)]">
                        {n.pctDelPadre}%
                      </span>
                    )}
                  </span>
                </div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                  <div className="h-full rounded-full transition-[width] duration-[var(--dur-slow)]" style={{ width: `${ancho}%`, backgroundColor: NODO_COLOR[n.tipo] }} />
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {f.hayStockEnPatio && (
        <p className="mt-3 rounded-xl border-2 border-[var(--data-info-500)] bg-[var(--data-info-50)] px-3 py-2 text-xs font-semibold text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/12 dark:text-[var(--data-info-500)]">
          {fm(f.stockEnPatioM3, 4)} m³ trozados siguen en patio: ni se vendieron en rollo ni entraron a planta.
        </p>
      )}

      <dl className="mt-4 grid grid-cols-1 gap-2 border-t-2 border-[var(--rule-base)] pt-3 sm:grid-cols-3">
        <Dato label="Rendimiento de trozado" valor={f.rendimientoTrozadoPct != null ? `${f.rendimientoTrozadoPct}%` : "—"} hint="trozas obtenidas del árbol tumbado" />
        <Dato label="Rendimiento de aserrío" valor={f.rendimientoAserrioPct != null ? `${f.rendimientoAserrioPct}%` : "—"} hint="producto sobre lo que entró a planta" />
        <Dato label="Se vendió en rollo" valor={f.ventaEnRolloPct != null ? `${f.ventaEnRolloPct}%` : "—"} hint="de lo trozado, sin transformar" />
      </dl>
    </section>
  );
}

function Dato({ label, valor, hint }: { label: string; valor: string; hint: string }) {
  return (
    <div className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2">
      <dt className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</dt>
      <dd className="mt-0.5 font-mono text-lg font-bold tabular-nums text-[var(--text-primary)]">{valor}</dd>
      <dd className="text-xs text-[var(--text-tertiary)]">{hint}</dd>
    </div>
  );
}

// ─── Ranking de rentabilidad ────────────────────────────────────────────────

const TRAMO_COLOR: Record<string, string> = {
  ven: "var(--data-error-500)",
  extraccion: "var(--data-warning-500)",
  transformacion: "var(--data-info-500)",
  flete: "var(--text-tertiary)",
};

/** Qué especie deja plata de verdad, y en qué se va el costo de cada m³. */
export function RankingPanel({ rows }: { rows: RankingItem[] }) {
  const generado = rows.filter((r) => !r.potencial);
  const potencial = rows.filter((r) => r.potencial);
  return (
    <div className="space-y-3">
      {generado.map((r) => <FilaEspecie key={r.species} r={r} />)}
      {potencial.length > 0 && (
        <>
          <p className="pt-1 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
            Autorizadas sin movilizar todavía · ordenadas por margen por m³
          </p>
          {potencial.map((r) => <FilaEspecie key={r.species} r={r} />)}
        </>
      )}
    </div>
  );
}

function FilaEspecie({ r }: { r: RankingItem }) {
  const tramos = tramosCosto(r.desglose, r.costoTotalM3);
  const margenTono = r.margenPct >= 25 ? "success" : r.margenPct >= 0 ? "warning" : "error";
  const color = {
    success: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
    warning: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
    error: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
  }[margenTono];

  return (
    <article className={`rounded-2xl border-2 p-4 ${r.potencial ? "border-[var(--rule-soft)] bg-[var(--surface-raised)] opacity-80" : "border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-sm)]"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="flex flex-wrap items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            {r.species}
            {r.cites && (
              <span className="rounded-full bg-[var(--data-error-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]">CITES</span>
            )}
            {r.potencial && (
              <span className="rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">sin movilizar</span>
            )}
          </h4>
          <p className="mt-0.5 font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
            {r.potencial
              ? <>margen potencial <b className={color}>S/ {fm(r.margenM3)}</b> por m³</>
              : <>{fm(r.movilizadoM3, 4)} m³ movilizados · S/ {fm(r.precioVentaM3)} venta − S/ {fm(r.costoTotalM3)} costo = <b className={color}>S/ {fm(r.margenM3)}</b> por m³</>}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className={`font-mono text-xl font-extrabold tabular-nums leading-none ${color}`}>
            {r.potencial ? `${r.margenPct}%` : `S/ ${fm(r.margen)}`}
          </div>
          <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
            {r.potencial ? "margen por m³" : `${r.margenPct}% de margen`}
          </div>
        </div>
      </div>

      {/* Participación en el margen generado del período. */}
      {r.participacionPct != null && !r.potencial && (
        <div className="mt-2 flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
            <div className="h-full rounded-full bg-[var(--data-success-500)]" style={{ width: `${r.participacionPct}%` }} />
          </div>
          <span className="shrink-0 font-mono text-xs font-bold tabular-nums text-[var(--text-secondary)]">{r.participacionPct}% del margen</span>
        </div>
      )}

      {/* En qué se va el costo de un m³: apilado, no en texto corrido. */}
      {tramos.length > 0 && (
        <div className="mt-3">
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
            {tramos.map((t) => (
              <span key={t.key} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${t.pct}%`, backgroundColor: TRAMO_COLOR[t.key] }} title={`${t.label}: S/ ${fm(t.valor)} (${t.pct}%)`} />
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
            {tramos.map((t) => (
              <span key={t.key} className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: TRAMO_COLOR[t.key] }} aria-hidden="true" />
                {t.label} <span className="font-mono font-bold tabular-nums text-[var(--text-secondary)]">S/ {fm(t.valor)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
