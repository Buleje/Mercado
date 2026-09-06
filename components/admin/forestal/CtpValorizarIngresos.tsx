"use client";

/**
 * CtpValorizarIngresos — cuánto costó la madera que entró al patio.
 *
 * EL HUECO QUE TAPA. El P&L sabía calcular el margen pero casi nunca podía:
 * el COGS sale del costo de los ingresos, y el costo no se podía cargar desde
 * ninguna pantalla (`costoTotal` existía en la tabla y en `create()`, pero
 * ningún endpoint lo aceptaba). Medido en el tenant real antes de este panel:
 * 78 de 83 ingresos sin costo — el 91% del patio sin valorizar, y por lo tanto
 * un margen que no se podía afirmar de casi ningún despacho.
 *
 * Por qué vive acá y no en el alta del ingreso: la factura del proveedor llega
 * DESPUÉS del camión. Pedirla en el formulario de entrada haría que el operario
 * invente un número para poder guardar — el mismo vicio que la regla de
 * atribución `≤` evita en la cadena de custodia. Acá se carga cuando se sabe.
 *
 * El S//m³ al lado de cada uno no es decoración: es el detector de dedazos.
 * Una troza a S/ 8/m³ o a S/ 8.000/m³ salta a la vista; el total en soles, no.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { CardTitle, StatCard } from "@buleje/design-system";
import { AlertCircle, CheckCircle2, Coins, Loader2, PackageOpen, Percent } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";

/** Sólo lo que este panel necesita del ingreso — no el WoodEntry entero. */
interface IngresoValorizable {
  id: string;
  gtfNumber: string;
  entryDate: string;
  providerName: string;
  speciesCommonName: string;
  volumeM3: number | string;
  costoTotal: number | string | null;
  moneda: string | null;
  status: string;
}

const API = "/api/admin/forestal/wood-entries";
const num = (v: number | string | null | undefined): number | null =>
  v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;
const soles = (n: number | null, m = "PEN") =>
  n == null ? "—" : `${m === "PEN" ? "S/" : m} ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const m3 = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("es-PE", { maximumFractionDigits: 3 })} m³`);
/** Fecha date-only: UTC o se corre un día en Lima. */
const dia = (iso: string) => new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", timeZone: "UTC" });

const TOPE = 200;

