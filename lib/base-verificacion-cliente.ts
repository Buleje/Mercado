/**
 * La base pública de los QR, pedida UNA vez por pestaña al servidor
 * (`GET /api/admin/tenant/url-publica`, regla en `lib/tenant-url-publica.ts`).
 *
 * Sin respaldo a `window.location.origin` a propósito: un QR impreso con el
 * host equivocado abre otro negocio (o «no encontrado») en el celular del
 * inspector, y eso es peor que un botón que espera un segundo. Si falla, se
 * tira un error con texto para la persona y el próximo intento vuelve a pedir.
 *
 * Client-safe (sin React): lo usan los armadores de papeles de `lib/forestal`
 * y el hook `useBaseVerificacion`.
 */

import { RespuestaUrlPublicaSchema, type RespuestaUrlPublica } from "@/lib/tenant-url-publica";

let enCurso: Promise<RespuestaUrlPublica> | null = null;
let pedidaEn = 0;
/** La base casi nunca cambia, pero un superadmin que pasa a otro negocio sin recargar no debe heredar la anterior. */
const VIGENCIA_MS = 5 * 60 * 1000;

async function pedir(): Promise<RespuestaUrlPublica> {
  const r = await fetch("/api/admin/tenant/url-publica", { credentials: "include", cache: "no-store" });
  const j: unknown = await r.json().catch(() => null);
  if (!r.ok) {
    const msg = j && typeof j === "object" && "message" in j && typeof j.message === "string" ? j.message : null;
    throw new Error(msg ?? `No se pudo saber la dirección pública del negocio (${r.status}).`);
  }
  const p = RespuestaUrlPublicaSchema.safeParse(j);
  if (!p.success) throw new Error("La dirección pública del negocio llegó incompleta. Vuelve a intentarlo.");
  return p.data;
}

/** `{ base, fuente }` del negocio de la sesión. */
export function obtenerUrlPublica(): Promise<RespuestaUrlPublica> {
  if (!enCurso || Date.now() - pedidaEn > VIGENCIA_MS) {
    pedidaEn = Date.now();
    enCurso = pedir().catch((err: unknown) => {
      enCurso = null;
      throw err instanceof Error ? err : new Error(String(err));
    });
  }
  return enCurso;
}

/** Sólo la base (`https://…` sin barra final), para armar las direcciones de los QR. */
export async function obtenerBaseVerificacion(): Promise<string> {
  return (await obtenerUrlPublica()).base;
}

/** Para los tests: olvida la base pedida. */
export function olvidarBaseVerificacion(): void {
  enCurso = null;
}
