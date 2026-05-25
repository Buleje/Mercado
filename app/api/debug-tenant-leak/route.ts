/**
 * @prisma-direct ok — endpoint de DIAGNOSTIC que usa `prisma.$extends`
 * intencionalmente para probar el sistema de cross-tenant leak detection.
 * Migrar a DB class destruiría el propósito del endpoint. Audit 2026-05-19.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { prismaForTenant } from "@/lib/tenant";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req, ["admin"]);
    if (auth instanceof NextResponse) return auth;

    const seenModels: string[] = [];
    const probe = prisma.$extends({
      query: {
        $allModels: {
          async findMany({ args, query, model }: { args: unknown; query: (a: unknown) => Promise<unknown>; model: string }) {
            seenModels.push(model);
            return query(args);
          },
        },
      },
    });
    await probe.adminUser.findMany({ take: 1, select: { id: true } });

    const scoped = prismaForTenant(auth.tenantId);
    const scopedResult = await scoped.adminUser.findMany({
      select: { id: true, username: true, name: true, tenantId: true },
    });

    return NextResponse.json({
      authTenantId: auth.tenantId,
      probeModelName: seenModels,
      scopedCount: scopedResult.length,
      scopedSample: scopedResult.slice(0, 12),
      leakDetected: scopedResult.some((u) => u.tenantId !== auth.tenantId),
    });

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
