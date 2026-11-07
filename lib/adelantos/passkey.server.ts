import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { kvBorrarSiEs, kvEscribir, kvLeer } from "@/lib/camaras/kv-efimero.server";
import { logger } from "@/lib/logger";
import { AdelantoPasskeysDB, type PasskeyGuardada } from "@/lib/db/adelanto-passkeys.db";
import { carpetaRegistro, sha256Hex } from "./registro-firmas";
import { SEGUNDOS_RETO_PASSKEY, TEXTO_CONFIRMADO_PASSKEY, type CodigoErrorPasskey, type ModoPasskey, type RegistroDeLaLlave } from "./passkey-tipos";

/**
 * ADR-513 — la ceremonia WebAuthn del enlace de firma, del lado del servidor.
 *
 * El reto (challenge) es de UN uso y vence a los 5 min: vive en el KV efímero
 * (Upstash; en dev, la memoria del proceso), con la clave del negocio y del
 * enlace. Sus 48 bytes = 16 al azar + sha256(negocio | adelanto | monto |
 * moneda | código): lo que el celular firma lleva adentro QUÉ se confirma. Si el
 * adelanto cambia de monto entre las opciones y la confirmación, el reto ya no
 * encaja y se rechaza.
 *
 * Origen y rpId llegan ya validados contra la lista (`passkey-rp.ts`).
 */

export type ContextoPasskey = {
  tenantId: string;
  enlaceId: string;
  adelantoId: string;
  beneficiarioId: string;
  monto: number;
  moneda: string;
  codigoOperacion: string | null;
  persona: string;
  origin: string;
  rpId: string;
};

export type FalloPasskey = { ok: false; code: CodigoErrorPasskey; status: number };

const RP_NOMBRE = "Recibos de adelantos";

export function huellaDelContexto(c: Pick<ContextoPasskey, "tenantId" | "adelantoId" | "monto" | "moneda" | "codigoOperacion">): Buffer {
  return createHash("sha256")
    .update(`adelanto-passkey:v1|${c.tenantId}|${c.adelantoId}|${c.monto.toFixed(2)}|${c.moneda}|${c.codigoOperacion ?? ""}`)
    .digest();
}

/** Copia a un `ArrayBuffer` propio: la librería no acepta `SharedArrayBuffer` (el pool de Buffer). */
function aBytes(b: Buffer): Uint8Array<ArrayBuffer> {
  const u = new Uint8Array(new ArrayBuffer(b.length));
  u.set(b);
  return u;
}

function nuevoReto(c: ContextoPasskey): Uint8Array<ArrayBuffer> {
  return aBytes(Buffer.concat([randomBytes(16), huellaDelContexto(c)]));
}

/** ¿El reto lleva adentro ESTE adelanto con ESTE monto? */
export function retoEncajaConContexto(challenge: string, c: ContextoPasskey): boolean {
  const bytes = Buffer.from(challenge, "base64url");
  if (bytes.length !== 48) return false;
  return timingSafeEqual(bytes.subarray(16), huellaDelContexto(c));
}

/** user.id estable y sin datos personales: la misma persona en el mismo celular pisa su llave, no suma otra. */
function userIdDe(tenantId: string, beneficiarioId: string): Uint8Array<ArrayBuffer> {
  return aBytes(createHash("sha256").update(`adelanto-persona:${tenantId}:${beneficiarioId}`).digest().subarray(0, 32));
}

const claveReto = (tenantId: string, enlaceId: string, modo: ModoPasskey) => `adelanto-passkey:${tenantId}:${enlaceId}:${modo}`;
const claveUsado = (challenge: string) => `adelanto-passkey:usado:${sha256Hex(challenge)}`;

/**
 * Lo guardado es un TEXTO (no JSON): el reto + adelanto, persona, dominio y
 * origen. Al consumir se arma el mismo texto con el reto que trae el celular y
 * se borra «si todavía es éste» en un solo paso (`kvBorrarSiEs`, Lua en Upstash).
 */
const valorReto = (c: ContextoPasskey, challenge: string) => `v1|${challenge}|${c.adelantoId}|${c.beneficiarioId}|${c.rpId}|${c.origin}`;

async function guardarReto(c: ContextoPasskey, modo: ModoPasskey, challenge: string): Promise<void> {
  await kvEscribir(claveReto(c.tenantId, c.enlaceId, modo), valorReto(c, challenge), SEGUNDOS_RETO_PASSKEY);
}

/** El reto que trae lo que firmó el celular (dentro de clientDataJSON). */
function retoDeLaRespuesta(clientDataJSON: string): string | null {
  try {
    const cd = JSON.parse(Buffer.from(clientDataJSON, "base64url").toString("utf8")) as { challenge?: unknown };
    return typeof cd.challenge === "string" ? cd.challenge : null;
  } catch {
    return null;
  }
}

/**
 * Un solo uso, ATÓMICO: borra el reto guardado sólo si es el que firmó el
 * celular, con este adelanto, persona, dominio y origen (GET+DEL en un paso:
 * entre leer y borrar no se cuela otro pedido). Dos a la vez → uno «usado».
 * Se deja una marca 10 min para decir «usado» y no «vencido» al que lo repite.
 */
