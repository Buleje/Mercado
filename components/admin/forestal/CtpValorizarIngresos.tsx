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
 * El precio EN TANDA (proveedor × especie, 2026-09-25) vive en el modal
 * «Poner precio», el mismo que se abre desde Ingresos → Opciones: antes este
 * panel tenía su propio «precio a todo un proveedor» que guardaba de a una
 * guía, sin transacción ni aviso de dedazo. La tabla guía por guía es
 * `CtpValorizarFilas`, compartida con la pestaña «Por fila» de ese modal.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { StatCard, Kicker } from "@buleje/design-system";
import { CtpKpisPlegables } from "./kpis-plegables";
import { AlertCircle, Coins, PackageOpen, Percent } from "@buleje/design-system/icons";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import { esValorizable } from "@/lib/forestal/precio-en-tanda";
import { requiereCosto } from "@/lib/forestal/madera-de-servicio";
import { formatNumber } from "@/lib/format";
import CtpValorizarFilas, { m3De, numDe, solesDe, type IngresoValorizable } from "./CtpValorizarFilas";
import CtpPonerPrecioModal from "./CtpPonerPrecioModal";

const API = "/api/admin/forestal/wood-entries";
const TOPE = 200;

/** El asiento como llega del listado: trae la marca de servicio (ADR-437). */
type IngresoConServicio = IngresoValorizable & { maderaDeTercero?: boolean; duenoNombre?: string | null };

/** Lo que es madera de servicio en el período: se nombra, no se cuenta como «sin costo». */
interface ResumenServicio {
  guias: number;
  m3: number;
  duenos: string[];
}

function resumirServicio(filas: readonly IngresoConServicio[]): ResumenServicio | null {
  const de = filas.filter((e) => e.maderaDeTercero === true);
  if (de.length === 0) return null;
  return {
    guias: new Set(de.map((e) => e.gtfNumber)).size,
    m3: de.reduce((t, e) => t + (numDe(e.volumeM3) ?? 0), 0),
    duenos: [...new Set(de.map((e) => e.duenoNombre?.trim()).filter((x): x is string => Boolean(x)))],
  };
}

