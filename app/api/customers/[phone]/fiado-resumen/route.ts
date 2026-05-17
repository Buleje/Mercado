import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { enqueueActivityLog } from "@/lib/queue";

const PhoneSchema = z.string().min(7).max(20).regex(/^\+?[0-9\- ]+$/, "Teléfono inválido");

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const rl = applyRateLimit(req, "MODERATE", "customers-phone-fiado-resumen");
  if (rl) return rl;

  const { phone } = await params;

  const phoneParsed = PhoneSchema.safeParse(phone);
  if (!phoneParsed.success) {
    return NextResponse.json({ error: "Teléfono inválido" }, { status: 400 });
  }
  const safePhone = phoneParsed.data;

  // SECURITY 2026-05-17 (audit C1): nunca fallback a "main".
  // Lecturas de PII de cliente deben fallar 401 si el JWT no trae tenantId.
  if (!auth.tenantId) {
    return NextResponse.json({ error: "Sesión sin tenant válido" }, { status: 401 });
  }
  const tenantId = auth.tenantId;

  try {
    // Aggregate active fiados
    // eslint-disable-next-line no-restricted-properties -- aggregation tenant-scoped; migration to lib/db/fiados.db.ts pendiente.
    const agg = await prisma.fiado.aggregate({
      where: {
        tenantId,
        customerId: safePhone,
        status: "ACTIVO",
      },
      _sum: { saldo: true },
      _count: true,
    });

    const montoPendiente = Number(agg._sum.saldo ?? 0);
    const cantidadFiados = agg._count ?? 0;

    // Find oldest active fiado to calculate days overdue
    let diasVencido = 0;
    let hasFiadosVencidos = false;

    if (cantidadFiados > 0) {
      // eslint-disable-next-line no-restricted-properties -- lookup tenant-scoped; migration pendiente.
      const oldest = await prisma.fiado.findFirst({
        where: {
          tenantId,
          customerId: safePhone,
          status: "ACTIVO",
        },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true, fechaVence: true },
      });

      if (oldest) {
        const now = new Date();
        diasVencido = Math.floor(
          (now.getTime() - oldest.createdAt.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (oldest.fechaVence && oldest.fechaVence < now) {
          hasFiadosVencidos = true;
        }
      }
    }

    enqueueActivityLog({
      action: "leer",
      resource: "cliente_pii",
      resourceId: safePhone,
      userId: auth.username,
      tenantId,
      details: { description: `Lectura PII cliente ${safePhone.slice(-4)} desde /api/customers/${safePhone}/fiado-resumen` },
      timestamp: new Date().toISOString(),
    }).catch(() => { /* fire-and-forget */ });
    return NextResponse.json({
      montoPendiente,
      cantidadFiados,
      diasVencido,
      hasFiadosVencidos,
    });
  } catch (e) {
    logger.error("[Fiado Resumen]", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json(
      { error: "Error al obtener resumen de fiado" },
      { status: 500 }
    );
  }
}
