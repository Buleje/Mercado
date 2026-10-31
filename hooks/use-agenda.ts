"use client";

/**
 * use-agenda — la agenda de Administración en el cliente (ADR-501).
 *
 * `AgendaProvider` (lo monta `AdministracionModule`) lee en paralelo lo de HOY
 * y la lista de actividades; cada vista toma lo suyo con `useAgenda()`. Tras
 * cada marca o cambio sube `version`: el calendario (`useCalendarioAgenda`)
 * vuelve a pedir su rango sin que nadie le avise a mano.
 *
 * Un 404 es «todavía no hay nada» (la ruta o la actividad no existe): la vista
 * muestra su estado vacío, no un error rojo. El error queda para 5xx y red.
 * Una respuesta vieja nunca pisa a una nueva (contador de pedidos).
 */
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  desmarcarOcurrencia,
  leerActividades,
  leerCalendario,
  leerHoy,
  marcarOcurrencia,
  type Marca,
} from "@/components/admin/administracion/agenda-api";
import { limaDateKey } from "@/lib/utils";
import type { ActividadDTO, ColorAgenda, DiaAgenda, FechaKey, ResumenAgendaHoy } from "@/lib/agenda/tipos";

interface Contexto {
  hoy: ResumenAgendaHoy;
  actividades: ActividadDTO[];
  /** Sólo la primera carga: las siguientes refrescan sin tapar la vista. */
  cargando: boolean;
  recargando: boolean;
  error: string | null;
  /** Sube tras cada cambio: quien lee un rango lo vuelve a pedir. */
  version: number;
  refrescar: () => void;
  colorDe: (actividadId: string) => ColorAgenda;
  marcar: (marca: Marca, aviso?: string) => Promise<boolean>;
  desmarcar: (actividadId: string, fecha: FechaKey) => Promise<boolean>;
}

const Ctx = createContext<Contexto | null>(null);

function resumenVacio(): ResumenAgendaHoy {
  return { fecha: limaDateKey(), hoy: [], atrasadas: [], cuenta: { total: 0, hechas: 0, pendientes: 0, atrasadas: 0 }, alertas: [] };
}

/** Volver a la pestaña refresca, pero no más de una vez cada 30 s. */
const REFRESCO_AL_VOLVER_MS = 30_000;

export function AgendaProvider({ children }: { children: ReactNode }) {
  const [hoy, setHoy] = useState<ResumenAgendaHoy>(resumenVacio);
  const [actividades, setActividades] = useState<ActividadDTO[]>([]);
  const [cargando, setCargando] = useState(true);
  const [recargando, setRecargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const pedido = useRef(0);
  const ultimaCarga = useRef(0);

  const cargar = useCallback(async () => {
    const n = ++pedido.current;
    ultimaCarga.current = Date.now();
    setRecargando(true);
    const [rHoy, rAct] = await Promise.all([leerHoy(), leerActividades()]);
    if (n !== pedido.current) return;
    setHoy(rHoy.ok && rHoy.data ? rHoy.data : resumenVacio());
    setActividades(rAct.ok ? (rAct.data?.actividades ?? []) : []);
    const falla = [rHoy, rAct].find((r) => !r.ok && r.status !== 404);
    setError(falla && !falla.ok ? falla.error : null);
    setCargando(false);
    setRecargando(false);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === "visible" && Date.now() - ultimaCarga.current > REFRESCO_AL_VOLVER_MS) {
        void cargar();
        setVersion((v) => v + 1);
      }
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [cargar]);

  const refrescar = useCallback(() => {
    void cargar();
    setVersion((v) => v + 1);
  }, [cargar]);

  const colores = useMemo(() => new Map(actividades.map((a) => [a.id, a.color])), [actividades]);
  const colorDe = useCallback((id: string): ColorAgenda => colores.get(id) ?? "neutral", [colores]);

  const marcar = useCallback(
    async (marca: Marca, aviso?: string) => {
      const r = await marcarOcurrencia(marca);
      if (!r.ok) {
        toast.error(r.error);
        return false;
      }
      if (aviso) toast.success(aviso);
      refrescar();
      return true;
    },
    [refrescar],
  );

  const desmarcar = useCallback(
    async (actividadId: string, fecha: FechaKey) => {
      const r = await desmarcarOcurrencia(actividadId, fecha);
      if (!r.ok && r.status !== 404) {
        toast.error(r.error);
        return false;
      }
      refrescar();
      return true;
    },
    [refrescar],
  );

  const valor = useMemo<Contexto>(
    () => ({ hoy, actividades, cargando, recargando, error, version, refrescar, colorDe, marcar, desmarcar }),
    [hoy, actividades, cargando, recargando, error, version, refrescar, colorDe, marcar, desmarcar],
  );
  return createElement(Ctx.Provider, { value: valor }, children);
}

export function useAgenda(): Contexto {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAgenda va dentro de <AgendaProvider>");
  return c;
}

export interface CalendarioAgenda {
  dias: ReadonlyMap<FechaKey, DiaAgenda>;
  cargando: boolean;
  error: string | null;
  recargar: () => void;
}

/** Los días de `[desde, hasta]` (≤ 62, ADR-501 §7) con lo que toca en cada uno. */
export function useCalendarioAgenda(desde: FechaKey, hasta: FechaKey): CalendarioAgenda {
  const { version } = useAgenda();
  const [dias, setDias] = useState<ReadonlyMap<FechaKey, DiaAgenda>>(() => new Map());
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const pedido = useRef(0);

  useEffect(() => {
    const n = ++pedido.current;
    setCargando(true);
    void leerCalendario(desde, hasta).then((r) => {
      if (n !== pedido.current) return;
      if (r.ok) setDias(new Map((r.data?.dias ?? []).map((d) => [d.fecha, d])));
      else if (r.status === 404) setDias(new Map());
      setError(!r.ok && r.status !== 404 ? r.error : null);
      setCargando(false);
    });
  }, [desde, hasta, version, vuelta]);

  const recargar = useCallback(() => setVuelta((v) => v + 1), []);
  return { dias, cargando, error, recargar };
}
