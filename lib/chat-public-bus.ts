/**
 * lib/chat-public-bus.ts
 *
 * Brandon 2026-05-16 (Chat realtime):
 *
 * In-memory pub/sub para mensajes del chat hacia el cliente storefront via SSE.
 * Espejo del patrón `lib/sse-emitter.ts` pero scopeado por threadId (en vez
 * de tenantId), porque cada cliente solo se subscribe a SU thread.
 *
 * Seguridad: el endpoint /api/chat/public/stream valida ownership
 * (storeSlug + customerPhone) ANTES de subscribir el stream — el bus en sí
 * no valida.
 *
 * Notas operativas:
 *  - Cada thread mantiene su propio Set de subscriptores. Si nadie escucha,
 *    el emit es no-op (no acumula).
 *  - El bus es per-instancia. En multi-instance (Vercel serverless con
 *    múltiples regions/workers), un message emitido en instance A NO llega
 *    a clients conectados a instance B. Para esa escala se necesita Redis
 *    pub/sub o Supabase Realtime — fuera del scope de esta versión.
 *  - Cleanup automático: cuando el bucket queda vacío, se borra para no
 *    leak memoria.
 */

type SseSend = (data: string) => void;

declare global {
  var __chatPublicBus: Map<string, Set<SseSend>> | undefined;
}

// Key: `${tenantId}:${threadId}` — evita colisión cross-tenant si por
// alguna razón dos threads tienen el mismo id (no debería pasar — los
// thread ids son CUIDs únicos, pero defensa en profundidad no daña).
const buckets: Map<string, Set<SseSend>> =
  globalThis.__chatPublicBus ?? (globalThis.__chatPublicBus = new Map());

function keyOf(tenantId: string, threadId: string): string {
  return `${tenantId}:${threadId}`;
}

export function subscribeChatPublic(
  tenantId: string,
  threadId: string,
  send: SseSend,
): () => void {
  const k = keyOf(tenantId, threadId);
  let bucket = buckets.get(k);
  if (!bucket) {
    bucket = new Set();
    buckets.set(k, bucket);
  }
  bucket.add(send);
  return () => {
    bucket?.delete(send);
    if (bucket && bucket.size === 0) buckets.delete(k);
  };
}

export function emitChatPublic(
  tenantId: string,
  threadId: string,
  data: unknown,
): void {
  const k = keyOf(tenantId, threadId);
  const bucket = buckets.get(k);
  if (!bucket || bucket.size === 0) return;
  const message = `event: chat_message\ndata: ${JSON.stringify(data)}\n\n`;
  for (const send of [...bucket]) {
    try {
      send(message);
    } catch {
      bucket.delete(send);
    }
  }
}

/** Total connections — útil para capacity guards. */
export function totalChatPublicConnections(): number {
  let total = 0;
  for (const set of buckets.values()) total += set.size;
  return total;
}
