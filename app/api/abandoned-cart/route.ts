import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import nodemailer from "nodemailer";
import { sendWhatsAppQueued } from "@/lib/whatsapp";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

/**
 * POST /api/abandoned-cart
 *
 * Roadmap item #4 (fix-abandoned-cart-whatsapp-cliente):
 * Envía WhatsApp de recuperación AL CLIENTE (no al admin).
 * Mantiene email de notificación al admin como secundario.
 *
 * Rate limit WhatsApp: máx 1 mensaje por número cada 48h.
 * Cooldown horario: 22:00-08:00 no se envía WhatsApp (hora Lima).
 */

const CartItemSchema = z.object({
  name: z.string().min(1).max(200),
  price: z.number().min(0),
  quantity: z.number().min(1),
  image: z.string().max(500).optional(),
});

const BodySchema = z.object({
  phone: z.string().min(3).max(30).optional(),
  items: z.array(CartItemSchema).min(1),
  total: z.number().min(0),
});

// Cooldown: no WhatsApp entre 22:00 y 08:00 hora Lima (UTC-5)
function isQuietHours(): boolean {
  const now = new Date();
  const limaOffset = -5 * 60;
  const limaTime = new Date(now.getTime() + (limaOffset + now.getTimezoneOffset()) * 60_000);
  const hour = limaTime.getHours();
  return hour >= 22 || hour < 8;
}

export const POST = withApiHandler("abandoned-cart", async (req, ctx) => {
  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const { phone, items, total } = parsed.data;
    // SECURITY 2026-05-06: si hay sesión admin, JWT manda. Anónimos: header
    // x-tenant-id (server-resolved — proxy.ts:60 lo sobreescribe SIEMPRE,
    // nunca confía en el cliente).
    // Audit 2026-06-10 P1: sin fallback "main" — si no hay tenant resoluble, 400.
    const { tryAdmin } = await import("@/lib/require-admin");
    const session = await tryAdmin(req);
    const tenantId = session?.tenantId ?? req.headers.get("x-tenant-id");
    if (!tenantId) {
      return NextResponse.json({ error: "Tenant no resuelto" }, { status: 400 });
    }
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.buleje.pe";
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    let whatsappSent = false;
    let whatsappSkipReason: "cooldown" | "rate_limited" | null = null;
    let maskedPhone: string | null = null;

    // ── 1. WhatsApp de recuperación AL CLIENTE (fix roadmap #4) ────────────
    if (phone && isQuietHours()) {
      whatsappSkipReason = "cooldown";
    }
    if (phone && !isQuietHours()) {
      // Rate limit: máx 1 WhatsApp por número cada 48h
      const cleanPhone = phone.replace(/\D/g, "");
      maskedPhone = cleanPhone.length >= 4
        ? `${"*".repeat(Math.max(0, cleanPhone.length - 4))}${cleanPhone.slice(-4)}`
        : "****";
      const { allowed } = rateLimit(`abandoned-cart-wa:${cleanPhone}`, 1, 48 * 60 * 60);

      if (!allowed) {
        whatsappSkipReason = "rate_limited";
      }
      if (allowed) {
        const topItems = items.slice(0, 3).map(i => `${i.quantity}x ${i.name}`).join(", ");
        const moreText = items.length > 3 ? ` y ${items.length - 3} más` : "";

        const message = [
          `Hola! Vimos que dejaste tu carrito en Buleje con ${items.length} productos (${topItems}${moreText}).`,
          ``,
          `Total: S/${total.toFixed(2)}`,
          ``,
          `Tu carrito sigue guardado. Completa tu pedido aquí:`,
          `${baseUrl}/tienda`,
          ``,
          `Si necesitas ayuda, escríbenos por aquí. Buleje - Tu bodega digital`,
        ].join("\n");

        await sendWhatsAppQueued(cleanPhone, message, { tenantId, context: "abandoned-cart:customer" }).catch((err) => logger.error("[abandoned-cart] WhatsApp enqueue fallback failed", { error: String(err), tenantId }));

        whatsappSent = true;
      }
    }

    // ── 2. Email de notificación al ADMIN (mantener como backup) ──────────
    if (smtpUser && smtpPass) {
      const notifyEmail = process.env.NOTIFY_EMAIL || smtpUser;

      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: { user: smtpUser, pass: smtpPass },
      });

      const itemsHtml = items
        .map(
          (i) =>
            `<tr>
              <td style="padding:6px 8px;border-bottom:1px solid #eee;">${i.quantity}× ${i.name}</td>
              <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">S/${(i.price * i.quantity).toFixed(2)}</td>
            </tr>`
        )
        .join("");

      transporter.sendMail({
        from: `"Buleje" <${smtpUser}>`,
        to: notifyEmail,
        subject: `🛒 Carrito abandonado — S/${total.toFixed(2)} en espera${whatsappSent ? " (WhatsApp enviado)" : ""}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border:1px solid #e0e0e0;border-radius:12px;overflow:hidden;">
            <div style="background:#ff6b5b;padding:20px 24px;">
              <h2 style="color:#fff;margin:0;font-size:18px;">🛒 Carrito abandonado</h2>
              <p style="color:#fff;margin:4px 0 0;font-size:13px;opacity:0.85;">Un cliente dejó su carrito sin completar${phone ? ` · Tel: ${phone.slice(-4).padStart(phone.length, "*")}` : ""}</p>
            </div>
            ${whatsappSent ? '<div style="padding:10px 24px;background:#dcfce7;border-bottom:1px solid #bbf7d0;"><p style="margin:0;font-size:12px;color:#166534;">✅ WhatsApp de recuperación enviado al cliente</p></div>' : ""}
            <div style="padding:20px 24px;background:#f9fafb;">
              <table style="width:100%;border-collapse:collapse;font-size:14px;">
                <thead>
                  <tr style="background:#f3f4f6;">
                    <th style="padding:8px;text-align:left;font-size:12px;color:#6b7280;">Producto</th>
                    <th style="padding:8px;text-align:right;font-size:12px;color:#6b7280;">Subtotal</th>
                  </tr>
                </thead>
                <tbody>${itemsHtml}</tbody>
                <tfoot>
                  <tr>
                    <td style="padding:10px 8px;font-weight:bold;font-size:15px;">Total:</td>
                    <td style="padding:10px 8px;font-weight:bold;font-size:15px;text-align:right;color:#2563EB;">S/${total.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div style="padding:16px 24px;background:#fff;border-top:1px solid #eee;">
              <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">Buleje · Pucallpa, Perú</p>
            </div>
          </div>`,
      }).catch((err) => logger.error("[abandoned-cart] operation failed", { error: String(err) })); // fire-and-forget — no bloquear response
    }

    const emailConfigured = !!(smtpUser && smtpPass);
    const channel: "whatsapp" | "email" | "both" | "none" =
      whatsappSent && emailConfigured
        ? "both"
        : whatsappSent
          ? "whatsapp"
          : emailConfigured
            ? "email"
            : "none";

    return NextResponse.json({
      ok: true,
      sent: whatsappSent || emailConfigured,
      channel,
      whatsappSent,
      whatsappSkipReason,
      recipientPhone: maskedPhone,
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
});
