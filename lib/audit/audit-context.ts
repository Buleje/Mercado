/**
 * lib/audit/audit-context.ts
 *
 * AsyncLocalStorage para propagar IP + actor desde el handler HTTP hasta el
 * complianceAuditExtension de Prisma (Ley 29733 art. 23-25 — origen de la
 * operación obligatorio en audit log).
 *
 * Antes (round 7): writeAuditEntry escribía `ipAddress: null` siempre porque
 * la extension Prisma corre fuera del contexto HTTP. SBS rechaza la cadena
 * como evidencia sin IP/user trazable. Pentest M004.
 *
 * Ahora: el handler envuelve su lógica con `runWithAuditContext(req, fn)` y
 * cualquier escritura a SENSITIVE_MODELS dentro de ese contexto async ve el
 * IP/user real via getAuditContext().
 *
 * Compatibilidad: si el handler NO usa el wrapper, getAuditContext() devuelve
 * null y la extension cae al comportamiento anterior (ipAddress null) sin
 * crash. Migración incremental endpoint por endpoint.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { getClientIp } from "@/lib/rate-limit";

export interface AuditCtx {
  ipAddress: string | null;
  userId: string | null;
  requestId: string | null;
}

const storage = new AsyncLocalStorage<AuditCtx>();

/**
 * Lee el contexto de audit del async store actual.
 * Retorna null si el handler no fue envuelto con runWithAuditContext.
 */
export function getAuditContext(): AuditCtx | null {
  return storage.getStore() ?? null;
}

/**
 * Wrap explícito con un contexto pre-armado. Útil cuando el caller ya
 * tiene IP/user resueltos (ej. cron jobs con `userId: "cron"`).
 */
export function withAuditContext<T>(ctx: AuditCtx, fn: () => T): T {
  return storage.run(ctx, fn);
}

/**
 * Helper drop-in para route handlers. Una sola línea al inicio:
 *
 *   export async function POST(req: NextRequest) {
 *     return runWithAuditContext(req, userId, async () => {
 *       // ... handler logic
 *     });
 *   }
 *
 * Extrae IP del request (X-Forwarded-For / X-Real-IP / X-Vercel-Forwarded-For
 * via lib/rate-limit#getClientIp) y requestId del header x-request-id que
 * setea proxy.ts.
 */
export function runWithAuditContext<T>(
  req: { headers: { get(name: string): string | null } },
  userId: string | null,
  fn: () => T,
): T {
  const ctx: AuditCtx = {
    ipAddress: getClientIp(req),
    userId,
    requestId: req.headers.get("x-request-id"),
  };
  return storage.run(ctx, fn);
}
