import { NextResponse, type NextRequest } from "next/server";
import { broadcastPush } from "@/lib/push-sender";
import nodemailer from "nodemailer";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { logger } from "@/lib/logger";
import { productosBajoMinimo, reponerPorNegocio, type ProductoParaReponer, type ReposicionDeNegocio } from "@/lib/compras/reposicion-automatica";

/**
 * GET /api/reorder-alerts — Check low-stock products and send reorder suggestions.
 * Runs daily via Vercel Cron alongside stock-alerts.
 *
 * Aislamiento (10-10): cada negocio se resuelve aparte (`reponerPorNegocio`):
 * su historial, su proveedor, sus productos y su push. Antes el proveedor se
 * buscaba por nombre en toda la base y el push salía a todos los negocios.
 */

type LowStockItem = ProductoParaReponer;

async function checkAndAlert(crearBorradores: boolean) {
  const lowStock = await productosBajoMinimo();

  if (lowStock.length === 0) {
    return { alerts: 0, sent: false };
  }

  const porNegocio: ReposicionDeNegocio[] = await reponerPorNegocio(lowStock, { crearBorradores, origen: "reorder-alerts" });
  const items: LowStockItem[] = porNegocio.flatMap((n) => n.productos);

  // Group by supplier for the email
  const bySupplier = new Map<string, LowStockItem[]>();
  for (const item of items) {
    const key = item.supplier ?? "Sin proveedor asignado";
    const list = bySupplier.get(key) ?? [];
    list.push(item);
    bySupplier.set(key, list);
  }

  // Send email
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (smtpUser && smtpPass) {
    const notifyEmail = process.env.NOTIFY_EMAIL || smtpUser;
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { user: smtpUser, pass: smtpPass },
    });

    let supplierSections = "";
    for (const [supplier, prods] of bySupplier) {
      const rows = prods
        .map(
          (p) =>
            `<tr>
              <td style="padding:5px 8px;border-bottom:1px solid #eee;font-size:13px;">${p.name}</td>
              <td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:center;font-size:13px;color:${p.stock <= 0 ? "#dc2626" : "#ff6b5b"};font-weight:bold;">${p.stock}</td>
              <td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:center;font-size:13px;">${p.stockMin}</td>
              <td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:center;font-size:13px;color:#16a34a;font-weight:bold;">${p.suggestedQty} ${p.unit}</td>
            </tr>`
        )
        .join("");
      supplierSections += `
        <div style="margin-bottom:20px;">
          <h3 style="font-size:14px;color:var(--accent);margin:0 0 8px;padding:8px 12px;background:#f5f3ff;border-radius:8px;">📦 ${supplier}</h3>
          <table style="width:100%;border-collapse:collapse;">
            <thead><tr style="background:#f9fafb;">
              <th style="text-align:left;padding:5px 8px;font-size:12px;color:var(--accent);">Producto</th>
              <th style="text-align:center;padding:5px 8px;font-size:12px;color:var(--accent);">Stock</th>
              <th style="text-align:center;padding:5px 8px;font-size:12px;color:var(--accent);">Mín.</th>
              <th style="text-align:center;padding:5px 8px;font-size:12px;color:var(--accent);">Pedir</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }

    await transporter.sendMail({
      from: `"Buleje" <${smtpUser}>`,
      to: notifyEmail,
      subject: `🔄 Sugerencia de reabastecimiento — ${items.length} productos`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;border:1px solid #e0e0e0;border-radius:12px;overflow:hidden;">
          <div style="background:var(--accent);padding:20px 24px;">
            <h2 style="color:#fff;margin:0;font-size:18px;">🔄 Sugerencia de Reabastecimiento</h2>
            <p style="color:#c4b5fd;margin:4px 0 0;font-size:13px;">${items.length} productos necesitan reposición</p>
          </div>
          <div style="padding:20px 24px;">
            ${supplierSections}
          </div>
          <div style="padding:12px 24px;border-top:1px solid #eee;text-align:center;">
            <p style="font-size:12px;color:#999;margin:0;">Buleje · Alerta automática de reabastecimiento</p>
          </div>
        </div>
      `,
    });
  }

  // Push a los admins de CADA negocio con SUS productos: sin `tenantId`,
  // `broadcastPush` le mandaba a todos los negocios los nombres de todos.
  for (const n of porNegocio) {
    if (n.productos.length === 0) continue;
    broadcastPush({
      title: `🔄 ${n.productos.length} productos para reabastecer`,
      body: n.productos.slice(0, 3).map((p) => p.name).join(", ") + (n.productos.length > 3 ? ` y ${n.productos.length - 3} más` : ""),
      url: "/admin?tab=inventario",
    }, n.tenantId).catch((err) => logger.warn("[reorder-alerts] broadcastPush failed", { err: String(err), tenantId: n.tenantId }));
  }

  return {
    alerts: items.length,
    sent: true,
    porNegocio: porNegocio.map((n) => ({ tenantId: n.tenantId, alertas: n.productos.length, borradores: n.borradores })),
  };
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    // Reintentar es seguro: `reponerBorrador` no duplica la orden de un proveedor.
    const result = await withCronRetry("reorder-alerts", () => checkAndAlert(true));
    return NextResponse.json(result);
  } catch (e) {
    logger.error("[reorder-alerts] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Failed to check reorder alerts" }, { status: 500 });
  }
}
