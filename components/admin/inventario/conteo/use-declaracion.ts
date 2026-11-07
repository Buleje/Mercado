"use client";

import { useCallback, useEffect, useState } from "react";
import { exportToExcel } from "@/lib/export-excel";
import { limaDateKey } from "@/lib/utils";
import {
  categoriasDe, mapearRespuesta, resumenPorCategoria,
  type DeclaracionAnterior, type DeclaracionData, type HistorialEntry,
} from "./declaracion-tipos";

const CLAVE_HISTORIAL = "inventory-declarations";
const CLAVE_ULTIMA = "last-declaration";

const hoyISO = () => limaDateKey();

function leer<T>(clave: string): T | null {
  try {
    const raw = localStorage.getItem(clave);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function pedir(fecha: string): Promise<DeclaracionData> {
  const res = await fetch(`/api/inventory/declaracion?fecha=${fecha}`);
  if (!res.ok) throw new Error("No se pudo generar la declaración");
  return mapearRespuesta(await res.json());
}

/** Estado de la Declaración de inventario: la de hoy, la que generas y las anteriores. */
export function useDeclaracion() {
  const [fecha, setFecha] = useState(hoyISO);
  const [data, setData] = useState<DeclaracionData | null>(null);
  const [resumen, setResumen] = useState<DeclaracionData | null>(null);
  const [resumenCargando, setResumenCargando] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historial, setHistorial] = useState<HistorialEntry[]>([]);
  const [anterior, setAnterior] = useState<DeclaracionAnterior | null>(null);

  useEffect(() => {
    setHistorial(leer<HistorialEntry[]>(CLAVE_HISTORIAL) ?? []);
  }, []);

  useEffect(() => {
    let cancelado = false;
    pedir(hoyISO())
      .then((d) => { if (!cancelado) setResumen(d); })
      .catch((err) => console.warn("[Declaracion] resumen de hoy no cargó:", err))
      .finally(() => { if (!cancelado) setResumenCargando(false); });
    return () => { cancelado = true; };
  }, []);

  const generar = useCallback(async () => {
    setCargando(true);
    setError(null);
    setData(null);
    try {
      const resultado = await pedir(fecha);
      setData(resultado);
      setAnterior(leer<DeclaracionAnterior>(CLAVE_ULTIMA));
      try {
        localStorage.setItem(CLAVE_ULTIMA, JSON.stringify({
          fecha: resultado.fecha,
          categorias: resumenPorCategoria(resultado),
          valorTotal: resultado.valorCosto ?? 0,
        }));
        const nueva: HistorialEntry = {
          fecha: resultado.fecha,
          totalProductos: resultado.totalProductos,
          totalUnidades: resultado.totalUnidades,
          valorCosto: resultado.valorCosto,
          valorPrecio: resultado.valorPrecio,
          categorias: Object.keys(categoriasDe(resultado)).length,
          savedAt: new Date().toISOString(),
        };
        const actualizado = [...(leer<HistorialEntry[]>(CLAVE_HISTORIAL) ?? []), nueva].slice(-12);
        localStorage.setItem(CLAVE_HISTORIAL, JSON.stringify(actualizado));
        setHistorial(actualizado);
      } catch (err) {
        console.warn("[Declaracion] no se pudo guardar en el historial:", err);
      }
      setResumen(resultado);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setCargando(false);
    }
  }, [fecha]);

  const exportar = useCallback(() => {
    if (!data) return;
    const filas: Record<string, unknown>[] = [];
    for (const [categoria, items] of Object.entries(categoriasDe(data))) {
      for (const p of items) {
        filas.push({
          Categoría: categoria,
          SKU: p.sku,
          Producto: p.name,
          Stock: p.stock,
          "Costo Unit.": p.costPrice,
          "Valor Costo": p.stock * p.costPrice,
          "Precio Unit.": p.price,
          "Valor Precio": p.stock * p.price,
        });
      }
    }
    exportToExcel(filas, `declaracion_inventario_${fecha}`, "Inventario");
  }, [data, fecha]);

  return { fecha, setFecha, data, resumen, resumenCargando, cargando, error, historial, anterior, generar, exportar };
}
