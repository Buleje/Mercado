import { NextRequest, NextResponse } from "next/server";
import { PrestamosDB } from "@/lib/db/prestamos.db";
import { logger } from "@/lib/logger";

// POST /api/prestamos/cron/recordatorios
// Sends WhatsApp reminders for upcoming and overdue loan cuotas.
// Called daily by Vercel cron (or manually).
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = req.headers.get("x-tenant-id") ?? "default";

    const { vencidas, proximas } = await PrestamosDB.getCuotasProximas(tenantId, 7);

    let sent = 0;
    let skipped = 0;

    const apiUrl = process.env.WHATSAPP_API_URL;
    const apiToken = process.env.WHATSAPP_API_TOKEN;
    const canSend = Boolean(apiUrl && apiToken);

    for (const c of vencidas) {
      if (!c.phone) { skipped++; continue; }
      const symbol = c.moneda === "USD" ? "$" : "S/";
      const msg =
        `🏪 *Buleje*\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `⚠️ *CUOTA VENCIDA*\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `Hola *${c.nombre}* 👋\n\n` +
        `Tienes una cuota de préstamo vencida:\n\n` +
        `  💰 *Cuota N°${c.numeroCuota}:* ${symbol}${c.monto.toFixed(2)}\n` +
        `  📅 Venció hace *${c.diasAtraso} día${c.diasAtraso !== 1 ? "s" : ""}*\n\n` +
        `Por favor, regulariza tu pago a la brevedad para evitar mora adicional.\n\n` +
        `_Buleje — Pucallpa_ 🙏`;

      if (canSend) {
        const phone = formatPhoneNumber(c.phone);
        await sendWAMessage(apiUrl!, apiToken!, phone, msg).catch(() => {});
        sent++;
      } else {
        sent++;
      }
    }

    for (const c of proximas) {
      if (!c.phone) { skipped++; continue; }
      const symbol = c.moneda === "USD" ? "$" : "S/";
      const msg =
        `🏪 *Buleje*\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `📅 *RECORDATORIO DE CUOTA*\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `Hola *${c.nombre}* 👋\n\n` +
        `Te recordamos que tienes una cuota próxima:\n\n` +
        `  💰 *Cuota N°${c.numeroCuota}:* ${symbol}${c.monto.toFixed(2)}\n` +
        `  📅 Vence en *${c.diasRestantes} día${c.diasRestantes !== 1 ? "s" : ""}*\n\n` +
        `Por favor, ten listo tu pago a tiempo. ¡Gracias! 🙏\n\n` +
        `_Buleje — Pucallpa_`;

      if (canSend) {
        const phone = formatPhoneNumber(c.phone);
        await sendWAMessage(apiUrl!, apiToken!, phone, msg).catch(() => {});
        sent++;
      } else {
        sent++;
      }
    }

    logger.info("[prestamos/cron/recordatorios] Done", {
      tenantId,
      overdueCount: vencidas.length,
      upcomingCount: proximas.length,
      sent,
      skipped,
    });

    return NextResponse.json({
      ok: true,
      overdue: vencidas.length,
      upcoming: proximas.length,
      sent,
      skipped,
    });
  } catch (e) {
    logger.error("[prestamos/cron/recordatorios] error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

function formatPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 9 ? `51${digits}` : digits;
}

async function sendWAMessage(apiUrl: string, apiToken: string, phone: string, body: string): Promise<void> {
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: { body },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WhatsApp API error: ${res.status} ${text}`);
  }
}
