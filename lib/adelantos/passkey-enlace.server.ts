import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { AdelantoFirmasDB, type EnlaceResuelto } from "@/lib/db/adelanto-firmas.db";
import { TOKEN_RE } from "./registro-firmas";
import { entornoRp, rpDelOrigen } from "./passkey-rp";
import type { ContextoPasskey } from "./passkey.server";
import type { CodigoErrorPasskey } from "./passkey-tipos";

/**
 * ADR-513 — lo común de las rutas públicas de la passkey: el token del enlace
 * es la credencial (sha256, vence, un uso, como `…/firmar`) y de él salen el
 * negocio, el adelanto y la persona; el origen, de la lista de la config.
 * La respuesta nunca lleva ids.
 */

export const MENSAJES_PASSKEY: Record<CodigoErrorPasskey, string> = {
  no_encontrado: "Este enlace no existe. Pide uno nuevo a quien te dio el adelanto.",
  vencido: "Este enlace venció. Pide uno nuevo a quien te dio el adelanto.",
  usado: "Este recibo ya se firmó con este enlace.",
  revocado: "Este enlace ya no sirve. Pide uno nuevo a quien te dio el adelanto.",
  anulado: "Este adelanto se anuló: no hay nada que firmar.",
  dni_no_coincide: "El DNI no coincide con el de la persona del adelanto.",
  origen_no_permitido: "Esta página no está autorizada para usar la huella del celular. Usa la foto de tu huella.",
  reto_vencido: "Pasó mucho tiempo. Vuelve a tocar «Confirmar con mi huella».",
  reto_usado: "Esa confirmación ya se usó. Vuelve a tocar «Confirmar con mi huella».",
  no_verificada: "El celular no lo confirmó. Prueba de nuevo.",
  credencial_ajena: "Ese celular no está registrado para la persona de este recibo.",
  contador_bajo: "Tu celular respondió algo raro. Prueba de nuevo o usa la foto de tu huella.",
  ya_registrada:
    "Esta persona ya tiene su celular registrado. Para cambiarlo, pídele al administrador que revoque el anterior; mientras tanto usa la foto de tu huella.",
  tope_llaves: "Esta persona ya tiene demasiados celulares registrados. Pídele al administrador que revoque alguno.",
  datos_invalidos: "Datos inválidos.",
};

const STATUS_ESTADO = { vencido: 410, usado: 409, revocado: 410, anulado: 409 } as const;

export function fallaPasskey(code: CodigoErrorPasskey, status: number, mensaje = MENSAJES_PASSKEY[code]): NextResponse {
  return NextResponse.json({ error: mensaje, code }, { status, headers: { "Cache-Control": "no-store" } });
}

/** El rpId y el origen de ESTE pedido, sólo si el origen está en la lista. */
export function rpDelPedido(req: NextRequest) {
  return rpDelOrigen(req.headers.get("origin"), entornoRp());
}

export function contextoDe(enlace: EnlaceResuelto, rp: { origin: string; rpId: string }): ContextoPasskey {
  return {
    tenantId: enlace.tenantId,
    enlaceId: enlace.enlaceId,
    adelantoId: enlace.adelantoId,
    beneficiarioId: enlace.beneficiarioId,
    monto: enlace.montoAdelantado,
    moneda: enlace.moneda,
    codigoOperacion: enlace.codigoOperacion,
    persona: enlace.firmanteNombre,
    origin: rp.origin,
    rpId: rp.rpId,
  };
}

/** Enlace pendiente + origen permitido, o la respuesta de error lista para devolver. */
export async function enlaceParaPasskey(req: NextRequest, token: string): Promise<{ enlace: EnlaceResuelto; c: ContextoPasskey } | NextResponse> {
  if (!TOKEN_RE.test(token)) return fallaPasskey("no_encontrado", 404);
  let enlace: EnlaceResuelto | null;
  try {
    enlace = await AdelantoFirmasDB.enlacePorToken(token);
  } catch (e) {
    logger.error("[public/adelantos/passkey] lectura error", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo leer el enlace. Prueba de nuevo." }, { status: 503 });
  }
  if (!enlace) return fallaPasskey("no_encontrado", 404);
  if (enlace.estado !== "pendiente") return fallaPasskey(enlace.estado, STATUS_ESTADO[enlace.estado]);
  const rp = rpDelPedido(req);
  if (!rp) return fallaPasskey("origen_no_permitido", 403);
  return { enlace, c: contextoDe(enlace, rp) };
}
