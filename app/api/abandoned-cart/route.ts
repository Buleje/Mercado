import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import nodemailer from "nodemailer";

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const { items, total } = parsed.data;

    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    if (!smtpUser || !smtpPass) {
      // Email not configured — silently succeed
      return NextResponse.json({ ok: true });
    }

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

    await transporter.sendMail({
      from: `"Bodega San Martín" <${smtpUser}>`,
      to: notifyEmail,
      subject: `🛒 Carrito abandonado — S/${total.toFixed(2)} en espera`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border:1px solid #e0e0e0;border-radius:12px;overflow:hidden;">
          <div style="background:#f59e0b;padding:20px 24px;">
            <h2 style="color:#fff;margin:0;font-size:18px;">🛒 Carrito abandonado</h2>
            <p style="color:#fff;margin:4px 0 0;font-size:13px;opacity:0.85;">Un cliente dejó su carrito sin completar el pedido</p>
          </div>
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
                  <td style="padding:10px 8px;font-weight:bold;font-size:15px;text-align:right;color:#2d6a4f;">S/${total.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div style="padding:16px 24px;background:#fff;border-top:1px solid #eee;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">Bodega San Martín · Pucallpa, Perú</p>
          </div>
        </div>`,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
