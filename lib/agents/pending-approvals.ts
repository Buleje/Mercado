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
 *   4. El frontend (Comandos IA › Lo que hizo la IA) hace polling a
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
  /**
   * Lo que se le muestra al humano en vez del payload crudo (sin ids ni el
   * número entero). Lo devuelve el ensayo (`data.mostrar`); el GET lo lista
   * en lugar de `payload`.
   */
  mostrar?: Record<string, unknown>;
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

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Lo que deja el ensayo de una herramienta con aprobación: qué se guarda para
 * ejecutar y qué ve el humano en la tarjeta. Un ensayo puede RESOLVER el pedido
 * («Alex» → el contacto con su número, «la resolución» → el id del papel) y
 * devolverlo en `data.payloadConfirmado`: tras el «Sí» se ejecuta ESO, no lo
 * que escribió el modelo, así lo que se confirmó es lo que sale. `data.mostrar`
 * es la versión para leer. Sin ninguno de los dos, todo sigue como antes.
 */
export function payloadsDelEnsayo(
  args: Record<string, unknown>,
  data: unknown,
): { payload: Record<string, unknown>; mostrar?: Record<string, unknown> } {
  const d = esObjeto(data) ? data : {};
  const payload = esObjeto(d.payloadConfirmado) ? d.payloadConfirmado : args;
  return esObjeto(d.mostrar) ? { payload, mostrar: d.mostrar } : { payload };
}

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