export default function CtpValorizarIngresos({ period }: { period: CtpPeriod }) {
  const [ingresos, setIngresos] = useState<IngresoValorizable[] | null>(null);
  /** Cuántos hay en total en el período, para saber si la lista quedó cortada. */
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [verTodos, setVerTodos] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams({ limit: String(TOPE) });
      if (period.from) p.set("from", period.from);
      if (period.to) p.set("to", period.to);
      const r = await fetch(`${API}?${p}`, { credentials: "include" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message ?? j.error ?? `HTTP ${r.status}`);
      // Sólo los que pesan en el balance: un anulado o rechazado no lleva costo.
      const vivos = (j.entries as IngresoValorizable[]).filter(
        (e) => e.status === "pendiente" || e.status === "validado",
      );
      setIngresos(vivos);
      setTotal(Number(j.total) || vivos.length);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setIngresos(null);
    }
  }, [period.from, period.to]);
  useEffect(() => { void load(); }, [load]);

  const resumen = useMemo(() => {
    const list = ingresos ?? [];
    let m3Total = 0, m3ConCosto = 0, invertido = 0, sinCosto = 0;
    const monedas = new Set<string>();
    for (const e of list) {
      const v = num(e.volumeM3) ?? 0;
      const c = num(e.costoTotal);
      m3Total += v;
      if (c != null) { m3ConCosto += v; invertido += c; monedas.add(e.moneda ?? "PEN"); } else { sinCosto++; }
    }
    // Sumar soles con dólares da un número que no existe. El motor del COGS ya
    // trata este caso como intratable (`monedas_mezcladas`); acá se hace igual:
    // se dice que no se puede totalizar, no se inventa un total.
    const mezcladas = monedas.size > 1;
    return {
      m3Total, m3ConCosto, sinCosto, mezcladas,
      moneda: monedas.size === 1 ? [...monedas][0] : "PEN",
      invertido: mezcladas ? null : invertido,
      cobertura: m3Total > 0 ? (m3ConCosto / m3Total) * 100 : null,
      costoM3: !mezcladas && m3ConCosto > 0 ? invertido / m3ConCosto : null,
      /** La lista se cortó en el tope: los KPIs sólo hablan de lo que se trajo. */
      truncada: total > list.length && list.length >= TOPE,
    };
  }, [ingresos, total]);

  const pendientes = Object.keys(draft).length;

  // Igual que el panel de ventas: un número a medio tipear no debe convertirse
  // en el costo del mes, pero perderlo por cambiar de pestaña tampoco.
  useEffect(() => {
    if (pendientes === 0) return;
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [pendientes]);

  async function saveCosto(id: string) {
    const raw = draft[id];
    if (raw === undefined) return;
    const costoTotal = raw.trim() === "" ? null : Number(raw);
    if (costoTotal != null && (!Number.isFinite(costoTotal) || costoTotal < 0)) {
      setError("Costo inválido: tiene que ser un número mayor o igual a 0.");
      return;
    }
    setSavingId(id); setError(null);
    try {
      const r = await fetch(`${API}/${id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ action: "set_costo", costoTotal }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message ?? j.error ?? `HTTP ${r.status}`);
      setDraft((d) => { const n = { ...d }; delete n[id]; return n; });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingId(null);
    }
  }

  async function saveTodo() {
    for (const id of Object.keys(draft)) await saveCosto(id);
  }

  if (error && !ingresos) {
    return (
      <div className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div><strong>Error:</strong> {error}</div>
      </div>
    );
  }
  if (!ingresos) {
    return <div className="h-40 animate-pulse rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]" />;
  }

  const visibles = verTodos ? ingresos : ingresos.filter((e) => num(e.costoTotal) == null);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard density="compact" icon={Coins} label="Invertido en madera" value={soles(resumen.invertido, resumen.moneda)} subValue={resumen.mezcladas ? "hay soles y dólares mezclados" : `${ingresos.length - resumen.sinCosto} de ${ingresos.length} ingresos`} emphasis={resumen.mezcladas ? "warning" : "neutral"} />
        <StatCard density="compact" icon={Percent} label="Patio valorizado" value={resumen.cobertura == null ? "—" : `${Number(resumen.cobertura).toFixed(0)}%`} subValue={`${m3(resumen.m3ConCosto)} de ${m3(resumen.m3Total)}`} emphasis={resumen.cobertura != null && resumen.cobertura < 80 ? "warning" : "success"} />
        <StatCard density="compact" icon={PackageOpen} label="Costo promedio" value={resumen.costoM3 == null ? "—" : `${soles(resumen.costoM3, resumen.moneda)}/m³`} subValue={resumen.mezcladas ? "no se puede promediar" : "de lo que sí tiene factura"} emphasis="neutral" />
        <StatCard density="compact" icon={AlertCircle} label="Sin costo" value={String(resumen.sinCosto)} subValue="no entran al margen" emphasis={resumen.sinCosto > 0 ? "warning" : "success"} />
      </div>

      {resumen.truncada && (
        <p className="rounded-xl border-2 border-[var(--data-info-500)] bg-[var(--data-info-50)] p-3 text-sm text-[var(--data-info-700)] dark:bg-transparent dark:text-[var(--data-info-500)]">
          El período tiene {total} ingresos y acá entran los primeros {TOPE}. Los totales de arriba hablan sólo de esos — acortá el período para verlo completo.
        </p>
      )}

      {resumen.mezcladas && (
        <p className="rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-3 text-sm text-[var(--data-warning-700)] dark:bg-transparent dark:text-[var(--data-warning-500)]">
          Hay ingresos en soles y en dólares en el mismo período: sumarlos daría un número que no existe. El detalle de abajo sigue siendo correcto uno por uno.
        </p>
      )}

      {resumen.sinCosto > 0 && (
        <p className="rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-3 text-sm text-[var(--data-warning-700)] dark:bg-transparent dark:text-[var(--data-warning-500)]">
          {resumen.sinCosto} {resumen.sinCosto === 1 ? "ingreso no tiene" : "ingresos no tienen"} costo cargado. Lo que sale de esa madera no puede mostrar margen — no se inventa un costo. Cargá la factura acá cuando llegue.
        </p>
      )}

      {pendientes > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-4 py-3 text-sm font-medium text-[var(--data-warning-700)] dark:bg-transparent dark:text-[var(--data-warning-500)]">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          <span>{pendientes} costo(s) sin guardar. Se pierden si salís de la pestaña.</span>
          <button
            type="button"
            onClick={() => void saveTodo()}
            disabled={savingId !== null}
            className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-lg border-2 border-[var(--data-warning-500)] px-3 text-sm font-bold text-[var(--data-warning-700)] hover:bg-[var(--data-warning-100)] disabled:opacity-50 dark:text-[var(--data-warning-500)] dark:hover:bg-transparent"
          >
            {savingId ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
            Guardar todo
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm text-[var(--data-error-700)]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><div>{error}</div>
        </div>
      )}

      <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <CardTitle as="h3" className="text-sm font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
            Ingresos del período · registrá lo que pagaste
          </CardTitle>
          <button
            type="button"
            onClick={() => setVerTodos((v) => !v)}
            className="inline-flex h-10 items-center rounded-lg border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
          >
            {verTodos ? "Ver sólo los que faltan" : `Ver todos (${ingresos.length})`}
          </button>
        </div>

        {visibles.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)]">
            {ingresos.length === 0 ? "No hay ingresos en el período." : "Todos los ingresos del período están valorizados."}
          </p>
        ) : (
          <div className="space-y-2">
            {visibles.map((e) => {
              const guardado = num(e.costoTotal);
              const val = draft[e.id] ?? (guardado != null ? String(guardado) : "");
              const dirty = draft[e.id] !== undefined;
              const vol = num(e.volumeM3) ?? 0;
              // Lo que se está tipeando manda sobre lo guardado: el S//m³ tiene
              // que reaccionar mientras se escribe, que es cuando se detecta el dedazo.
              const efectivo = dirty ? (val.trim() === "" ? null : Number(val)) : guardado;
              const porM3 = efectivo != null && Number.isFinite(efectivo) && vol > 0 ? efectivo / vol : null;
              return (
                <div key={e.id} className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
                  <div className="min-w-[10rem] flex-1">
                    <p className="text-sm font-bold text-[var(--text-primary)]">
                      {e.speciesCommonName} · {m3(vol)}
                    </p>
                    <p className="text-xs text-[var(--text-tertiary)]">
                      <span className="font-mono">{e.gtfNumber}</span> · {e.providerName} · {dia(e.entryDate)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-[var(--text-tertiary)]">S/</span>
                    <input
                      inputMode="decimal"
                      value={val}
                      onChange={(ev) => setDraft((d) => ({ ...d, [e.id]: ev.target.value }))}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter") { ev.preventDefault(); void saveCosto(e.id); }
                        if (ev.key === "Escape") setDraft((d) => { const n = { ...d }; delete n[e.id]; return n; });
                      }}
                      aria-label={`Costo total del ingreso ${e.gtfNumber}`}
                      placeholder="costo"
                      className="h-11 w-28 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]"
                    />
                  </div>
                  <div className="min-w-[6rem] text-right">
                    <p className="text-xs text-[var(--text-tertiary)]">por m³</p>
                    <p className="text-sm font-bold tabular-nums text-[var(--text-secondary)]">
                      {porM3 == null ? "—" : `${soles(porM3, e.moneda ?? "PEN")}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void saveCosto(e.id)}
                    disabled={savingId === e.id || !dirty}
                    className="inline-flex h-11 items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40"
                  >
                    {savingId === e.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />} Guardar
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
