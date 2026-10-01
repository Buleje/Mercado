"use client";

/**
 * Conexión DIRECTA con el aparato (ADR-421): conectar, volver a probar y mover.
 *
 * No pasan por `escribir` de `useCamaras`: acá hace falta el cuerpo del error
 * tal cual lo manda el servidor (`motivo`/`detalle`) para traducirlo a qué
 * hacer, y `escribir` lo aplana en una sola frase. La guarda de carga vieja sí
 * se respeta: se cuenta el cambio y se recarga en silencio al terminar.
 */

import { useCallback } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  queHacer,
  type CamaraConConexion,
  type ConexionCamara,
  type DatosConexion,
  type ResultadoConexion,
} from "./ConectarCamaraModal";
import { API_CAMARAS } from "./camaras-ui";
import type { DatosCamaras } from "./use-camaras";

type Necesita = Pick<
  DatosCamaras,
  "setCamaras" | "marcarCambio" | "cargar" | "setError" | "setAviso"
>;

export function useConexionDirecta({
  setCamaras,
  marcarCambio,
  cargar,
  setError,
  setAviso,
}: Necesita) {
  const pedirConexion = useCallback(
    async (cuerpo: Record<string, unknown>, camaraId: string): Promise<ResultadoConexion> => {
      marcarCambio();
      try {
        const r = await fetch(API_CAMARAS, {
          method: "PATCH",
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(cuerpo),
        });
        const j = (await r.json().catch(() => ({}))) as {
          camaras?: CamaraConConexion[];
          conexion?: ConexionCamara | null;
          motivo?: string;
          detalle?: string;
          error?: string;
          message?: string;
          respondio?: boolean;
        };
        if (j.camaras) setCamaras(j.camaras);
        /* Estas acciones contestan 200 con el problema ADENTRO del cuerpo: el
           `r.ok` solo no alcanza. `respondio: false` es «probar» diciendo que la
           cámara no contestó, aunque la conexión guardada siga ahí. */
        const conexion = j.conexion ?? j.camaras?.find((x) => x.id === camaraId)?.conexion ?? null;
        const fallo = !r.ok || Boolean(j.error) || j.respondio === false;
        if (!fallo && conexion) return { ok: true, conexion };
        return {
          ok: false,
          motivo: j.motivo ?? j.error ?? "",
          detalle: j.detalle ?? j.message ?? `El servidor respondió ${r.status}.`,
        };
      } catch (e) {
        /* Ni siquiera salió el pedido: el panel no llegó a su propio servidor. */
        return {
          ok: false,
          motivo: "inalcanzable",
          detalle: e instanceof Error ? e.message : String(e),
        };
      } finally {
        void cargar({ silenciosa: true });
      }
    },
    [cargar, marcarCambio, setCamaras],
  );

  const conectar = (c: CamaraConConexion, datos: DatosConexion) =>
    pedirConexion({ id: c.id, accion: "conectar", ...datos }, c.id);

  const probarDeNuevo = async (c: CamaraConConexion) => {
    setError(null);
    const r = await pedirConexion({ id: c.id, accion: "probar" }, c.id);
    if (!r.ok) setError(queHacer(r.motivo, r.detalle));
    else setAviso(`${c.nombre} contestó: la conexión funciona.`);
  };

  /**
   * Mover la cámara. Va sin esperar respuesta a propósito: entre que se aprieta
   * y se suelta pasan décimas, y encolar la vuelta del servidor haría que la
   * cámara siguiera girando después de soltar el botón.
   */
  const moverCamara = (c: CamaraConConexion, x: number, y: number, zoom: number) => {
    void fetch(API_CAMARAS, {
      method: "PATCH",
      credentials: "include",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id: c.id, accion: "ptz", x, y, zoom }),
    })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { error?: string; message?: string };
        if (!r.ok || j.error) setError(j.message ?? `No se pudo mover ${c.nombre}.`);
      })
      .catch((e: unknown) =>
        setError(`No se pudo mover ${c.nombre}: ${e instanceof Error ? e.message : String(e)}`),
      );
  };

  return { conectar, probarDeNuevo, moverCamara };
}
