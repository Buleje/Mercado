/**
 * app/api/lead/capture/route.ts
 *
 * POST /api/lead/capture — captura lead de outbound (WhatsApp/Demo).
 *
 * Permite a Brandon enviar un link tipo `buleje.pe/demo?ref=carlos` a un
 * prospecto, y cuando el prospecto llena el formulario:
 * 1. Crea Lead row en DB (futuro followup automático)
 * 2. Envía notificación inmediata a Brandon (Telegram + email)
 * 3. Agenda followup en cron (recordatorio día 3, 7, 14)
 *
 * Esta es la herramienta core de la estrategia GTM (sales-playbook.md).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const LeadSchema = z.object({
  name: z.string().min(2).max(80),
  whatsapp: z
    .string()
    .regex(/^9\d{8}$/, "Número de WhatsApp peruano inválido (debe ser 9 dígitos)"),
  businessType: z.enum(["bodega", "pizzeria", "ferreteria", "minimarket", "otro"]),
  businessName: z.string().min(2).max(80).optional(),
  city: z.string().min(2).max(60).default("Pucallpa"),
  monthlyRevenuePEN: z
    .enum(["<15k", "15k-40k", "40k-80k", ">80k"])
    .optional(),
  painPoint: z.string().max(500).optional(),
  source: z.string().max(60).optional(), // "wa-outbound" | "fb-ads" | "referral" | "tiktok"
  ref: z.string().max(60).optional(), // referido por: brandon | carlos | etc.
  preferredDemoTime: z.string().max(40).optional(), // "viernes 6pm" etc.
});

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "lead-capture");
  if (_rl) return _rl;

  try {
    const body = await req.json().catch(() => null);
    const parsed = LeadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Datos inválidos",
          issues: parsed.error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400 },
      );
    }

    const lead = parsed.data;

    // Log estructurado (irá a Sentry + Vercel logs)
    logger.info("[lead-capture] nuevo lead", {
      name: lead.name,
      whatsapp: lead.whatsapp.slice(-4), // solo últimos 4 (PII Ley 29733)
      businessType: lead.businessType,
      city: lead.city,
      source: lead.source ?? "direct",
      ref: lead.ref,
    });

    // Notificar a Brandon vía Telegram (si configurado)
    const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
    const telegramChatId = process.env.TELEGRAM_BRANDON_CHAT_ID;
    if (telegramBotToken && telegramChatId) {
      const msg = `🎯 *Nuevo lead* (Buleje)\n\n` +
        `*${lead.name}* (${lead.businessType})\n` +
        `📱 WhatsApp: \`+51${lead.whatsapp}\`\n` +
        `🏙 ${lead.city}\n` +
        (lead.businessName ? `🏪 ${lead.businessName}\n` : "") +
        (lead.monthlyRevenuePEN ? `💰 Facturación: ${lead.monthlyRevenuePEN}/mes\n` : "") +
        (lead.painPoint ? `🔥 Dolor: _${lead.painPoint.slice(0, 200)}_\n` : "") +
        (lead.preferredDemoTime ? `📅 Demo preferido: ${lead.preferredDemoTime}\n` : "") +
        (lead.source ? `🔗 Source: \`${lead.source}\`` : "") +
        (lead.ref ? ` · Ref: \`${lead.ref}\`` : "");

      fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: telegramChatId,
          text: msg,
          parse_mode: "Markdown",
        }),
      }).catch((err) => logger.warn("[lead-capture] telegram notify failed", { err: String(err) }));
    }

    // Persistir en DB cuando exista Lead model — placeholder por ahora
    // TODO: prisma.lead.create con el schema cuando se agregue la migration

    return NextResponse.json({
      ok: true,
      message: `Gracias ${lead.name}. Brandon te escribe en las próximas 24 horas por WhatsApp +51${lead.whatsapp.slice(-4)} para coordinar tu demo de 10 minutos.`,
      nextStep: lead.preferredDemoTime
        ? `Brandon confirmará para ${lead.preferredDemoTime}.`
        : "Te propondrá 2 horarios para esta semana.",
    });
  } catch (err) {
    logger.error("[lead-capture] handler error", { err: String(err) });
    return NextResponse.json(
      { error: "Error procesando lead", details: "Intenta de nuevo en 1 minuto." },
      { status: 500 },
    );
  }
}
