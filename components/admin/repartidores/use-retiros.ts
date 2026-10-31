"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { tenantFetch } from "@/lib/tenant-fetch";
import { csvDeRetiros, type AlertaRetiro, type JustificacionAlerta, type ReferenciaUsada, type RetiroParaCsv } from "@/lib/delivery/retiros-conciliacion";

/** Un retiro como lo manda `GET /api/admin/delivery/payouts` (fechas en ISO). */
export interface RetiroFila {
  id: string;
  partnerId: string;
  partnerName: string;
  partnerPhone: string;
  amount: number;
  yapeNumber: string;
  status: "pending" | "approved" | "paid" | "rejected" | string;
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface DatosRetiros {
  porPagar: RetiroFila[];
  historial: RetiroFila[];
  resumen: {
    porPagar: { cantidad: number; monto: number };
    pagadoEsteMes: { cantidad: number; monto: number };
  };
  /** De TODAS las filas del historial con los filtros (no sólo las que viajan): P35. */
  totales: {
    filas: number;
    pagados: { cantidad: number; monto: number };
    rechazados: { cantidad: number; monto: number };
  };
  /** Coincidencias para revisar (nunca bloquean un pago): P36. */
  alertas: AlertaRetiro[];
  /** N.° de operación ya usados en pagos de los últimos 90 días: P34. */
  referencias: ReferenciaUsada[];
  puedeResolver: boolean;
}

/** Filtros del historial (P35): día de Lima «AAAA-MM-DD», vacío = sin filtro. */
export interface FiltrosHistorial {
  historial: FiltroHistorial;
  desde: string;
  hasta: string;
  partnerId: string;
}

export const FILTROS_INICIALES: FiltrosHistorial = { historial: "todos", desde: "", hasta: "", partnerId: "" };

/**
 * Un pago que no se sabe si quedó (P34): se cortó la conexión o el servidor
 * falló a medias. Reintentar es seguro (el servidor no paga dos veces), pero la
 * pantalla lo marca «por confirmar» hasta releer.
 */
export class ErrorAccionRetiro extends Error {
  constructor(
    message: string,
    readonly incierto: boolean,
  ) {
    super(message);
    this.name = "ErrorAccionRetiro";
  }
}

function consulta(f: FiltrosHistorial, extra?: Record<string, string>): string {
  const qs = new URLSearchParams();
  if (f.historial !== "todos") qs.set("historial", f.historial);
  if (f.desde) qs.set("desde", f.desde);
  if (f.hasta) qs.set("hasta", f.hasta);
  if (f.partnerId) qs.set("partnerId", f.partnerId);
  for (const [k, v] of Object.entries(extra ?? {})) qs.set(k, v);
  const t = qs.toString();
  return t ? `?${t}` : "";
}

export type CuerpoAccion =
  | { accion: "aprobar" }
  | { accion: "pagar"; metodo: "yape" | "efectivo" | "transferencia"; salidaDeCaja: boolean; referencia?: string }
  | { accion: "rechazar"; motivo: string }
  | { accion: "deshacer"; motivo: string };

/** Qué mira el historial: todo, o sólo un estado (lo filtra el servidor). */
export type FiltroHistorial = "todos" | "paid" | "rejected";

export interface RespuestaAccion {
  ok: true;
  yaEstaba: boolean;
  gastoId?: string;
  caja?: { sinCaja: boolean } | null;
  /** Al deshacer: el gasto todavía estaba y se borró. */
  gastoBorrado?: boolean;
  /** Al deshacer: el efectivo que había salido del cajón. */
  devolucion?:
    | { estado: "sin-egreso" }
    | { estado: "devuelto" | "cerrada" | "ya-devuelto"; monto: number; dia: string }
    | null;
  retiro: RetiroFila;
}

/** Datos de la pestaña Retiros y la acción que los resuelve (el servidor decide todo). */
export function useRetiros(filtros: FiltrosHistorial = FILTROS_INICIALES) {
  const [datos, setDatos] = useState<DatosRetiros | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Sólo la última lectura pinta: cambiar de filtro rápido no deja la lista del filtro anterior. */
  const ultima = useRef(0);

  const qs = consulta(filtros);

  const recargar = useCallback(async () => {
    const esta = ++ultima.current;
    setCargando(true);
    try {
      const res = await tenantFetch(`/api/admin/delivery/payouts${qs}`);
      const body = (await res.json().catch(() => null)) as (DatosRetiros & { error?: string }) | null;
      if (!res.ok || !body) throw new Error(body?.error ?? `No pudimos leer los retiros (HTTP ${res.status}).`);
      if (esta !== ultima.current) return;
      setDatos(body);
      setError(null);
    } catch (err) {
      if (esta === ultima.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (esta === ultima.current) setCargando(false);
    }
  }, [qs]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  /** Devuelve la respuesta o lanza con el mensaje del servidor (409/400/403 en palabras). */
  const resolver = useCallback(
    async (id: string, cuerpo: CuerpoAccion): Promise<RespuestaAccion> => {
      let res: Response;
      try {
        res = await tenantFetch(`/api/admin/delivery/payouts/${encodeURIComponent(id)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cuerpo),
        });
      } catch {
        void recargar();
        throw new ErrorAccionRetiro("Se cortó la conexión y no sabemos si se guardó. Reintentar no paga dos veces: si ya quedó, te lo decimos.", true);
      }
      const body = (await res.json().catch(() => null)) as (RespuestaAccion & { error?: string; message?: string }) | null;
      if (!res.ok || !body) {
        const incierto = res.status >= 500 || (res.ok && !body);
        if (incierto) void recargar();
        throw new ErrorAccionRetiro(
          incierto
            ? "El servidor no confirmó. Reintentar no paga dos veces: si ya quedó, te lo decimos."
            : (body?.message ?? body?.error ?? `HTTP ${res.status}`),
          incierto,
        );
      }
      await recargar();
      return body;
    },
    [recargar],
  );

  /** CSV del historial con los mismos filtros (hasta 2000 filas). Devuelve cuántas bajó. */
  const exportar = useCallback(async (): Promise<number> => {
    const res = await tenantFetch(`/api/admin/delivery/payouts${consulta(filtros, { exportar: "1" })}`);
    const body = (await res.json().catch(() => null)) as (DatosRetiros & { error?: string }) | null;
    if (!res.ok || !body) throw new Error(body?.error ?? `No se pudo exportar (HTTP ${res.status}).`);
    const filas: RetiroParaCsv[] = body.historial;
    const blob = new Blob(["\uFEFF", csvDeRetiros(filas)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `retiros${filtros.desde ? `-desde-${filtros.desde}` : ""}${filtros.hasta ? `-hasta-${filtros.hasta}` : ""}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return filas.length;
  }, [filtros]);

  /** Anota (o quita, con `motivo` null) por qué una alerta no es un problema. No toca ningún retiro. */
  const justificar = useCallback(
    async (clave: string, motivo: string | null): Promise<JustificacionAlerta | null> => {
      const res = await tenantFetch("/api/admin/delivery/payouts/alertas", {
        method: "POST",
        headers: { "Content-Type": "application/json" }, // tenantFetch pone el CSRF en POST
        body: JSON.stringify({ clave, motivo }),
      });
      const body = (await res.json().catch(() => null)) as { revisada?: JustificacionAlerta | null; error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      await recargar();
      return body?.revisada ?? null;
    },
    [recargar],
  );

  return { datos, cargando, error, recargar, resolver, exportar, justificar };
}
