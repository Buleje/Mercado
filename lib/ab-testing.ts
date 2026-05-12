import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";

export type Variant = { id: string; label: string; weight: number };
export type ABTestDef = {
  id: string;
  name: string;
  description: string;
  variants: Variant[];
  active: boolean;
  createdAt: string;
};

function toISO(d: Date) { return d.toISOString(); }

export const ABTestDB = {
  async getAll(): Promise<ABTestDef[]> {
    const rows = await prisma.aBTest.findMany({ orderBy: { createdAt: "desc" } });
    return rows.map(r => ({ id: r.id, name: r.name, description: r.description, variants: r.variants as Variant[], active: r.active, createdAt: toISO(r.createdAt) }));
  },

  async getActive(): Promise<ABTestDef[]> {
    const rows = await prisma.aBTest.findMany({ where: { active: true }, orderBy: { createdAt: "desc" } });
    return rows.map(r => ({ id: r.id, name: r.name, description: r.description, variants: r.variants as Variant[], active: r.active, createdAt: toISO(r.createdAt) }));
  },

  async create(name: string, description: string, variants: Variant[], tenantId?: string): Promise<ABTestDef> {
    // P1-1 multi-tenant: tenantId requerido pero con fallback observable.
    // TODO: eliminar fallback cuando todos los callers pasen tenantId.
    const effectiveTenantId = tenantId ?? "main";
    if (!tenantId) {
      // eslint-disable-next-line no-console -- ab-testing no importa logger para evitar ciclo
      console.warn("[ab-testing] create missing tenantId — falling back to 'main'", { name });
    }
    const row = await prisma.aBTest.create({ data: { name, description, variants, tenantId: effectiveTenantId } });
    return { id: row.id, name: row.name, description: row.description, variants: row.variants as Variant[], active: row.active, createdAt: toISO(row.createdAt) };
  },

  async toggle(id: string): Promise<void> {
    const row = await prisma.aBTest.findUnique({ where: { id } });
    if (row) await prisma.aBTest.update({ where: { id }, data: { active: !row.active } });
  },

  async delete(id: string): Promise<void> {
    // eslint-disable-next-line no-restricted-syntax -- ABTestEvent indirecto (ADR-101) FK→ABTest. Caller (app/api/ab-tests POST) ya hace IDOR check con tenantId.
    await prisma.aBTestEvent.deleteMany({ where: { testId: id } });
    await prisma.aBTest.delete({ where: { id } });
  },

  /** Assign a variant to a visitor using weighted random */
  assignVariant(test: ABTestDef, visitorId: string): Variant {
    // Deterministic assignment based on hash of testId + visitorId
    let hash = 0;
    const str = test.id + visitorId;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    const totalWeight = test.variants.reduce((s, v) => s + v.weight, 0);
    let pick = Math.abs(hash) % totalWeight;
    for (const v of test.variants) {
      pick -= v.weight;
      if (pick < 0) return v;
    }
    return test.variants[0];
  },

  async trackEvent(testId: string, variantId: string, visitorId: string, event: "impression" | "conversion", value?: number, tenantId?: string): Promise<void> {
    const effectiveTenantId = tenantId ?? "main";
    if (!tenantId) {
      // eslint-disable-next-line no-console
      console.warn("[ab-testing] trackEvent missing tenantId — falling back to 'main'", { testId, event });
    }
    await prisma.aBTestEvent.create({ data: { testId, variantId, visitorId, event, value, tenantId: effectiveTenantId } });
  },

  async getResults(testId: string): Promise<{ variantId: string; impressions: number; conversions: number; totalValue: number; conversionRate: number }[]> {
    const events = await prisma.aBTestEvent.findMany({ where: { testId } });
    const map = new Map<string, { impressions: number; conversions: number; totalValue: number }>();
    for (const e of events) {
      if (!map.has(e.variantId)) map.set(e.variantId, { impressions: 0, conversions: 0, totalValue: 0 });
      const m = map.get(e.variantId)!;
      if (e.event === "impression") m.impressions++;
      // TD-018: e.value puede ser Decimal
      else if (e.event === "conversion") { m.conversions++; m.totalValue += toNumOrZero(e.value); }
    }
    return Array.from(map.entries()).map(([variantId, m]) => ({
      variantId,
      ...m,
      conversionRate: m.impressions > 0 ? (m.conversions / m.impressions) * 100 : 0,
    }));
  },
};
