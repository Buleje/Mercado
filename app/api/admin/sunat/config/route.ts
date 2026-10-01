import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { SunatDB } from "@/lib/db/sunat.db";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { applyRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";
import { assertCsrf } from "@/lib/auth/csrf";

// ── GET /api/admin/sunat/config — obtener config SUNAT del tenant ──────────

export async function GET(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req, "MODERATE", "sunat-config");
  if (rateLimitResponse) return rateLimitResponse;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;

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
  /* Opcional a propósito: el GET no devuelve el token (es un secreto), así que
     la pantalla de conexión no puede reenviarlo al editar. Si no viene, la capa
     DB conserva el guardado; si NO hay config previa, `upsertConfig` corta. */
  nubefactToken: z.string().min(10, "Token de NubeFact requerido").optional(),
  nubefactUrl: z.string().url().optional(),
  boletaSeries: z.string().regex(/^B\d{3}$/).optional(),
  facturaSeries: z.string().regex(/^F\d{3}$/).optional(),
  isProduction: z.boolean().optional(),
});

export async function PUT(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req, "MODERATE", "sunat-config");
  if (rateLimitResponse) return rateLimitResponse;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;

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

    /* Vía `SunatDB` y no `prisma.*` (regla #1 CLAUDE.md): la capa DB además
       resuelve el token faltante contra lo ya guardado. */
    let config;
    try {
      config = await SunatDB.upsertConfig(auth.tenantId, parsed.data);
    } catch {
      return NextResponse.json(
        { error: "Falta el token de Nubefact: es obligatorio la primera vez que se conecta el negocio." },
        { status: 400 },
      );
    }

    logActivity(
      "sunat_config_updated",
      "TenantSunatConfig",
      JSON.stringify({ ruc: config.ruc, isProduction: config.isProduction }),
      config.id,
      auth.name ?? "admin",
      undefined,
      auth.tenantId,
    ).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

    return NextResponse.json({
      data: { id: config.id, ruc: config.ruc, razonSocial: config.razonSocial },
      message: "Configuración SUNAT guardada",
    });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
