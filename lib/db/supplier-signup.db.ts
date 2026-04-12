import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { invalidateByPrefix } from "@/lib/cache";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Platform-level sentinel tenantId used by suppliers that haven't been
 * approved/assigned to a tenant yet. Self-signup creates suppliers with this
 * tenantId; approval can later migrate them to the proper tenant if needed.
 */
export const PLATFORM_TENANT_ID = "__platform__";

export const SUPPLIER_STATUS = {
  PENDING: "pending_review",
  APPROVED: "approved",
  REJECTED: "rejected",
  SUSPENDED: "suspended",
} as const;

export type SupplierStatus =
  (typeof SUPPLIER_STATUS)[keyof typeof SUPPLIER_STATUS];

export type SupplierSignupInput = {
  ruc: string;
  razonSocial: string;
  category: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
};

export type DbSupplierRow = {
  id: string;
  name: string;
  ruc: string | null;
  razonSocial: string | null;
  category: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  status: SupplierStatus | string;
  tenantId: string;
  appliedAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  rejectedAt: string | null;
  rejectedBy: string | null;
  rejectionReason: string | null;
  apiKey?: string | null;
  apiKeyGeneratedAt?: string | null;
  createdAt: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toISO(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function mapRow(row: {
  id: string;
  name: string;
  ruc: string | null;
  razonSocial: string | null;
  categoria: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  estado: string | null;
  tenantId: string;
  appliedAt: Date | null;
  approvedAt: Date | null;
  approvedBy: string | null;
  rejectedAt: Date | null;
  rejectedBy: string | null;
  rejectionReason: string | null;
  createdAt: Date;
  portal?: { apiKey: string; createdAt: Date } | null;
}): DbSupplierRow {
  return {
    id: row.id,
    name: row.name,
    ruc: row.ruc,
    razonSocial: row.razonSocial,
    category: row.categoria,
    contactName: row.contactName,
    contactPhone: row.phone,
    contactEmail: row.email,
    status: row.estado ?? SUPPLIER_STATUS.PENDING,
    tenantId: row.tenantId,
    appliedAt: toISO(row.appliedAt),
    approvedAt: toISO(row.approvedAt),
    approvedBy: row.approvedBy,
    rejectedAt: toISO(row.rejectedAt),
    rejectedBy: row.rejectedBy,
    rejectionReason: row.rejectionReason,
    apiKey: row.portal?.apiKey ?? null,
    apiKeyGeneratedAt: row.portal ? toISO(row.portal.createdAt) : null,
    createdAt: toISO(row.createdAt) ?? new Date().toISOString(),
  };
}

/**
 * Generate a high-entropy API key for a supplier portal.
 * 32 random bytes → 64-char hex string. `sk_sup_` prefix marks scope.
 */
function generateApiKey(): string {
  return `sk_sup_${randomBytes(32).toString("hex")}`;
}

// ─── SupplierSignupDB ─────────────────────────────────────────────────────────

export const SupplierSignupDB = {
  /**
   * Register a new supplier with status "pending_review".
   * Platform-level (cross-tenant). The approval workflow can migrate the
   * supplier to a concrete tenant later if needed.
   *
   * @throws Error with message "RUC_ALREADY_REGISTERED" if RUC already exists.
   */
  async register(input: SupplierSignupInput): Promise<DbSupplierRow> {
    // Dedup by RUC across platform scope
    const existing = await prisma.supplier.findFirst({
      where: { ruc: input.ruc, tenantId: PLATFORM_TENANT_ID },
      select: { id: true },
    });
    if (existing) {
      throw new Error("RUC_ALREADY_REGISTERED");
    }

    const id = crypto.randomUUID();

    const row = await prisma.supplier.create({
      data: {
        id,
        name: input.razonSocial,
        razonSocial: input.razonSocial,
        ruc: input.ruc,
        phone: input.contactPhone,
        email: input.contactEmail,
        contactName: input.contactName,
        categoria: input.category,
        estado: SUPPLIER_STATUS.PENDING,
        tenantId: PLATFORM_TENANT_ID,
        appliedAt: new Date(),
      },
    });

    invalidateByPrefix("suppliers:");

    return mapRow({ ...row, portal: null });
  },

  /**
   * Check if a supplier already exists for this RUC at the platform level.
   */
  async findByRuc(ruc: string): Promise<DbSupplierRow | null> {
    const row = await prisma.supplier.findFirst({
      where: { ruc, tenantId: PLATFORM_TENANT_ID },
      include: { portal: true },
    });
    return row ? mapRow(row) : null;
  },

  /**
   * Get one supplier by id (platform scope).
   */
  async getById(id: string): Promise<DbSupplierRow | null> {
    const row = await prisma.supplier.findUnique({
      where: { id },
      include: { portal: true },
    });
    return row ? mapRow(row) : null;
  },

  /**
   * List suppliers in pending_review state.
   */
  async listPendingReview(limit = 100): Promise<DbSupplierRow[]> {
    const rows = await prisma.supplier.findMany({
      where: {
        tenantId: PLATFORM_TENANT_ID,
        estado: SUPPLIER_STATUS.PENDING,
      },
      orderBy: { appliedAt: "desc" },
      take: limit,
      include: { portal: true },
    });
    return rows.map(mapRow);
  },

  /**
   * List all suppliers for the superadmin marketplace queue, optionally
   * filtered by status. Always platform scope.
   */
  async listForQueue(opts?: {
    status?: SupplierStatus;
    limit?: number;
  }): Promise<DbSupplierRow[]> {
    const where: { tenantId: string; estado?: string } = {
      tenantId: PLATFORM_TENANT_ID,
    };
    if (opts?.status) {
      where.estado = opts.status;
    }
    const rows = await prisma.supplier.findMany({
      where,
      orderBy: [{ appliedAt: "desc" }, { createdAt: "desc" }],
      take: opts?.limit ?? 200,
      include: { portal: true },
    });
    return rows.map(mapRow);
  },

  /**
   * Approve a supplier: flips status → "approved", generates a portal API key
   * (via SupplierPortal relation), and stamps approvedAt/approvedBy.
   *
   * Idempotent: if the supplier is already approved, returns the existing row
   * without regenerating the key.
   */
  async approve(id: string, approvedBy: string): Promise<DbSupplierRow> {
    const existing = await prisma.supplier.findUnique({
      where: { id },
      include: { portal: true },
    });
    if (!existing) throw new Error("SUPPLIER_NOT_FOUND");
    if (existing.estado === SUPPLIER_STATUS.APPROVED && existing.portal) {
      return mapRow(existing);
    }

    const apiKey = generateApiKey();

    const updated = await prisma.supplier.update({
      where: { id },
      data: {
        estado: SUPPLIER_STATUS.APPROVED,
        approvedAt: new Date(),
        approvedBy,
        rejectedAt: null,
        rejectedBy: null,
        rejectionReason: null,
        portal: existing.portal
          ? {
              update: {
                apiKey,
                isActive: true,
              },
            }
          : {
              create: {
                apiKey,
                isActive: true,
                autoPublish: true,
              },
            },
      },
      include: { portal: true },
    });

    invalidateByPrefix("suppliers:");

    return mapRow(updated);
  },

  /**
   * Reject a supplier application with an audit trail reason.
   */
  async reject(
    id: string,
    rejectedBy: string,
    reason: string,
  ): Promise<DbSupplierRow> {
    const existing = await prisma.supplier.findUnique({
      where: { id },
      include: { portal: true },
    });
    if (!existing) throw new Error("SUPPLIER_NOT_FOUND");

    const updated = await prisma.supplier.update({
      where: { id },
      data: {
        estado: SUPPLIER_STATUS.REJECTED,
        rejectedAt: new Date(),
        rejectedBy,
        rejectionReason: reason,
      },
      include: { portal: true },
    });

    invalidateByPrefix("suppliers:");

    return mapRow(updated);
  },
};
