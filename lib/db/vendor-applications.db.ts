import "server-only";
import { prisma } from "@/lib/prisma";
import { cacheLife, cacheTag } from "next/cache";
import { revalidateTag } from "next/cache";
import { logger } from "@/lib/logger";
import {
  canTransition,
  resolveTransition,
  InvalidStateTransitionError,
  type ApplicationReviewAction,
  type ApplicationStatus,
} from "@/lib/state-machines/vendor-application-machine";
import type {
  Prisma,
  VendorApplication,
  VendorApplicationReview,
  VendorCategory,
  VendorDistrict,
  VendorPlan,
} from "@/lib/generated/prisma/client";

// Re-export public del state machine para no romper callers existentes.
// Los consumers pueden tambien importar directo desde
// `@/lib/state-machines/vendor-application-machine`.
export {
  canTransition,
  resolveTransition,
  InvalidStateTransitionError,
  type ApplicationReviewAction,
  type ApplicationStatus,
};

/**
 * lib/db/vendor-applications.db.ts
 *
 * DB class para aplicaciones de vendedores del marketplace (ADR-079).
 *
 * ══ EXCEPCION A LA REGLA CLAUDE.md #3 ══
 * Esta clase NO recibe `tenantId` como primer parametro. La razon es
 * intencional y esta documentada en ADR-079 §2.3:
 *
 *   VendorApplication es PRE-TENANT. La solicitud nace antes de que
 *   exista un Tenant (el Tenant se crea recien tras aprobacion, via
 *   provisionTenantStub). Por eso viven a nivel plataforma, igual que
 *   `SupplierSignupDB` (ver lib/db/supplier-signup.db.ts y su constante
 *   `PLATFORM_TENANT_ID`).
 *
 * State machine (ADR-079 §2.2):
 *
 *   pending → under_review (action: start_review)
 *   under_review → info_requested (action: request_info)
 *   pending | under_review | info_requested → approved (action: approve)
 *   approved → tenant_provisioned (hook automatico)
 *   cualquiera != tenant_provisioned → rejected (action: reject)
 *   rejected → pending (action: reopen)
 *
 * Toda transicion valida inserta un row en VendorApplicationReview para
 * garantizar audit trail. Transicion ilegal → `INVALID_STATE_TRANSITION`.
 *
 * Cache (ADR-019):
 *   listPending / listByStatus / getStats → "use cache" con cacheLife.
 *   Tags: vendor-applications:list, vendor-applications:stats,
 *         vendor-applications:${id}. Writes invalidan con revalidateTag.
 */

// ─── Types publicos ──────────────────────────────────────────────────────────

export type { VendorCategory, VendorDistrict, VendorPlan };
export type VendorApplicationRow = VendorApplication;
export type VendorApplicationWithReviews = VendorApplication & {
  reviews: VendorApplicationReview[];
};

/** Payload aceptado por submit() — shape del wizard /vender/registro. */
export interface VendorApplicationSubmitInput {
  businessName: string;
  ruc: string;
  address: string;
  district: VendorDistrict;
  category: VendorCategory;
  contactName: string;
  contactDni: string;
  contactPhone: string;
  contactEmail: string;
  rucDocumentUrl?: string | null;
  storefrontPhotoUrl?: string | null;
  termsAcceptedAt?: Date | null;
  schedule: unknown; // JSON bruto del wizard step 4
  deliveryZones: unknown;
  deliveryFeeSoles: number;
  plan: VendorPlan;
}

export interface VendorApplicationStats {
  pending: number;
  underReview: number;
  approvedThisMonth: number;
  rejectedThisMonth: number;
  tenantProvisioned: number;
  /** Dias promedio entre submittedAt y decidedAt para apps decididas. */
  avgReviewDays: number;
  /** Top 5 razones de rechazo (decisionReason con status=rejected). */
  topRejectionReasons: Array<{ reason: string; count: number }>;
  generatedAt: string;
}

// ─── Errores especificos del DB class ───────────────────────────────────────

export class RucAlreadyRegisteredError extends Error {
  code = "RUC_ALREADY_REGISTERED" as const;
  constructor(public ruc: string) {
    super(`Ya existe una aplicacion con RUC ${ruc}`);
    this.name = "RucAlreadyRegisteredError";
  }
}

