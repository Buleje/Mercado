/**
 * Enlace PÚBLICO de solo ver de una cotización (noche 04-11, tramo 1).
 *
 * El negocio arma la cotización en el panel y le manda al cliente un enlace que
 * abre SIN clave. Igual que el estado de cuenta (`lib/fiado/statement-token.ts`):
 * sin tabla ni migración, firmado con HMAC y con fecha de vencimiento.
 *
 * Token = base64url(payload).firma con payload = `cot.${tenantId}.${cotizacionId}.${exp}`.
 * Dos candados para que un token de estado de cuenta NUNCA sirva acá (ni al revés):
 *   1. el payload lleva el propósito `cot` y 4 partes (el de estado de cuenta tiene 3);
 *   2. la firma se calcula con un prefijo de dominio propio, así que aunque los
 *      payloads coincidieran la firma no.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const PROPOSITO = "cot";
const DOMINIO_FIRMA = "buleje:cotizacion-enlace:v1\n";
const DIA_MS = 24 * 60 * 60 * 1000;

/** Días que el enlace sigue abriendo después de la vigencia (el cliente ve «vencida»). */
export const GRACIA_TRAS_VIGENCIA_MS = 7 * DIA_MS;
/** Vida del enlace si la cotización no trae una vigencia legible. */
export const VIDA_SIN_VIGENCIA_MS = 30 * DIA_MS;
/** Un enlace recién pedido nunca nace muerto: aunque la cotización ya venció, abre una semana. */
export const VIDA_MINIMA_MS = 7 * DIA_MS;

/** Mismo origen que el estado de cuenta; se lee en cada llamada (sin secreto en el código). */
function secreto(): string {
  return process.env.FIADO_STATEMENT_SECRET ?? process.env.AUTH_SECRET ?? "";
}

function firmar(payload: string, clave: string): Buffer {
  return createHmac("sha256", clave).update(DOMINIO_FIRMA + payload).digest();
}

/** Cuánto vive el enlace desde `ahora`: vigencia + 7 días, 30 días sin vigencia, nunca menos de 7. */
export function vidaDelEnlace(validoHasta: string | Date | null | undefined, ahora: number = Date.now()): number {
  const vence = validoHasta == null ? Number.NaN : new Date(validoHasta).getTime();
  if (!Number.isFinite(vence)) return VIDA_SIN_VIGENCIA_MS;
  return Math.max(vence + GRACIA_TRAS_VIGENCIA_MS - ahora, VIDA_MINIMA_MS);
}

/**
 * Firma el enlace de una cotización. `null` si falta el secreto del servidor o si
 * los ids traen un punto (rompería el formato): en ese caso no se genera nada.
 */
export function generarTokenCotizacion(
  tenantId: string,
  cotizacionId: string,
  venceEnMs: number,
  ahora: number = Date.now(),
): string | null {
  const clave = secreto();
  if (!clave || !tenantId || !cotizacionId) return null;
  if (tenantId.includes(".") || cotizacionId.includes(".")) return null;
  const exp = Math.floor(ahora + venceEnMs);
  const payload = `${PROPOSITO}.${tenantId}.${cotizacionId}.${exp}`;
  return `${Buffer.from(payload).toString("base64url")}.${firmar(payload, clave).toString("base64url")}`;
}

export type TokenCotizacion =
  | { valido: true; tenantId: string; cotizacionId: string; venceEl: Date }
  | { valido: false; motivo: "malformado" | "vencido" | "firma" | "sin_secreto" };

export function verificarTokenCotizacion(token: string, ahora: number = Date.now()): TokenCotizacion {
  const clave = secreto();
  if (!clave) return { valido: false, motivo: "sin_secreto" };
  if (typeof token !== "string" || token.length > 400) return { valido: false, motivo: "malformado" };

  const punto = token.lastIndexOf(".");
  if (punto <= 0) return { valido: false, motivo: "malformado" };
  const cuerpo = token.slice(0, punto);
  const firma = token.slice(punto + 1);

  const payload = Buffer.from(cuerpo, "base64url").toString("utf8");
  const partes = payload.split(".");
  if (partes.length !== 4) return { valido: false, motivo: "malformado" };
  const [proposito, tenantId, cotizacionId, expTexto] = partes;
  if (proposito !== PROPOSITO || !tenantId || !cotizacionId || !/^\d+$/.test(expTexto ?? "")) {
    return { valido: false, motivo: "malformado" };
  }

  // La firma primero: un token alterado no llega a decir si «venció».
  const recibida = Buffer.from(firma, "base64url");
  const esperada = firmar(payload, clave);
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) {
    return { valido: false, motivo: "firma" };
  }

  const exp = Number(expTexto);
  if (exp < ahora) return { valido: false, motivo: "vencido" };
  return { valido: true, tenantId, cotizacionId, venceEl: new Date(exp) };
}
