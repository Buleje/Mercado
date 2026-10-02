"use client";

/**
 * Pieza `cierre-para-contador` — baja las ventas y los gastos de un mes por las
 * MISMAS rutas que ya usa el panel (`/api/sales`, `/api/expenses`) y arma el
 * Excel. Nada de acá lee la base: si la ruta dice 403 o 500, se avisa y no se
 * baja un archivo a medias.
 */
import { useCallback, useState } from "react";
import { exportSheetsToExcel, type HojaExcel } from "@/lib/export-excel";
import { logger } from "@/lib/logger";
import type { OpcionesCierreParaContador } from "./manifest";
import {
  consultaDeGastos,
  filasDeGastos,
  filasDeVentas,
  nombreDelArchivo,
  rangoDelMes,
  type GastoApi,
  type VentaApi,
} from "./filas";

/** `/api/sales` entrega a lo sumo 1.000 por página: 20 páginas = 20.000 ventas en un mes. */
const POR_PAGINA = 1000;
const TOPE_PAGINAS = 20;

export type EstadoCierre =
  | { fase: "quieto" }
  | { fase: "bajando" }
  | { fase: "listo"; ventas: number; gastos: number }
  | { fase: "vacio" }
  | { fase: "error"; mensaje: string };

async function leerVentas(desde: string, hasta: string): Promise<VentaApi[]> {
  const todas: VentaApi[] = [];
  for (let pagina = 1; pagina <= TOPE_PAGINAS; pagina++) {
    const r = await fetch(`/api/sales?from=${desde}&to=${hasta}&limit=${POR_PAGINA}&page=${pagina}`, {
      cache: "no-store",
    });
    if (!r.ok) throw new Error(r.status === 403 ? "Tu usuario no puede bajar las ventas." : "No pude leer las ventas.");
    const lote = (await r.json()) as VentaApi[];
    todas.push(...lote);
    const total = Number(r.headers.get("X-Total-Count") ?? 0);
    if (lote.length < POR_PAGINA || todas.length >= total) break;
  }
  return todas;
}

async function leerGastos(desde: string, hasta: string): Promise<GastoApi[]> {
  const r = await fetch(`/api/expenses?${consultaDeGastos(desde, hasta)}`, { cache: "no-store" });
  if (!r.ok) throw new Error(r.status === 403 ? "Sólo el administrador puede bajar los gastos." : "No pude leer los gastos.");
  return (await r.json()) as GastoApi[];
}

export function useCierre(opciones: OpcionesCierreParaContador) {
  const [estado, setEstado] = useState<EstadoCierre>({ fase: "quieto" });

  const descargar = useCallback(
    async (mes: string) => {
      const rango = rangoDelMes(mes);
      if (!rango) {
        setEstado({ fase: "error", mensaje: "Elige un mes válido." });
        return;
      }
      setEstado({ fase: "bajando" });
      try {
        const [ventas, gastos] = await Promise.all([
          leerVentas(rango.desde, rango.hasta),
          opciones.incluirGastos ? leerGastos(rango.desde, rango.hasta) : Promise.resolve<GastoApi[]>([]),
        ]);
        if (ventas.length === 0 && gastos.length === 0) {
          setEstado({ fase: "vacio" });
          return;
        }
        const hojas: HojaExcel[] = [
          { nombre: "Ventas", filas: filasDeVentas(ventas, opciones.columnasVentas) },
          { nombre: "Gastos", filas: filasDeGastos(gastos, opciones.columnasGastos) },
        ];
        await exportSheetsToExcel(hojas, nombreDelArchivo(mes, opciones.contador));
        setEstado({ fase: "listo", ventas: ventas.length, gastos: gastos.length });
      } catch (err) {
        logger.error("[cierre-para-contador] descarga falló", { error: String(err) });
        setEstado({ fase: "error", mensaje: err instanceof Error ? err.message : "No pude armar el Excel." });
      }
    },
    [opciones],
  );

  return { estado, descargar };
}
