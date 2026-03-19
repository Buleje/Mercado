/**
 * Global in-memory SSE emitter for admin real-time updates.
 * Uses globalThis so the Set survives HMR in development.
 */

declare global {
  var __sseAdminClients: Set<(data: string) => void> | undefined;
}

export const sseAdminClients: Set<(data: string) => void> =
  globalThis.__sseAdminClients ??
  (globalThis.__sseAdminClients = new Set());

/**
 * Broadcast an SSE event to all connected admin clients.
 * Silently drops clients that have disconnected.
 */
export function emitAdminSSE(event: string, data: unknown): void {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const send of [...sseAdminClients]) {
    try {
      send(message);
    } catch {
      sseAdminClients.delete(send);
    }
  }
}
