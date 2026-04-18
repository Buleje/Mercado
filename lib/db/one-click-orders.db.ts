import "server-only";

/**
 * one-click-orders.db.ts — STUB documentado para One-Click Buy.
 *
 * ⚠️  ZONA DE PELIGRO — lee antes de tocar ⚠️
 * Este archivo NO modifica `lib/db/orders.db.ts` ni el state-machine real.
 * Es un stub paralelo con fines de demostración UI.
 *
 * Para convertirlo en flow real se requiere:
 *   1. Crear ADR (checkout-squad) mapeando campos al modelo Order.
 *   2. Resolver idempotency con id/tenantId/userId + timestamp.
 *   3. Instrumentar eventos (Stripe/Yape) con webhook handler.
 *   4. Validar tenantId aislamiento (regla CLAUDE.md #3).
 *
 * Mientras tanto: genera un id sintético, no escribe DB, loguea en audit.
 */

import { randomUUID } from "crypto";
import type { OneClickOrderInput } from "@/lib/validators/one-click";

export interface OneClickOrderResult {
  id: string;
  status: "stub_created";
  createdAt: string;
  estimatedEta: string;
}

/**
 * createOneClickOrder — stub idempotente que NO persiste.
 *
 * @param data - payload validado via OneClickOrderSchema.safeParse()
 * @param userId - customer logueado
 * @param tenantId - tenant activo (aislamiento obligatorio, aunque sea stub)
 */
export async function createOneClickOrder(
  data: OneClickOrderInput,
  userId: string,
  tenantId: string,
): Promise<OneClickOrderResult> {
  if (!userId) throw new Error("userId required for 1-click buy");
  if (!tenantId) throw new Error("tenantId required (multi-tenant isolation)");

  // Generar id determinista basado en payload para evitar duplicados accidentales
  // al hacer refresh durante demo. En real-flow usariamos idempotency-key header.
  const syntheticId = `oc_${tenantId.slice(0, 6)}_${randomUUID().slice(0, 12)}`;

  // ETA mock: 25 min desde ahora
  const etaDate = new Date(Date.now() + 25 * 60 * 1000);

  return {
    id: syntheticId,
    status: "stub_created",
    createdAt: new Date().toISOString(),
    estimatedEta: etaDate.toISOString(),
  };
}
