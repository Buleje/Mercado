"use client";

/**
 * Escrituras de las GTF preliminares del plan (`/api/admin/forestal/plan/preliminares`).
 * Leer viene con el saldo: `useSaldoDelPlan(planId, version, true, true)`.
 */

import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import { logger } from "@/lib/logger";
import type { DatosPreliminar, GtfPreliminar } from "@/lib/forestal/loth-plan-preliminares";

const RUTA = "/api/admin/forestal/plan/preliminares";

export type ResultadoPreliminar = { ok: true; guia: GtfPreliminar; mensaje: string | null } | { ok: false; mensaje: string };

type Respuesta = { guia?: GtfPreliminar; message?: string; error?: string };

async function enviar(method: "POST" | "PATCH", body: unknown, que: string): Promise<ResultadoPreliminar> {
  try {
    const r = await fetch(RUTA, {
      method,
      credentials: "include",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    const j = await leerJson<Respuesta>(r);
    if (r.ok && j?.guia) return { ok: true, guia: j.guia, mensaje: j.message ?? null };
    return { ok: false, mensaje: j?.message ?? j?.error ?? `No se pudo ${que} (${r.status}).` };
  } catch (err) {
    logger.warn(`[plan-preliminares] no se pudo ${que}`, { error: String(err) });
    return { ok: false, mensaje: `No se pudo ${que}: revisa la conexión y vuelve a intentar.` };
  }
}

/** Alta (sin `id`) o corrección (con `id`). */
export function guardarPreliminarDelPlan(planId: string, datos: DatosPreliminar, id?: string | null): Promise<ResultadoPreliminar> {
  return id
    ? enviar("PATCH", { planId, id, accion: "corregir", datos }, "corregir la guía")
    : enviar("POST", { planId, ...datos }, "anotar la guía");
}

export type CambioDeEstado = { accion: "registrada" } | { accion: "pendiente" } | { accion: "anular"; motivo: string };

export function cambiarEstadoDeLaPreliminar(planId: string, id: string, cambio: CambioDeEstado): Promise<ResultadoPreliminar> {
  return enviar("PATCH", { planId, id, ...cambio }, cambio.accion === "anular" ? "anular la guía" : "cambiar la guía");
}
