"use client";

import { useEffect, useState } from "react";
import { limaDateKey, startOfLimaMonth } from "@/lib/utils";
import type { Conciliacion } from "@/lib/compras/conciliacion";

export type PeriodoConciliacion = "este-mes" | "mes-pasado" | "tres-meses" | "este-ano";
export const PERIODOS: Array<{ id: PeriodoConciliacion; label: string }> = [
  { id: "este-mes", label: "Este mes" },
  { id: "mes-pasado", label: "Mes pasado" },
  { id: "tres-meses", label: "Últimos 3 meses" },
  { id: "este-ano", label: "Este año" },
];

export type ConciliacionRespuesta = Conciliacion & { recortado?: boolean };

/** Desde y hasta (día de Lima) de cada período; «Mes pasado» cierra el último día del mes. */
export function rangoDe(periodo: PeriodoConciliacion, ahora = new Date()): { desde: string; hasta: string } {
  const hoy = limaDateKey(ahora);
  const inicioMes = (offset: number) => limaDateKey(new Date(startOfLimaMonth(offset, ahora)));
  if (periodo === "este-mes") return { desde: inicioMes(0), hasta: hoy };
  if (periodo === "mes-pasado") return { desde: inicioMes(-1), hasta: limaDateKey(new Date(startOfLimaMonth(0, ahora) - 1)) };
  if (periodo === "este-ano") return { desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy };
  return { desde: inicioMes(-2), hasta: hoy };
}

/**
 * La conciliación de documentos (N04). Lo arma el servidor; acá se pide con el
 * período y el proveedor elegidos. `marca` cambia cuando Por pagar recarga sus
 * cuentas (p. ej. tras vincular una a su orden) y vuelve a pedir. Una respuesta
 * vieja no pisa a la nueva.
 */
export function useConciliacion(marca: unknown) {
  const [periodo, setPeriodo] = useState<PeriodoConciliacion>("tres-meses");
  const [proveedor, setProveedor] = useState("");
  const [datos, setDatos] = useState<ConciliacionRespuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    let vigente = true;
    const { desde, hasta } = rangoDe(periodo);
    const qs = new URLSearchParams({ desde, hasta });
    if (proveedor) qs.set("proveedor", proveedor);
    setCargando(true);
    setError(null);
    fetch(`/api/compras/conciliacion?${qs}`)
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!vigente) return;
        if (!r.ok || !j || !Array.isArray(j.filas)) {
          setError(typeof j?.error === "string" ? j.error : `No se pudo armar la conciliación (${r.status}).`);
          return;
        }
        setDatos(j as ConciliacionRespuesta);
      })
      .catch(() => {
        if (vigente) setError("Sin conexión: no se pudo armar la conciliación.");
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [periodo, proveedor, vuelta, marca]);

  return { datos, cargando, error, periodo, setPeriodo, proveedor, setProveedor, recargar: () => setVuelta((v) => v + 1) };
}
