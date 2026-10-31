import { createCipheriv, createDecipheriv, createHash } from "node:crypto";

/**
 * La foto de una cámara con el video cifrado llega CIFRADA (ADR-472): medido
 * el 05-10, `capturePic` de Teams contesta `isEncrypted: 1` y la de EZVIZ trae
 * la cabecera `hikencodepicture`. Se abre con el código de verificación.
 *
 * Formato (pyEzviz `decrypt_image`, github.com/BaQs/pyEzviz `utils.py`):
 *   16 B «hikencodepicture» · 32 B md5hex(md5hex(código)) · AES-128-CBC
 *   con clave = código rellenado con \0 a 16 B, IV = «01234567» + 8 \0, PKCS7.
 *
 * Puro (sólo `node:crypto`): lo prueba `__tests__/camaras-ezviz-control.test.ts`.
 */

const CABECERA = "hikencodepicture";
const IV = Buffer.from([48, 49, 50, 51, 52, 53, 54, 55, 0, 0, 0, 0, 0, 0, 0, 0]);

const md5hex = (s: string) => createHash("md5").update(s).digest("hex");

export type FotoLeida = { ok: true; valor: Buffer } | { ok: false; error: string };

export const estaCifrada = (b: Uint8Array) =>
  b.length >= 48 && Buffer.from(b.subarray(0, 16)).toString("latin1") === CABECERA;

export function decodificarFotoHik(bytes: Uint8Array, codigo: string | null): FotoLeida {
  const b = Buffer.from(bytes);
  if (!estaCifrada(b)) return { ok: true, valor: b };
  if (!codigo)
    return {
      ok: false,
      error: "La foto viene cifrada y falta el código de verificación de la cámara.",
    };
  if (b.subarray(16, 48).toString("latin1") !== md5hex(md5hex(codigo)))
    return {
      ok: false,
      error: "El código de verificación guardado no abre la foto. Revísalo en «Enlazar».",
    };
  try {
    const clave = Buffer.alloc(16);
    clave.write(codigo.slice(0, 16), "latin1");
    const d = createDecipheriv("aes-128-cbc", clave, IV);
    return { ok: true, valor: Buffer.concat([d.update(b.subarray(48)), d.final()]) };
  } catch {
    return { ok: false, error: "La foto cifrada llegó incompleta. Vuelve a intentar." };
  }
}

/** Para los tests: cifra como la cámara. */
export function cifrarComoHik(foto: Buffer, codigo: string): Buffer {
  const clave = Buffer.alloc(16);
  clave.write(codigo.slice(0, 16), "latin1");
  const c = createCipheriv("aes-128-cbc", clave, IV);
  return Buffer.concat([
    Buffer.from(CABECERA, "latin1"),
    Buffer.from(md5hex(md5hex(codigo)), "latin1"),
    c.update(foto),
    c.final(),
  ]);
}
