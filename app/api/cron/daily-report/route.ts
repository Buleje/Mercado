import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { prisma } from "@/lib/prisma";
import { generateDailyReport } from "@/lib/daily-report-generator";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/daily-report
 *
 * Genera y envía el resumen diario de ventas por WhatsApp al dueño
 * de cada tenant activo que tenga ownerPhone configurado.
 *
 * Sugerencia vercel.json: "0 21 * * *" (21:00 hora Lima)
 * Autorización: Bearer <CRON_SECRET>
 *
 * Respuesta: { sent: number, errors: number }
 */
export async function GET(req: NextRequest) {
  // ── 1. Autenticación con timing-safe compare ───────────────────────────────
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(authHeader, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // ── 2. Obtener todos los tenants activos con ownerPhone ────────────────────
  const tenants = await prisma.tenant.findMany({
    where: {
      active: true,
      ownerPhone: { not: null },
    },
    select: {
      id:         true,
      name:       true,
      ownerPhone: true,
    },
  });

  let enviados = 0;
  let errores  = 0;

  logger.info("[cron/daily-report] Iniciando envío de reportes diarios", {
    totalTenants: tenants.length,
  });

  // ── 3. Por cada tenant: generar reporte y enviar WhatsApp ──────────────────
  for (const tenant of tenants) {
    // ownerPhone garantizado no-null por el filtro anterior, pero TS lo marca opcional
    const phone = tenant.ownerPhone;
    if (!phone) continue;

    try {
      const mensaje = await generateDailyReport(tenant.id);

      // Fire-and-forget: el envío WA no debe bloquear ni romper el loop
      sendWhatsAppText(phone, mensaje).catch((err) => logger.error("[cron/daily-report] WhatsApp send failed", { error: String(err), tenantId: tenant.id }));

      logger.info("[cron/daily-report] Reporte enviado", { tenant: tenant.name, tenantId: tenant.id });
      enviados++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("[cron/daily-report] Error al procesar tenant", {
        tenant: tenant.name,
        tenantId: tenant.id,
        error: message,
      });
      errores++;
    }
  }

  logger.info("[cron/daily-report] Completado", { sent: enviados, errors: errores });

  return NextResponse.json({ sent: enviados, errors: errores });
}
