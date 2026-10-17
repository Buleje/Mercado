/**
 * Los tres caminos por los que sale el alta de «Nuevo adelanto» (ADR-448).
 *
 * | Qué se registra                          | Endpoint                                   |
 * |------------------------------------------|--------------------------------------------|
 * | dar · adelanto por servicio · préstamo   | `POST /api/adelantos`                      |
 * | abono a UN adelanto                      | `POST /api/adelantos/[id]/entregas`        |
 * | abono repartido entre varios             | `GET cuentas/partidas` → `POST cuentas/liquidaciones` (ADR-413, atómico, código LIQ) |
 *
 * Los tres llevan `idempotencyKey`: una por intento de guardar. Si la respuesta
 * se pierde y se aprieta otra vez, el servidor reconoce el mismo intento
 * (`repetido`) y no da la plata dos veces.
 *
 * Fuera del hook para que el hook sea sólo estado: acá no hay React.
 */

import { leerJson } from "@/lib/errores/sin-dato";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import type { IntencionLiquidacion } from "@/lib/cuentas/liquidacion";

const jsonHeaders = () => csrfHeaders({ "Content-Type": "application/json" });

/**
 * `status` = el servidor contestó (el intento terminó); ausente = no hubo
 * respuesta. `codigo` = el `error` de máquina, cuando el llamador decide algo con él.
 */
export type Envio<T> = { ok: true; data: T } | { ok: false; error: string; status?: number; codigo?: string };

/** Lo recibido (alta, devolución en plata, anular con devolución) lo registra el dueño o un administrador. */
export const SIN_PERMISO = "Esto lo registra el dueño o un administrador.";

/**
 * El mismo intento llegó dos veces con OTRO cuerpo (se cambió el monto después
 * de un corte): el servidor guardó el primero y no lo pisa.
 */
export const INTENTO_DISTINTO =
  "Ese intento ya estaba guardado con otros datos: quedó el primero y no se volvió a dar la plata. Revisa la lista.";

/**
 * ¿La clave del intento se puede cambiar? Sólo ante un 4xx: el servidor dijo
 * que NO guardó. Ante un 5xx o un corte el alta pudo quedar guardada, y con una
 * clave nueva el reintento la daría dos veces. `idempotencia_distinta` también
 * es un 4xx, pero ahí SÍ quedó guardado el primero.
 */
export const puedeCambiarDeClave = (r: { status?: number; codigo?: string }): boolean =>
  r.status != null && r.status >= 400 && r.status < 500 && r.codigo !== "idempotencia_distinta";

type Respuesta = {
  id?: string;
  codigoOperacion?: string | null;
  montoAdelantado?: number;
  direccion?: unknown;
  caja?: { sinCaja?: boolean } | null;
  repetido?: boolean;
  error?: string;
  message?: string;
  issues?: unknown[];
};

/** Lo que viene de Zod en inglés («Too big…») se dice en español; lo propio del servidor ya viene en español. */
const CAMPO: Record<string, string> = {
  notas: "las notas (hasta 1000 letras; repartido, hasta 500)",
  reciboManual: "el N° de recibo (hasta 60)",
  montoAdelantado: "el monto",
  valorManual: "el monto",
  descripcion: "la descripción",
};
export function mensajeDeValidacion(issue: unknown): string | null {
  const msg = typeof issue === "string" ? issue : typeof issue === "object" && issue ? (issue as { message?: unknown }).message : null;
  if (typeof msg !== "string" || !msg) return null;
  if (!/^(too (big|small)|invalid|expected|required)/i.test(msg)) return msg;
  const ruta = typeof issue === "object" && issue ? String((issue as { path?: unknown }).path ?? "") : "";
  const campo = CAMPO[ruta.split(".").pop() ?? ""];
  return campo ? `Revisa ${campo}.` : "Algún dato no es válido: revisa el monto, las notas y el recibo.";
}

async function enviar(url: string, body: unknown, contexto: string): Promise<Envio<Respuesta>> {
  try {
    const res = await fetch(url, { method: "POST", headers: jsonHeaders(), credentials: "include", body: JSON.stringify(body) });
    const j = await leerJson<Respuesta>(res);
    if (res.ok) return { ok: true, data: j ?? {} };
    if (res.status === 403) return { ok: false, error: SIN_PERMISO, status: 403, codigo: j?.error };
    if (res.status === 422 && j?.error === "idempotencia_distinta") {
      return { ok: false, error: INTENTO_DISTINTO, status: 422, codigo: "idempotencia_distinta" };
    }
    const deValidacion = (res.status === 400 || res.status === 422) && Array.isArray(j?.issues) ? mensajeDeValidacion(j.issues[0]) : null;
    return {
      ok: false,
      error: deValidacion ?? mensajeDeValidacion(j?.message) ?? j?.error ?? `No se pudo guardar (${res.status}).`,
      status: res.status,
      codigo: j?.error,
    };
  } catch (e) {
    logger.error(`[adelantos] ${contexto}`, { error: String(e) });
    return { ok: false, error: "No se pudo guardar. Revisa la conexión." };
  }
}

/** Dar, adelanto por servicio o préstamo: crea el adelanto. */
export const crearAdelanto = (body: Record<string, unknown>) => enviar("/api/adelantos", body, "no se pudo crear el adelanto");

/** El abono cae sobre un solo adelanto: una entrega libre que entra a la caja. */
export const abonarAUno = (adelantoId: string, body: Record<string, unknown>) =>
  enviar(`/api/adelantos/${encodeURIComponent(adelantoId)}/entregas`, body, "no se pudo registrar el abono");

/**
 * El abono se reparte entre varios adelantos. Va por Liquidar porque es la
 * única vía atómica: dos entregas sueltas podían quedar a medias. Pide la
 * huella de la cuenta justo antes, así un cambio en otra pestaña no se pisa.
 */
export async function abonarRepartido(
  beneficiarioId: string,
  intencion: IntencionLiquidacion,
  idempotencyKey: string,
): Promise<Envio<{ codigo: string | null; sinCaja: boolean; repetido: boolean }>> {
  try {
    const r = await fetch(`/api/adelantos/cuentas/partidas?beneficiario=${encodeURIComponent(beneficiarioId)}`, {
      credentials: "include",
      cache: "no-store",
    });
    if (r.status === 403) return { ok: false, error: "Repartir entre varios lo confirma un administrador. Elige un solo adelanto.", status: 403 };
    const p = await leerJson<{ huella?: string }>(r);
    if (!r.ok || !p?.huella) return { ok: false, error: "No se pudo leer la cuenta para repartir el abono.", status: r.ok ? undefined : r.status };
    const res = await enviar(
      "/api/adelantos/cuentas/liquidaciones",
      { idempotencyKey, persona: { beneficiarioId }, ...intencion, huella: p.huella },
      "no se pudo repartir el abono",
    );
    if (!res.ok) return res;
    const d = res.data as { liquidacion?: { codigo?: string | null; caja?: { resultado?: string | null } }; repetida?: boolean };
    return { ok: true, data: { codigo: d.liquidacion?.codigo ?? null, sinCaja: d.liquidacion?.caja?.resultado === "sin_caja", repetido: !!d.repetida } };
  } catch (e) {
    logger.error("[adelantos] no se pudo repartir el abono", { error: String(e) });
    return { ok: false, error: "No se pudo repartir el abono. Revisa la conexión." };
  }
}