async function consumirReto(c: ContextoPasskey, modo: ModoPasskey, clientDataJSON: string): Promise<{ challenge: string } | FalloPasskey> {
  const delCliente = retoDeLaRespuesta(clientDataJSON);
  if (!delCliente) return { ok: false, code: "datos_invalidos", status: 400 };
  /* Si el adelanto cambió de monto desde las opciones, el reto ya no encaja. */
  if (!retoEncajaConContexto(delCliente, c)) return { ok: false, code: "reto_vencido", status: 400 };
  if (!(await kvBorrarSiEs(claveReto(c.tenantId, c.enlaceId, modo), valorReto(c, delCliente)))) {
    const usado = await kvLeer<number>(claveUsado(delCliente));
    return { ok: false, code: usado ? "reto_usado" : "reto_vencido", status: 400 };
  }
  await kvEscribir(claveUsado(delCliente), 1, SEGUNDOS_RETO_PASSKEY * 2).catch((err: unknown) =>
    logger.error("[adelantos/passkey] no se pudo marcar el reto usado", { error: String(err) }),
  );
  return { challenge: delCliente };
}

const credencialesDe = (ps: PasskeyGuardada[]) => ps.map((p) => ({ id: p.credentialId, transports: p.transports }));

export async function opcionesDeRegistro(c: ContextoPasskey, existentes: PasskeyGuardada[]): Promise<Record<string, unknown>> {
  const opciones = await generateRegistrationOptions({
    rpName: RP_NOMBRE,
    rpID: c.rpId,
    userName: c.persona.slice(0, 64) || "Persona",
    userDisplayName: c.persona.slice(0, 64) || "Persona",
    userID: userIdDe(c.tenantId, c.beneficiarioId),
    challenge: nuevoReto(c),
    timeout: SEGUNDOS_RETO_PASSKEY * 1000,
    attestationType: "none",
    excludeCredentials: credencialesDe(existentes),
    authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "preferred", userVerification: "required" },
    preferredAuthenticatorType: "localDevice",
  });
  await guardarReto(c, "registrar", opciones.challenge);
  return opciones as unknown as Record<string, unknown>;
}

export async function opcionesDeConfirmacion(c: ContextoPasskey, existentes: PasskeyGuardada[]): Promise<Record<string, unknown>> {
  const opciones = await generateAuthenticationOptions({
    rpID: c.rpId,
    allowCredentials: credencialesDe(existentes),
    challenge: nuevoReto(c),
    timeout: SEGUNDOS_RETO_PASSKEY * 1000,
    userVerification: "required",
  });
  await guardarReto(c, "confirmar", opciones.challenge);
  return opciones as unknown as Record<string, unknown>;
}

/** Con qué IP y navegador se registró (rastro; el navegador se muestra rotulado «según su navegador»). */
export type RastroRegistro = { ip: string | null; userAgent: string | null };

/**
 * Registra la llave del celular para ESTA persona en ESTE dominio, SÓLO si la
 * persona no tiene ninguna vigente (en ningún dominio): el enlace no cambia de
 * celular; eso lo aprueba el administrador revocando la anterior.
 */
export async function verificarRegistro(c: ContextoPasskey, respuesta: RegistrationResponseJSON, rastro: RastroRegistro): Promise<{ ok: true; passkey: PasskeyGuardada } | FalloPasskey> {
  const reto = await consumirReto(c, "registrar", respuesta.response.clientDataJSON);
  if ("ok" in reto) return reto;
  let v: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
  try {
    v = await verifyRegistrationResponse({
      response: respuesta,
      expectedChallenge: reto.challenge,
      expectedOrigin: c.origin,
      expectedRPID: c.rpId,
      requireUserVerification: true,
    });
  } catch (e) {
    logger.warn("[adelantos/passkey] registro no verificado", { error: e instanceof Error ? e.message : String(e) });
    return { ok: false, code: "no_verificada", status: 400 };
  }
  if (!v.verified || !v.registrationInfo.userVerified) return { ok: false, code: "no_verificada", status: 400 };
  const cred = v.registrationInfo.credential;
  const ya = await AdelantoPasskeysDB.porCredencial(c.tenantId, cred.id);
  if (ya) {
    if (ya.beneficiarioId !== c.beneficiarioId || ya.revokedAt || ya.rpId !== c.rpId) return { ok: false, code: "credencial_ajena", status: 403 };
    return { ok: true, passkey: ya };
  }
  const alta = await AdelantoPasskeysDB.crear(
    c.tenantId,
    {
      beneficiarioId: c.beneficiarioId,
      credentialId: cred.id,
      publicKey: cred.publicKey,
      counter: cred.counter,
      transports: cred.transports ?? respuesta.response.transports ?? [],
      rpId: c.rpId,
      enlaceId: c.enlaceId,
      registroIp: rastro.ip,
      registroUserAgent: rastro.userAgent,
    },
    0,
  );
  if (!alta.ok) return { ok: false, code: alta.motivo === "tope" ? "tope_llaves" : "ya_registrada", status: 409 };
  return { ok: true, passkey: alta.passkey };
}

