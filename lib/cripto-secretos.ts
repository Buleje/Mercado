import "server-only";

/**
 * Cifrar secretos de terceros antes de guardarlos (2026-09-15).
 *
 * ## Qué problema resuelve
 *
 * La clave del usuario de la cámara Hikvision se guarda en el KV del tenant
 * para poder pedirle la foto cuando alguien abre el panel. Esa clave no es
 * nuestra: es la del aparato del cliente, y con ella se entra al panel de la
 * cámara (y en muchas instalaciones es la MISMA que usa el dueño en otros
 * lados). Guardarla en texto plano convierte un volcado del KV en el control
 * de las cámaras del negocio. Por eso entra cifrada y sale sólo cuando el
 * servidor la necesita para armar el header Digest.
 *
 * ## Por qué la sal es fija
 *
 * `scrypt` pide sal. Lo habitual es una sal aleatoria por secreto, pero eso
 * sirve para derivar claves de contraseñas de usuarios distintos. Acá hay UNA
 * sola clave maestra (`AUTH_SECRET`) y lo que se guarda tiene que poder leerse
 * en el próximo arranque del servidor: con una sal aleatoria por proceso, todo
 * lo cifrado ayer quedaría ilegible hoy. La sal aleatoria por secreto también
 * se podría guardar dentro del payload, pero entonces cada lectura pagaría un
 * `scrypt` completo (~100 ms) en vez de reusar la clave ya derivada — sobre una
 * grilla de cámaras eso se nota. Lo que SÍ es aleatorio y único por secreto es
 * el IV (12 bytes): eso es lo que evita que dos claves iguales se vean iguales
 * cifradas, que es el riesgo real acá.
 *
 * ## Formato
 *
 *   v1:<iv>:<tag>:<datos>     — las tres partes en base64url
 *
 * El prefijo de versión permite cambiar de algoritmo sin adivinar: si algún día
 * hay `v2`, `descifrarSecreto` sabe qué hacer con cada uno y lo que no reconoce
 * devuelve `null` en vez de romper la pantalla.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from "node:crypto";

const ALGORITMO = "aes-256-gcm" as const;
const LARGO_IV = 12; // el tamaño que recomienda GCM (96 bits)
const LARGO_TAG = 16;
const VERSION = "v1";

/** Sal fija del módulo — el porqué está arriba. No cambiarla: lo guardado deja de leerse. */
const SAL = Buffer.from("buleje:cripto-secretos:v1");

/**
 * La clave derivada se cachea porque `scryptSync` es caro a propósito (~100 ms).
 * La cache se indexa por la HUELLA del secreto, no por el secreto: así una
 * rotación de `AUTH_SECRET` (o un test que lo cambia) re-deriva sola, y no
 * queda una segunda copia del secreto viva en memoria.
 */
let cacheClave: { huella: string; clave: Buffer } | null = null;

function secretoBase(): string | null {
  const s = process.env.AUTH_SECRET?.trim();
  return s ? s : null;
}

/** ¿Se puede cifrar? Si no, el llamador no debe guardar el secreto igual. */
export function hayClaveDeCifrado(): boolean {
  return secretoBase() !== null;
}

function claveDeCifrado(): Buffer {
  const base = secretoBase();
  if (!base) {
    throw new Error(
      "Falta AUTH_SECRET: no hay con qué cifrar la clave de la cámara. Configura AUTH_SECRET antes de guardarla; dejarla en texto plano no es una opción.",
    );
  }
  const huella = createHash("sha256").update(base).digest("hex");
  if (cacheClave && cacheClave.huella === huella) return cacheClave.clave;
  const clave = scryptSync(base, SAL, 32);
  cacheClave = { huella, clave };
  return clave;
}

/** Cifra un texto. Tira si no hay `AUTH_SECRET` — es el único caso en que tira. */
export function cifrarSecreto(texto: string): string {
  const clave = claveDeCifrado();
  const iv = randomBytes(LARGO_IV);
  const cifrador = createCipheriv(ALGORITMO, clave, iv);
  const datos = Buffer.concat([cifrador.update(texto, "utf8"), cifrador.final()]);
  const tag = cifrador.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), datos.toString("base64url")].join(":");
}

/**
 * Descifra. Devuelve `null` —y NUNCA tira— si el dato está corrupto, si es de
 * otra versión, si quedó de una `AUTH_SECRET` anterior o si no hay clave.
 * Decide el llamador: la pantalla de cámaras, por ejemplo, muestra «hay que
 * volver a cargar la clave» en vez de caerse entera.
 */
export function descifrarSecreto(cifrado: string): string | null {
  try {
    if (!cifrado || !hayClaveDeCifrado()) return null;
    const partes = cifrado.split(":");
    if (partes.length !== 4 || partes[0] !== VERSION) return null;
    const iv = Buffer.from(partes[1], "base64url");
    const tag = Buffer.from(partes[2], "base64url");
    const datos = Buffer.from(partes[3], "base64url");
    if (iv.length !== LARGO_IV || tag.length !== LARGO_TAG) return null;
    const descifrador = createDecipheriv(ALGORITMO, claveDeCifrado(), iv);
    descifrador.setAuthTag(tag);
    return Buffer.concat([descifrador.update(datos), descifrador.final()]).toString("utf8");
  } catch {
    /* Dato corrupto, tag que no valida o clave cambiada: el contrato es `null`.
       No se loguea el valor por ningún motivo — es justamente el secreto. */
    return null;
  }
}

/**
 * ¿Ese valor guardado ya está cifrado? Sirve para no cifrar dos veces al migrar
 * o al re-guardar una ficha que no tocó la clave.
 */
export function estaCifrado(valor: string | null | undefined): boolean {
  if (!valor) return false;
  const partes = valor.split(":");
  return partes.length === 4 && partes[0] === VERSION;
}
