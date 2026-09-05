import "server-only";

/**
 * lib/asistente/vinculacion.ts
 *
 * El código que empareja un canal de mensajería (un chat de Telegram, un
 * teléfono de WhatsApp) con un negocio.
 *
 * ── Por qué es EFÍMERO y no derivado ─────────────────────────────────────────
 * El token de n8n se deriva de `AUTH_SECRET` y vive para siempre porque vive en
 * un servidor. Este se tipea en un chat, se ve en la pantalla del celular y se
 * reenvía sin pensar. Y quien lo tenga puede enganchar SU teléfono y empezar a
 * escribir en los libros del negocio.
 *
 * Por eso funciona como el código de un cajero: se pide cuando se va a usar,
 * dura 15 minutos, y se quema al canjearlo. Si se filtra después, no sirve.
 *
 * ── Por qué el canal es parte de la llave ────────────────────────────────────
 * Un negocio tiene UN código vivo POR CANAL, no uno solo. Si el store fuera
 * compartido, pedir el código de WhatsApp mataría en silencio el de Telegram
 * que el dueño está tipeando en ese mismo momento — dos pantallas distintas,
 * ningún aviso. Separarlos cuesta una llave compuesta y evita ese choque.
 *
 * Nació en `lib/telegram/vinculacion.ts` (ADR-388) y se generalizó al sumar el
 * canal de WhatsApp; ese archivo quedó como binding fino para no tocar a sus
 * llamadores.
 */

import { randomInt, timingSafeEqual } from "node:crypto";
import { logger } from "@/lib/logger";

/** Canales que pueden anotar en los libros desde afuera del panel. */
export type CanalVinculable = "telegram" | "whatsapp";

const VIGENCIA_MS = 15 * 60 * 1000;
const MAX_VIVOS = 50;

interface CodigoVivo {
  canal: CanalVinculable;
  tenantId: string;
  /** Quién lo pidió — queda en el log del vínculo. */
  pedidoPor: string;
  expira: number;
}

/** Llave: `<canal>:<código>`. El canal viaja en la llave, no sólo en el valor. */
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
  for (const [llave, v] of vivos) if (v.expira <= ahora) vivos.delete(llave);
}

const llaveDe = (canal: CanalVinculable, codigo: string) => `${canal}:${codigo}`;

/** Un código nuevo para este negocio EN ESTE CANAL. Invalida el anterior del mismo canal. */
export function crearCodigo(
  tenantId: string,
  pedidoPor: string,
  canal: CanalVinculable = "telegram",
): { codigo: string; expiraEn: number } {
  limpiarVencidos();
  // Un negocio tiene UN código vivo por canal a la vez: dos códigos válidos al
  // mismo tiempo es una ventana abierta de más sin ninguna ventaja.
  for (const [llave, v] of vivos) if (v.tenantId === tenantId && v.canal === canal) vivos.delete(llave);
  if (vivos.size >= MAX_VIVOS) {
    const masViejo = [...vivos.entries()].sort((a, b) => a[1].expira - b[1].expira)[0];
    if (masViejo) vivos.delete(masViejo[0]);
  }

  const codigo = generar();
  vivos.set(llaveDe(canal, codigo), { canal, tenantId, pedidoPor, expira: Date.now() + VIGENCIA_MS });
  logger.info("[asistente] código de vinculación emitido", {
    tenantId,
    canal,
    expiraEnMin: VIGENCIA_MS / 60000,
  });
  return { codigo, expiraEn: VIGENCIA_MS };
}

/**
 * Canjea el código. Devuelve el negocio y lo QUEMA — un código sirve una vez.
 *
 * La comparación recorre todos los vivos DEL CANAL en tiempo constante: probar
 * códigos de seis caracteres es factible, y un `Map.get` filtra por el tiempo
 * que tarda en fallar.
 */
export function canjearCodigo(
  codigoCrudo: string,
  canal: CanalVinculable = "telegram",
): { tenantId: string; pedidoPor: string } | null {
  limpiarVencidos();
  const codigo = codigoCrudo.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (codigo.length === 0) return null;

  let encontrado: { llave: string; valor: CodigoVivo } | null = null;
  for (const [llave, valor] of vivos) {
    if (valor.canal !== canal) continue;
    const suCodigo = llave.slice(canal.length + 1);
    if (suCodigo.length !== codigo.length) continue;
    if (timingSafeEqual(Buffer.from(suCodigo), Buffer.from(codigo))) {
      encontrado = { llave, valor };
    }
  }
  if (!encontrado) return null;

  vivos.delete(encontrado.llave);
  return { tenantId: encontrado.valor.tenantId, pedidoPor: encontrado.valor.pedidoPor };
}

/** Si hay un código vivo para este negocio en este canal, cuánto le queda. Para la pantalla. */
export function codigoVivoDe(
  tenantId: string,
  canal: CanalVinculable = "telegram",
): { codigo: string; quedanSegundos: number } | null {
  limpiarVencidos();
  for (const [llave, v] of vivos) {
    if (v.tenantId === tenantId && v.canal === canal) {
      return {
        codigo: llave.slice(canal.length + 1),
        quedanSegundos: Math.max(0, Math.round((v.expira - Date.now()) / 1000)),
      };
    }
  }
  return null;
}
