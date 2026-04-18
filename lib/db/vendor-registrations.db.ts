/**
 * lib/db/vendor-registrations.db.ts
 *
 * Placeholder DB class para solicitudes de registro de vendedores (/vender/registro).
 *
 * ¿Por qué placeholder y no Prisma real?
 *
 *   Este módulo todavía NO tiene tabla real en `prisma/schema.prisma`
 *   (la tabla `VendorRegistration` pertenece al roadmap de Seller Central y
 *   requiere diseño de compliance Ley 29733 + SUNAT antes de escribir a DB).
 *   Hasta ese momento, guardamos las solicitudes en un store en memoria
 *   compartido entre requests (pierde data en cold-start — eso es aceptable
 *   porque la solicitud se replica por email al equipo de Buleje).
 *
 *   Cuando llegue el momento de materializar el modelo en Prisma:
 *     - Agregar `model VendorRegistration` en schema.prisma
 *     - Correr `prisma migrate deploy` con DIRECT_URL
 *     - Reemplazar la implementación in-memory por llamadas a `prisma.vendorRegistration.*`
 *     - Mantener la signature de VendorRegistrationsDB idéntica para no romper call sites
 *
 * Regla del repo (CLAUDE.md #1): NUNCA Prisma directo — siempre pasar por una
 * clase DB. Este archivo es el point-of-entry oficial para vendor registrations.
 *
 * Regla del repo (CLAUDE.md #3): tenantId primer parámetro siempre.
 */

import type { VendorRegistrationPayload } from "@/lib/validators/vendor-registration";

export type VendorRegistrationStatus =
  | "pending_review"
  | "verifying_sunat"
  | "approved"
  | "rejected"
  | "more_info_requested";

export interface VendorRegistrationRecord {
  id: string;
  tenantId: string;
  status: VendorRegistrationStatus;
  payload: VendorRegistrationPayload;
  createdAt: string;
  updatedAt: string;
}

// ── In-memory singleton store ─────────────────────────────────────────────
// Export of a Map in module scope survives for the life of the server process
// (next dev, serverless warm instance). Cold start = lost — acceptable for
// placeholder (emails still get delivered).
const store = new Map<string, VendorRegistrationRecord>();

function generateId(): string {
  // Formato human-readable: BSL + timestamp base36 + 4-digit rand (útil para reclamos soporte).
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(Math.random() * 9999)
    .toString()
    .padStart(4, "0");
  return `BSL-${ts}-${rand}`;
}

export class VendorRegistrationsDB {
  /**
   * Crea una nueva solicitud de registro. La valida contra Zod debería
   * ocurrir en el API route (route.ts) — este método asume payload válido.
   */
  static async create(
    tenantId: string,
    payload: VendorRegistrationPayload,
  ): Promise<VendorRegistrationRecord> {
    const now = new Date().toISOString();
    const record: VendorRegistrationRecord = {
      id: generateId(),
      tenantId,
      status: "pending_review",
      payload,
      createdAt: now,
      updatedAt: now,
    };
    store.set(record.id, record);
    return record;
  }

  /**
   * Busca una solicitud por id + tenant. Aislamiento multi-tenant obligatorio.
   */
  static async getById(
    tenantId: string,
    id: string,
  ): Promise<VendorRegistrationRecord | null> {
    const rec = store.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  /**
   * Lista todas las solicitudes pendientes del tenant (uso superadmin).
   */
  static async listPending(
    tenantId: string,
  ): Promise<VendorRegistrationRecord[]> {
    return Array.from(store.values()).filter(
      (r) => r.tenantId === tenantId && r.status === "pending_review",
    );
  }

  /**
   * Actualiza status de una solicitud. Uso aprobación/rechazo admin.
   */
  static async updateStatus(
    tenantId: string,
    id: string,
    status: VendorRegistrationStatus,
  ): Promise<VendorRegistrationRecord | null> {
    const rec = store.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    rec.status = status;
    rec.updatedAt = new Date().toISOString();
    store.set(id, rec);
    return rec;
  }

  /** Útil en tests para resetear el singleton. */
  static async _clearAll() {
    store.clear();
  }
}
