"use client";

/**
 * Los tratos de precio de UN cliente (ADR-430): leerlos, guardar una versión y
 * darla de baja. Es el mismo dato que usa el servidor al cobrar: la pantalla
 * resuelve la vista previa con `tarifaVigente` + `precioDelCliente` sobre lo
 * que devuelve este hook, con los MISMOS argumentos que `cobrarCorrida`.
 *
 * `parteId` null = no hay cliente elegido: no se pide nada.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import type { ServicioPrecio, TarifaCliente, TarifaClienteInput } from "@/lib/forestal/precio-cliente";

const URL_BASE = "/api/admin/forestal/tarifas-cliente";

/**
 * Se avisa en `window` cuando un trato se guarda o se quita. Las vistas previas
 * abiertas a la vez (el cubicador, el despacho, un cobro) lo escuchan y vuelven
 * a leer ese cliente: sin esto seguían cotizando con el trato viejo hasta
 * cerrar la pantalla.
 */
export const EVENTO_TRATOS_CLIENTE = "forestal:tratos-cliente";
export interface DetalleTratosCliente {
  parteId: string;
  origen: number;
}
let siguienteOrigen = 0;

function avisarCambio(parteId: string, origen: number): void {
  try {
    window.dispatchEvent(new CustomEvent<DetalleTratosCliente>(EVENTO_TRATOS_CLIENTE, { detail: { parteId, origen } }));
  } catch (err) {
    logger.warn("[tarifas-cliente] no se pudo avisar el cambio", { parteId, error: String(err) });
  }
}

export function useTarifasCliente(parteId: string | null | undefined) {
  const [tarifas, setTarifas] = useState<TarifaCliente[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Una respuesta vieja (de otro cliente elegido antes) no pisa la de ahora. */
  const pedido = useRef(0);

  const cargar = useCallback(async () => {
    const id = parteId?.trim();
    const mio = ++pedido.current;
    if (!id) {
      setTarifas([]);
      setError(null);
      setCargando(false);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const r = await fetch(`${URL_BASE}?parteId=${encodeURIComponent(id)}`, { credentials: "include", cache: "no-store" });
      if (!r.ok) throw new Error(`No se pudieron leer los precios del cliente (${r.status})`);
      const j = (await r.json()) as { tarifas?: TarifaCliente[] };
      if (mio === pedido.current) setTarifas(j.tarifas ?? []);
    } catch (e) {
      if (mio === pedido.current) setError(e instanceof Error ? e.message : String(e));
      logger.warn("[tarifas-cliente] lectura fallida", { parteId: id, error: String(e) });
    } finally {
      if (mio === pedido.current) setCargando(false);
    }
  }, [parteId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /* Otro lugar de la pantalla guardó o quitó un trato de ESTE cliente. El que
     lo guardó ya relee solo (`origen` propio): no se pide dos veces. */
  const [origen] = useState(() => ++siguienteOrigen);
  useEffect(() => {
    const alCambiar = (e: Event) => {
      const d = (e as CustomEvent<DetalleTratosCliente>).detail;
      if (d && d.origen !== origen && d.parteId === parteId?.trim()) void cargar();
    };
    window.addEventListener(EVENTO_TRATOS_CLIENTE, alCambiar);
    return () => window.removeEventListener(EVENTO_TRATOS_CLIENTE, alCambiar);
  }, [cargar, parteId, origen]);

  const guardar = useCallback(
    async (input: TarifaClienteInput): Promise<TarifaCliente> => {
      const r = await fetch(URL_BASE, {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(input),
      });
      const j = (await r.json().catch(() => ({}))) as { tarifa?: TarifaCliente; message?: string; error?: string };
      if (!r.ok || !j.tarifa) throw new Error(j.message ?? j.error ?? `No se pudo guardar el precio (${r.status})`);
      avisarCambio(j.tarifa.parteId, origen);
      await cargar();
      return j.tarifa;
    },
    [cargar, origen],
  );

  const quitar = useCallback(
    async (id: string): Promise<void> => {
      const r = await fetch(`${URL_BASE}?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
        headers: csrfHeaders(),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(j.message ?? j.error ?? `No se pudo quitar el precio (${r.status})`);
      }
      if (parteId?.trim()) avisarCambio(parteId.trim(), origen);
      await cargar();
    },
    [cargar, parteId, origen],
  );

  /** Las versiones de un servicio, de la más nueva a la más vieja (para la ficha). */
  const deServicio = useCallback(
    (servicio: ServicioPrecio) => tarifas.filter((t) => t.servicio === servicio).slice().reverse(),
    [tarifas],
  );

  return { tarifas, cargando, error, recargar: cargar, guardar, quitar, deServicio };
}
