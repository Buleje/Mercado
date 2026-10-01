"use client";

/**
 * LothResumenStrip — resumen "de un vistazo" del aprovechamiento, arriba de las
 * secciones del Libro TH. El dueño abre el libro y ve el estado de su operación
 * (bosque → producto) sin tener que leer una tabla cruda ni ir a Analítica.
 *
 * Teaser compacto (NO duplica Analítica): el embudo de 3 etapas de negocio
 * (Talado → Trozado → Movilizado) + rendimiento + saldo autorizado + alertas,
 * con enlaces a la Analítica y al Cumplimiento para el detalle. Misma fuente que
 * la Analítica (`/plan?analytics=1`) → nunca dicen números distintos.
 *
 * Se pliega, y la preferencia se recuerda en el navegador (Brandon,
 * 2026-09-18). Es del libro entero, no de una sección: una sola clave. Plegado
 * no se calla nada que pida acción —el estado (bloqueos/alertas), lo
 * movilizado fuera del plan y el saldo del POA siguen en la cabecera— y el
 * embudo queda en una línea de cifras.
 */

import { useCallback, useEffect, useId, useState } from "react";
import { CardTitle, Kicker } from "@buleje/design-system";
import {
  TreePine,
  Scissors,
  Truck,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  AlertTriangle,
  ShieldCheck,
  BarChart3,
} from "@buleje/design-system/icons";
import { useLocalStorage } from "@/hooks/use-local-storage";

/** Clave de la preferencia. Exportada: la prueba en navegador la lee. */
export const CLAVE_RESUMEN_ABIERTO = "loth:secciones:resumen-abierto";

interface Analytics {
  hasPlan: boolean;
  aprovechamiento: {
    funnel: { taladoM3: number; trozadoM3: number; despachoTrozaM3: number; despachoProductoM3: number };
    rendimientoGlobalPct: number;
    bySpecies: { species: string }[];
  };
  balance: { rows: { movilizado: number; saldo: number }[]; fueraDePlan?: { species: string; movilizadoM3: number }[] } | null;
  anomalias: { level: "error" | "warn" }[];
}

const fm = (n: number, dp = 2) => n.toLocaleString("es-PE", { minimumFractionDigits: dp, maximumFractionDigits: dp });

