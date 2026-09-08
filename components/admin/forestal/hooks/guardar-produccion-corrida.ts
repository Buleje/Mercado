"use client";

/**
 * Guardar la producción de una corrida que YA existe (ADR-361/365).
 *
 * Son dos acciones distintas del libro y la diferencia importa:
 *
 *  · `declarar` — la corrida nunca declaró (`quantity` nula). Es su PRIMERA
 *    declaración: escribe cantidad, unidad, línea y producto del asiento.
 *  · `ampliar`  — la corrida ya declaró y le queda margen bajo el tope. Sólo
 *    agrega paquetes; la fecha y la línea del asiento no se tocan.
 *
 * Vivía copiado en `CtpCorridaSinDeclarar` y `CtpProduccionPendiente`, y ahora
 * lo usa además el pegado del SNIFFS: tres copias del payload de un asiento del
 * libro es donde una de ellas se queda sin un campo.
 */

import { csrfHeaders } from "@/lib/csrf-client";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import type { ProduccionRegistrada } from "../CtpRegistrarProduccionModal";

export type ModoDeclaracion = "declarar" | "ampliar";

/** Los paquetes como los quiere el servidor. */
function paquetesParaServidor(datos: ProduccionRegistrada) {
  return datos.paquetes.map((p) => ({
    codigo: p.codigo,
    productType: p.productType,
    presentacion: p.presentacion,
    cantidad: p.cantidad,
    volumenM3: p.volumenM3,
    espesorCm: p.espesorCm,
    anchoCm: p.anchoCm,
    largoM: p.largoM,
    observations: p.observations || null,
  }));
}

export async function guardarProduccionDeCorrida(
  corridaId: string,
  modo: ModoDeclaracion,
  datos: ProduccionRegistrada,
): Promise<void> {
  const body =
    modo === "declarar"
      ? {
          action: "declarar_produccion",
          id: corridaId,
          quantity: datos.volumen,
          unit: "m3",
          lineaProduccion: datos.lineaProduccion,
          observations: datos.observaciones,
          pieces: datos.paquetes.reduce((a, p) => a + p.cantidad, 0),
          productType: datos.paquetes[0]?.productType ?? null,
          presentacion: datos.paquetes[0]?.presentacion ?? null,
          codigoProducto: datos.paquetes[0]?.codigo ?? null,
          paquetes: paquetesParaServidor(datos),
        }
      : {
          action: "ampliar_produccion",
          id: corridaId,
          observations: datos.observaciones,
          paquetes: paquetesParaServidor(datos),
        };

  const r = await fetch("/api/admin/forestal/ctp", {
    method: "PATCH",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    credentials: "include",
    body: JSON.stringify(body),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json?.message ?? json?.error ?? `El servidor respondió ${r.status}`);
  invalidarCtp("/forestal/");
}

/**
 * Los paquetes que la corrida ya declaró.
 *
 * Sin ellos el formulario propone un código que el servidor va a rechazar con
 * la tanda entera ya tipeada. Que falle no impide declarar: se avisa.
 */
export async function paquetesYaDeclarados(corridaId: string) {
  const r = await fetch(`/api/admin/forestal/ctp?entryId=${encodeURIComponent(corridaId)}`, {
    credentials: "include",
  });
  if (!r.ok) throw new Error(`El servidor respondió ${r.status}`);
  const j: { entry?: { paquetes?: unknown[] } } = await r.json();
  return (j.entry?.paquetes ?? []) as never[];
}
