"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { tenantFetch } from "@/lib/tenant-fetch";

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
  puedeResolver: boolean;
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
export function useRetiros(filtro: FiltroHistorial = "todos") {
  const [datos, setDatos] = useState<DatosRetiros | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Sólo la última lectura pinta: cambiar de filtro rápido no deja la lista del filtro anterior. */
  const ultima = useRef(0);

  const recargar = useCallback(async () => {
    const esta = ++ultima.current;
    setCargando(true);
    try {
      const qs = filtro === "todos" ? "" : `?historial=${filtro}`;
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
  }, [filtro]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  /** Devuelve la respuesta o lanza con el mensaje del servidor (409/400/403 en palabras). */
  const resolver = useCallback(
    async (id: string, cuerpo: CuerpoAccion): Promise<RespuestaAccion> => {
      const res = await tenantFetch(`/api/admin/delivery/payouts/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const body = (await res.json().catch(() => null)) as (RespuestaAccion & { error?: string; message?: string }) | null;
      if (!res.ok || !body) throw new Error(body?.message ?? body?.error ?? `HTTP ${res.status}`);
      await recargar();
      return body;
    },
    [recargar],
  );

  return { datos, cargando, error, recargar, resolver };
}
