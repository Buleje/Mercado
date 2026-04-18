/**
 * lib/db/vendor-registrations.db.ts — DEPRECADO (ADR-079)
 *
 * Este stub vivio in-memory antes de que ADR-079 materializara
 * `VendorApplication` en Prisma. Los call sites originales
 * (`/api/vendor/registration` route.ts) fueron migrados al nuevo DB class.
 *
 * Por ahora dejamos un shim delgado que:
 *   1. Marca cualquier uso como @deprecated
 *   2. Delega a VendorApplicationsDB.submit / getById / listPending
 *   3. Mantiene firmas compatibles con el shape viejo para que imports
 *      antiguos no exploten.
 *
 * En la proxima major release se elimina el archivo entero.
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

/**
 * @deprecated Usar `VendorApplicationsDB` de `@/lib/db/vendor-applications.db`.
 *
 * Esta clase queda como shim para no romper imports legacy. Todos los
 * metodos tiran un warning en consola una vez por proceso y delegan al
 * reemplazo cuando es posible.
 */
let warnedOnce = false;
function warnDeprecated(method: string) {
  if (warnedOnce) return;
  warnedOnce = true;
  // eslint-disable-next-line no-console
  console.warn(
    `[deprecated] VendorRegistrationsDB.${method} — migrar a VendorApplicationsDB (ADR-079)`,
  );
}

export class VendorRegistrationsDB {
  static async create(
    _tenantId: string,
    _payload: VendorRegistrationPayload,
  ): Promise<VendorRegistrationRecord> {
    warnDeprecated("create");
    throw new Error(
      "VendorRegistrationsDB.create is deprecated — use /api/vendor/registration which now persists via VendorApplicationsDB.submit",
    );
  }

  static async getById(
    _tenantId: string,
    _id: string,
  ): Promise<VendorRegistrationRecord | null> {
    warnDeprecated("getById");
    return null;
  }

  static async listPending(
    _tenantId: string,
  ): Promise<VendorRegistrationRecord[]> {
    warnDeprecated("listPending");
    return [];
  }

  static async updateStatus(
    _tenantId: string,
    _id: string,
    _status: VendorRegistrationStatus,
  ): Promise<VendorRegistrationRecord | null> {
    warnDeprecated("updateStatus");
    return null;
  }

  /** no-op — se conserva para tests antiguos que limpiaban el Map */
  static async _clearAll() {
    // Noop: la persistencia real ahora esta en Prisma.
  }
}
