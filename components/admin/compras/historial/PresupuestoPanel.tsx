"use client";

/**
 * PresupuestoPanel — cuánto planeaste gastar, cuánto va, y qué se despegó.
 *
 * Un total suelto no dice nada: S/2.100 de luz es normal o es una fuga según
 * lo que se pagó los meses anteriores. Acá cada categoría se compara contra su
 * techo (si alguien lo fijó) y contra su PROPIA historia — el aviso de gasto
 * atípico sale del promedio y el desvío de los meses previos, no de un número
 * redondo elegido a dedo.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Check, Loader2, Pencil, TrendingDown, TrendingUp, Zap } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";
import { fmt } from "./shared";

type Comparativa = {
  category: string;
  actual: number;
  anterior: number;
  promedio: number;
  presupuesto: number | null;
  variacionPct: number | null;
  atipico: boolean;
};

type Respuesta = {
  meses: Array<{ clave: string; total: number }>;
  categorias: Comparativa[];
  totales: { actual: number; anterior: number; variacionPct: number | null; presupuesto: number };
};

const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function etiquetaMes(clave: string): string {
  const [, mes] = clave.split("-");
  return MES_CORTO[Number(mes) - 1] ?? clave;
}

/** Verde hasta el 80% del techo, ámbar hasta el 100%, rojo pasado. */
function semaforo(gastado: number, techo: number): { tono: string; label: string } {
  const pct = techo > 0 ? (gastado / techo) * 100 : 0;
  if (pct > 100) return { tono: "var(--data-error-500)", label: "Pasado" };
  if (pct >= 80) return { tono: "var(--data-warning-500)", label: "Al límite" };
  return { tono: "var(--data-success-500)", label: "En rango" };
}

function Variacion({ pct }: { pct: number | null }) {
  // «sin base» no le decía nada a nadie: el mes anterior no tuvo gastos de esa
  // categoría, así que no hay contra qué comparar todavía.
  if (pct === null) return <span className="text-sm text-[var(--text-secondary)]">sin mes anterior</span>;
  const sube = pct > 0;
  const Icono = sube ? TrendingUp : TrendingDown;
  // Gastar más es malo y gastar menos es bueno: el color va al revés que en ventas.
  const tono = Math.abs(pct) < 5
    ? "var(--text-secondary)"
    : sube ? "var(--data-error-500)" : "var(--data-success-500)";
  return (
    <span className="inline-flex items-center gap-1 text-sm font-semibold tabular-nums" style={{ color: tono }}>
      <Icono className="h-3.5 w-3.5" aria-hidden />
      {sube ? "+" : ""}{pct}%
    </span>
  );
}

