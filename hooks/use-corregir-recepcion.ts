"use client";

/**
 * use-corregir-recepcion — corregir la fecha de llegada de varias guías ya
 * recibidas (ADR-434), una por pedido y EN SERIE.
 *
 * Cada guía es su propia transacción en el servidor (bloquea sus trozas y sus
 * asientos); en paralelo, dos guías que comparten corrida esperarían una a la
 * otra sin ganar nada. El resultado dice CUÁLES entraron y por qué no las
 * otras: «fallaron 2» no sirve parado en el patio.
 */

import { useCallback, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import { URL_RECEPCION } from "./use-contexto-de-llegada";

export interface PedidoDeCorreccion {
  gtfNumber: string;
  /** `AAAA-MM-DD`: el día que la madera llegó de verdad. */
  fecha: string;
}

export interface ResultadoCorreccion {
  corregidas: { gtfNumber: string; antes: string | null; despues: string; trozas: number }[];
  fallaron: { gtfNumber: string; motivo: string }[];
}

export function useCorregirRecepcion() {
  const [enviando, setEnviando] = useState(false);
  const [hechas, setHechas] = useState(0);

  const corregir = useCallback(
    async (pedidos: readonly PedidoDeCorreccion[], motivo: string): Promise<ResultadoCorreccion> => {
      setEnviando(true);
      setHechas(0);
      const salida: ResultadoCorreccion = { corregidas: [], fallaron: [] };
      try {
        for (const p of pedidos) {
          try {
            const res = await fetch(URL_RECEPCION, {
              method: "PATCH",
              headers: csrfHeaders({ "Content-Type": "application/json" }),
              credentials: "include",
              body: JSON.stringify({ action: "corregir_recepcion", gtfNumber: p.gtfNumber, fecha: p.fecha, motivo }),
            });
            const datos = await leerJson<{
              message?: string;
              error?: string;
              antes?: string | null;
              despues?: string;
              trozas?: number;
            }>(res);
            if (!res.ok) {
              salida.fallaron.push({
                gtfNumber: p.gtfNumber,
                motivo: datos?.message ?? datos?.error ?? `HTTP ${res.status}`,
              });
              continue;
            }
            salida.corregidas.push({
              gtfNumber: p.gtfNumber,
              antes: datos?.antes ?? null,
              despues: datos?.despues ?? p.fecha,
              trozas: datos?.trozas ?? 0,
            });
          } catch (err) {
            salida.fallaron.push({ gtfNumber: p.gtfNumber, motivo: err instanceof Error ? err.message : String(err) });
          } finally {
            setHechas((n) => n + 1);
          }
        }
        return salida;
      } finally {
        setEnviando(false);
      }
    },
    [],
  );

  return { enviando, hechas, corregir };
}
