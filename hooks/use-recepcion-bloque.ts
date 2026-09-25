"use client";

/**
 * use-recepcion-bloque — mandar una tanda de recepciones, guía por guía.
 *
 * Una guía = un pedido (`recepcionar_guia`, ADR-351), y los pedidos van **en
 * serie**: el servidor recorre los asientos de cada guía en orden para que
 * ninguna quede partida entre la bandeja y el archivo, y mandar diez en
 * paralelo desde el navegador devolvería esa garantía al revés — diez guías a
 * medias en vez de una.
 *
 * Por eso también el resultado es por guía y no un contador: al recibir diez,
 * «fallaron 2» no sirve para nada; hay que poder decir CUÁLES y por qué.
 *
 * El costo viaja en el mismo acto (ADR-135): la factura del proveedor está
 * sobre la mesa justo cuando se recibe, y pasar después por Rentabilidad es el
 * camino que nadie hace —medido el 2026-09-15: 24 de 24 asientos sin costo—.
 */

import { useCallback, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";

/** Lo que hay que mandar por cada guía marcada. */
export interface PedidoDeGuia {
  clave: string;
  gtfNumber: string;
  /** Los asientos del libro de esa guía. */
  ids: string[];
  /** Su costo ya repartido entre los asientos; vacío = no se carga. */
  costos: { id: string; costoTotal: number }[];
  observacion?: string;
}

export interface FalloDeGuia {
  clave: string;
  gtfNumber: string;
  motivo: string;
}

export interface ResultadoBloque {
  recibidas: string[];
  fallaron: FalloDeGuia[];
  /** Guías recibidas a las que no se les pudo guardar el costo. */
  sinCosto: FalloDeGuia[];
}

const URL_GUIAS = "/api/admin/forestal/wood-entries";

export function useRecepcionBloque() {
  const [enviando, setEnviando] = useState(false);
  /** Cuántas guías ya se mandaron — para la barra de avance. */
  const [hechas, setHechas] = useState(0);

  const recibir = useCallback(
    async (pedidos: readonly PedidoDeGuia[], fecha: string): Promise<ResultadoBloque> => {
      setEnviando(true);
      setHechas(0);
      const salida: ResultadoBloque = { recibidas: [], fallaron: [], sinCosto: [] };
      try {
        for (const p of pedidos) {
          try {
            const res = await fetch(URL_GUIAS, {
              method: "PATCH",
              headers: csrfHeaders({ "Content-Type": "application/json" }),
              credentials: "include",
              body: JSON.stringify({
                action: "recepcionar_guia",
                ids: p.ids,
                fecha,
                ...(p.observacion?.trim() ? { observacion: p.observacion.trim() } : {}),
              }),
            });
            const datos = await leerJson<{ message?: string; error?: string; recepcionados?: number }>(res);
            if (!res.ok) {
              salida.fallaron.push({
                clave: p.clave,
                gtfNumber: p.gtfNumber,
                motivo: datos?.message ?? datos?.error ?? `HTTP ${res.status}`,
              });
              continue;
            }
            salida.recibidas.push(p.clave);
          } catch (err) {
            salida.fallaron.push({
              clave: p.clave,
              gtfNumber: p.gtfNumber,
              motivo: err instanceof Error ? err.message : String(err),
            });
            continue;
          } finally {
            setHechas((n) => n + 1);
          }

          /* El costo va DESPUÉS y aparte: si falla, la guía ya quedó recibida y
             eso no se deshace — se dice cuál quedó sin valorizar y se carga
             desde su propia fila, que ahora tiene el botón. */
          if (p.costos.length > 0) {
            const oks = await Promise.all(
              p.costos.map((c) =>
                fetch(`${URL_GUIAS}/${encodeURIComponent(c.id)}`, {
                  method: "PATCH",
                  headers: csrfHeaders({ "Content-Type": "application/json" }),
                  credentials: "include",
                  body: JSON.stringify({ action: "set_costo", costoTotal: c.costoTotal, moneda: "PEN" }),
                })
                  .then((r) => r.ok)
                  .catch(() => false),
              ),
            );
            if (oks.some((ok) => !ok)) {
              salida.sinCosto.push({
                clave: p.clave,
                gtfNumber: p.gtfNumber,
                motivo: "se recibió, pero el costo no se guardó",
              });
            }
          }
        }
        return salida;
      } finally {
        setEnviando(false);
      }
    },
    [],
  );

  return { enviando, hechas, recibir };
}
