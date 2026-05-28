/**
 * /superadmin/specializations — Habilitar/deshabilitar especializaciones
 * por tenant (ADR-124).
 *
 * Server component: lista tenants + catálogo. Toggle handler en client.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionPayload } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { listSpecializations } from "@/lib/specializations";
import SpecializationsClient from "./SpecializationsClient";

export const metadata = {
  title: "Especializaciones — Superadmin",
  description:
    "Habilita módulos especializados por tenant (forestal CTP, salud, textil).",
  robots: { index: false, follow: false },
};

export default async function SpecializationsPage() {
  // Server-side auth guard
  const hdrs = await headers();
  const cookie = hdrs.get("cookie") || "";
  const session = await getSessionPayload(cookie);
  if (!session || session.role !== "superadmin") {
    redirect("/admin/login?reason=superadmin_required");
  }

  // Cargar tenants activos + flags actuales en paralelo
  const [tenants, allFlags] = await Promise.all([
    prisma.tenant.findMany({
      where: { active: true },
      select: {
        id: true,
        slug: true,
        name: true,
        industry: true,
        plan: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.tenantFeatureFlag.findMany({
      where: { flagKey: { startsWith: "spec:" } },
      select: { tenantId: true, flagKey: true, enabled: true },
    }),
  ]);

  // Agrupar flags por tenant para lookup eficiente en cliente
  const flagsByTenant = new Map<string, Map<string, boolean>>();
  for (const f of allFlags) {
    if (!flagsByTenant.has(f.tenantId)) {
      flagsByTenant.set(f.tenantId, new Map());
    }
    flagsByTenant.get(f.tenantId)!.set(f.flagKey, f.enabled);
  }

  const tenantsWithFlags = tenants.map((t) => ({
    ...t,
    flags: Object.fromEntries(flagsByTenant.get(t.id) ?? new Map()),
  }));

  const catalog = listSpecializations();

  return (
    <SpecializationsClient
      tenants={tenantsWithFlags}
      catalog={catalog}
    />
  );
}
