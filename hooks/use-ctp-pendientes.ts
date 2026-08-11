"use client";

/**
 * use-ctp-pendientes — los contadores de "qué falta" del Libro CTP.
 *
 * Lo usan el panel de la portada y el asistente de cierre: si cada uno hiciera
 * sus fetches, el asistente podría decir "todo listo" mientras el panel de
 * arriba muestra pendientes. Una sola fuente, una sola verdad.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import { applyCtpPeriodParams, type CtpPeriod } from "@/lib/forestal/ctp-period";
import {
  diaDeFechaOnly, diaDeLimiteLocal, diaEnPeriodo, pendientesDelLibro, TROZAS_VARADAS_DIAS,
  type DatosPendientes, type Pendiente,
} from "@/lib/forestal/ctp-pendientes";

const VACIO: DatosPendientes = {
  ingresosPendientes: 0, fueraDePlazo: 0, guiasSinIngresar: 0,
  despachosSinGtf: 0, despachosSinAnexo: 0, corridasSinOrigen: 0, saldosNegativos: 0,
  trozasVaradas: 0, ingresosSinCosto: 0,
};

/* Deduplicado (ADR-347): estos mismos GET los hace la vista activa en el mismo
   montaje. Un `null` en vez de tirar: la tira de pendientes no puede tumbar la
   pantalla por un endpoint. */
/* eslint-disable-next-line no-restricted-syntax -- el `null` es el contrato:
   la tira de pendientes NO puede tumbar la pantalla porque un endpoint falle;
   el error ya se loguea del lado del servidor. */
const json = (url: string) => ctpGet<Respuesta>(url).catch(() => null);

/** Lo que se le lee a cada respuesta. Suelto porque son seis endpoints. */
type Respuesta = {
  entries?: unknown;
  gtfs?: unknown;
  anexos?: unknown;
  stats?: { byStatus?: Record<string, number>; lateCount?: number; sinCostoCount?: number };
  saldos?: { materiaPrima?: unknown; productos?: unknown };
  /** `?varadas=`: sólo el conteo, para no traerse el patio entero. */
  piezas?: number;
};

/** Lo que devuelve el hook. Exportado: el shell lo carga una vez y lo reparte
 *  (tira de pendientes + avisos por pestaña en la cabina). */
export interface CtpPendientesState {
  datos: DatosPendientes;
  lista: Pendiente[];
  cargando: boolean;
  falló: boolean;
  recargar: () => void;
}

export function useCtpPendientes(period: CtpPeriod): CtpPendientesState {
  const [datos, setDatos] = useState<DatosPendientes>(VACIO);
  const [cargando, setCargando] = useState(true);
  /** Si el cálculo falla, NO se puede decir "al día": sería mentir. */
  const [falló, setFalló] = useState(false);
  /**
   * Cambiar de período dispara otra carga; si la primera responde DESPUÉS,
   * pisaba los datos nuevos con los viejos y el panel mostraba "al día"
   * habiendo pendientes. Sólo la última carga puede escribir.
   */
  const cargaRef = useRef(0);

  const recargar = useCallback(() => {
    const miCarga = ++cargaRef.current;
    setCargando(true);
    setFalló(false);
    const p = new URLSearchParams();
    applyCtpPeriodParams(p, period);
    const q = p.toString();
    const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
    Promise.all([
      json(`/api/admin/forestal/wood-entries?stats=1&limit=1&${q}`),
      json("/api/admin/forestal/gtf?sinIngresar=1"),
      json(`/api/admin/forestal/ctp?section=despacho&${q}`),
      json("/api/admin/forestal/anexos"),
      json(`/api/admin/forestal/ctp?saldos=1&${q}`),
      /* Sin período a propósito: una troza parada desde marzo sigue parada hoy,
         y mirar sólo el mes elegido la escondería justo cuando más urge. */
      json(`/api/admin/forestal/trozas/patio?varadas=${TROZAS_VARADAS_DIAS}`),
    ])
      .then(([we, gtf, desp, anexos, saldos, varadas]) => {
        if (miCarga !== cargaRef.current) return;   // llegó tarde: manda la más nueva
        const despachos = arr<{ status?: string; gtfNumber?: string | null; id: string }>(desp?.entries)
          .filter((e) => e.status === "registrado");
        // Las guías del monte se piden sin filtro (el endpoint no lo tiene) y se
        // acotan acá al período: una guía de julio no traba el cierre de junio.
        const desde = diaDeLimiteLocal(period.from);
        const hasta = diaDeLimiteLocal(period.to);
        const guias = arr<{ gtfDate?: string }>(gtf?.gtfs)
          .filter((g) => diaEnPeriodo(diaDeFechaOnly(g.gtfDate), desde, hasta));
        const conAnexo = new Set(arr<{ ctpEntryId?: string }>(anexos?.anexos).map((a) => a.ctpEntryId).filter(Boolean));
        setDatos({
          ingresosPendientes: we?.stats?.byStatus?.pendiente ?? 0,
          fueraDePlazo: we?.stats?.lateCount ?? 0,
          guiasSinIngresar: guias.length,
          despachosSinGtf: despachos.filter((e) => !e.gtfNumber?.trim()).length,
          despachosSinAnexo: despachos.filter((e) => !conAnexo.has(e.id)).length,
          corridasSinOrigen: 0,   // requiere la trazabilidad completa: se mira en Radar
          saldosNegativos:
            arr<{ negativa?: boolean }>(saldos?.saldos?.materiaPrima).filter((s) => s.negativa).length +
            arr<{ negativo?: boolean }>(saldos?.saldos?.productos).filter((s) => s.negativo).length,
          trozasVaradas: varadas?.piezas ?? 0,
          ingresosSinCosto: we?.stats?.sinCostoCount ?? 0,
        });
      })
      .catch(() => { if (miCarga === cargaRef.current) setFalló(true); })
      .finally(() => { if (miCarga === cargaRef.current) setCargando(false); });
  }, [period]);

  useEffect(recargar, [recargar]);

  return { datos, lista: pendientesDelLibro(datos), cargando, falló, recargar };
}