export class ApplicationNotFoundError extends Error {
  code = "APPLICATION_NOT_FOUND" as const;
  constructor(public id: string) {
    super(`Aplicacion ${id} no existe`);
    this.name = "ApplicationNotFoundError";
  }
}

// ─── Tags de cache ───────────────────────────────────────────────────────────

const TAG_LIST = "vendor-applications:list" as const;
const TAG_STATS = "vendor-applications:stats" as const;
const tagFor = (id: string) => `vendor-applications:${id}` as const;

function invalidateAll(id?: string): void {
  // Next 16: revalidateTag requiere 2 args (tag, profile). "max" descarta
  // la entrada sin esperar al ciclo de revalidacion.
  revalidateTag(TAG_LIST, "max");
  revalidateTag(TAG_STATS, "max");
  if (id) revalidateTag(tagFor(id), "max");
}

// ─── DB class ────────────────────────────────────────────────────────────────

export const VendorApplicationsDB = {
  /**
   * Crea una nueva aplicacion con status=pending. Valida que el RUC no
   * este en uso (duplicate detection). NO requiere tenantId (pre-tenant).
   *
   * @throws RucAlreadyRegisteredError si ya existe una fila con ese RUC
   */
  async submit(input: VendorApplicationSubmitInput): Promise<VendorApplicationRow> {
    // Dedup check por RUC. La @@unique del schema es la verdad; esto es un
    // pre-check para devolver un error legible antes del INSERT.
    const existing = await prisma.vendorApplication.findUnique({
      where: { ruc: input.ruc },
      select: { id: true },
    });
    if (existing) {
      throw new RucAlreadyRegisteredError(input.ruc);
    }

    try {
      const row = await prisma.vendorApplication.create({
        data: {
          businessName: input.businessName,
          ruc: input.ruc,
          address: input.address,
          district: input.district,
          category: input.category,
          contactName: input.contactName,
          contactDni: input.contactDni,
          contactPhone: input.contactPhone,
          contactEmail: input.contactEmail,
          rucDocumentUrl: input.rucDocumentUrl ?? null,
          storefrontPhotoUrl: input.storefrontPhotoUrl ?? null,
          termsAcceptedAt: input.termsAcceptedAt ?? null,
          schedule: input.schedule as object,
          deliveryZones: input.deliveryZones as object,
          deliveryFeeSoles: input.deliveryFeeSoles,
          plan: input.plan,
          status: "pending",
        },
      });
      invalidateAll(row.id);
      return row;
    } catch (err) {
      // Si la race condition gana, el DB unique lo captura y llega aca.
      const code = (err as { code?: string }).code;
      if (code === "P2002") {
        throw new RucAlreadyRegisteredError(input.ruc);
      }
      throw err;
    }
  },

  /**
   * Lista aplicaciones en estado pending — uso superadmin.
   * Cache 30s, tag `vendor-applications:list`.
   */
  async listPending(): Promise<VendorApplicationRow[]> {
    "use cache";
    cacheLife({ revalidate: 30, stale: 15, expire: 120 });
    cacheTag(TAG_LIST);
    return prisma.vendorApplication.findMany({
      where: { status: "pending" },
      orderBy: { submittedAt: "desc" },
    });
  },

  /**
   * Lista aplicaciones por estado — acepta "all" para traer todo.
   */
  async listByStatus(
    status: ApplicationStatus | "all",
  ): Promise<VendorApplicationRow[]> {
    "use cache";
    cacheLife({ revalidate: 30, stale: 15, expire: 120 });
    cacheTag(TAG_LIST);
    const where = status === "all" ? {} : { status };
    return prisma.vendorApplication.findMany({
      where,
      orderBy: { submittedAt: "desc" },
      take: 500,
    });
  },

  /**
   * Detalle completo con historia de reviews. Cache tag individual.
   */
  async getById(id: string): Promise<VendorApplicationWithReviews | null> {
    "use cache";
    cacheLife({ revalidate: 60, stale: 30, expire: 300 });
    cacheTag(tagFor(id));
    return prisma.vendorApplication.findUnique({
      where: { id },
      include: {
        reviews: { orderBy: { createdAt: "asc" } },
      },
    });
  },

  /**
   * Lookup por RUC — util para mostrar "ya aplicaste" en el wizard.
   * No se cachea (low volume, low hit-rate).
   */
  async getByRuc(ruc: string): Promise<VendorApplicationRow | null> {
    return prisma.vendorApplication.findUnique({ where: { ruc } });
  },

  /**
   * Transita la aplicacion y registra la action en VendorApplicationReview.
   * Runs dentro de una transaccion: o todo ok o nada.
   *
   * Uso privado — los callers publicos (startReview, approve, reject, …)
   * llaman a esta funcion con la action correcta.
   */
  async _applyAction(opts: {
    id: string;
    reviewerUserId: string;
    action: ApplicationReviewAction;
    note?: string | null;
    extraData?: {
      reviewStartedAt?: Date | null;
      decidedAt?: Date | null;
      decisionReason?: string | null;
      infoRequestNote?: string | null;
    };
  }): Promise<VendorApplicationWithReviews> {
    const { id, reviewerUserId, action, note, extraData } = opts;

    return prisma.$transaction(async (tx) => {
      const current = await tx.vendorApplication.findUnique({
        where: { id },
      });
      if (!current) throw new ApplicationNotFoundError(id);

      // Resuelve destino — throws InvalidStateTransitionError si invalida.
      const nextStatus = resolveTransition(current.status, action);

      // Construye el patch de extras (tipado Prisma update)
      const patch: Prisma.VendorApplicationUncheckedUpdateInput = {
        status: nextStatus,
        reviewerUserId,
      };
      if (extraData?.reviewStartedAt !== undefined) {
        patch.reviewStartedAt = extraData.reviewStartedAt;
      }
      if (extraData?.decidedAt !== undefined) {
        patch.decidedAt = extraData.decidedAt;
      }
      if (extraData?.decisionReason !== undefined) {
        patch.decisionReason = extraData.decisionReason;
      }
      if (extraData?.infoRequestNote !== undefined) {
        patch.infoRequestNote = extraData.infoRequestNote;
      }

      await tx.vendorApplication.update({
        where: { id },
        data: patch,
      });

      await tx.vendorApplicationReview.create({
        data: {
          applicationId: id,
          reviewerUserId,
          action,
          note: note ?? null,
          previousStatus: current.status,
          newStatus: nextStatus,
        },
      });

      const withReviews = await tx.vendorApplication.findUnique({
        where: { id },
        include: { reviews: { orderBy: { createdAt: "asc" } } },
      });

      return withReviews!;
    }).then((result) => {
      invalidateAll(id);
      return result;
    });
  },

  /** pending → under_review */
  async startReview(id: string, reviewerUserId: string) {
    return this._applyAction({
      id,
      reviewerUserId,
      action: "start_review",
      extraData: { reviewStartedAt: new Date() },
    });
  },

  /** under_review → info_requested */
  async requestInfo(id: string, reviewerUserId: string, note: string) {
    const trimmed = note.trim();
    if (!trimmed) {
      throw new Error("request_info requires a non-empty note");
    }
    return this._applyAction({
      id,
      reviewerUserId,
      action: "request_info",
      note: trimmed,
      extraData: { infoRequestNote: trimmed },
    });
  },

  /**
   * (pending | under_review | info_requested) → approved
   * Dispara el hook `provisionTenantStub()` (fire-and-forget) para marcar
   * `tenantId` / `tenantSlug` con valores stub (ADR-079 §2.4).
   */
  async approve(
    id: string,
    reviewerUserId: string,
    reason?: string | null,
  ): Promise<VendorApplicationWithReviews> {
    const result = await this._applyAction({
      id,
      reviewerUserId,
      action: "approve",
      note: reason ?? null,
      extraData: {
        decidedAt: new Date(),
        decisionReason: reason ?? null,
      },
    });

    // Fire-and-forget (CLAUDE.md #7). El stub loggea y retorna un id.
    // El real (ADR-080) creara el Tenant con AdminUser + storePage.
    import("@/lib/vendor/tenant-provisioning")
      .then(({ provisionTenantStub }) =>
        provisionTenantStub(result).catch((err) => {
          logger.error("[vendor-applications] provisionTenantStub failed", {
            applicationId: id,
            error: err instanceof Error ? err.message : String(err),
          });
        }),
      )
      .catch((err) => {
        logger.error(
          "[vendor-applications] failed to import tenant-provisioning module",
          { applicationId: id, error: err instanceof Error ? err.message : String(err) },
        );
      });

    return result;
  },

  /** cualquiera != tenant_provisioned → rejected */
  async reject(
    id: string,
    reviewerUserId: string,
    reason: string,
  ): Promise<VendorApplicationWithReviews> {
    const trimmed = reason.trim();
    if (!trimmed) {
      throw new Error("reject requires a non-empty reason");
    }
    return this._applyAction({
      id,
      reviewerUserId,
      action: "reject",
      note: trimmed,
      extraData: {
        decidedAt: new Date(),
        decisionReason: trimmed,
      },
    });
  },

  /** rejected → pending (superadmin reopen policy) */
  async reopen(
    id: string,
    reviewerUserId: string,
    note?: string,
  ): Promise<VendorApplicationWithReviews> {
    return this._applyAction({
      id,
      reviewerUserId,
      action: "reopen",
      note: note ?? null,
      extraData: {
        decidedAt: null,
        decisionReason: null,
        infoRequestNote: null,
      },
    });
  },

  /**
   * approved → tenant_provisioned. No tiene action asociada (no es una
   * review humana), asi que la DB se updatea directo y NO se inserta en
   * VendorApplicationReview. El caller es el propio provisionTenant[Stub].
   */
  async markTenantProvisioned(
    id: string,
    tenantId: string,
    tenantSlug: string,
  ): Promise<VendorApplicationRow> {
    const current = await prisma.vendorApplication.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!current) throw new ApplicationNotFoundError(id);
    if (current.status !== "approved") {
      throw new InvalidStateTransitionError(
        current.status,
        "tenant_provisioned",
        "approve", // action ficticia — este branch no pasa por resolveTransition
      );
    }

    const updated = await prisma.vendorApplication.update({
      where: { id },
      data: {
        status: "tenant_provisioned",
        tenantId,
        tenantSlug,
      },
    });
    invalidateAll(id);
    return updated;
  },

  /**
   * KPIs para el dashboard del superadmin.
   *
   * - pending: count total con status=pending
   * - underReview: count total con status=under_review
   * - approvedThisMonth / rejectedThisMonth: decididas en el mes actual
   * - tenantProvisioned: count con status=tenant_provisioned
   * - avgReviewDays: (decidedAt - submittedAt) promedio sobre todas las decididas
   * - topRejectionReasons: group by decisionReason sobre rejected
   */
  async getStats(): Promise<VendorApplicationStats> {
    "use cache";
    cacheLife({ revalidate: 60, stale: 30, expire: 300 });
    cacheTag(TAG_STATS);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      pending,
      underReview,
      approvedThisMonth,
      rejectedThisMonth,
      tenantProvisioned,
      decidedApps,
      rejectionGroups,
    ] = await Promise.all([
      prisma.vendorApplication.count({ where: { status: "pending" } }),
      prisma.vendorApplication.count({ where: { status: "under_review" } }),
      prisma.vendorApplication.count({
        where: {
          status: "approved",
          decidedAt: { gte: monthStart },
        },
      }),
      prisma.vendorApplication.count({
        where: {
          status: "rejected",
          decidedAt: { gte: monthStart },
        },
      }),
      prisma.vendorApplication.count({ where: { status: "tenant_provisioned" } }),
      prisma.vendorApplication.findMany({
        where: {
          decidedAt: { not: null },
          status: { in: ["approved", "rejected", "tenant_provisioned"] },
        },
        select: { submittedAt: true, decidedAt: true },
        take: 500,
      }),
      prisma.vendorApplication.groupBy({
        by: ["decisionReason"],
        where: {
          status: "rejected",
          decisionReason: { not: null },
        },
        _count: { _all: true },
        orderBy: { _count: { decisionReason: "desc" } },
        take: 5,
      }),
    ]);

    const avgReviewDays = (() => {
      if (decidedApps.length === 0) return 0;
      const totalMs = decidedApps.reduce((acc, a) => {
        if (!a.decidedAt) return acc;
        return acc + (a.decidedAt.getTime() - a.submittedAt.getTime());
      }, 0);
      const avgMs = totalMs / decidedApps.length;
      return Math.round((avgMs / (1000 * 60 * 60 * 24)) * 10) / 10;
    })();

    return {
      pending,
      underReview,
      approvedThisMonth,
      rejectedThisMonth,
      tenantProvisioned,
      avgReviewDays,
      topRejectionReasons: rejectionGroups
        .filter((g) => g.decisionReason)
        .map((g) => ({
          reason: g.decisionReason as string,
          count: g._count._all,
        })),
      generatedAt: now.toISOString(),
    };
  },
};
