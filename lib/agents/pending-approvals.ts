/**
 * lib/agents/pending-approvals.ts
 *
 * Store de tools pendientes de aprobación humana (HITL — TD-025, Excel
 * Agentes IA práctica #10).
 *
 * Flujo:
 *   1. El LLM pide ejecutar un tool marcado con `requiresApproval: true`
 *      en `lib/agents/tool-definitions.ts`.
 *   2. El route handler `ai-assistant/route.ts` detecta el flag y llama
 *      `stashPendingApproval(...)` en vez de ejecutar el tool directamente.
 *   3. El tool result devuelto al LLM es un mensaje: "Esta acción requiere
 *      aprobación humana. ID: xxx".
 *   4. El frontend (AICommandCenter.tsx en sesión futura) hace polling a
 *      GET `/api/ai-assistant/approvals` para mostrar el modal.
 *   5. El admin aprueba/rechaza via POST `/api/ai-assistant/approvals`.
 *   6. Al aprobar, el endpoint ejecuta el tool vía el orchestrator con el
 *      payload original stashado.
 *
 * TTL: 10 minutos. Las approvals expiradas se limpian en `list()` y no
 * pueden resolverse.
 *
 * Store en memoria (compatible con serverless Fluid Compute warm instances,
 * pero NO sincroniza entre instancias frías). Para producción con múltiples
 * instancias persistentes, migrar a Redis. Ver TD-025.
 */

import { randomUUID } from "node:crypto";

export interface PendingApproval {
  id: string;
  tenantId: string;
  toolName: string;
  domain: string;
  action: string;
  payload: Record<string, unknown>;
  createdAt: number;
  /** ID de la conversación que disparó la aprobación — para contexto en UI. */
  conversationId?: string;
  /** Username del admin que verá la aprobación. */
  requestedBy: string;
}

export interface ApprovalResolution {
  id: string;
  action: "approve" | "reject";
  resolvedBy: string;
  resolvedAt: number;
  result?: unknown;
  error?: string;
}

// ── Store en memoria ─────────────────────────────────────────────────────────

const TTL_MS = 10 * 60 * 1000; // 10 minutos
const store = new Map<string, PendingApproval>();
const MAX_SIZE = 100; // Safety — evita memory leak si el admin nunca aprueba

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Guarda un tool call pendiente y devuelve su ID.
 */
export function stashPendingApproval(
  input: Omit<PendingApproval, "id" | "createdAt">,
): string {
  // Evict oldest si estamos en el límite
  if (store.size >= MAX_SIZE) {
    const oldest = [...store.entries()].sort(
      (a, b) => a[1].createdAt - b[1].createdAt,
    )[0];
    if (oldest) store.delete(oldest[0]);
  }

  const id = randomUUID();
  const entry: PendingApproval = {
    ...input,
    id,
    createdAt: Date.now(),
  };
  store.set(id, entry);
  return id;
}

/**
 * Lista aprobaciones pendientes para un tenant. Aplica TTL automático.
 */
export function listPendingApprovals(tenantId: string): PendingApproval[] {
  const now = Date.now();
  const result: PendingApproval[] = [];
  for (const [id, approval] of store.entries()) {
    if (now - approval.createdAt > TTL_MS) {
      store.delete(id);
      continue;
    }
    if (approval.tenantId === tenantId) {
      result.push(approval);
    }
  }
  return result.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Obtiene una aprobación por ID, aplicando TTL.
 * Retorna null si expiró o no existe.
 */
export function getPendingApproval(id: string): PendingApproval | null {
  const entry = store.get(id);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TTL_MS) {
    store.delete(id);
    return null;
  }
  return entry;
}

/**
 * Remueve una aprobación del store (tras resolverla).
 * Retorna la aprobación removida o null si no existía.
 */
export function removePendingApproval(id: string): PendingApproval | null {
  const entry = getPendingApproval(id);
  if (!entry) return null;
  store.delete(id);
  return entry;
}

/**
 * Testing helper — limpia todo el store (solo para uso en tests).
 */
export function _clearApprovalsStore(): void {
  store.clear();
}

/**
 * Testing helper — tamaño actual del store.
 */
export function _approvalsStoreSize(): number {
  return store.size;
}
