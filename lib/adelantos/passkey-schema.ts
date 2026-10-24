import { z } from "zod";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { VERSION_CONSENTIMIENTO_PASSKEY } from "./passkey-tipos";

/**
 * ADR-513 — lo que manda la página pública en la ceremonia de la passkey. Las
 * respuestas del celular se validan en forma y tamaño (base64url con tope);
 * la firma criptográfica la verifica @simplewebauthn/server.
 */

const B64U = (max: number) => z.string().min(1).max(max).regex(/^[A-Za-z0-9_-]+$/, "base64url");

const Comunes = {
  id: B64U(1024),
  rawId: B64U(1024),
  type: z.literal("public-key"),
  authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
  clientExtensionResults: z.record(z.string(), z.unknown()).optional(),
};

export const RespuestaRegistroSchema = z.object({
  ...Comunes,
  response: z.object({
    clientDataJSON: B64U(4096),
    attestationObject: B64U(16_384),
    authenticatorData: B64U(8192).optional(),
    transports: z.array(z.string().max(20)).max(8).optional(),
    publicKeyAlgorithm: z.number().int().optional(),
    publicKey: B64U(4096).optional(),
  }),
});

export const RespuestaConfirmacionSchema = z.object({
  ...Comunes,
  response: z.object({
    clientDataJSON: B64U(4096),
    authenticatorData: B64U(8192),
    signature: B64U(2048),
    userHandle: B64U(512).optional(),
  }),
});

const Documento = z.string().trim().max(20).optional();

/** Sin `nueva` (revisión 23-10): el enlace ya no registra un segundo celular; lo cambia el administrador revocando. */
export const OpcionesPasskeySchema = z.object({ documento: Documento }).strict();

export const RegistrarPasskeySchema = z
  /* Sin `dispositivo` (revisión 23-10): lo escribía el cliente y la ficha lo mostraba como dato. */
  .object({ respuesta: RespuestaRegistroSchema })
  .strict();

/** El campo `passkey` del multipart de firmar. */
export const PasskeyAlFirmarSchema = z
  .object({ respuesta: RespuestaConfirmacionSchema, consentimiento: z.literal(VERSION_CONSENTIMIENTO_PASSKEY) })
  .strict();

/* Las formas validadas son las que espera la librería; `clientExtensionResults` llega como objeto libre. */
export const comoRegistro = (r: z.infer<typeof RespuestaRegistroSchema>) =>
  ({ ...r, clientExtensionResults: r.clientExtensionResults ?? {} }) as unknown as RegistrationResponseJSON;
export const comoConfirmacion = (r: z.infer<typeof RespuestaConfirmacionSchema>) =>
  ({ ...r, clientExtensionResults: r.clientExtensionResults ?? {} }) as unknown as AuthenticationResponseJSON;
