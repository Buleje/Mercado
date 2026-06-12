/**
 * lib/chat/presence.ts — Presencia + "escribiendo…" efímeros del chat
 * negocio↔cliente (Tanda 1 · Increment 2, Brandon 2026-06-11).
 *
 * Sin schema: usa `cacheStore` (Redis-backed con espejo en memoria). Cada lado
 * (buyer/seller) refresca su flag en cada GET de mensajes; el otro lo lee para
 * pintar "En línea · Escribiendo… · Visto hace X" en el header del chat.
 *
 * La frescura está acotada por el polling (cliente 5s) — suficiente para un
 * indicador de presencia; no pretende ser tiempo-real al milisegundo.
 */

import { cacheStore } from "@/lib/cache";

export type ChatSide = "buyer" | "seller";

const ONLINE_TTL = 18; // s — "en línea" si refrescó hace < 18s
const TYPING_TTL = 7; // s — "escribiendo…" se apaga solo
const SEEN_TTL = 60 * 60 * 24 * 2; // 2 días — soporte para "visto hace X"

const onlineKey = (threadId: string, side: ChatSide) => `chat:online:${threadId}:${side}`;
const typingKey = (threadId: string, side: ChatSide) => `chat:typing:${threadId}:${side}`;
const seenKey = (threadId: string, side: ChatSide) => `chat:seen:${threadId}:${side}`;

export interface ChatPresence {
  /** El otro lado está escribiendo ahora. */
  typing: boolean;
  /** El otro lado refrescó hace poco (chat abierto). */
  online: boolean;
  /** Último visto (epoch ms) o null si nunca. */
  lastSeen: number | null;
}

// La presencia es un EXTRA: nunca debe romper el GET/POST del chat. Todo lo que
// toca cacheStore va envuelto en try/catch con defaults seguros.

/** Marca al lado online + actualiza "visto". Llamar en cada GET de su lado. */
export function markPresence(threadId: string, side: ChatSide): void {
  try {
    const now = Date.now();
    cacheStore.set(onlineKey(threadId, side), now, ONLINE_TTL);
    cacheStore.set(seenKey(threadId, side), now, SEEN_TTL);
  } catch { /* presencia no crítica */ }
}

/** Marca "escribiendo" del lado (TTL corto). Llamar en el ping de typing. */
export function markTyping(threadId: string, side: ChatSide): void {
  try {
    cacheStore.set(typingKey(threadId, side), Date.now(), TYPING_TTL);
  } catch { /* presencia no crítica */ }
}

/** Lee la presencia del OTRO lado para el header del chat. */
export function readPresence(threadId: string, otherSide: ChatSide): ChatPresence {
  try {
    const seen = cacheStore.get<number>(seenKey(threadId, otherSide));
    return {
      typing: cacheStore.get<number>(typingKey(threadId, otherSide)) != null,
      online: cacheStore.get<number>(onlineKey(threadId, otherSide)) != null,
      lastSeen: typeof seen === "number" ? seen : null,
    };
  } catch {
    return { typing: false, online: false, lastSeen: null };
  }
}