export default function LothResumenStrip({ onNavigate, reloadSignal }: { onNavigate: (view: "analitica" | "cumplimiento") => void; reloadSignal?: number }) {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [abierto, setAbierto] = useLocalStorage<boolean>(CLAVE_RESUMEN_ABIERTO, false);
  const cuerpoId = useId();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/forestal/plan?analytics=1", { credentials: "include" });
      if (r.ok) setData((await r.json()).analytics ?? null);
    } catch {
      /* best-effort: sin resumen la vista de secciones igual funciona */
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load, reloadSignal]);

  if (loading && !data) {
    // La silueta mide lo que va a medir el bloque: plegado es una fila.
    return (
      <div
        className={`${abierto ? "h-[11.5rem]" : "h-12"} animate-pulse rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)]`}
        aria-hidden="true"
      />
    );
  }
  if (!data) return null;

  const f = data.aprovechamiento.funnel;
  const talado = f.taladoM3;
  const trozado = f.trozadoM3;
  const movilizado = f.despachoTrozaM3 + f.despachoProductoM3;
  // Sin actividad registrada → no hay nada que resumir (el empty state de la tabla cubre).
  if (talado <= 0 && trozado <= 0 && movilizado <= 0) return null;

  const rend = data.aprovechamiento.rendimientoGlobalPct;
  const errores = data.anomalias.filter((a) => a.level === "error").length;
  const warns = data.anomalias.filter((a) => a.level === "warn").length;
  const especies = data.aprovechamiento.bySpecies.length;

  // Saldo autorizado (si el plan declara volúmenes): movilizado / autorizado.
  const totalMov = data.balance ? data.balance.rows.reduce((a, r) => a + r.movilizado, 0) : 0;
  const totalAutorizado = data.balance ? data.balance.rows.reduce((a, r) => a + r.movilizado + Math.max(0, r.saldo), 0) : 0;
  const pctUsado = totalAutorizado > 0 ? Math.min(100, (totalMov / totalAutorizado) * 100) : 0;
  const excedido = data.balance ? data.balance.rows.some((r) => r.saldo < -1e-6) : false;
  // Lo que salió de especies que el POA no declara. El saldo de arriba NO lo
  // cuenta —recorre las autorizadas— así que sin esto la barra decía «0.00 de
  // 320» al lado de un «movilizado 4.05 m³»: dos cifras del mismo hecho, y la
  // más tranquilizadora justo cuando la infracción es peor.
  const fueraDePlan = data.balance?.fueraDePlan ?? [];
  const volFueraDePlan = fueraDePlan.reduce((a, f) => a + f.movilizadoM3, 0);

  const alertaFueraDePlan = volFueraDePlan > 0 && (
    <button
      type="button"
      onClick={() => onNavigate("cumplimiento")}
      title={fueraDePlan.map((f) => `${f.species}: ${fm(f.movilizadoM3)} m³`).join(" · ")}
      className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--data-error-500)] bg-[var(--data-error-500)]/10 px-2.5 py-1 text-xs font-bold text-[var(--data-error-700)] transition-colors hover:bg-[var(--data-error-500)]/20 dark:text-[var(--data-error-500)]"
    >
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="font-mono tabular-nums">{fm(volFueraDePlan)} m³</span> movilizados fuera del plan
      <span className="font-normal opacity-80">
        ({fueraDePlan.length === 1 ? fueraDePlan[0].species : `${fueraDePlan.length} especies`})
      </span>
    </button>
  );

  return (
    <section
      className="overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]"
      aria-labelledby={`${cuerpoId}-titulo`}
    >
      {/* Cabecera: título + (plegado) el embudo en una línea + estado + plegar */}
      <div
        className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 ${
          abierto ? "border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)]" : ""
        }`}
      >
        <CardTitle id={`${cuerpoId}-titulo`} as="h2" className="flex shrink-0 items-center gap-2">
          <BarChart3 className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
          Aprovechamiento
        </CardTitle>
        {!abierto && (
          <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm tabular-nums text-[var(--text-secondary)]">
            <span>Talado <b className="text-[var(--text-primary)]">{fm(talado)}</b></span>
            <ChevronRight className="h-3.5 w-3.5 text-[var(--text-tertiary)]" aria-hidden="true" />
            <span>Trozado <b className="text-[var(--text-primary)]">{fm(trozado)}</b>{rend > 0 && ` (${fm(rend, 1)} %)`}</span>
            <ChevronRight className="h-3.5 w-3.5 text-[var(--text-tertiary)]" aria-hidden="true" />
            <span>Movilizado <b className="text-[var(--text-primary)]">{fm(movilizado)}</b> m³</span>
            {totalAutorizado > 0 && (
              <span
                title={`Saldo del POA, especies autorizadas: ${fm(totalMov)} de ${fm(totalAutorizado)} m³`}
                className={excedido ? "font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : undefined}
              >
                · POA {fm(pctUsado, 0)} %
              </span>
            )}
          </p>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!abierto && alertaFueraDePlan}
          {errores > 0 || warns > 0 ? (
            <button
              type="button"
              onClick={() => onNavigate("cumplimiento")}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold transition-colors ${
                errores > 0
                  ? "bg-[var(--data-error-100)] text-[var(--data-error-700)] hover:bg-[var(--data-error-100)]/80"
                  : "bg-[var(--data-warning-100)] text-[var(--data-warning-700)] hover:bg-[var(--data-warning-100)]/80"
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              {errores > 0 ? `${errores} ${errores === 1 ? "bloqueo" : "bloqueos"}` : `${warns} ${warns === 1 ? "alerta" : "alertas"}`}
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--data-success-100)] px-2.5 py-1 text-xs font-bold text-[var(--data-success-700)]">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> En orden
            </span>
          )}
          {abierto && (
          <button
            type="button"
            onClick={() => onNavigate("analitica")}
            className="inline-flex h-8 items-center gap-1 rounded-lg px-1.5 text-xs font-bold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]"
          >
            Ver analítica <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          )}
          <button
            type="button"
            onClick={() => setAbierto(!abierto)}
            aria-expanded={abierto}
            aria-controls={`${cuerpoId}-cuerpo`}
            title={abierto ? "Oculta el resumen. Se recuerda en este navegador." : "Muestra el resumen del aprovechamiento"}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
          >
            <span className="max-sm:sr-only">{abierto ? "Ocultar" : "Mostrar"}</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div id={`${cuerpoId}-cuerpo`} hidden={!abierto}>
        {/* Embudo de negocio: Talado → Trozado → Movilizado (stack en mobile) */}
        <div className="flex flex-col gap-1 p-3 sm:flex-row sm:flex-nowrap sm:items-center sm:gap-0">
          <Stage icon={TreePine} label="Talado" value={`${fm(talado)} m³`} sub="tumbado en el bosque" />
          <Arrow />
          <Stage
            icon={Scissors}
            label="Trozado"
            value={`${fm(trozado)} m³`}
            sub={rend > 0 ? `rinde ${fm(rend, 1)} % del talado` : "en trozas"}
          />
          <Arrow />
          <Stage icon={Truck} label="Movilizado" value={`${fm(movilizado)} m³`} sub="despachado con GTF" accent />
        </div>

        {/* Pie: saldo autorizado (si hay plan) + especies */}
        {(data.hasPlan || especies > 0 || volFueraDePlan > 0) && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[var(--rule-soft)] px-4 py-2.5">
            {totalAutorizado > 0 && (
              <div className="flex grow basis-[14rem] items-center gap-3">
                {/* `basis` y no `min-w` + `flex-1`: con base 0 % el bloque no
                    pedía renglón propio y a 400 px la cifra se montaba sobre
                    «1 especie aprovechada». */}
                <span
                  className="shrink-0 text-xs font-medium text-[var(--text-tertiary)]"
                  title="Mide sólo las especies declaradas en el plan de manejo: lo movilizado de una especie no autorizada no descuenta saldo porque nunca tuvo saldo."
                >
                  Saldo POA <span className="hidden sm:inline">· especies autorizadas</span>
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                  <div
                    className={`h-full rounded-full ${excedido ? "bg-[var(--data-error-500)]" : pctUsado > 85 ? "bg-[var(--data-warning-500)]" : "bg-[var(--accent)]"}`}
                    style={{ width: `${Math.max(2, pctUsado)}%` }}
                  />
                </div>
                <span className={`shrink-0 font-mono text-xs font-bold tabular-nums ${excedido ? "text-[var(--data-error-700)]" : "text-[var(--text-secondary)]"}`}>
                  {fm(totalMov)} / {fm(totalAutorizado)} m³
                </span>
              </div>
            )}
            {alertaFueraDePlan}
            {especies > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
                <TrendingUp className="h-3.5 w-3.5 text-[var(--text-tertiary)]" aria-hidden="true" />
                <b className="font-mono tabular-nums text-[var(--text-secondary)]">{especies}</b> {especies === 1 ? "especie aprovechada" : "especies aprovechadas"}
              </span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Sub-componentes ──────────────────────────────────────────────────────────

function Stage({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: typeof TreePine;
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div className="flex min-w-[8.5rem] flex-1 items-center gap-3 rounded-xl px-3 py-2">
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
          accent
            ? "bg-linear-to-br from-[var(--accent)] to-[var(--accent-dark)] text-white"
            : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
        }`}
        aria-hidden="true"
      >
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <div className="min-w-0">
        <Kicker className="block font-bold">{label}</Kicker>
        <div className="font-mono text-lg font-bold leading-tight tabular-nums text-[var(--text-primary)]">{value}</div>
        <div className="truncate text-xs text-[var(--text-tertiary)]">{sub}</div>
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex shrink-0 items-center justify-center px-1 text-[var(--rule-strong)] max-sm:hidden" aria-hidden="true">
      <ChevronRight className="h-5 w-5" />
    </div>
  );
}
