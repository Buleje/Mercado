/**
 * Global in-memory SSE emitter for admin real-time updates.
 *
 * SECURITY/CRITICAL 2026-05-06 (audit notifs #1): tenant-scoped emitter.
 * Antes el `Set` global hacía fan-out a TODOS los admins conectados, así
 * que admin de tenant A recibía `new_order` de tenant B → leak masivo de
 * pedidos cross-tenant en tiempo real.
 *
 * Ahora el emitter mantiene un Map por tenantId. `subscribe()` retorna una
 * función de unsubscribe segura. `emitAdminSSE(tenantId, event, data)` solo
 * itera el bucket de ese tenant.
 *
 * Backward-compat: `emitAdminSSE(event, data)` (firma vieja) sigue funcionando
 * pero loggea warning y NO hace broadcast (fallaría open). Migrar todos los
 * callers a la firma nueva.
 */

type SseSend = (data: string) => void;

declare global {
  var __sseAdminClientsByTenant: Map<string, Set<SseSend>> | undefined;
}

const buckets: Map<string, Set<SseSend>> =
  globalThis.__sseAdminClientsByTenant ??
  (globalThis.__sseAdminClientsByTenant = new Map());

/** Subscribe a stream to a tenant. Returns an unsubscribe function. */
export function subscribeAdminSSE(tenantId: string, send: SseSend): () => void {
  let bucket = buckets.get(tenantId);
  if (!bucket) {
    bucket = new Set();
    buckets.set(tenantId, bucket);
  }
  bucket.add(send);
  return () => {
    bucket?.delete(send);
    if (bucket && bucket.size === 0) buckets.delete(tenantId);
  };
}

/** Total connections summed across tenants (for capacity guards). */
export function totalAdminSSEConnections(): number {
  let total = 0;
  for (const set of buckets.values()) total += set.size;
  return total;
}

/** Connections for a specific tenant (for per-tenant cap). */
export function tenantAdminSSEConnections(tenantId: string): number {
  return buckets.get(tenantId)?.size ?? 0;
}

/**
 * Broadcast an SSE event to admins of a tenant.
 *
 * Firma nueva (recomendada): `emitAdminSSE(tenantId, event, data)`.
 * Firma vieja (deprecated): `emitAdminSSE(event, data)` — fail-closed,
 * NO emite a nadie y loggea warning.
 */
export function emitAdminSSE(tenantId: string, event: string, data: unknown): void;
export function emitAdminSSE(event: string, data: unknown): void;
export function emitAdminSSE(arg1: string, arg2: unknown, arg3?: unknown): void {
  // Detectar firma vieja: si arg3 es undefined y arg2 NO es un string-like
  // event name, entonces es la firma legacy. Para simplificar: si solo hay
  // 2 args, es legacy.
  if (arguments.length === 2) {
     
    console.warn(
      `[sse-emitter] DEPRECATED: emitAdminSSE("${arg1}") sin tenantId — ` +
      `evento NO emitido. Migrar caller a emitAdminSSE(tenantId, event, data).`,
    );
    return;
  }
  const tenantId = arg1;
  const event = String(arg2);
  const data = arg3;
  const bucket = buckets.get(tenantId);
  if (!bucket || bucket.size === 0) return;
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const send of [...bucket]) {
    try {
      send(message);
    } catch {
      bucket.delete(send);
    }
  }
}

/**
 * Backward-compat: el viejo `sseAdminClients` se mantiene como Set vacío
 * para no romper callers que importen el símbolo. NO se debe usar — usar
 * subscribeAdminSSE/emitAdminSSE.
 */
export const sseAdminClients: Set<SseSend> = new Set();
