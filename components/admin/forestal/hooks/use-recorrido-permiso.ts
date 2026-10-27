"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import {
  leerEstadoRecorrido,
  leerRespuestaEjecutar,
  mensajeDeError,
  TOPE_VUELTAS_RECORRIDO,
  type EjecutadoDelRecorrido,
} from "@/lib/forestal/recorrido-pantalla";
import type { EstadoRecorrido, RecorridoEjecutar } from "@/lib/forestal/recorrido-permiso";

/**
 * use-recorrido-permiso — el GET y el POST del «Recorrido del permiso»
 * (ADR-519, contrato `recorrido-permiso.ts`).
 *
 * El estado no vive acá: el servidor lo deriva del Libro en cada lectura.
 * Cerrar el modal y volver relee y sigue desde `siguiente`. Una lectura vieja
 * que llega tarde no pisa a la nueva (contador de pedidos).
 *
 * La cubicación no se guarda en el servidor: el GET lleva lo que el bloque
 * ampara en la pantalla (`usadoM3`) y el POST, sus días repartidos (`porDia`),
 * los mismos que usa «Registrar jornadas». Sin `porDia`, jornadas vuelve con
 * `FALTA_REPARTO`.
 */

export const URL_RECORRIDO = "/api/admin/forestal/distribuciones/recorrido";

export interface ResultadoRecorrido {
  ok: boolean;
  mensaje: string | null;
  code?: string;
  /** Lo que el servidor escribió, sumando todas las vueltas. */
  ejecutados?: EjecutadoDelRecorrido[];
}

export interface DelBloqueEnPantalla {
  /** `BloqueDistribuido.usadoM3`: lo que el bloque ampara en la distribución. */
  usadoM3?: number;
  /** `BloqueDistribuido.porDia`: los días tal como los reparte la pantalla. */
  porDia?: RecorridoEjecutar["porDia"];
}

export function useRecorridoPermiso(distribucionId: string | null, bloqueId: string | null, delBloque: DelBloqueEnPantalla = {}) {
  const [estado, setEstado] = useState<EstadoRecorrido | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ejecutando, setEjecutando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoRecorrido | null>(null);
  const pedido = useRef(0);
  /* Los días cambian de referencia en cada reparto: van por ref para no rehacer `ejecutar`. */
  const porDia = useRef(delBloque.porDia);
  porDia.current = delBloque.porDia;
  /* Cerrado el modal a mitad de las vueltas, no se sigue escribiendo: al volver, sigue desde `siguiente`. */
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);
  const usadoM3 = delBloque.usadoM3 != null && Number.isFinite(delBloque.usadoM3) ? Math.max(0, delBloque.usadoM3) : null;

  const leer = useCallback(async (): Promise<EstadoRecorrido | null> => {
    if (!distribucionId || !bloqueId) {
      setEstado(null);
      return null;
    }
    const n = ++pedido.current;
    setCargando(true);
    setError(null);
    try {
      const q = new URLSearchParams({ distribucionId, bloqueId });
      if (usadoM3 != null) q.set("usadoM3", String(usadoM3));
      const r = await fetch(`${URL_RECORRIDO}?${q.toString()}`, { credentials: "include", cache: "no-store" });
      const json: unknown = await r.json().catch(() => null);
      if (n !== pedido.current) return null;
      if (!r.ok) throw new Error(mensajeDeError(json, r.status).mensaje);
      const e = leerEstadoRecorrido(json);
      if (!e) throw new Error("El servidor no devolvió los pasos del recorrido.");
      setEstado(e);
      return e;
    } catch (err) {
      if (n === pedido.current) setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      if (n === pedido.current) setCargando(false);
    }
  }, [distribucionId, bloqueId, usadoM3]);

  useEffect(() => {
    setResultado(null);
    void leer();
  }, [leer]);

  /**
   * Ejecuta los pasos que hace el servidor (lote y jornadas), uno por
   * transacción. Si se le acaba el tiempo responde `continuar: true` y se le
   * vuelve a pedir con el mismo `hasta`, con el botón ocupado, hasta el tope.
   */
  const ejecutar = useCallback(
    async (hasta: RecorridoEjecutar["hasta"]): Promise<EstadoRecorrido | null> => {
      if (!distribucionId || !bloqueId || ejecutando) return null;
      setEjecutando(true);
      setResultado(null);
      const escritos: EjecutadoDelRecorrido[] = [];
      try {
        /* `usadoM3` también va en el POST: el estado que devuelve trae «amparado»
           y sin él el servidor usa la capacidad del bloque (hoy el contrato lo
           descarta; queda listo para cuando lo lea). */
        const body: RecorridoEjecutar & { usadoM3?: number } = {
          distribucionId,
          bloqueId,
          hasta,
          porDia: porDia.current,
          ...(usadoM3 != null ? { usadoM3 } : {}),
        };
        let ultimo: EstadoRecorrido | null = null;
        for (let vuelta = 1; ; vuelta++) {
          const r = await fetch(URL_RECORRIDO, {
            method: "POST",
            credentials: "include",
            headers: csrfHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify(body),
          });
          const json: unknown = await r.json().catch(() => null);
          if (!r.ok) {
            const { mensaje, code } = mensajeDeError(json, r.status);
            setResultado({ ok: false, mensaje, code, ejecutados: escritos });
            /* Un paso pudo quedar escrito antes del que falló: se relee. */
            return await leer();
          }
          const resp = leerRespuestaEjecutar(json);
          escritos.push(...resp.ejecutados);
          if (resp.estado) {
            /* El estado que trae (derivado del Libro tras escribir) vale más que una lectura en vuelo. */
            pedido.current += 1;
            setEstado(resp.estado);
            ultimo = resp.estado;
          }
          if (!resp.continuar || !montado.current) break;
          if (vuelta >= TOPE_VUELTAS_RECORRIDO) {
            setResultado({
              ok: false,
              mensaje: `Se registraron ${escritos.length} pasos y todavía quedan días: vuelve a tocar «Registrar» para seguir.`,
              ejecutados: escritos,
            });
            return ultimo ?? (await leer());
          }
        }
        const e = ultimo ?? (await leer());
        setResultado({ ok: true, mensaje: null, ejecutados: escritos });
        return e;
      } catch (err) {
        setResultado({ ok: false, mensaje: err instanceof Error ? err.message : String(err), ejecutados: escritos });
        return escritos.length > 0 ? await leer() : null;
      } finally {
        /* Lo mismo que «Registrar jornadas»: Capacidad, Consumos y Producción
           no pueden quedarse con el Libro de antes. Va aunque la respuesta sea
           un error: un paso pudo quedar escrito antes del que falló. */
        invalidarCtp("/forestal/");
        setEjecutando(false);
      }
    },
    [distribucionId, bloqueId, usadoM3, ejecutando, leer],
  );

  return { estado, cargando, error, recargar: leer, ejecutar, ejecutando, resultado };
}

export type EstadoHookRecorrido = ReturnType<typeof useRecorridoPermiso>;
