"use client";

/**
 * useCuadrosResumen — lee lo que piden los tres Cuadros Resumen del LO-CTP y
 * los arma con `cuadrosResumen()` (el mismo cálculo puro del Excel oficial).
 *
 * Salió de `CtpResumenesSerfor` (compactación del libro, 17-10) cuando los
 * cuadros pasaron a vivir también en Saldos › «Lo que firma el libro»: ahí el
 * «Recargar» del riel recalcula todo, así que la carga acepta un `version` que
 * la vuelve a pedir. Una respuesta que llega tarde (cambiaste de período a
 * mitad de la carga) ya no pisa la nueva.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { applyCtpPeriodParams, type CtpPeriod } from "@/lib/forestal/ctp-period";
import { pedirJsonCtp, pedirOpcionalCtp } from "@/lib/forestal/ctp-fetch";
import { retrozadoPorEspecie, type RetrozoParaApartado } from "@/lib/forestal/loctp-apartados";
import {
  claveProducto,
  cuadrosResumen,
  type FilaResumen1,
  type FilaResumen2,
  type FilaResumen3,
  type StockInicial,
} from "@/lib/forestal/loctp-resumenes";

interface IngresoLite {
  id: string;
  speciesCommonName: string;
  speciesScientificName: string | null;
  speciesCites: boolean;
  volumeM3: string | number;
  pieces: number;
  productType: string | null;
  status: string;
}
interface CtpRowLite {
  id: string;
  lineNo: number;
  speciesCommon: string | null;
  speciesScientific: string | null;
  productType: string | null;
  unit: string | null;
  quantity: string | number | null;
  volumeInputM3: string | number | null;
  lineaProduccion: string | null;
  status: string;
}
interface GrafoLite {
  consumos: { from: string; to: string; volumeM3: number }[];
  origenes?: { from: string; to: string; quantity: number }[];
}
interface LoteLite {
  loteCode: string;
  corridaIds: string[];
}
interface SaldosLite {
  porEspecie: { especie: string; saldoM3: number }[];
  productos: { producto: string; stock: number }[];
}

export interface CuadrosResumen {
  resumen1: FilaResumen1[];
  resumen2: FilaResumen2[];
  resumen3: FilaResumen3[];
}

const num = (v: string | number | null | undefined) => (v == null ? 0 : Number(v) || 0);

export function useCuadrosResumen(period: CtpPeriod, version = 0) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Partes que no se pudieron leer: los cuadros salen, pero incompletos. */
  const [incompleto, setIncompleto] = useState<string[]>([]);
  const [datos, setDatos] = useState<CuadrosResumen | null>(null);
  const turno = useRef(0);

  const cargar = useCallback(async () => {
    const mio = ++turno.current;
    const vigente = () => mio === turno.current;
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
        pedirJsonCtp<{ entries?: IngresoLite[] }>(
          url("/api/admin/forestal/wood-entries", { limit: "5000" }),
          "los ingresos",
        ),
        pedirJsonCtp<{ entries?: CtpRowLite[] }>(
          url("/api/admin/forestal/ctp", { section: "produccion" }),
          "las corridas de producción",
        ),
        pedirJsonCtp<{ entries?: CtpRowLite[] }>(
          url("/api/admin/forestal/ctp", { section: "despacho" }),
          "los despachos",
        ),
        pedirJsonCtp<{ grafo?: GrafoLite }>(
          url("/api/admin/forestal/ctp", { grafo: "1" }),
          "la cadena de custodia",
        ),
      ]);

      // Lo que ENRIQUECE los cuadros va aparte: si falla, se arman igual y se
      // dice qué quedó afuera. Una pantalla en blanco por los lotes sería
      // perder los tres cuadros por un casillero.
      const [lotRes, retRes] = await Promise.all([
        pedirOpcionalCtp<{ lotes?: LoteLite[] }>(
          "/api/admin/forestal/lotes",
          "los lotes de producción",
        ),
        // Casilleros (7)-(10) del Cuadro 1: lo cortado en planta (Apartado 2).
        pedirOpcionalCtp<{ retrozos?: RetrozoParaApartado[] }>(
          url("/api/admin/forestal/trozas", { retrozos: "1" }),
          "el retrozado",
        ),
      ]);
      const lot = lotRes.datos ?? {};
      const ret = retRes.datos ?? {};

      // Stock inicial = saldo al cierre del período anterior. Sin `from` (todo el
      // histórico) no hay período anterior: el inicial es cero por definición.
      let inicial: StockInicial | undefined;
      if (period.from) {
        const u = new URL("/api/admin/forestal/ctp", window.location.origin);
        u.searchParams.set("saldos", "1");
        u.searchParams.set("to", new Date(new Date(period.from).getTime() - 1).toISOString());
        const previo = await pedirJsonCtp<{ saldos?: SaldosLite }>(
          u.toString(),
          "el saldo del período anterior",
        );
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

      const ingresos = (ing.entries ?? []).filter(
        (e) => e.status !== "anulado" && e.status !== "rechazado",
      );
      const produccion = (prod.entries ?? []).filter((e) => e.status === "registrado");
      const despacho = (desp.entries ?? []).filter((e) => e.status === "registrado");

      const consumidoPorIngreso = new Map<string, number>();
      for (const c of gra.grafo?.consumos ?? []) {
        consumidoPorIngreso.set(c.from, (consumidoPorIngreso.get(c.from) ?? 0) + c.volumeM3);
      }
      const loteDeCorrida = new Map<string, string>();
      for (const l of lot.lotes ?? [])
        for (const cid of l.corridaIds ?? []) loteDeCorrida.set(cid, l.loteCode);
      const lotesDeDespacho = new Map<string, string[]>();
      for (const o of gra.grafo?.origenes ?? []) {
        const lote = loteDeCorrida.get(o.from);
        if (!lote) continue;
        const previos = lotesDeDespacho.get(o.to) ?? [];
        if (!previos.includes(lote)) lotesDeDespacho.set(o.to, [...previos, lote]);
      }

      const cuadros = cuadrosResumen({
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
          id: e.id,
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
      });
      if (!vigente()) return;
      setIncompleto([lotRes.falta, retRes.falta].filter((x): x is string => Boolean(x)));
      setDatos(cuadros);
    } catch (e) {
      if (vigente()) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (vigente()) setCargando(false);
    }
  }, [period]);

  useEffect(() => {
    void cargar();
  }, [cargar, version]);

  return { cargando, error, incompleto, datos, recargar: cargar };
}
