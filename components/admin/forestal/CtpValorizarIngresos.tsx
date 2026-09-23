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
import { formatDateShort, formatNumber } from "@/lib/format";

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
  n == null ? "—" : `${m === "PEN" ? "S/" : m} ${formatNumber(n, 2)}`;
const m3 = (n: number | null) => (n == null ? "—" : `${formatNumber(n, { max: 3 })} m³`);
/** Fecha date-only: UTC o se corre un día en Lima. */
const dia = (iso: string) => formatDateShort(iso, { soloFecha: true });

const TOPE = 200;

export default function CtpValorizarIngresos({ period }: { period: CtpPeriod }) {
  const [ingresos, setIngresos] = useState<IngresoValorizable[] | null>(null);
  /** Cuántos hay en total en el período, para saber si la lista quedó cortada. */
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [verTodos, setVerTodos] = useState(false);
  /**
   * Sale del período.
   *
   * «Ver todos» sólo alternaba entre "todos los del período" y "los del período
   * que faltan": el filtro de fechas nunca se soltaba. Pero la madera sin costo
   * que más pesa es justamente la vieja — en la planta real, las guías paradas
   * hace 849 días no caen en el trimestre en curso, así que Antigüedad las
   * denunciaba y acá no había forma de encontrarlas. Un ingreso sin factura no
   * deja de deberse porque cambió el trimestre.
   */
  const [sinPeriodo, setSinPeriodo] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams({ limit: String(TOPE) });
      if (!sinPeriodo && period.from) p.set("from", period.from);
      if (!sinPeriodo && period.to) p.set("to", period.to);
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
  }, [period.from, period.to, sinPeriodo]);
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

  /**
   * Lo que falta valorizar, agrupado por proveedor.
   *
   * En el patio el precio se acuerda **por proveedor y por m³** («S/ 360 el
   * metro»), no ingreso por ingreso: medido en el tenant real, 24 ingresos sin
   * costo repartidos en 3 proveedores, uno solo con 21. Cargarlos de a uno son
   * 24 formularios para 3 precios.
   */
  const porProveedor = useMemo(() => {
    const m = new Map<string, { proveedor: string; ids: string[]; m3: number }>();
    for (const e of ingresos ?? []) {
      if (num(e.costoTotal) != null) continue;
      const p = (e.providerName ?? "").trim() || "(sin proveedor)";
      const acc = m.get(p) ?? { proveedor: p, ids: [], m3: 0 };
      acc.ids.push(e.id);
      acc.m3 += num(e.volumeM3) ?? 0;
      m.set(p, acc);
    }
    return [...m.values()].sort((a, b) => b.m3 - a.m3);
  }, [ingresos]);

  const [provElegido, setProvElegido] = useState("");
  const [precioM3, setPrecioM3] = useState("");
  const [aplicando, setAplicando] = useState<{ hechos: number; total: number } | null>(null);

  const grupo = porProveedor.find((p) => p.proveedor === provElegido) ?? null;
  const precioNum = num(precioM3);

  /**
   * Aplicar un precio por m³ a todos los ingresos sin costo de un proveedor.
   *
   * El costo que se guarda sigue siendo el TOTAL de cada ingreso —es lo que el
   * libro almacena y lo que el COGS lee—: acá sólo se multiplica por su volumen.
   * Se guarda de a uno con el mismo endpoint de siempre, para no abrir una
   * segunda forma de escribir el costo.
   */
  async function aplicarAlProveedor() {
    if (!grupo || precioNum == null || precioNum < 0) return;
    setError(null);
    setAplicando({ hechos: 0, total: grupo.ids.length });
    const fallidos: string[] = [];
    for (const [i, id] of grupo.ids.entries()) {
      const e = (ingresos ?? []).find((x) => x.id === id);
      const v = num(e?.volumeM3) ?? 0;
      /* Un ingreso sin volumen no se puede valorizar por m³: multiplicar por
         cero guardaría «costó 0», que es una afirmación falsa y distinta de
         «no sé cuánto costó». Se saltea y se dice. */
      if (!(v > 0)) {
        fallidos.push(e?.gtfNumber ?? id);
        setAplicando({ hechos: i + 1, total: grupo.ids.length });
        continue;
      }
      try {
        const r = await fetch(`${API}/${id}`, {
          method: "PATCH",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify({ action: "set_costo", costoTotal: Math.round(precioNum * v * 100) / 100 }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          fallidos.push(`${e?.gtfNumber ?? id} (${j.message ?? j.error ?? r.status})`);
        }
      } catch (err) {
        fallidos.push(`${e?.gtfNumber ?? id} (${err instanceof Error ? err.message : String(err)})`);
      }
      setAplicando({ hechos: i + 1, total: grupo.ids.length });
    }
    setAplicando(null);
    setPrecioM3("");
    setProvElegido("");
    if (fallidos.length > 0) {
      setError(
        `No se pudo valorizar ${fallidos.length} de ${grupo.ids.length}: ${fallidos.slice(0, 3).join(", ")}${fallidos.length > 3 ? "…" : ""}. El resto sí quedó cargado.`,
      );
    }
    await load();
  }

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
    return <div className="h-40 animate-pulse rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]" />;
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
          El período tiene {total} ingresos y acá entran los primeros {TOPE}. Los totales de arriba hablan sólo de esos — acorta el período para verlo completo.
        </p>
      )}

      {resumen.mezcladas && (
        <p className="rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-3 text-sm text-[var(--data-warning-700)] dark:bg-transparent dark:text-[var(--data-warning-500)]">
          Hay ingresos en soles y en dólares en el mismo período: sumarlos daría un número que no existe. El detalle de abajo sigue siendo correcto uno por uno.
        </p>
      )}

      {resumen.sinCosto > 0 && (
        <p className="rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-3 text-sm text-[var(--data-warning-700)] dark:bg-transparent dark:text-[var(--data-warning-500)]">
          {resumen.sinCosto} {resumen.sinCosto === 1 ? "ingreso no tiene" : "ingresos no tienen"} costo cargado. Lo que sale de esa madera no puede mostrar margen — no se inventa un costo. Carga la factura acá cuando llegue.
        </p>
      )}

      {/**
       * Un precio para todo un proveedor.
       *
       * El precio se acuerda por proveedor y por m³, no ingreso por ingreso: en
       * el tenant real son 24 ingresos sin costo en 3 proveedores, uno solo con
       * 21. Cargarlos de a uno son 24 formularios para 3 precios.
       */}
      {porProveedor.length > 0 && (
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3">
          <p className="text-sm font-bold text-[var(--text-primary)]">Cargar un precio por m³ a todo un proveedor</p>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
            Se multiplica por el volumen de cada ingreso y se guarda el total, como si lo cargaras uno
            por uno.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-sm">
              <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                Proveedor
              </span>
              <select
                value={provElegido}
                onChange={(e) => setProvElegido(e.target.value)}
                aria-label="Proveedor a valorizar"
                className="h-11 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              >
                <option value="">Elige uno…</option>
                {porProveedor.map((p) => (
                  <option key={p.proveedor} value={p.proveedor}>
                    {p.proveedor} — {p.ids.length} ingreso{p.ids.length === 1 ? "" : "s"} · {m3(p.m3)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex w-40 flex-col gap-1">
              <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                Precio por m³
              </span>
              <input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={precioM3}
                onChange={(e) => setPrecioM3(e.target.value)}
                placeholder="360.00"
                aria-label="Precio por metro cúbico"
                className="h-11 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-right font-mono text-sm tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
            </label>
            <button
              type="button"
              onClick={() => void aplicarAlProveedor()}
              disabled={!grupo || precioNum == null || precioNum < 0 || aplicando !== null}
              title={
                !grupo
                  ? "Elige un proveedor"
                  : precioNum == null
                    ? "Pon el precio por m³"
                    : `Se van a valorizar ${grupo.ids.length} ingresos por ${soles(precioNum * grupo.m3, resumen.moneda)}`
              }
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
            >
              {aplicando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Coins className="h-4 w-4" aria-hidden />}
              {aplicando ? `Cargando ${aplicando.hechos}/${aplicando.total}…` : "Aplicar"}
            </button>
          </div>
          {/* Lo que va a quedar guardado, ANTES de tocar el botón: son 24
              escrituras y conviene verlas como una cifra de plata. */}
          {grupo && precioNum != null && precioNum >= 0 && (
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              {grupo.ids.length} ingreso{grupo.ids.length === 1 ? "" : "s"} · {m3(grupo.m3)} ·{" "}
              <b className="font-mono tabular-nums text-[var(--text-primary)]">
                {soles(precioNum * grupo.m3, resumen.moneda)}
              </b>{" "}
              en total.
            </p>
          )}
        </div>
      )}

      {pendientes > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-4 py-3 text-sm font-medium text-[var(--data-warning-700)] dark:bg-transparent dark:text-[var(--data-warning-500)]">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          <span>{pendientes} costo(s) sin guardar. Se pierden si sales de la pestaña.</span>
          <button
            type="button"
            onClick={() => void saveTodo()}
            disabled={savingId !== null}
            className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-xl border-2 border-[var(--data-warning-500)] px-3 text-sm font-semibold text-[var(--data-warning-700)] hover:bg-[var(--data-warning-100)] disabled:opacity-50 dark:text-[var(--data-warning-500)] dark:hover:bg-transparent"
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

      <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <CardTitle as="h3" className="text-sm font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
            {sinPeriodo ? "Todos los ingresos · registra lo que pagaste" : "Ingresos del período · registra lo que pagaste"}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {/* Sin este botón, la madera parada hace años queda fuera de alcance:
                es la que más urge valorizar y la que nunca cae en el período en
                curso. */}
            <button
              type="button"
              onClick={() => setSinPeriodo((v) => !v)}
              className={`inline-flex h-10 items-center rounded-xl border-2 px-3 text-sm font-semibold transition-colors ${
                sinPeriodo
                  ? "border-[var(--accent)] bg-primary/10 text-[var(--text-primary)]"
                  : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
              }`}
            >
              {sinPeriodo ? "Volver al período" : "Todo el patio"}
            </button>
            <button
              type="button"
              onClick={() => setVerTodos((v) => !v)}
              className="inline-flex h-10 items-center rounded-xl border border-[var(--rule-base)] px-3 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
            >
              {verTodos ? "Ver sólo los que faltan" : `Ver todos (${ingresos.length})`}
            </button>
          </div>
        </div>

        {visibles.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)]">
            {ingresos.length === 0
              ? sinPeriodo
                ? "No hay ingresos cargados."
                : "No hay ingresos en el período."
              : sinPeriodo
                ? "Todos los ingresos tienen su costo cargado."
                : "Todos los ingresos del período están valorizados. Si Antigüedad marca madera sin costo, es más vieja que el período: mira «Todo el patio»."}
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
                <div key={e.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
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
                      className="h-11 w-28 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]"
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
                    className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40"
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