/**
 * Lo que queda en `AdelantoFirma.constancia` (v2, revisión 23-10): alcanza para
 * volver a verificar la firma SIN la fila de `AdelantoPasskey` (la llave pública
 * va copiada: es pública), dice de dónde salió la llave y qué prueba.
 */
export type ConstanciaPasskey = {
  v: 2;
  significado: string;
  credentialId: string;
  /** Llave pública COSE, base64url. */
  publicKey: string;
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
  userHandle: string | null;
  contador: number;
  rpId: string;
  origin: string;
  contexto: string;
  verificadaEn: string;
  registro: RegistroDeLaLlave & { passkeyId: string; enlaceId: string | null };
};

export type ConfirmacionPasskey = { ok: true; passkey: PasskeyGuardada; contadorNuevo: number; constancia: ConstanciaPasskey };

/** Verifica que el celular de ESTA persona confirmó ESTE adelanto. No escribe: el contador sube en la tx de la firma. */
export async function verificarConfirmacion(c: ContextoPasskey, respuesta: AuthenticationResponseJSON): Promise<ConfirmacionPasskey | FalloPasskey> {
  const reto = await consumirReto(c, "confirmar", respuesta.response.clientDataJSON);
  if ("ok" in reto) return reto;
  const passkey = await AdelantoPasskeysDB.porCredencial(c.tenantId, respuesta.id);
  /* De otra persona, de otro negocio (no existe acá), revocada o de otro dominio: 403. */
  if (!passkey || passkey.beneficiarioId !== c.beneficiarioId || passkey.revokedAt || passkey.rpId !== c.rpId) {
    return { ok: false, code: "credencial_ajena", status: 403 };
  }
  let v: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
  try {
    v = await verifyAuthenticationResponse({
      response: respuesta,
      expectedChallenge: reto.challenge,
      expectedOrigin: c.origin,
      expectedRPID: c.rpId,
      credential: { id: passkey.credentialId, publicKey: new Uint8Array(passkey.publicKey), counter: passkey.counter, transports: passkey.transports },
      requireUserVerification: true,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn("[adelantos/passkey] confirmación no verificada", { error: msg });
    return { ok: false, code: /counter/i.test(msg) ? "contador_bajo" : "no_verificada", status: /counter/i.test(msg) ? 409 : 400 };
  }
  if (!v.verified || !v.authenticationInfo.userVerified) return { ok: false, code: "no_verificada", status: 400 };
  const nuevo = v.authenticationInfo.newCounter;
  /* Si el autenticador cuenta (alguno > 0), tiene que subir: si no, es un clon. */
  if ((nuevo > 0 || passkey.counter > 0) && nuevo <= passkey.counter) return { ok: false, code: "contador_bajo", status: 409 };
  const constancia: ConstanciaPasskey = {
    v: 2,
    significado: `${TEXTO_CONFIRMADO_PASSKEY}: el celular verificó a quien lo desbloquea (huella o PIN) y firmó este recibo. No es la huella de la persona ni la compara con RENIEC.`,
    credentialId: passkey.credentialId,
    publicKey: Buffer.from(passkey.publicKey).toString("base64url"),
    clientDataJSON: respuesta.response.clientDataJSON,
    authenticatorData: respuesta.response.authenticatorData,
    signature: respuesta.response.signature,
    userHandle: respuesta.response.userHandle ?? null,
    contador: nuevo,
    rpId: c.rpId,
    origin: c.origin,
    contexto: huellaDelContexto(c).toString("hex"),
    verificadaEn: new Date().toISOString(),
    /* Registrada con ESTE mismo enlace = prueba más débil: el mismo enlace dio la llave y la usó. */
    registro: { passkeyId: passkey.id, enlaceId: passkey.enlaceId, mismoEnlace: passkey.enlaceId === null ? null : passkey.enlaceId === c.enlaceId, registradaEn: passkey.creadaEn.toISOString() },
  };
  return { ok: true, passkey, contadorNuevo: nuevo, constancia };
}

/**
 * La fila HUELLA de una passkey no tiene imagen: `ruta` es un nombre dentro de
 * la carpeta del registro (el CHECK `AdelantoFirma_ruta_chk` pide el prefijo)
 * que NO es un archivo — la puerta de la imagen la rechaza (no es `.webp`).
 * `sha256` y `bytes` son de la constancia.
 */
export function filaDeConstancia(tenantId: string, adelantoId: string, constancia: ConstanciaPasskey): { ruta: string; sha256: string; bytes: number } {
  const json = JSON.stringify(constancia);
  const ruta = `${carpetaRegistro(tenantId, adelantoId)}/${Date.now()}-huella-${randomBytes(8).toString("hex")}.passkey`;
  return { ruta, sha256: sha256Hex(json), bytes: Buffer.byteLength(json, "utf8") };
}
