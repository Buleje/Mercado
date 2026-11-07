/**
 * Mandar una grabación por WhatsApp: el número, el enlace público y la URL de
 * `wa.me`. Puro; el número y el `wa.me` salen de `contactos-envio` (la misma
 * regla que «Documentos del permiso»: 9 dígitos peruanos reciben el 51, uno de
 * 10 a 15 ya trae su código de país).
 */
import { enlaceWhatsApp, normalizarTelefono } from "@/lib/forestal/contactos-envio";

export { DIAS_ENLACE } from "@/lib/forestal/contactos-envio";

/** «987 654 321» → «51987654321»; lo que no es teléfono → `null`. */
export function numeroParaWhatsapp(crudo: string | null | undefined): string | null {
  return normalizarTelefono(crudo);
}

/** El texto del mensaje: el nombre, el contexto si hay, y el enlace para escucharla. */
export function mensajeGrabacion(nombre: string, enlace: string, contexto?: string | null): string {
  const lineas = [`Grabación: ${nombre.trim() || "sin nombre"}`];
  const ctx = contexto?.trim();
  if (ctx) lineas.push(ctx);
  lineas.push(`Escúchala aquí: ${enlace}`);
  return lineas.join("\n");
}

/** La URL de `wa.me` lista para abrir, o `null` si el número no sirve. */
export function urlWhatsappGrabacion(
  numeroCrudo: string,
  nombre: string,
  enlace: string,
  contexto?: string | null,
): string | null {
  const numero = numeroParaWhatsapp(numeroCrudo);
  return numero ? enlaceWhatsApp(numero, mensajeGrabacion(nombre, enlace, contexto)) : null;
}

// ── Enlace público: reusar el que sigue vivo ────────────────────────────────

export interface EnlaceExistente {
  token: string;
  expiresAt: string | null;
  revokedAt: string | null;
  hasPassword: boolean;
}

/** Margen: un enlace que vence en menos de un día no se manda (el otro lo abre mañana). */
const MARGEN_MS = 24 * 60 * 60 * 1000;

/** El token de un enlace sin clave, sin revocar y que vive al menos un día más; `null` = crear uno. */
export function elegirEnlaceVigente(enlaces: readonly EnlaceExistente[], ahora: Date): string | null {
  const limite = ahora.getTime() + MARGEN_MS;
  const vivos = enlaces.filter((e) => {
    if (e.revokedAt || e.hasPassword) return false;
    if (!e.expiresAt) return true;
    const vence = Date.parse(e.expiresAt);
    return Number.isFinite(vence) && vence > limite;
  });
  // El que dura más: si hay dos, el más nuevo sirve más tiempo.
  vivos.sort((a, b) => (b.expiresAt ? Date.parse(b.expiresAt) : Infinity) - (a.expiresAt ? Date.parse(a.expiresAt) : Infinity));
  return vivos[0]?.token ?? null;
}

// ── Últimos números usados (localStorage) ───────────────────────────────────

export const CLAVE_NUMEROS = "grabadora:numeros-recientes";
export const TOPE_NUMEROS = 5;

type Almacen = Pick<Storage, "getItem" | "setItem">;

function almacenPorDefecto(): Almacen | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null; // modo privado de Safari / almacenamiento bloqueado
  }
}

/** Los últimos números (con 51), el más reciente primero. Nunca lanza. */
export function leerNumerosRecientes(almacen: Almacen | null = almacenPorDefecto()): string[] {
  if (!almacen) return [];
  try {
    const crudo: unknown = JSON.parse(almacen.getItem(CLAVE_NUMEROS) ?? "[]");
    if (!Array.isArray(crudo)) return [];
    return crudo.filter((n): n is string => typeof n === "string" && /^\d{10,15}$/.test(n)).slice(0, TOPE_NUMEROS);
  } catch {
    return [];
  }
}

/** Pone el número arriba (sin repetirlo) y devuelve la lista nueva. Nunca lanza. */
export function recordarNumero(numero: string, almacen: Almacen | null = almacenPorDefecto()): string[] {
  const n = numeroParaWhatsapp(numero);
  const previos = leerNumerosRecientes(almacen);
  if (!n) return previos;
  const lista = [n, ...previos.filter((x) => x !== n)].slice(0, TOPE_NUMEROS);
  try {
    almacen?.setItem(CLAVE_NUMEROS, JSON.stringify(lista));
  } catch {
    /* lleno o bloqueado: la lista de esta vez igual sirve */
  }
  return lista;
}
