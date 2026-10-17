"use client";

/**
 * El «Resumen del turno»: se abre solo al cerrar y, desde el 08-10, también al
 * tocar cualquier turno del historial (antes sólo existía en el instante del
 * cierre; si lo cerrabas, el corte de ese turno no se volvía a ver).
 */
import { useCallback, useState } from "react";
import type { ResumenServidor, Turno, TurnoSummary } from "./tipos";

export async function pedirResumenServidor(turnoId: string): Promise<ResumenServidor | null> {
  try {
    const res = await fetch(`/api/turnos/${turnoId}/summary`);
    if (!res.ok) return null;
    const s = await res.json();
    return {
      cantidadVentas: Number(s.cantidadVentas ?? 0),
      totalVendido: Number(s.totalVendido ?? 0),
      totalDescuentos: Number(s.totalDescuentos ?? 0),
      metodosPago: Array.isArray(s.metodosPago) ? s.metodosPago : [],
      topProductos: Array.isArray(s.topProductos) ? s.topProductos : [],
    };
  } catch {
    return null;
  }
}

/** Arma el resumen de un turno YA cerrado del historial (cifras del servidor). */
export function resumenDeTurnoCerrado(t: Turno, s: ResumenServidor | null, cajeroNombre: string): TurnoSummary {
  const totalVentas = t.ventasTotal;
  const cantidadVentas = s?.cantidadVentas ?? 0;
  return {
    turnoId: t.id,
    cajeroNombre,
    abrioEn: t.abrioEn,
    cerroEn: t.cerroEn,
    totalVentas,
    cantidadVentas,
    ticketPromedio: cantidadVentas > 0 ? totalVentas / cantidadVentas : 0,
    inicioEfectivo: t.inicioEfectivo,
    /* El cron guarda el esperado como cierre del turno: no es un conteo. */
    cierreEfectivo: t.cerradoPorSistema ? null : t.cierreEfectivo ?? null,
    diferencia: t.diferencia ?? null,
    metodosPago: s?.metodosPago ?? [],
    topProductos: (s?.topProductos ?? []).slice(0, 3),
    totalDescuentos: s?.totalDescuentos ?? 0,
  };
}

export function useResumenTurno() {
  const [resumen, setResumen] = useState<TurnoSummary | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [cargandoId, setCargandoId] = useState<string | null>(null);

  const mostrar = useCallback((r: TurnoSummary) => { setResumen(r); setAbierto(true); }, []);
  const cerrar = useCallback(() => setAbierto(false), []);

  const abrirDeHistorial = useCallback(async (t: Turno, cajeroNombre: string) => {
    setCargandoId(t.id);
    const s = await pedirResumenServidor(t.id);
    setCargandoId(null);
    mostrar(resumenDeTurnoCerrado(t, s, cajeroNombre));
  }, [mostrar]);

  return { resumen, abierto, cargandoId, mostrar, cerrar, abrirDeHistorial };
}
