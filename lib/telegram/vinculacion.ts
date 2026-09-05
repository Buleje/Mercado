import "server-only";

/**
 * lib/telegram/vinculacion.ts
 *
 * El código que empareja un chat de Telegram con un negocio.
 *
 * ── Por qué es EFÍMERO y no derivado ─────────────────────────────────────────
 * El token de n8n se deriva de `AUTH_SECRET` y vive para siempre porque vive en
 * un servidor. Este se tipea en un chat, se ve en la pantalla del celular y se
 * reenvía sin pensar. Y quien lo tenga puede enganchar SU Telegram y empezar a
 * escribir en los libros del negocio.
 *
 * Por eso funciona como el código de un cajero: se pide cuando se va a usar,
 * dura 15 minutos, y se quema al canjearlo. Si se filtra después, no sirve.
 */

import { randomInt, timingSafeEqual } from "node:crypto";
import { logger } from "@/lib/logger";

const VIGENCIA_MS = 15 * 60 * 1000;
const MAX_VIVOS = 50;

interface CodigoVivo {
  tenantId: string;
  /** Quién lo pidió — queda en el log del vínculo. */
  pedidoPor: string;
  expira: number;
}

const vivos = new Map<string, CodigoVivo>();

/**
 * Sin ceros ni letras que se confundan al leer de una pantalla a otra
 * (0/O, 1/I/L). Se dicta por teléfono tanto como se copia.
 */
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function generar(largo = 6): string {
  let s = "";
  for (let i = 0; i < largo; i++) s += ALFABETO[randomInt(ALFABETO.length)];
  return s;
}

function limpiarVencidos(): void {
  const ahora = Date.now();
  for (const [codigo, v] of vivos) if (v.expira <= ahora) vivos.delete(codigo);
}

/** Un código nuevo para este negocio. Invalida el anterior que tuviera vivo. */
export function crearCodigo(tenantId: string, pedidoPor: string): { codigo: string; expiraEn: number } {
  limpiarVencidos();
  // Un negocio tiene UN código vivo a la vez: dos códigos válidos al mismo
  // tiempo es una ventana abierta de más sin ninguna ventaja.
  for (const [c, v] of vivos) if (v.tenantId === tenantId) vivos.delete(c);
  if (vivos.size >= MAX_VIVOS) {
    const masViejo = [...vivos.entries()].sort((a, b) => a[1].expira - b[1].expira)[0];
    if (masViejo) vivos.delete(masViejo[0]);
  }

  const codigo = generar();
  vivos.set(codigo, { tenantId, pedidoPor, expira: Date.now() + VIGENCIA_MS });
  logger.info("[telegram] código de vinculación emitido", { tenantId, expiraEnMin: VIGENCIA_MS / 60000 });
  return { codigo, expiraEn: VIGENCIA_MS };
}

/**
 * Canjea el código. Devuelve el negocio y lo QUEMA — un código sirve una vez.
 *
 * La comparación recorre todos los vivos en tiempo constante: probar códigos
 * de seis caracteres es factible, y un `Map.get` filtra por el tiempo que tarda
 * en fallar.
 */
export function canjearCodigo(codigoCrudo: string): { tenantId: string; pedidoPor: string } | null {
  limpiarVencidos();
  const codigo = codigoCrudo.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (codigo.length === 0) return null;

  let encontrado: { clave: string; valor: CodigoVivo } | null = null;
  for (const [clave, valor] of vivos) {
    if (clave.length !== codigo.length) continue;
    if (timingSafeEqual(Buffer.from(clave), Buffer.from(codigo))) {
      encontrado = { clave, valor };
    }
  }
  if (!encontrado) return null;

  vivos.delete(encontrado.clave);
  return { tenantId: encontrado.valor.tenantId, pedidoPor: encontrado.valor.pedidoPor };
}

/** Si hay un código vivo para este negocio, cuánto le queda. Para la pantalla. */
export function codigoVivoDe(tenantId: string): { codigo: string; quedanSegundos: number } | null {
  limpiarVencidos();
  for (const [codigo, v] of vivos) {
    if (v.tenantId === tenantId) {
      return { codigo, quedanSegundos: Math.max(0, Math.round((v.expira - Date.now()) / 1000)) };
    }
  }
  return null;
}