export default function CtpValorizarIngresos({ period }: { period: CtpPeriod }) {
  const [ingresos, setIngresos] = useState<IngresoValorizable[] | null>(null);
  /** Cuántos hay en total en el período, para saber si la lista quedó cortada. */
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [verTodos, setVerTodos] = useState(false);
  const [enTanda, setEnTanda] = useState(false);
  const [servicio, setServicio] = useState<ResumenServicio | null>(null);
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
      const vivos = (j.entries as IngresoConServicio[]).filter((e) => esValorizable(e.status));
      /* La madera de servicio (ADR-437) no se compró: no lleva costo ni cuenta
         como «sin costo». Sale de la lista y se nombra aparte. */
      setServicio(resumirServicio(vivos));
      setIngresos(vivos.filter((e) => requiereCosto(e)));
      setTotal(Number(j.total) || vivos.length);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setIngresos(null);
    }
  }, [period.from, period.to, sinPeriodo]);
  useEffect(() => {
    void load();
  }, [load]);

  const resumen = useMemo(() => {
    const list = ingresos ?? [];
    let m3Total = 0,
      m3ConCosto = 0,
      invertido = 0,
      sinCosto = 0;
    const monedas = new Set<string>();
    for (const e of list) {
      const v = numDe(e.volumeM3) ?? 0;
      const c = numDe(e.costoTotal);
      m3Total += v;
      if (c != null) {
        m3ConCosto += v;
        invertido += c;
        monedas.add(e.moneda ?? "PEN");
      } else {
        sinCosto++;
      }
    }
    // Sumar soles con dólares da un número que no existe. El motor del COGS ya
    // trata este caso como intratable (`monedas_mezcladas`); acá se hace igual:
    // se dice que no se puede totalizar, no se inventa un total.
    const mezcladas = monedas.size > 1;
    return {
      m3Total,
      m3ConCosto,
      sinCosto,
      mezcladas,
      moneda: monedas.size === 1 ? [...monedas][0] : "PEN",
      invertido: mezcladas ? null : invertido,
      cobertura: m3Total > 0 ? (m3ConCosto / m3Total) * 100 : null,
      costoM3: !mezcladas && m3ConCosto > 0 ? invertido / m3ConCosto : null,
      /** La lista se cortó en el tope: los KPIs sólo hablan de lo que se trajo. */
      truncada: total > list.length && list.length >= TOPE,
    };
  }, [ingresos, total]);

  if (error && !ingresos) {
    return (
      <div className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div>
          <strong>Error:</strong> {error}
        </div>
      </div>
    );
  }
  if (!ingresos) {
    return <div className="h-40 animate-pulse rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]" />;
  }

  const visibles = verTodos ? ingresos : ingresos.filter((e) => numDe(e.costoTotal) == null);

  return (
    <div className="space-y-4">
      <CtpKpisPlegables
        claveMemoria="ctp-valorizar-ingresos"
        antes={<span className="text-sm font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Costo de la madera que entró</span>}
        resumen={`${solesDe(resumen.invertido, resumen.moneda)} invertido${resumen.cobertura == null ? "" : ` · ${Number(resumen.cobertura).toFixed(0)}% valorizado`} · ${resumen.sinCosto} sin costo`}
        tarjetas={[
          <StatCard key="invertido" density="compact" icon={Coins} label="Invertido en madera" value={solesDe(resumen.invertido, resumen.moneda)} subValue={resumen.mezcladas ? "hay soles y dólares mezclados" : `${ingresos.length - resumen.sinCosto} de ${ingresos.length} ingresos`} emphasis={resumen.mezcladas ? "warning" : "neutral"} />,
          <StatCard key="patio" density="compact" icon={Percent} label="Patio valorizado" value={resumen.cobertura == null ? "—" : `${Number(resumen.cobertura).toFixed(0)}%`} subValue={`${m3De(resumen.m3ConCosto)} de ${m3De(resumen.m3Total)}`} emphasis={resumen.cobertura != null && resumen.cobertura < 80 ? "warning" : "success"} />,
          <StatCard key="costo" density="compact" icon={PackageOpen} label="Costo promedio" value={resumen.costoM3 == null ? "—" : `${solesDe(resumen.costoM3, resumen.moneda)}/m³`} subValue={resumen.mezcladas ? "no se puede promediar" : "de lo que sí tiene factura"} emphasis="neutral" />,
          <StatCard key="sin" density="compact" icon={AlertCircle} label="Sin costo" value={String(resumen.sinCosto)} subValue="no entran al margen" emphasis={resumen.sinCosto > 0 ? "warning" : "success"} />,
        ]}
      />

      {servicio && (
        <p className="text-sm text-[var(--text-secondary)]">
          <span className="font-bold text-[var(--text-primary)]">
            {servicio.guias} {servicio.guias === 1 ? "guía" : "guías"} de servicio
            {servicio.duenos.length > 0 ? ` (${servicio.duenos.join(", ")})` : ""}
          </span>{" "}
          · {formatNumber(servicio.m3, 2)} m³ — no llevan costo: la madera es de otro, sólo la asierras.
        </p>
      )}

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
        <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-3 text-sm text-[var(--data-warning-700)] dark:bg-transparent dark:text-[var(--data-warning-500)]">
          <span className="min-w-0 flex-1">
            {resumen.sinCosto} {resumen.sinCosto === 1 ? "ingreso no tiene" : "ingresos no tienen"} costo cargado. Lo que sale de esa madera no puede mostrar margen — no se inventa un costo.
          </span>
          {/* El precio se acuerda por proveedor y por m³: un precio para todo
              un grupo de guías, con vista previa, en una sola transacción. */}
          <button
            type="button"
            onClick={() => setEnTanda(true)}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3 text-sm font-semibold text-white transition hover:brightness-95"
          >
            <Coins className="h-4 w-4" aria-hidden /> Poner precio en tanda
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm text-[var(--data-error-700)]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>{error}</div>
        </div>
      )}

      <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Kicker as="h3" className="libro-kicker">
            {sinPeriodo ? "Todos los ingresos · registra lo que pagaste" : "Ingresos del período · registra lo que pagaste"}
          </Kicker>
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
          <CtpValorizarFilas filas={visibles} onGuardado={load} />
        )}
      </div>

      {enTanda && (
        <CtpPonerPrecioModal
          onClose={() => setEnTanda(false)}
          onGuardado={() => void load()}
        />
      )}
    </div>
  );
}
