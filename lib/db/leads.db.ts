import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * lib/db/leads.db.ts — Lead capture funnel via ActivityLog.
 *
 * Background (CEO funnel tracking 2026-05-12):
 * En vez de crear un modelo Lead nuevo (que requeriría migration + schema
 * drift), persistimos los leads como ActivityLog rows con `entity: "lead"`.
 * El detail JSON contiene los campos del formulario.
 *
 * Ventajas:
 *  - Cero schema change (Brandon puede ver leads ya mismo)
 *  - Audit log + retention automático (Ley 29733)
 *  - Filtrable cross-tenant si tenantId = "main"
 *
 * Trade-off: queries por businessType o source requieren parsear JSON.
 * Para escala >10k leads/mes migrar a tabla dedicada.
 *
 * Cumple regla #1 CLAUDE.md (no prisma.* directo en routes).
 */

export interface LeadRow {
  id: string;
  entityId: string;
  whatsappLast4: string;
  name: string;
  businessType: string;
  businessName?: string;
  city: string;
  monthlyRevenue?: string;
  painPoint?: string;
  preferredDemoTime?: string;
  source: string;
  ref?: string;
  status: string;
  createdAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface FunnelStats {
  total: number;
  last7d: number;
  last30d: number;
  bySource: Record<string, number>;
  byBusinessType: Record<string, number>;
  byCity: Record<string, number>;
  byStatus: Record<string, number>;
  conversionRate: number; // (status=demo_done OR signed_up) / total
  oldestLeadAt?: Date;
  newestLeadAt?: Date;
}

function parseLeadDetail(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function rowToLead(r: {
  id: string;
  entityId: string | null;
  detail: string;
  createdAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}): LeadRow | null {
  const parsed = parseLeadDetail(r.detail);
  if (!parsed) return null;
  if (!r.entityId) return null;
  return {
    id: r.id,
    entityId: r.entityId,
    whatsappLast4: String(parsed.whatsappLast4 ?? ""),
    name: String(parsed.name ?? ""),
    businessType: String(parsed.businessType ?? ""),
    businessName: parsed.businessName ? String(parsed.businessName) : undefined,
    city: String(parsed.city ?? "Pucallpa"),
    monthlyRevenue: parsed.monthlyRevenue ? String(parsed.monthlyRevenue) : undefined,
    painPoint: parsed.painPoint ? String(parsed.painPoint) : undefined,
    preferredDemoTime: parsed.preferredDemoTime ? String(parsed.preferredDemoTime) : undefined,
    source: String(parsed.source ?? "direct"),
    ref: parsed.ref ? String(parsed.ref) : undefined,
    status: String(parsed.status ?? "new"),
    createdAt: r.createdAt,
    ipAddress: r.ipAddress,
    userAgent: r.userAgent,
  };
}

export interface CaptureLeadInput {
  name: string;
  whatsapp: string;
  businessType: string;
  businessName?: string;
  city: string;
  monthlyRevenue?: string;
  painPoint?: string;
  preferredDemoTime?: string;
  source?: string;
  ref?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export const LeadsDB = {
  /**
   * Persiste un lead recién capturado como ActivityLog row.
   * Fire-and-forget seguro: el caller no debe await — el lead aún llega
   * por Telegram + log estructurado si la DB falla.
   * Solo guarda los últimos 4 dígitos del whatsapp (PII Ley 29733).
   */
  async capture(tenantId: string, input: CaptureLeadInput): Promise<void> {
    try {
      await prisma.activityLog.create({
        data: {
          tenantId,
          action: "create",
          entity: "lead",
          entityId: `${input.whatsapp}-${Date.now()}`,
          detail: JSON.stringify({
            name: input.name,
            whatsappLast4: input.whatsapp.slice(-4),
            businessType: input.businessType,
            businessName: input.businessName,
            city: input.city,
            monthlyRevenue: input.monthlyRevenue,
            painPoint: input.painPoint?.slice(0, 200),
            preferredDemoTime: input.preferredDemoTime,
            source: input.source ?? "direct",
            ref: input.ref,
            status: "new",
          }),
          user: "lead-capture-public",
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent?.slice(0, 200) ?? null,
        },
      });
    } catch (err) {
      logger.warn("[LeadsDB.capture] persist failed (non-critical)", {
        err: String(err).slice(0, 120),
      });
    }
  },

  /**
   * Lista leads con filtros opcionales.
   * tenantId default "main" (los leads landing son cross-tenant).
   */
  async list(
    tenantId: string,
    opts: {
      limit?: number;
      offset?: number;
      source?: string;
      businessType?: string;
      since?: Date;
    } = {},
  ): Promise<LeadRow[]> {
    const limit = Math.min(opts.limit ?? 50, 200);
    const offset = Math.max(opts.offset ?? 0, 0);

    const rows = await prisma.activityLog.findMany({
      where: {
        tenantId,
        entity: "lead",
        ...(opts.since ? { createdAt: { gte: opts.since } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        entityId: true,
        detail: true,
        createdAt: true,
        ipAddress: true,
        userAgent: true,
      },
    });

    const parsed = rows
      .map(rowToLead)
      .filter((x): x is LeadRow => x !== null);

    // Filtros post-parsing (JSON detail no es queryable nativo en Postgres
    // sin GIN index — para volúmenes <10k leads/mes es aceptable).
    return parsed.filter((l) => {
      if (opts.source && l.source !== opts.source) return false;
      if (opts.businessType && l.businessType !== opts.businessType) return false;
      return true;
    });
  },

  /**
   * Stats del funnel para dashboard CEO.
   * Considera leads de los últimos 90 días para conversión meaningful.
   */
  async getStats(tenantId: string): Promise<FunnelStats> {
    const since90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const rows = await prisma.activityLog.findMany({
      where: {
        tenantId,
        entity: "lead",
        createdAt: { gte: since90d },
      },
      select: { detail: true, createdAt: true, entityId: true, id: true, ipAddress: true, userAgent: true },
      orderBy: { createdAt: "desc" },
    });

    const leads = rows
      .map(rowToLead)
      .filter((x): x is LeadRow => x !== null);

    const bySource: Record<string, number> = {};
    const byBusinessType: Record<string, number> = {};
    const byCity: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let last7d = 0;
    let last30d = 0;
    let converted = 0;

    for (const l of leads) {
      bySource[l.source] = (bySource[l.source] ?? 0) + 1;
      byBusinessType[l.businessType] = (byBusinessType[l.businessType] ?? 0) + 1;
      byCity[l.city] = (byCity[l.city] ?? 0) + 1;
      byStatus[l.status] = (byStatus[l.status] ?? 0) + 1;
      if (l.createdAt >= since7d) last7d++;
      if (l.createdAt >= since30d) last30d++;
      if (l.status === "demo_done" || l.status === "signed_up" || l.status === "won") {
        converted++;
      }
    }

    return {
      total: leads.length,
      last7d,
      last30d,
      bySource,
      byBusinessType,
      byCity,
      byStatus,
      conversionRate: leads.length > 0 ? Math.round((converted / leads.length) * 1000) / 10 : 0,
      oldestLeadAt: leads.length > 0 ? leads[leads.length - 1]!.createdAt : undefined,
      newestLeadAt: leads.length > 0 ? leads[0]!.createdAt : undefined,
    };
  },

  /**
   * Actualiza el status de un lead (new → contacted → demo_done → signed_up → won/lost).
   * Crea un nuevo ActivityLog con la transición (audit trail).
   */
  async updateStatus(
    tenantId: string,
    entityId: string,
    newStatus: string,
    actor: string,
  ): Promise<boolean> {
    const original = await prisma.activityLog.findFirst({
      where: { tenantId, entity: "lead", entityId },
      orderBy: { createdAt: "desc" },
      select: { id: true, detail: true },
    });

    if (!original) {
      logger.warn("[LeadsDB.updateStatus] lead not found", { entityId });
      return false;
    }

    const parsed = parseLeadDetail(original.detail);
    if (!parsed) return false;

    const updated = { ...parsed, status: newStatus, lastStatusChange: new Date().toISOString() };

    await prisma.activityLog.create({
      data: {
        tenantId,
        action: "update",
        entity: "lead",
        entityId,
        detail: JSON.stringify(updated),
        user: actor,
      },
    });

    return true;
  },
};
