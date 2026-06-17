import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

// ─── Zod Schema ───────────────────────────────────────────────────────────────

const WhatsAppConfigSchema = z.object({
  phoneNumberId: z
    .string()
    .min(1, "Phone Number ID requerido")
    .max(50)
    .regex(/^\d+$/, "Phone Number ID debe contener solo dígitos"),
  whatsappToken: z
    .string()
    .min(10, "Token demasiado corto")
    .max(500)
    .optional(),
  webhookVerifyToken: z
    .string()
    .min(6, "Verify token debe tener al menos 6 caracteres")
    .max(100),
  businessName: z.string().max(60).optional().nullable(),
  yapeNumber: z
    .string()
    .regex(/^\d{9}$/, "El número Yape debe tener 9 dígitos")
    .optional()
    .nullable(),
  isActive: z.boolean().default(true),
});

// ─── GET — leer config actual del tenant ──────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "tienda_owner"]);
  if (auth instanceof NextResponse) return auth;

  logger.debug("[whatsapp-config] GET", { tenantId: auth.tenantId });

  try {
    const config = await prisma.tenantWhatsAppConfig.findUnique({
      where: { tenantId: auth.tenantId },
    });

    if (!config) {
      logger.info("[whatsapp-config] Sin configuración para tenant", {
        tenantId: auth.tenantId,
      });
      return NextResponse.json({ config: null });
    }

    logger.info("[whatsapp-config] Configuración obtenida", {
      tenantId: auth.tenantId,
      phoneNumberId: config.phoneNumberId,
      isActive: config.isActive,
    });

    // No exponer el token completo — devolver solo los últimos 6 chars
    return NextResponse.json({
      config: {
        id: config.id,
        tenantId: config.tenantId,
        phoneNumberId: config.phoneNumberId,
        whatsappTokenMasked: `...${config.whatsappToken.slice(-6)}`,
        webhookVerifyToken: config.webhookVerifyToken,
        businessName: config.businessName,
        yapeNumber: config.yapeNumber,
        isActive: config.isActive,
        createdAt: config.createdAt.toISOString(),
      },
    });
  } catch (err) {
    logger.error("[whatsapp-config] Error en GET", {
      tenantId: auth.tenantId,
      error: err,
    });
    return NextResponse.json(
      {
        error: "Error al obtener configuración",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

// ─── PUT — crear o actualizar config del tenant ───────────────────────────────

export async function PUT(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "admin-whatsapp-config"); if (_rl) return _rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ["admin", "tienda_owner"]);
  if (auth instanceof NextResponse) return auth;

  logger.debug("[whatsapp-config] PUT", { tenantId: auth.tenantId });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = WhatsAppConfigSchema.safeParse(body);
  if (!parsed.success) {
    logger.warn("[whatsapp-config] Validación fallida en PUT", {
      tenantId: auth.tenantId,
      issues: parsed.error.issues,
    });
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = parsed.data;

  try {
    // Token: requerido para la config inicial; OPCIONAL al actualizar — si viene
    // vacío se mantiene el existente. El GET lo devuelve enmascarado (...XXXXXX),
    // así que el form no tiene el token completo para reenviarlo. Brandon 2026-06-17.
    const current = await prisma.tenantWhatsAppConfig.findUnique({
      where: { tenantId: auth.tenantId },
    });
    if (!current && !data.whatsappToken) {
      return NextResponse.json(
        { error: "El token de WhatsApp es requerido para la configuración inicial" },
        { status: 400 },
      );
    }
    const whatsappToken = data.whatsappToken ?? current!.whatsappToken;

    // Verificar que el phoneNumberId no esté en uso por otro tenant
    const existing = await prisma.tenantWhatsAppConfig.findFirst({
      where: {
        phoneNumberId: data.phoneNumberId,
        tenantId: { not: auth.tenantId },
      },
    });
    if (existing) {
      logger.warn("[whatsapp-config] Phone Number ID duplicado", {
        phoneNumberId: data.phoneNumberId,
        tenantId: auth.tenantId,
        conflictTenant: existing.tenantId,
      });
      return NextResponse.json(
        {
          error:
            "Este Phone Number ID ya está asignado a otro tenant. Cada número solo puede pertenecer a un tenant.",
        },
        { status: 409 }
      );
    }

    const config = await prisma.tenantWhatsAppConfig.upsert({
      where: { tenantId: auth.tenantId },
      create: {
        tenantId: auth.tenantId,
        phoneNumberId: data.phoneNumberId,
        whatsappToken,
        webhookVerifyToken: data.webhookVerifyToken,
        businessName: data.businessName ?? null,
        yapeNumber: data.yapeNumber ?? null,
        isActive: data.isActive,
      },
      update: {
        phoneNumberId: data.phoneNumberId,
        whatsappToken,
        webhookVerifyToken: data.webhookVerifyToken,
        businessName: data.businessName ?? null,
        yapeNumber: data.yapeNumber ?? null,
        isActive: data.isActive,
      },
    });

    logger.info("[whatsapp-config] Configuración guardada", {
      tenantId: auth.tenantId,
      phoneNumberId: config.phoneNumberId,
      isActive: config.isActive,
    });

    logActivity(
      "Configurar",
      "whatsapp_config",
      `WhatsApp Commerce configurado para tenant ${auth.tenantId}`,
      config.id
    ).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

    return NextResponse.json({
      ok: true,
      config: {
        id: config.id,
        phoneNumberId: config.phoneNumberId,
        webhookVerifyToken: config.webhookVerifyToken,
        businessName: config.businessName,
        yapeNumber: config.yapeNumber,
        isActive: config.isActive,
      },
    });
  } catch (err) {
    logger.error("[whatsapp-config] Error en PUT", {
      tenantId: auth.tenantId,
      error: err,
    });
    return NextResponse.json(
      {
        error: "Error al guardar configuración",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

// ─── DELETE — desactivar config del tenant ────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "admin-whatsapp-config"); if (_rl) return _rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ["admin", "tienda_owner"]);
  if (auth instanceof NextResponse) return auth;

  logger.debug("[whatsapp-config] DELETE", { tenantId: auth.tenantId });

  try {
    const config = await prisma.tenantWhatsAppConfig.findUnique({
      where: { tenantId: auth.tenantId },
    });

    if (!config) {
      logger.warn("[whatsapp-config] Configuración no encontrada para DELETE", {
        tenantId: auth.tenantId,
      });
      return NextResponse.json(
        { error: "Configuración no encontrada" },
        { status: 404 }
      );
    }

    // Soft delete: desactivar en lugar de eliminar
    await prisma.tenantWhatsAppConfig.update({
      where: { tenantId: auth.tenantId },
      data: { isActive: false },
    });

    logger.info("[whatsapp-config] Configuración desactivada", {
      tenantId: auth.tenantId,
      phoneNumberId: config.phoneNumberId,
    });

    logActivity(
      "Desactivar",
      "whatsapp_config",
      `WhatsApp Commerce desactivado para tenant ${auth.tenantId}`,
      config.id
    ).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[whatsapp-config] Error en DELETE", {
      tenantId: auth.tenantId,
      error: err,
    });
    return NextResponse.json(
      {
        error: "Error al eliminar configuración",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
