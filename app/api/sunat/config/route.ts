/**
 * GET  /api/sunat/config  — Lee configuración SUNAT del tenant
 * PUT  /api/sunat/config  — Actualiza configuración SUNAT del tenant
 *
 * El token Nubefact se devuelve enmascarado en GET (últimos 4 caracteres).
 * En PUT se acepta token completo y se guarda tal cual (la DB es la fuente de verdad).
 */

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";

export const dynamic = "force-dynamic";

// ── Validación PUT ────────────────────────────────────────────────────────────

const ConfigPutSchema = z.object({
  ruc: z
    .string()
    .regex(/^\d{11}$/, "El RUC debe tener exactamente 11 dígitos."),
  razonSocial: z.string().min(3).max(200),
  direccionFiscal: z.string().max(300).optional(),
  ubigeo: z
    .string()
    .regex(/^\d{6}$/, "El ubigeo debe tener 6 dígitos.")
    .optional(),
  nubefactToken: z.string().min(10).optional(), // opcional en UPDATE — no borrar si no se envía
  nubefactUrl: z
    .string()
    .url()
    .default("https://api.nubefact.com/api/v1"),
  boletaSeries: z
    .string()
    .regex(/^B\d{3}$/, 'La serie de boleta debe tener formato B001.')
    .default("B001"),
  facturaSeries: z
    .string()
    .regex(/^F\d{3}$/, 'La serie de factura debe tener formato F001.')
    .default("F001"),
  isProduction: z.boolean().default(false),
});

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const { tenantId } = auth;

  try {
    const config = await prisma.tenantSunatConfig.findUnique({
      where: { tenantId },
    });

    if (!config) {
      return NextResponse.json({ config: null });
    }

    // Enmascarar token: mostrar solo últimos 4 caracteres
    const tokenMasked =
      config.nubefactToken.length > 4
        ? `${"*".repeat(config.nubefactToken.length - 4)}${config.nubefactToken.slice(-4)}`
        : "****";

    return NextResponse.json({
      config: {
        ...config,
        nubefactToken: tokenMasked,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[SUNAT config GET] Error", { tenantId, error: message });
    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}

// ── PUT ───────────────────────────────────────────────────────────────────────

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const { tenantId } = auth;

  const rawBody = await req.json().catch(() => null);
  const parsed = ConfigPutSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const data = parsed.data;

  try {
    // Si no se envía token, no sobreescribir el existente
    const existingConfig = await prisma.tenantSunatConfig.findUnique({
      where: { tenantId },
      select: { nubefactToken: true },
    });

    const tokenToSave = data.nubefactToken ?? existingConfig?.nubefactToken;

    if (!tokenToSave) {
      return NextResponse.json(
        { error: "El token de Nubefact es obligatorio para la primera configuración." },
        { status: 400 }
      );
    }

    const config = await prisma.tenantSunatConfig.upsert({
      where: { tenantId },
      create: {
        tenantId,
        ruc: data.ruc,
        razonSocial: data.razonSocial,
        direccionFiscal: data.direccionFiscal ?? null,
        ubigeo: data.ubigeo ?? null,
        nubefactToken: tokenToSave,
        nubefactUrl: data.nubefactUrl,
        boletaSeries: data.boletaSeries,
        facturaSeries: data.facturaSeries,
        isProduction: data.isProduction,
      },
      update: {
        ruc: data.ruc,
        razonSocial: data.razonSocial,
        direccionFiscal: data.direccionFiscal ?? null,
        ubigeo: data.ubigeo ?? null,
        nubefactToken: tokenToSave,
        nubefactUrl: data.nubefactUrl,
        boletaSeries: data.boletaSeries,
        facturaSeries: data.facturaSeries,
        isProduction: data.isProduction,
      },
    });

    // Audit trail fire-and-forget
    logActivity(
      "sunat_config_update",
      "TenantSunatConfig",
      `ruc=${data.ruc} isProduction=${data.isProduction} tokenUpdated=${!!data.nubefactToken}`,
      config.id,
      auth.username,
    ).catch(() => {});

    // Devolver config enmascarando el token
    const tokenMasked = `${"*".repeat(tokenToSave.length - 4)}${tokenToSave.slice(-4)}`;

    return NextResponse.json({
      config: { ...config, nubefactToken: tokenMasked },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[SUNAT config PUT] Error", { tenantId, error: message });
    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}
