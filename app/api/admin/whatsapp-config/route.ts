import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { invalidateByPrefix } from "@/lib/cache";

// ─── Zod Schema ───────────────────────────────────────────────────────────────
// Multi-número (migración 311): cada fila es UN número del tenant. `id` presente
// = actualizar esa fila; ausente = conectar número nuevo.

const WhatsAppConfigSchema = z.object({
  id: z.string().max(40).optional(),
  label: z.string().max(40).optional().nullable(),
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
  wabaId: z
    .string()
    .regex(/^\d+$/, "El WABA ID debe contener solo dígitos")
    .max(50)
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),
  businessName: z.string().max(60).optional().nullable(),
  yapeNumber: z
    .string()
    .regex(/^\d{9}$/, "El número Yape debe tener 9 dígitos")
    .optional()
    .nullable(),
  isActive: z.boolean().default(true),
});

function maskConfig(config: {
  id: string;
  tenantId: string;
  label: string | null;
  phoneNumberId: string;
  whatsappToken: string;
  webhookVerifyToken: string;
  wabaId: string | null;
  businessName: string | null;
  yapeNumber: string | null;
  isActive: boolean;
  createdAt: Date;
}) {
  // No exponer el token completo — devolver solo los últimos 6 chars
  return {
    id: config.id,
    tenantId: config.tenantId,
    label: config.label,
    phoneNumberId: config.phoneNumberId,
    whatsappTokenMasked: `...${config.whatsappToken.slice(-6)}`,
    webhookVerifyToken: config.webhookVerifyToken,
    wabaId: config.wabaId,
    businessName: config.businessName,
    yapeNumber: config.yapeNumber,
    isActive: config.isActive,
    createdAt: config.createdAt.toISOString(),
  };
}

// ─── GET — listar los números del tenant ──────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "tienda_owner"]);
  if (auth instanceof NextResponse) return auth;

  logger.debug("[whatsapp-config] GET", { tenantId: auth.tenantId });

  try {
    const configs = await prisma.tenantWhatsAppConfig.findMany({
      where: { tenantId: auth.tenantId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      configs: configs.map(maskConfig),
      // Compat: el shape viejo era { config } singular (pre multi-número)
      config: configs.length > 0 ? maskConfig(configs[0]) : null,
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

// ─── PUT — conectar número nuevo o actualizar uno existente ───────────────────

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
    // Al editar: la fila debe existir Y pertenecer al tenant (nunca cross-tenant).
    const current = data.id
      ? await prisma.tenantWhatsAppConfig.findFirst({
          where: { id: data.id, tenantId: auth.tenantId },
        })
      : null;
    if (data.id && !current) {
      return NextResponse.json({ error: "Número no encontrado" }, { status: 404 });
    }

    // Token: requerido al conectar; OPCIONAL al actualizar — si viene vacío se
    // mantiene el existente. El GET lo devuelve enmascarado (...XXXXXX), así que
    // el form no tiene el token completo para reenviarlo. Brandon 2026-06-17.
    if (!current && !data.whatsappToken) {
      return NextResponse.json(
        { error: "El token de WhatsApp es requerido para conectar un número" },
        { status: 400 },
      );
    }
    const whatsappToken = data.whatsappToken ?? current!.whatsappToken;

    // El phoneNumberId es único GLOBAL: no puede estar en otra config (de este
    // tenant u otro) distinta de la que estamos editando.
    const existing = await prisma.tenantWhatsAppConfig.findFirst({
      where: {
        phoneNumberId: data.phoneNumberId,
        ...(current ? { id: { not: current.id } } : {}),
      },
    });
    if (existing) {
      logger.warn("[whatsapp-config] Phone Number ID duplicado", {
        phoneNumberId: data.phoneNumberId,
        tenantId: auth.tenantId,
        conflictTenant: existing.tenantId,
      });
      const sameTenant = existing.tenantId === auth.tenantId;
      return NextResponse.json(
        {
          error: sameTenant
            ? "Ese número ya está conectado en tu negocio."
            : "Este Phone Number ID ya está asignado a otro tenant. Cada número solo puede pertenecer a un tenant.",
        },
        { status: 409 }
      );
    }

    const payload = {
      label: data.label ?? null,
      phoneNumberId: data.phoneNumberId,
      whatsappToken,
      webhookVerifyToken: data.webhookVerifyToken,
      wabaId: data.wabaId ?? null,
      businessName: data.businessName ?? null,
      yapeNumber: data.yapeNumber ?? null,
      isActive: data.isActive,
    };

    const config = current
      ? await prisma.tenantWhatsAppConfig.update({ where: { id: current.id }, data: payload })
      : await prisma.tenantWhatsAppConfig.create({
          data: { tenantId: auth.tenantId, ...payload },
        });

    logger.info("[whatsapp-config] Número guardado", {
      tenantId: auth.tenantId,
      configId: config.id,
      phoneNumberId: config.phoneNumberId,
      isActive: config.isActive,
    });

    // Invalidar el cache del inbox (listWhatsAppConfigs) para que "Probar conexión"
    // y los envíos lean la config recién guardada, no la de hasta 30s atrás.
    await invalidateByPrefix(`whatsapp-inbox:${auth.tenantId}`);

    logActivity(
      "Configurar",
      "whatsapp_config",
      `Número WhatsApp ${current ? "actualizado" : "conectado"} para tenant ${auth.tenantId}`,
      config.id
    ).catch((err) => {
      logger.error("[whatsapp-config] logActivity falló", { error: String(err) });
    });

    return NextResponse.json({
      ok: true,
      config: {
        id: config.id,
        label: config.label,
        phoneNumberId: config.phoneNumberId,
        webhookVerifyToken: config.webhookVerifyToken,
        wabaId: config.wabaId,
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

// ─── DELETE — desactivar un número del tenant ─────────────────────────────────

export async function DELETE(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "admin-whatsapp-config"); if (_rl) return _rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ["admin", "tienda_owner"]);
  if (auth instanceof NextResponse) return auth;

  logger.debug("[whatsapp-config] DELETE", { tenantId: auth.tenantId });

  try {
    // ?id= apunta al número; sin id (compat single-número) cae al primero.
    const id = req.nextUrl.searchParams.get("id");
    const config = id
      ? await prisma.tenantWhatsAppConfig.findFirst({
          where: { id, tenantId: auth.tenantId },
        })
      : await prisma.tenantWhatsAppConfig.findFirst({
          where: { tenantId: auth.tenantId },
          orderBy: { createdAt: "asc" },
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
      where: { id: config.id },
      data: { isActive: false },
    });

    logger.info("[whatsapp-config] Número desactivado", {
      tenantId: auth.tenantId,
      configId: config.id,
      phoneNumberId: config.phoneNumberId,
    });

    // El inbox cachea la config (listWhatsAppConfigs) — reflejar la desactivación ya
    await invalidateByPrefix(`whatsapp-inbox:${auth.tenantId}`);

    logActivity(
      "Desactivar",
      "whatsapp_config",
      `Número WhatsApp desactivado para tenant ${auth.tenantId}`,
      config.id
    ).catch((err) => {
      logger.error("[whatsapp-config] logActivity falló", { error: String(err) });
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