export default function PresupuestoPanel() {
  const [data, setData] = useState<Respuesta | null>(null);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/expenses/presupuesto?meses=6");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (err) {
      console.warn("[PresupuestoPanel] carga falló", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const guardar = useCallback(async (category: string) => {
    const monto = Number(borrador.replace(",", "."));
    if (!Number.isFinite(monto) || monto < 0) return;
    setGuardando(true);
    try {
      const res = await fetch("/api/expenses/presupuesto", {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ category, montoMensual: monto }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEditando(null);
      await cargar();
    } catch (err) {
      console.warn("[PresupuestoPanel] guardar falló", err);
    } finally {
      setGuardando(false);
    }
  }, [borrador, cargar]);

  const maxMes = useMemo(
    () => Math.max(...(data?.meses.map((m) => m.total) ?? [0]), 1),
    [data],
  );
  const atipicas = useMemo(() => data?.categorias.filter((c) => c.atipico) ?? [], [data]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-5">
        <Loader2 className="h-4 w-4 animate-spin text-[var(--text-secondary)]" />
        <span className="text-sm text-[var(--text-secondary)]">Comparando con los meses anteriores…</span>
      </div>
    );
  }

  if (!data || data.categorias.length === 0) return null;

  return (
    <section className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <header className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <CardTitle className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
          Presupuesto y comparación
        </CardTitle>
        <p className="text-sm text-[var(--text-secondary)]">
          Este mes <span className="font-bold tabular-nums text-[var(--text-primary)]">{fmt(data.totales.actual)}</span>
          {data.totales.anterior > 0 ? (
            <>
              {" "}contra <span className="tabular-nums">{fmt(data.totales.anterior)}</span> del mes pasado{" "}
              <Variacion pct={data.totales.variacionPct} />
            </>
          ) : (
            <> · el mes pasado no hubo gastos registrados, así que todavía no hay con qué comparar</>
          )}
          {data.totales.presupuesto > 0 && (
            <> · techo declarado <span className="font-bold tabular-nums text-[var(--text-primary)]">{fmt(data.totales.presupuesto)}</span></>
          )}
        </p>
      </header>

      {atipicas.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-3 py-2">
          <Zap className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-500)]" />
          <p className="text-sm text-[var(--text-primary)]">
            <span className="font-bold">Se despegó de lo habitual:</span>{" "}
            {atipicas.map((c) => `${c.category} (${fmt(c.actual)}, suele ser ${fmt(c.promedio)})`).join(" · ")}.
          </p>
        </div>
      )}

      {/* Seis meses de gasto. Los meses sin movimiento se dibujan igual: sacarlos
          haría que la serie mintiera por omisión. */}
      <div className="mb-4 flex items-end gap-2" style={{ height: "5rem" }}>
        {data.meses.map((m, i) => {
          const esActual = i === data.meses.length - 1;
          return (
            <div key={m.clave} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-sm tabular-nums text-[var(--text-secondary)]">
                {m.total > 0 ? fmt(m.total).replace("S/", "") : "—"}
              </span>
              <div
                className={cn("w-full rounded-t-md", esActual ? "bg-primary" : "bg-primary/40")}
                style={{ height: `${Math.max((m.total / maxMes) * 48, 3)}px` }}
                title={`${etiquetaMes(m.clave)}: ${fmt(m.total)}`}
              />
              <span className={cn("text-sm", esActual ? "font-bold text-[var(--text-primary)]" : "text-[var(--text-secondary)]")}>
                {etiquetaMes(m.clave)}
              </span>
            </div>
          );
        })}
      </div>

      <ul className="space-y-2">
        {data.categorias.slice(0, 8).map((c) => {
          const s = c.presupuesto ? semaforo(c.actual, c.presupuesto) : null;
          const pct = c.presupuesto && c.presupuesto > 0 ? Math.min((c.actual / c.presupuesto) * 100, 100) : 0;
          return (
            <li key={c.category} className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-bold text-[var(--text-primary)]">{c.category}</span>
                <span className="tabular-nums text-[var(--text-primary)]">{fmt(c.actual)}</span>
                <Variacion pct={c.variacionPct} />
                <span className="text-sm text-[var(--text-secondary)]">
                  promedio {fmt(c.promedio)}
                </span>

                <div className="ml-auto flex items-center gap-2">
                  {editando === c.category ? (
                    <>
                      <label className="flex items-center gap-1">
                        <span className="sr-only">Techo mensual de {c.category}</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={borrador}
                          autoFocus
                          onChange={(e) => setBorrador(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") guardar(c.category);
                            if (e.key === "Escape") setEditando(null);
                          }}
                          className="h-10 w-28 rounded-lg border-2 border-[var(--rule-base)] bg-white px-2 text-sm tabular-nums text-[var(--text-primary)] outline-none focus:border-primary/60 dark:bg-[var(--color-card)]"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => guardar(c.category)}
                        disabled={guardando}
                        className="inline-flex h-10 items-center gap-1 rounded-lg bg-primary px-3 text-sm font-bold text-white disabled:opacity-50"
                      >
                        {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        Guardar
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setEditando(c.category); setBorrador(String(c.presupuesto ?? "")); }}
                      className="inline-flex h-10 items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] px-3 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                      {c.presupuesto ? `Techo ${fmt(c.presupuesto)}` : "Poner techo"}
                    </button>
                  )}
                </div>
              </div>

              {c.presupuesto ? (
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: s?.tono }} />
                  </div>
                  <span className="text-sm font-semibold" style={{ color: s?.tono }}>{s?.label}</span>
                </div>
              ) : (
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Sin techo declarado — no se puede decir si te pasaste.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
