/**
 * lib/db/vendor-grace.db.ts
 *
 * Grace period storage para vendor identity alerts.
 *
 * Cuando el admin del tenant reconoce una alerta y elige "voy a regularizar
 * en N días", persistimos un grace marker en cacheStore. El cron lee este
 * marker antes de crear nueva notification — si está activo, skip ese vendor
 * durante el período de gracia (no spam mientras el admin trabaja en
 * regularizar con SUNAT/RENIEC).
 *
 * Storage:
 *   - cacheStore key: `vendor-identity-grace:<tenantId>`
 *   - value: { vendorId, kind, until ISO, reason?, by username }
 *   - TTL: hasta el `until` (cacheStore acepta segundos)
 *
 * Audit ref: TD-058 capa 8 (self-service para reducir noise sin perder trail).
 */
import "server-only";
import { cacheStore } from "@/lib/cache";
import { logger } from "@/lib/logger";

export type AlertKind = "ruc-changed" | "ruc-not-found" | "dni-not-found";

export interface GraceRecord {
  /** Vendor application id reconocido */
  vendorId: string;
  /** Tipo de alerta sobre el que se aplica gracia */
  kind: AlertKind;
  /** ISO timestamp hasta el que el cron NO debe re-alertar */
  until: string;
  /** Plazo en días que el admin eligió (3/7/14) */
  graceDays: number;
  /** Razón libre opcional ("Cita en SUNAT lunes", "Documento en trámite", etc) */
  reason?: string;
  /** Username del admin que reconoció (audit trail) */
  acknowledgedBy: string;
  /** ISO timestamp cuando se creó el grace */
  acknowledgedAt: string;
}

/** Plazos válidos en días — UI ofrece estos 3 a elegir. */
export const VALID_GRACE_DAYS = [3, 7, 14] as const;

function keyFor(tenantId: string): string {
  return `vendor-identity-grace:${tenantId}`;
}

export const VendorGraceDB = {
  /**
   * Crea o sobreescribe el grace para el tenant. Solo un grace activo por
   * tenant (el último gana). Si el admin escoge un plazo mayor mientras
   * uno previo sigue activo, el nuevo extiende; si es menor, lo acorta.
   */
  async set(
    tenantId: string,
    record: Omit<GraceRecord, "until" | "acknowledgedAt"> & {
      until?: string;
      acknowledgedAt?: string;
    },
  ): Promise<GraceRecord> {
    const now = new Date();
    const acknowledgedAt = record.acknowledgedAt ?? now.toISOString();
    const ttlSec = record.graceDays * 24 * 60 * 60;
    const until = record.until ?? new Date(now.getTime() + ttlSec * 1000).toISOString();
    const full: GraceRecord = {
      vendorId: record.vendorId,
      kind: record.kind,
      until,
      graceDays: record.graceDays,
      ...(record.reason != null && { reason: record.reason }),
      acknowledgedBy: record.acknowledgedBy,
      acknowledgedAt,
    };
    cacheStore.set(keyFor(tenantId), full, ttlSec);
    logger.info("[vendor-grace] set", {
      tenantId,
      vendorId: full.vendorId,
      kind: full.kind,
      graceDays: full.graceDays,
      until: full.until,
      by: full.acknowledgedBy,
    });
    return full;
  },

  /** Lee el grace activo del tenant; null si no hay o expiró (cacheStore TTL). */
  get(tenantId: string): GraceRecord | null {
    return cacheStore.get<GraceRecord>(keyFor(tenantId)) ?? null;
  },

  /**
   * Helper de decisión: ¿el cron debe SKIP alertar a este vendor?
   * Skip si: hay grace activo Y matchea el vendorId Y matchea el kind.
   * Si el kind cambió (RUC ya HABIDO pero ahora DNI cae), NO skip — es
   * otro problema y merece alerta nueva.
   */
  shouldSkip(tenantId: string, vendorId: string, kind: AlertKind): boolean {
    const grace = this.get(tenantId);
    if (!grace) return false;
    if (grace.vendorId !== vendorId) return false;
    if (grace.kind !== kind) return false;
    // Doble check (cacheStore TTL ya filtra pero por si acaso)
    if (new Date(grace.until).getTime() <= Date.now()) return false;
    return true;
  },

  /** Borra explícitamente el grace (cuando el admin marca "ya regularicé"). */
  clear(tenantId: string): void {
    cacheStore.del(keyFor(tenantId));
    logger.info("[vendor-grace] cleared", { tenantId });
  },
};
