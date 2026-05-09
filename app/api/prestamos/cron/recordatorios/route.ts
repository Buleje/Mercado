import { NextResponse } from "next/server";
import { PrestamosDB } from "@/lib/db/prestamos.db";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { withCronAuth } from "@/lib/cron-auth";

// GET /api/prestamos/cron/recordatorios
// SECURITY 2026-05-06: withCronAuth (timing-safe + fail-closed) + itera todos
// los tenants activos (antes leía header con default "default" → solo 1).
// Cambio POST→GET para Vercel cron.
export const GET = withCronAuth("prestamos-recordatorios", async () => {
  try {
    const tenants = await prisma.tenant.findMany({
      where: { active: true },
      select: { id: true },
    });

    const aggregate = { vencidas: [] as Awaited<ReturnType<typeof PrestamosDB.getCuotasProximas>>["vencidas"], proximas: [] as Awaited<ReturnType<typeof PrestamosDB.getCuotasProximas>>["proximas"] };
    for (const t of tenants) {
      try {
        const r = await PrestamosDB.getCuotasProximas(t.id, 7);
        aggregate.vencidas.push(...r.vencidas);
        aggregate.proximas.push(...r.proximas);
      } catch (err) {
        logger.error("[prestamos/cron/recordatorios] tenant failed", {
          tenantId: t.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    const vencidas = aggregate.vencidas;
    const proximas = aggregate.proximas;

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
        await sendWAMessage(apiUrl!, apiToken!, phone, msg).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });
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
        await sendWAMessage(apiUrl!, apiToken!, phone, msg).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });
        sent++;
      } else {
        sent++;
      }
    }

    logger.info("[prestamos/cron/recordatorios] Done", {
      tenantsProcessed: tenants.length,
      overdueCount: vencidas.length,
      upcomingCount: proximas.length,
      sent,
      skipped,
    });

    return NextResponse.json({
      ok: true,
      tenantsProcessed: tenants.length,
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
});

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
