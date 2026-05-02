/**
 * auto-translator.ts — utilidad que traduce strings vía 3 capas:
 *
 *   1. Diccionario local (`TRANSLATIONS`) — lookup instantáneo, sin red.
 *   2. Caché localStorage — segundo lookup, sin red.
 *   3. MyMemory API (free, sin auth) — solo para es↔en, primera vez por
 *      string. Resultado se cachea automáticamente.
 *
 * Para `qu` (quechua) y `shi` (shipibo) usa solo capa 1+2 — son lenguas
 * sin soporte API confiable, dependemos del overlay manual + fallback ES.
 *
 * Idempotente: el mismo input siempre devuelve el mismo output (cache).
 * Race-safe: dedup de requests in-flight por (locale, text).
 */

import { TRANSLATIONS, type Locale } from "./translations";
import { QU_OVERRIDES } from "./translations-qu";

const CACHE_PREFIX = "i18n-auto-cache:";
const REVERSE_LOOKUP: Map<string, Record<string, string>> = new Map();
const PENDING: Map<string, Promise<string>> = new Map();

/** Construye reverse-lookup: español plano → key del diccionario. */
function ensureReverseLookup(): void {
  if (REVERSE_LOOKUP.size > 0) return;
  for (const [, entry] of Object.entries(TRANSLATIONS)) {
    const es = entry.es?.trim();
    if (!es) continue;
    REVERSE_LOOKUP.set(es, entry as Record<string, string>);
  }
}

function readCache(locale: Locale, text: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(`${CACHE_PREFIX}${locale}:${text}`);
  } catch {
    return null;
  }
}

function writeCache(locale: Locale, text: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${CACHE_PREFIX}${locale}:${text}`, value);
  } catch {
    /* quota exceeded — ignore */
  }
}

/**
 * Llama a MyMemory API. Soporta es↔en, es↔qu (parcial), no shipibo.
 * Free tier sin auth, ~5K caracteres/día por IP. Si falla → texto original.
 */
async function fetchMyMemory(text: string, locale: Locale): Promise<string> {
  // Solo intentamos los pares que MyMemory soporta confiablemente.
  // qu (Quechua): tiene cobertura parcial — vale la pena intentar.
  // shi (Shipibo): no soportado, retorna texto.
  if (locale === "shi") return text;
  if (locale === "es") return text;
  const langpair = `es|${locale}`;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langpair}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return text;
    const json = (await res.json()) as {
      responseData?: { translatedText?: string };
      responseStatus?: number;
    };
    if (json.responseStatus !== 200) return text;
    const translated = json.responseData?.translatedText;
    if (typeof translated !== "string" || translated.trim().length === 0) return text;
    // MyMemory a veces devuelve mensajes de error como traducción
    if (translated.startsWith("MYMEMORY WARNING")) return text;
    if (translated.toUpperCase().includes("INVALID")) return text;
    return translated;
  } catch {
    return text;
  }
}

/**
 * Traduce un string al locale. Resuelve con la mejor traducción disponible
 * de las 3 capas. Es asíncrona porque la capa 3 hace I/O — pero la capa 1
 * resuelve sincrónicamente vía Promise.resolve.
 */
export async function autoTranslate(text: string, locale: Locale): Promise<string> {
  if (locale === "es") return text;
  const trimmed = text.trim();
  if (trimmed.length === 0) return text;

  ensureReverseLookup();

  // Capa 1 — diccionario local (incluye overlay quechua)
  const dictEntry = REVERSE_LOOKUP.get(trimmed);
  if (dictEntry) {
    if (locale === "qu") {
      // Buscar el key inverso para chequear overlay quechua
      for (const [k, e] of Object.entries(TRANSLATIONS)) {
        if (e.es === trimmed && QU_OVERRIDES[k]) {
          return QU_OVERRIDES[k];
        }
      }
      return dictEntry.es ?? text;
    }
    const out = dictEntry[locale];
    if (out && out !== trimmed) return out;
  }

  // Capa 2 — caché localStorage
  const cached = readCache(locale, trimmed);
  if (cached) return cached;

  // Capa 3 — MyMemory cubre es→en y es→qu (parcial). Shipibo cae al texto.
  if (locale === "shi") return text;

  // Dedup de requests concurrentes para el mismo (locale, text)
  const k = `${locale}:${trimmed}`;
  const inflight = PENDING.get(k);
  if (inflight) return inflight;

  const promise = fetchMyMemory(trimmed, locale).then((result) => {
    // Solo cachear si la traducción es DIFERENTE del original (caso contrario
    // significa que la API falló y es mejor reintentar después).
    if (result !== trimmed) {
      writeCache(locale, trimmed, result);
    }
    PENDING.delete(k);
    return result;
  });
  PENDING.set(k, promise);
  return promise;
}

/** Debe traducirse este nodo? Skip scripts, styles, inputs, opt-outs. */
export function shouldTranslateNode(node: Node): boolean {
  if (node.nodeType !== Node.TEXT_NODE) return false;
  const parent = node.parentElement;
  if (!parent) return false;
  const tag = parent.tagName;
  if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return false;
  if (tag === "CODE" || tag === "PRE") return false;
  if (parent.closest("[data-no-translate]")) return false;
  // Skip campos editables
  if (parent.closest("input, textarea, [contenteditable=true]")) return false;
  const text = node.textContent?.trim() ?? "";
  if (text.length < 2) return false;
  // Solo skip si NO hay letras alfabéticas (números/símbolos puros).
  // Antes el regex `[\d\s.,:/$%-]+` excluía cosas como "S/ 99", pero
  // tiene letras → mantenemos el skip solo para casos sin alfabeto.
  if (!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(text)) return false;
  if (/^https?:\/\//.test(text)) return false;
  return true;
}
