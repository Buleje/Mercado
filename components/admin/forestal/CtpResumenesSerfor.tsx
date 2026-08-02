"use client";

/**
 * Los tres CUADROS RESUMEN del formato oficial del LO-CTP, en pantalla.
 *
 * Estaban sólo dentro del Excel oficial, así que para saber si el período cierra
 * había que descargarlo y abrirlo. Son los cuadros que un fiscalizador lee
 * primero, y el operador tiene que poder verlos ANTES de cerrar el mes.
 *
 * El cálculo NO vive acá: es el mismo `cuadrosResumen()` puro que usa el export
 * (`lib/forestal/loctp-resumenes.ts`). Si la pantalla y el Excel mostraran
 * números distintos del mismo período, ninguno de los dos serviría.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, Scale } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { applyCtpPeriodParams, type CtpPeriod } from "@/lib/forestal/ctp-period";
import { pedirJsonCtp, pedirOpcionalCtp } from "@/lib/forestal/ctp-fetch";
import { unidadOficial } from "@/lib/forestal/loctp-campos";
import { retrozadoPorEspecie, type RetrozoParaApartado } from "@/lib/forestal/loctp-apartados";
import CtpApartadosSerfor from "./CtpApartadosSerfor";
import { Celda, Cuadro, Entero, Th } from "./ctp-cuadro-shared";
import {
  claveProducto,
  cuadrosResumen,
  type FilaResumen1,
  type FilaResumen2,
  type FilaResumen3,
  type StockInicial,
} from "@/lib/forestal/loctp-resumenes";

interface IngresoLite {
  id: string; speciesCommonName: string; speciesScientificName: string | null; speciesCites: boolean;
  volumeM3: string | number; pieces: number; productType: string | null; status: string;
}
interface CtpRowLite {
  id: string; lineNo: number; speciesCommon: string | null; speciesScientific: string | null;
  productType: string | null; unit: string | null; quantity: string | number | null;
  volumeInputM3: string | number | null; lineaProduccion: string | null; status: string;
}
interface GrafoLite {
  consumos: { from: string; to: string; volumeM3: number }[];
  origenes?: { from: string; to: string; quantity: number }[];
}
interface LoteLite { loteCode: string; corridaIds: string[] }
interface SaldosLite {
  porEspecie: { especie: string; saldoM3: number }[];
  productos: { producto: string; stock: number }[];
}

const num = (v: string | number | null | undefined) => (v == null ? 0 : Number(v) || 0);

export default function CtpResumenesSerfor({ period }: { period: CtpPeriod }) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Partes que no se pudieron leer: los cuadros salen, pero incompletos. */
  const [incompleto, setIncompleto] = useState<string[]>([]);
  const [datos, setDatos] = useState<{
    resumen1: FilaResumen1[];
    resumen2: FilaResumen2[];
    resumen3: FilaResumen3[];
  } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const url = (base: string, extra: Record<string, string> = {}) => {
        const u = new URL(base, window.location.origin);
        for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
        applyCtpPeriodParams(u.searchParams, period);
        return u.toString();
      };
      // Lo IMPRESCINDIBLE va en `Promise.all`: sin ingresos, producción,
      // despacho o grafo no hay cuadros que armar, y ahí sí corresponde cortar.
      const [ing, prod, desp, gra] = await Promise.all([
        pedirJsonCtp<{ entries?: IngresoLite[] }>(url("/api/admin/forestal/wood-entries", { limit: "5000" }), "los ingresos"),
        pedirJsonCtp<{ entries?: CtpRowLite[] }>(url("/api/admin/forestal/ctp", { section: "produccion" }), "las corridas de producción"),
        pedirJsonCtp<{ entries?: CtpRowLite[] }>(url("/api/admin/forestal/ctp", { section: "despacho" }), "los despachos"),
        pedirJsonCtp<{ grafo?: GrafoLite }>(url("/api/admin/forestal/ctp", { grafo: "1" }), "la cadena de custodia"),
      ]);

      // Lo que ENRIQUECE los cuadros va aparte: si falla, se arman igual y se
      // dice qué quedó afuera. Una pantalla en blanco por los lotes sería
      // perder los tres cuadros por un casillero.
      const [lotRes, retRes] = await Promise.all([
        pedirOpcionalCtp<{ lotes?: LoteLite[] }>("/api/admin/forestal/lotes", "los lotes de producción"),
        // Casilleros (7)-(10) del Cuadro 1: lo cortado en planta (Apartado 2).
        pedirOpcionalCtp<{ retrozos?: RetrozoParaApartado[] }>(url("/api/admin/forestal/trozas", { retrozos: "1" }), "el retrozado"),
      ]);
      const lot = lotRes.datos ?? {};
      const ret = retRes.datos ?? {};
      setIncompleto([lotRes.falta, retRes.falta].filter((x): x is string => Boolean(x)));

      // Stock inicial = saldo al cierre del período anterior. Sin `from` (todo el
      // histórico) no hay período anterior: el inicial es cero por definición.
      let inicial: StockInicial | undefined;
      if (period.from) {
        const u = new URL("/api/admin/forestal/ctp", window.location.origin);
        u.searchParams.set("saldos", "1");
        u.searchParams.set("to", new Date(new Date(period.from).getTime() - 1).toISOString());
        const previo = await pedirJsonCtp<{ saldos?: SaldosLite }>(u.toString(), "el saldo del período anterior");
        if (previo.saldos) {
          const trozasM3: Record<string, number> = {};
          for (const e of previo.saldos.porEspecie) trozasM3[e.especie] = e.saldoM3;
          const productos: Record<string, number> = {};
          for (const p of previo.saldos.productos) {
            const [tipo, especie] = p.producto.split("·").map((x) => x.trim());
            productos[claveProducto(especie ?? null, tipo ?? null, "m3")] = p.stock;
          }
          inicial = { trozasM3, productos };
        }
      }

      const ingresos = (ing.entries ?? []).filter((e) => e.status !== "anulado" && e.status !== "rechazado");
      const produccion = (prod.entries ?? []).filter((e) => e.status === "registrado");
      const despacho = (desp.entries ?? []).filter((e) => e.status === "registrado");

      const consumidoPorIngreso = new Map<string, number>();
      for (const c of gra.grafo?.consumos ?? []) {
        consumidoPorIngreso.set(c.from, (consumidoPorIngreso.get(c.from) ?? 0) + c.volumeM3);
      }
      const loteDeCorrida = new Map<string, string>();
      for (const l of lot.lotes ?? []) for (const cid of l.corridaIds ?? []) loteDeCorrida.set(cid, l.loteCode);
      const lotesDeDespacho = new Map<string, string[]>();
      for (const o of gra.grafo?.origenes ?? []) {
        const lote = loteDeCorrida.get(o.from);
        if (!lote) continue;
        const previos = lotesDeDespacho.get(o.to) ?? [];
        if (!previos.includes(lote)) lotesDeDespacho.set(o.to, [...previos, lote]);
      }

      setDatos(
        cuadrosResumen({
          ingresos: ingresos.map((e) => ({
            especie: e.speciesCommonName,
            cientifico: e.speciesScientificName,
            cites: e.speciesCites,
            volumenM3: num(e.volumeM3),
            piezas: e.pieces ?? 0,
            tipoProducto: e.productType,
            consumidoM3: consumidoPorIngreso.get(e.id) ?? 0,
          })),
          produccion: produccion.map((e) => ({
            especie: e.speciesCommon,
            cientifico: e.speciesScientific,
            tipoProducto: e.productType,
            unidad: e.unit,
            cantidad: num(e.quantity),
            consumidoM3: num(e.volumeInputM3),
            lineaProduccion: e.lineaProduccion ?? "LP",
            lote: loteDeCorrida.get(e.id) ?? null,
          })),
          salidas: despacho.map((e) => ({
            especie: e.speciesCommon,
            cientifico: e.speciesScientific,
            tipoProducto: e.productType,
            unidad: e.unit,
            cantidad: num(e.quantity),
            lote: lotesDeDespacho.get(e.id)?.join(", ") ?? null,
          })),
          inicial,
          retrozados: retrozadoPorEspecie(ret.retrozos ?? []),
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, [period]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** Un saldo negativo en cualquier cuadro es lo que impide cerrar el mes. */
  const negativos = useMemo(() => {
    if (!datos) return 0;
    return (
      datos.resumen1.filter((f) => f.saldo.volumen < 0).length +
      datos.resumen2.filter((f) => f.saldo < 0).length +
      datos.resumen3.filter((f) => f.stock < 0).length
    );
  }, [datos]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--surface-raised)] px-4 py-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Scale className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-[var(--text-primary)]">
            Cuadros resumen del formato oficial · {period.label}
          </p>
          <p className="text-xs text-[var(--text-secondary)]">
            Los tres cuadros que exige la RDE D000025-2023 con su numeración. Un casillero en «—» es
            un dato que el libro no registra: se completa a mano en el formato.
          </p>
        </div>
        <button
          onClick={() => void cargar()}
          disabled={cargando}
          className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] px-3 py-2 text-sm font-bold text-[var(--text-primary)] transition-colors hover:border-primary disabled:opacity-50"
        >
          {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Recalcular
        </button>
      </div>

      {error && (
        <p className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/10 px-3 py-2.5 text-sm font-medium text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> No pude armar los cuadros. {error}
        </p>
      )}

      {/* Los cuadros SÍ se armaron, pero con un casillero sin fuente. Un
          documento regulatorio incompleto tiene que decirlo: callarlo es peor
          que no mostrarlo. */}
      {incompleto.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] dark:bg-transparent px-3 py-2.5 text-sm font-medium text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Los cuadros están armados pero les falta una parte: {incompleto.join(" · ")} Revisá esos
            casilleros antes de presentar el libro.
          </span>
        </p>
      )}

      {negativos > 0 && (
        <p className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/10 px-3 py-2.5 text-sm font-medium text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {negativos} fila(s) con saldo negativo. Un saldo negativo dice que salió o se consumió más
            de lo que entró: revisá las atribuciones antes de presentar el libro.
          </span>
        </p>
      )}

      {cargando && !datos ? (
        <p className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] px-4 py-10 text-center text-sm text-[var(--text-secondary)]">
          Armando los cuadros del período…
        </p>
      ) : datos ? (
        <>
          <Cuadro
            titulo="Cuadro Resumen 1 · Saldos y movimientos de trozas"
            subtitulo="Por especie: 16 casilleros. El retrozado (7)-(10) sale del Apartado 2 y no mueve el saldo: cortar una troza no crea ni destruye madera. El N° de trozas consumidas va en «—» porque el consumo se atribuye en m³, no por troza."
          >
            <thead className="bg-[var(--surface-sunken)]">
              <tr>
                <Th>(1) Especie</Th>
                <Th>(2) Científico</Th>
                <Th>(3) Inicial m³</Th>
                <Th>(4) Inicial N°</Th>
                <Th>(5) Ingresó m³</Th>
                <Th>(6) Ingresó N°</Th>
                <Th>(7) Retrozado m³</Th>
                <Th>(8) Retrozado N°</Th>
                <Th>(9) De retrozado m³</Th>
                <Th>(10) De retrozado N°</Th>
                <Th>(11) Consumido m³</Th>
                <Th>(12) Consumido N°</Th>
                <Th>(13) Salió m³</Th>
                <Th>(15) Saldo m³</Th>
              </tr>
            </thead>
            <tbody>
              {datos.resumen1.length === 0 ? (
                <tr><td colSpan={14} className="px-4 py-6 text-center text-sm text-[var(--text-secondary)]">Sin movimientos de trozas en el período.</td></tr>
              ) : (
                datos.resumen1.map((f) => (
                  <tr key={f.especie} className="border-t border-[var(--rule-soft)]">
                    <td className="px-3 py-2 font-bold text-[var(--text-primary)]">
                      {f.especie}
                      {f.cites && <span className="ml-1.5 rounded bg-[var(--data-error-50)] px-1 text-[length:var(--ts-2xs,11px)] font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]">CITES</span>}
                    </td>
                    <td className="px-3 py-2 text-xs italic text-[var(--text-secondary)]">{f.cientifico ?? "—"}</td>
                    <Celda v={f.inicial.volumen} />
                    <Entero v={f.inicial.piezas} />
                    <Celda v={f.ingresado.volumen} />
                    <Entero v={f.ingresado.piezas} />
                    <Celda v={f.retrozado.volumen || null} />
                    <Entero v={f.retrozado.piezas} />
                    <Celda v={f.deRetrozado.volumen || null} />
                    <Entero v={f.deRetrozado.piezas} />
                    <Celda v={f.consumido.volumen} />
                    <Entero v={f.consumido.piezas} />
                    <Celda v={f.salido.volumen} />
                    <Celda v={f.saldo.volumen} negativo />
                  </tr>
                ))
              )}
            </tbody>
          </Cuadro>

          <Cuadro
            titulo="Cuadro Resumen 2 · Saldos y movimientos de productos transformados"
            subtitulo="Por especie, tipo de producto y unidad: 10 casilleros."
          >
            <thead className="bg-[var(--surface-sunken)]">
              <tr>
                <Th>(1) Especie</Th>
                <Th>(3) Tipo de producto</Th>
                <Th>(4) Unidad</Th>
                <Th>(5) Inicial</Th>
                <Th>(6) Ingresó</Th>
                <Th>(7) Consumido</Th>
                <Th>(8) Producido</Th>
                <Th>(9) Salió</Th>
                <Th>(10) Saldo</Th>
              </tr>
            </thead>
            <tbody>
              {datos.resumen2.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-6 text-center text-sm text-[var(--text-secondary)]">Sin productos transformados en el período.</td></tr>
              ) : (
                datos.resumen2.map((f) => (
                  <tr key={`${f.especie}|${f.tipoProducto}|${f.unidad}`} className="border-t border-[var(--rule-soft)]">
                    <td className="px-3 py-2 font-bold text-[var(--text-primary)]">{f.especie}</td>
                    <td className="px-3 py-2">{f.tipoProducto}</td>
                    <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">{unidadOficial(f.unidad)}</td>
                    <Celda v={f.inicial} />
                    <Celda v={f.ingresado} />
                    <Celda v={f.consumido} />
                    <Celda v={f.producido} />
                    <Celda v={f.salido} />
                    <Celda v={f.saldo} negativo />
                  </tr>
                ))
              )}
            </tbody>
          </Cuadro>

          <Cuadro
            titulo="Cuadro Resumen 3 · Balance de la transformación primaria"
            subtitulo="Por lote y línea de producción: 13 casilleros. Con unidades distintas el formato pide el factor de conversión, no un porcentaje."
          >
            <thead className="bg-[var(--surface-sunken)]">
              <tr>
                <Th>(1) Lote</Th>
                <Th>(2) Producto</Th>
                <Th>(3) Especie</Th>
                <Th>(6) Consumido m³</Th>
                <Th>(7) Línea</Th>
                <Th>(9) Producido</Th>
                <Th>(11) Salió</Th>
                <Th>(12) Stock</Th>
                <Th>(13) Rendimiento</Th>
              </tr>
            </thead>
            <tbody>
              {datos.resumen3.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-6 text-center text-sm text-[var(--text-secondary)]">Sin producción en el período.</td></tr>
              ) : (
                datos.resumen3.map((f) => (
                  <tr key={`${f.lote}|${f.lineaProduccion}|${f.tipoProducto}|${f.especie}`} className="border-t border-[var(--rule-soft)]">
                    <td className="px-3 py-2 font-mono text-sm font-bold text-[var(--text-primary)]">{f.lote}</td>
                    <td className="px-3 py-2">{f.tipoProducto}</td>
                    <td className="px-3 py-2">{f.especie}</td>
                    <Celda v={f.cantidadConsumida} />
                    <td className="px-3 py-2">
                      <span className={cn(
                        "rounded px-1.5 py-0.5 text-[length:var(--ts-2xs,11px)] font-bold",
                        f.lineaProduccion === "LRE"
                          ? "bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]"
                          : "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]",
                      )}>
                        {f.lineaProduccion}
                      </span>
                    </td>
                    <Celda v={f.cantidadProducida} />
                    <Celda v={f.salido} />
                    <Celda v={f.stock} negativo />
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {f.rendimientoPct != null ? `${f.rendimientoPct}%` : (f.factorConversion ?? "—")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </Cuadro>
        </>
      ) : null}

      {/* Los apartados van DEBAJO de los cuadros: el formato los pide al final y
          el operador los lee después de ver si el período cierra. */}
      <CtpApartadosSerfor period={period} />
    </div>
  );
}
