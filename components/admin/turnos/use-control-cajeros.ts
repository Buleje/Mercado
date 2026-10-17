"use client";

import { useCallback, useEffect, useState } from "react";
import type { DetalleQuitado, QuitadosDeCajero } from "@/lib/pos/quitados";
import type { Cajero } from "./tipos";

/** Una fila de `GET /api/pos/cajeros-mes`. */
export type FilaControlCajero = {
  clave: string;
  descuentos: { monto: number; tickets: number };
  quitados: QuitadosDeCajero;
};

export type EstadoCarga = "cargando" | "error" | "sin-permiso" | "listo";

/** El nombre de una clave de la base (`username` o, en ventas viejas, el id). */
export function nombreDeClave(clave: string, cajeros: Cajero[]): string {
  const c = cajeros.find((x) => x.username === clave || x.id === clave);
  return c?.name?.trim() || c?.username || clave;
}

/**
 * Descuentos y productos quitados del mes por cajero (Turnos › Cajeros). Un
 * 403 (cajero: ve sólo lo suyo en otras pantallas) deja el bloque sin dibujar.
 */
export function useControlCajeros() {
  const [estado, setEstado] = useState<EstadoCarga>("cargando");
  const [filas, setFilas] = useState<FilaControlCajero[]>([]);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vivo = true;
    fetch("/api/pos/cajeros-mes")
      .then(async (res) => {
        if (!vivo) return;
        if (res.status === 401 || res.status === 403) { setEstado("sin-permiso"); return; }
        if (!res.ok) { setEstado("error"); return; }
        const data = (await res.json()) as { cajeros?: FilaControlCajero[] };
        if (!vivo) return;
        setFilas(Array.isArray(data.cajeros) ? data.cajeros : []);
        setEstado("listo");
      })
      .catch((err) => {
        console.warn("[Turnos] control de cajeros", err);
        if (vivo) setEstado("error");
      });
    return () => { vivo = false; };
  }, [intento]);

  const reintentar = useCallback(() => { setEstado("cargando"); setIntento((n) => n + 1); }, []);
  return { estado, filas, reintentar };
}

export type QuitadoDelCajero = { id: string; creadoEn: string; detalle: DetalleQuitado };

/** El detalle de lo que quitó un cajero este mes (el «⋯» de su fila). `usuario` null = cerrado. */
export function useQuitadosDeCajero(usuario: string | null) {
  const [estado, setEstado] = useState<EstadoCarga>("cargando");
  const [quitados, setQuitados] = useState<QuitadoDelCajero[]>([]);

  useEffect(() => {
    if (!usuario) return;
    let vivo = true;
    setEstado("cargando");
    fetch(`/api/pos/quitado?usuario=${encodeURIComponent(usuario)}`)
      .then(async (res) => {
        if (!vivo) return;
        if (!res.ok) { setEstado(res.status === 403 ? "sin-permiso" : "error"); return; }
        const data = (await res.json()) as { quitados?: QuitadoDelCajero[] };
        if (!vivo) return;
        setQuitados(Array.isArray(data.quitados) ? data.quitados : []);
        setEstado("listo");
      })
      .catch((err) => {
        console.warn("[Turnos] quitados del cajero", err);
        if (vivo) setEstado("error");
      });
    return () => { vivo = false; };
  }, [usuario]);

  return { estado, quitados };
}
