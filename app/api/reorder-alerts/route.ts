import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { broadcastPush } from "@/lib/push-sender";
import nodemailer from "nodemailer";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { logger } from "@/lib/logger";

/**
 * GET /api/reorder-alerts — Check low-stock products and send reorder suggestions.
 * Runs daily via Vercel Cron alongside stock-alerts.
 */

type LowStockItem = {
  id: number;
  name: string;
  stock: number;
  stockMin: number;
  stockMax: number;
  category: string;
  unit: string;
  supplier?: string;
  suggestedQty: number;
};

async function checkAndAlert() {
  // Find products at or below stockMin
  const products = await prisma.product.findMany({
    where: { active: true, stock: { not: null }, stockMin: { not: null } },
    select: { id: true, name: true, stock: true, stockMin: true, stockMax: true, category: true, unit: true },
  });

  const lowStock = products.filter(
    (p) => p.stock !== null && p.stockMin !== null && p.stock <= p.stockMin
  );

  if (lowStock.length === 0) {
    return { alerts: 0, sent: false };
  }

  // Try to find last supplier for each product from purchase order history
  const productIds = lowStock.map(p => p.id);
  const recentPurchaseItems = await prisma.purchaseItem.findMany({
    where: { productId: { in: productIds } },
    include: { purchaseOrder: { select: { supplierName: true } } },
    orderBy: { purchaseOrder: { createdAt: "desc" } },
  });

  const supplierMap = new Map<number, string>();
  for (const item of recentPurchaseItems) {
    if (item.productId && !supplierMap.has(item.productId)) {
      supplierMap.set(item.productId, item.purchaseOrder.supplierName);
    }
  }

  const items: LowStockItem[] = lowStock.map((p) => {
    const max = p.stockMax ?? (p.stockMin ?? 0) * 3;
    const current = p.stock ?? 0;
    return {
      id: p.id,
      name: p.name,
      stock: current,
      stockMin: p.stockMin ?? 0,
      stockMax: max,
      category: p.category,
      unit: p.unit,
      supplier: supplierMap.get(p.id),
      suggestedQty: Math.max(max - current, p.stockMin ?? 1),
    };
  });

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
              <td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:center;font-size:13px;color:${p.stock <= 0 ? "#dc2626" : "#f59e0b"};font-weight:bold;">${p.stock}</td>
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

  // Push notification to admin
  broadcastPush({
    title: `🔄 ${items.length} productos para reabastecer`,
    body: items.slice(0, 3).map(p => p.name).join(", ") + (items.length > 3 ? ` y ${items.length - 3} más` : ""),
    url: "/admin?tab=inventario",
  }).catch((err) => logger.warn("[reorder-alerts] broadcastPush failed", { err: String(err) }));

  return { alerts: items.length, sent: true, bySupplier: Object.fromEntries(bySupplier) };
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await withCronRetry("reorder-alerts", async () => {
      const alertResult = await checkAndAlert();

      // Auto-create draft purchase orders grouped by supplier
      if (alertResult.sent && alertResult.bySupplier) {
        for (const [supplierName, items] of Object.entries(alertResult.bySupplier) as [string, LowStockItem[]][]) {
          if (supplierName === "Sin proveedor asignado") continue;

          // Find the supplier
          const supplier = await prisma.supplier.findFirst({
            where: { name: supplierName },
            select: { id: true, tenantId: true },
          });
          if (!supplier) continue;

          const poId = `auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const total = items.reduce((s, i) => s + i.suggestedQty * (i.stockMin || 1), 0); // rough estimate

          await prisma.purchaseOrder.create({
            data: {
              id: poId,
              tenantId: supplier.tenantId,
              supplierId: supplier.id,
              supplierName,
              total,
              status: "pendiente",
              notes: `Auto-generado por sistema de reabastecimiento. ${items.length} productos bajo stock mínimo.`,
              items: {
                create: items.map(i => ({
                  productId: i.id,
                  name: i.name,
                  quantity: i.suggestedQty,
                  unitCost: 0,
                  unit: i.unit,
                })),
              },
            },
          });
        }
      }

      return alertResult;
    });
    return NextResponse.json(result);
  } catch (e) {
    logger.error("[reorder-alerts] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Failed to check reorder alerts" }, { status: 500 });
  }
}
