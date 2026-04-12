import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { applyRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";

// ── GET /api/admin/sunat/config — obtener config SUNAT del tenant ──────────

export async function GET(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req, "MODERATE", "sunat-config");
  if (rateLimitResponse) return rateLimitResponse;

  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin"]);
    if (auth instanceof NextResponse) return auth;

    const config = await prisma.tenantSunatConfig.findUnique({
      where: { tenantId: auth.tenantId },
      select: {
        id: true,
        ruc: true,
        razonSocial: true,
        direccionFiscal: true,
        ubigeo: true,
        boletaSeries: true,
        facturaSeries: true,
        lastBoletaNum: true,
        lastFacturaNum: true,
        isProduction: true,
        createdAt: true,
        updatedAt: true,
        // Never expose nubefactToken in GET
      },
    });

    return NextResponse.json({ data: config });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}

// ── PUT /api/admin/sunat/config — crear o actualizar config SUNAT ──────────

const ConfigSchema = z.object({
  ruc: z.string().regex(/^\d{11}$/, "RUC debe tener 11 dígitos"),
  razonSocial: z.string().min(3).max(200),
  direccionFiscal: z.string().max(300).optional(),
  ubigeo: z.string().regex(/^\d{6}$/).optional(),
  nubefactToken: z.string().min(10, "Token de NubeFact requerido"),
  nubefactUrl: z.string().url().optional(),
  boletaSeries: z.string().regex(/^B\d{3}$/).optional(),
  facturaSeries: z.string().regex(/^F\d{3}$/).optional(),
  isProduction: z.boolean().optional(),
});

export async function PUT(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req, "MODERATE", "sunat-config");
  if (rateLimitResponse) return rateLimitResponse;

  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin"]);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json().catch(() => ({}));
    const parsed = ConfigSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const data = {
      tenantId: auth.tenantId,
      ruc: parsed.data.ruc,
      razonSocial: parsed.data.razonSocial,
      direccionFiscal: parsed.data.direccionFiscal ?? null,
      ubigeo: parsed.data.ubigeo ?? null,
      nubefactToken: parsed.data.nubefactToken,
      nubefactUrl: parsed.data.nubefactUrl ?? "https://api.nubefact.com/api/v1",
      boletaSeries: parsed.data.boletaSeries ?? "B001",
      facturaSeries: parsed.data.facturaSeries ?? "F001",
      isProduction: parsed.data.isProduction ?? false,
    };

    const config = await prisma.tenantSunatConfig.upsert({
      where: { tenantId: auth.tenantId },
      create: data,
      update: data,
    });

    logActivity(
      "sunat_config_updated",
      "TenantSunatConfig",
      JSON.stringify({ ruc: config.ruc, isProduction: config.isProduction }),
      config.id,
      auth.name ?? "admin",
      undefined,
      auth.tenantId,
    ).catch(() => {});

    return NextResponse.json({
      data: { id: config.id, ruc: config.ruc, razonSocial: config.razonSocial },
      message: "Configuración SUNAT guardada",
    });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
