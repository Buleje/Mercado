export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from "next/server";
import { OrdersDB, SettingsDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { toErrorPayload } from "@/lib/api-error";

const IGV_RATE = 0.18;

export async function GET(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { orderId } = await params;
    const orders = await OrdersDB.getAll(auth.tenantId);
    const order = orders.find(o => o.id === orderId);
    if (!order) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    }

    const settings = await SettingsDB.get();
    const businessName = settings.businessName || "Buleje";
    const businessPhone = settings.businessPhone || "";
    const businessAddress = settings.businessAddress || "Pucallpa, Ucayali, Perú";

    const subtotal = order.items.reduce((s, i) => s + i.price * i.quantity, 0);
    const discount = (order.couponDiscount ?? 0) + (order.discountAmount ?? 0);
    const total = order.total;
    const igv = +(total * IGV_RATE / (1 + IGV_RATE)).toFixed(2);
    const baseImponible = +(total - igv).toFixed(2);

    const date = new Date(order.createdAt).toLocaleDateString("es-PE", {
      timeZone: "America/Lima",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Boleta − ${order.id.slice(-8).toUpperCase()}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; font-size: 12px; color: #1a1a1a; padding: 24px; max-width: 600px; margin: 0 auto; }
  .header { text-align: center; margin-bottom: 16px; border-bottom: 2px solid #111; padding-bottom: 12px; }
  .header h1 { font-size: 18px; font-weight: 800; }
  .header p { font-size: 11px; color: #555; margin-top: 2px; }
  .meta { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 11px; }
  .meta span { color: #555; }
  .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #888; letter-spacing: 0.5px; margin-bottom: 6px; }
  .customer { margin-bottom: 14px; }
  .customer p { margin: 1px 0; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; color: #888; border-bottom: 1px solid #ddd; padding: 4px 0; }
  th:last-child { text-align: right; }
  td { padding: 5px 0; border-bottom: 1px solid #f0f0f0; }
  td:last-child { text-align: right; font-weight: 600; }
  .totals { border-top: 2px solid #111; padding-top: 8px; }
  .totals .row { display: flex; justify-content: space-between; padding: 2px 0; font-size: 12px; }
  .totals .row.total { font-weight: 800; font-size: 14px; border-top: 1px solid #ddd; padding-top: 6px; margin-top: 4px; }
  .footer { text-align: center; margin-top: 20px; font-size: 10px; color: #999; border-top: 1px dashed #ccc; padding-top: 8px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="header">
    <h1>${businessName}</h1>
    <p>${businessAddress}</p>
    ${businessPhone ? `<p>Tel: ${businessPhone}</p>` : ""}
  </div>

  <div class="meta">
    <div><strong>Boleta Nº:</strong> ${order.id.slice(-8).toUpperCase()}</div>
    <div><strong>Fecha:</strong> ${date}</div>
  </div>

  <div class="customer">
    <p class="section-title">Cliente</p>
    <p><strong>${order.customer.name}</strong></p>
    ${order.customer.phone ? `<p>Tel: ${order.customer.phone}</p>` : ""}
    <p>${order.customer.location}</p>
  </div>

  <table>
    <thead>
      <tr><th>Producto</th><th>Cant.</th><th>P.Unit</th><th>Subtotal</th></tr>
    </thead>
    <tbody>
      ${order.items.map(i => `
      <tr>
        <td>${i.name} (${i.unit})</td>
        <td>${i.quantity}</td>
        <td>S/${i.price.toFixed(2)}</td>
        <td>S/${(i.price * i.quantity).toFixed(2)}</td>
      </tr>`).join("")}
    </tbody>
  </table>

  <div class="totals">
    <div class="row"><span>Subtotal</span><span>S/${subtotal.toFixed(2)}</span></div>
    ${discount > 0 ? `<div class="row"><span>Descuento</span><span>−S/${discount.toFixed(2)}</span></div>` : ""}
    <div class="row"><span>Base imponible</span><span>S/${baseImponible.toFixed(2)}</span></div>
    <div class="row"><span>IGV (18%)</span><span>S/${igv.toFixed(2)}</span></div>
    <div class="row total"><span>TOTAL</span><span>S/${total.toFixed(2)}</span></div>
  </div>

  <div class="footer">
    <p>Método de pago: ${order.paymentMethod === "yape" ? "Yape" : order.paymentMethod === "efectivo" ? "Efectivo" : "No especificado"}</p>
    <p>Gracias por su compra — ${businessName}</p>
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}
