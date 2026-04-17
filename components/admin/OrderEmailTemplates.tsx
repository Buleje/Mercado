"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Mail, Package, Truck, Tag } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrderEmailItem {
  name: string;
  quantity: number;
  price: number;
  unit: string;
}

export interface OrderEmailData {
  id: string;
  customerName: string;
  customerPhone?: string;
  total: number;
  paymentMethod?: string;
  items: OrderEmailItem[];
  trackingUrl?: string;
  surveyUrl?: string;
  createdAt?: string;
}

export interface OfferProduct {
  id: number;
  name: string;
  price: number;
  originalPrice?: number;
  imageUrl?: string;
  unit: string;
  category?: string;
}

// ─── HTML Generator: Confirmación de pedido ───────────────────────────────────

export function generateOrderConfirmationHTML(order: OrderEmailData): string {
  const fmt = (n: number) => `S/${n.toFixed(2)}`;
  const fmtDate = (iso?: string) => {
    if (!iso) return new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });
    try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
    catch { return iso; }
  };

  const paymentLabels: Record<string, string> = {
    efectivo: "Efectivo",
    yape: "Yape",
    plin: "Plin",
    tarjeta: "Tarjeta",
  };
  const payLabel = order.paymentMethod ? (paymentLabels[order.paymentMethod] ?? order.paymentMethod) : "Efectivo";

  const itemsHtml = order.items
    .map(
      (i) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333;">
          <strong>${i.quantity}</strong> x ${i.name}
          <span style="font-size:12px;color:#888;display:block;">${i.unit}</span>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333;text-align:right;white-space:nowrap;">
          ${fmt(i.price * i.quantity)}
        </td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Pedido confirmado</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:#00B4A6;padding:28px 28px 20px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="background:rgba(255,255,255,0.15);width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;text-align:center;line-height:48px;">
          B
        </div>
        <div>
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Buleje</h1>
          <p style="margin:2px 0 0;color:#a8d5ba;font-size:13px;">Pucallpa, Peru</p>
        </div>
      </div>
    </div>

    <!-- Banner confirmacion -->
    <div style="background:#f97316;padding:16px 28px;text-align:center;">
      <p style="margin:0;color:#ffffff;font-size:17px;font-weight:700;">Pedido confirmado</p>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Orden #${order.id} &bull; ${fmtDate(order.createdAt)}</p>
    </div>

    <!-- Saludo -->
    <div style="padding:24px 28px 0;">
      <p style="margin:0;font-size:15px;color:#222;">Hola <strong>${order.customerName}</strong>,</p>
      <p style="margin:8px 0 0;font-size:14px;color:#555;line-height:1.6;">
        Recibimos tu pedido con exito. Lo estamos preparando y pronto estara en camino.
      </p>
    </div>

    <!-- Detalle items -->
    <div style="padding:20px 28px 0;">
      <h2 style="margin:0 0 12px;font-size:15px;color:#00B4A6;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">
        Detalle del pedido
      </h2>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f0fdf4;">
            <th style="padding:10px 12px;text-align:left;font-size:12px;color:#00B4A6;text-transform:uppercase;letter-spacing:0.5px;">Producto</th>
            <th style="padding:10px 12px;text-align:right;font-size:12px;color:#00B4A6;text-transform:uppercase;letter-spacing:0.5px;">Subtotal</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
        <tfoot>
          <tr style="background:#f0fdf4;">
            <td style="padding:12px;font-weight:700;font-size:15px;color:#111;">Total</td>
            <td style="padding:12px;text-align:right;font-weight:700;font-size:17px;color:#00B4A6;">${fmt(order.total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Info pago -->
    <div style="padding:16px 28px;">
      <div style="background:#f9fafb;border-radius:8px;padding:14px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:13px;color:#666;">Metodo de pago</span>
        <span style="font-size:13px;font-weight:700;color:#333;">${payLabel}</span>
      </div>
      ${order.customerPhone ? `<div style="margin-top:8px;background:#f9fafb;border-radius:8px;padding:14px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:13px;color:#666;">Telefono de contacto</span>
        <span style="font-size:13px;font-weight:700;color:#333;">${order.customerPhone}</span>
      </div>` : ""}
    </div>

    <!-- Boton tracking -->
    ${order.trackingUrl ? `
    <div style="padding:8px 28px 20px;text-align:center;">
      <a href="${order.trackingUrl}" style="display:inline-block;background:#00B4A6;color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:8px;font-size:14px;font-weight:700;">
        Ver estado de mi pedido
      </a>
    </div>` : ""}

    <!-- Footer -->
    <div style="border-top:1px solid #e8e8e8;padding:16px 28px;text-align:center;">
      <p style="margin:0;font-size:12px;color:#aaa;">Buleje &bull; Pucallpa, Peru</p>
      <p style="margin:4px 0 0;font-size:12px;color:#aaa;">Este es un mensaje automatico, no responder a este correo.</p>
    </div>
  </div>
</body>
</html>`;
}

// ─── HTML Generator: Confirmación de entrega ──────────────────────────────────

export function generateDeliveryConfirmationHTML(order: OrderEmailData): string {
  const fmt = (n: number) => `S/${n.toFixed(2)}`;

  const itemsSummary = order.items
    .slice(0, 3)
    .map((i) => `${i.quantity}x ${i.name}`)
    .join(", ");
  const extraItems = order.items.length > 3 ? ` y ${order.items.length - 3} mas` : "";

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Pedido entregado</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:#00B4A6;padding:28px 28px 20px;">
      <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Buleje</h1>
      <p style="margin:4px 0 0;color:#a8d5ba;font-size:13px;">Pucallpa, Peru</p>
    </div>

    <!-- Banner entrega -->
    <div style="background:#16a34a;padding:28px;text-align:center;">
      <div style="width:64px;height:64px;background:rgba(255,255,255,0.2);border-radius:50%;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;font-size:28px;line-height:64px;text-align:center;">
        &#10003;
      </div>
      <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Tu pedido fue entregado</p>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Orden #${order.id}</p>
    </div>

    <!-- Cuerpo -->
    <div style="padding:28px;">
      <p style="margin:0 0 16px;font-size:15px;color:#222;">Hola <strong>${order.customerName}</strong>,</p>
      <p style="margin:0 0 16px;font-size:14px;color:#555;line-height:1.7;">
        Tu pedido de <strong>${itemsSummary}${extraItems}</strong> por <strong>S/${order.total.toFixed(2)}</strong>
        fue entregado exitosamente. Esperamos que estes satisfecho con tu compra.
      </p>

      <!-- Resumen rapido -->
      <div style="background:#f0fdf4;border-radius:8px;padding:16px;margin-bottom:20px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:4px 0;color:#555;">Orden</td>
            <td style="padding:4px 0;text-align:right;font-weight:600;color:#222;">#${order.id}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#555;">Total pagado</td>
            <td style="padding:4px 0;text-align:right;font-weight:700;color:#00B4A6;">${fmt(order.total)}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#555;">Productos</td>
            <td style="padding:4px 0;text-align:right;font-weight:600;color:#222;">${order.items.length} item${order.items.length !== 1 ? "s" : ""}</td>
          </tr>
        </table>
      </div>

      <!-- CTA encuesta -->
      ${order.surveyUrl ? `
      <div style="text-align:center;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:20px 16px;margin-bottom:20px;">
        <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#92400e;">Como fue tu experiencia?</p>
        <p style="margin:0 0 14px;font-size:13px;color:#78350f;">Tu opinion nos ayuda a mejorar el servicio.</p>
        <a href="${order.surveyUrl}" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;padding:11px 28px;border-radius:8px;font-size:14px;font-weight:700;">
          Dar mi opinion (30 segundos)
        </a>
      </div>` : `
      <div style="text-align:center;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:20px 16px;margin-bottom:20px;">
        <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#92400e;">Como fue tu experiencia?</p>
        <p style="margin:0 0 0;font-size:13px;color:#78350f;">Respondenos por WhatsApp para mejorar tu proxima compra.</p>
      </div>`}

      <!-- Invitacion proxima compra -->
      <div style="text-align:center;">
        <p style="margin:0 0 12px;font-size:14px;color:#555;">Visitanos de nuevo para encontrar los mejores precios en productos de primera necesidad.</p>
      </div>
    </div>

    <!-- Footer -->
    <div style="border-top:1px solid #e8e8e8;padding:16px 28px;text-align:center;">
      <p style="margin:0;font-size:12px;color:#aaa;">Buleje &bull; Pucallpa, Peru</p>
      <p style="margin:4px 0 0;font-size:12px;color:#aaa;">Este es un mensaje automatico, no responder a este correo.</p>
    </div>
  </div>
</body>
</html>`;
}

// ─── HTML Generator: Ofertas semanales ───────────────────────────────────────

export function generateWeeklyOffersHTML(products: OfferProduct[], customerName: string): string {
  const fmt = (n: number) => `S/${n.toFixed(2)}`;
  const top5 = products.slice(0, 5);

  const productCards = top5
    .map((p) => {
      const hasDiscount = p.originalPrice != null && p.originalPrice > p.price;
      const discountPct = hasDiscount
        ? Math.round(((p.originalPrice! - p.price) / p.originalPrice!) * 100)
        : 0;

      return `
      <tr>
        <td style="padding:12px;border-bottom:1px solid #f0f0f0;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="width:80px;padding-right:12px;vertical-align:top;">
                ${p.imageUrl
          ? `<img src="${p.imageUrl}" alt="${p.name}" style="width:72px;height:72px;object-fit:cover;border-radius:8px;display:block;">`
          : `<div style="width:72px;height:72px;background:#f0fdf4;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:28px;text-align:center;line-height:72px;color:#00B4A6;font-weight:700;">${p.name.charAt(0)}</div>`
        }
              </td>
              <td style="vertical-align:middle;">
                ${hasDiscount ? `<span style="display:inline-block;background:#dc2626;color:#fff;font-size:11px;font-weight:700;padding:2px 7px;border-radius:4px;margin-bottom:4px;">-${discountPct}%</span>` : ""}
                <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#222;">${p.name}</p>
                <p style="margin:0 0 6px;font-size:12px;color:#888;">${p.unit}${p.category ? ` &bull; ${p.category}` : ""}</p>
                <div>
                  <span style="font-size:16px;font-weight:700;color:#00B4A6;">${fmt(p.price)}</span>
                  ${hasDiscount ? `<span style="font-size:13px;color:#aaa;text-decoration:line-through;margin-left:6px;">${fmt(p.originalPrice!)}</span>` : ""}
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
    })
    .join("");

  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 7);
  const validStr = validUntil.toLocaleDateString("es-PE", { day: "2-digit", month: "long" });

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Ofertas de la semana</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:#00B4A6;padding:28px 28px 20px;">
      <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Buleje</h1>
      <p style="margin:4px 0 0;color:#a8d5ba;font-size:13px;">Pucallpa, Peru</p>
    </div>

    <!-- Banner -->
    <div style="background:linear-gradient(135deg,#f97316,#e8803a);padding:22px 28px;text-align:center;">
      <p style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Ofertas de la semana</p>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.9);font-size:13px;">Valido hasta el ${validStr}</p>
    </div>

    <!-- Saludo -->
    <div style="padding:20px 28px 8px;">
      <p style="margin:0;font-size:15px;color:#222;">Hola <strong>${customerName}</strong>,</p>
      <p style="margin:8px 0 0;font-size:14px;color:#555;line-height:1.6;">
        Esta semana tenemos precios especiales en productos seleccionados solo para ti.
      </p>
    </div>

    <!-- Productos -->
    <div style="padding:0 20px;">
      <table style="width:100%;border-collapse:collapse;">
        <tbody>${productCards}</tbody>
      </table>
    </div>

    <!-- CTA -->
    <div style="padding:20px 28px 24px;text-align:center;">
      <p style="margin:0 0 14px;font-size:13px;color:#777;">Haz tu pedido por WhatsApp o visita nuestra tienda.</p>
      <div style="display:inline-block;background:#00B4A6;color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:8px;font-size:14px;font-weight:700;">
        Ver todas las ofertas
      </div>
    </div>

    <!-- Footer -->
    <div style="border-top:1px solid #e8e8e8;padding:16px 28px;text-align:center;">
      <p style="margin:0;font-size:12px;color:#aaa;">Buleje &bull; Pucallpa, Peru</p>
      <p style="margin:4px 0 0;font-size:12px;color:#aaa;">
        Si no deseas recibir mas correos, puedes ignorar este mensaje.
      </p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Preview Tabs ─────────────────────────────────────────────────────────────

type PreviewTab = "confirmacion" | "entrega" | "ofertas";

const DEMO_ORDER: OrderEmailData = {
  id: "ORD-0042",
  customerName: "Maria Lopez",
  customerPhone: "987654321",
  total: 45.8,
  paymentMethod: "yape",
  createdAt: new Date().toISOString(),
  trackingUrl: "#",
  surveyUrl: "#",
  items: [
    { name: "Arroz Costeño 5kg", quantity: 2, price: 12.5, unit: "bolsa" },
    { name: "Aceite Primor 1L", quantity: 1, price: 8.9, unit: "botella" },
    { name: "Azucar Rubia 1kg", quantity: 1, price: 3.5, unit: "kg" },
    { name: "Fideos Don Vittorio", quantity: 2, price: 4.2, unit: "paquete" },
  ],
};

const DEMO_PRODUCTS: OfferProduct[] = [
  { id: 1, name: "Arroz Costeño 5kg", price: 22.0, originalPrice: 26.0, unit: "bolsa", category: "Granos" },
  { id: 2, name: "Aceite Primor 1L", price: 7.5, originalPrice: 9.0, unit: "botella", category: "Aceites" },
  { id: 3, name: "Leche Gloria 400g", price: 4.2, unit: "tarro", category: "Lacteos" },
  { id: 4, name: "Azucar Rubia 1kg", price: 3.0, originalPrice: 3.5, unit: "kg", category: "Basicos" },
  { id: 5, name: "Fideos Don Vittorio 500g", price: 3.8, unit: "paquete", category: "Pastas" },
];

// ─── Componente principal: Preview ────────────────────────────────────────────

export default function OrderEmailTemplates() {
  const [activeTab, setActiveTab] = useState<PreviewTab>("confirmacion");

  const tabs: { id: PreviewTab; label: string; icon: React.ReactNode }[] = [
    { id: "confirmacion", label: "Confirmacion", icon: <Package className="w-4 h-4" /> },
    { id: "entrega", label: "Entrega", icon: <Truck className="w-4 h-4" /> },
    { id: "ofertas", label: "Ofertas", icon: <Tag className="w-4 h-4" /> },
  ];

  const htmlByTab: Record<PreviewTab, string> = {
    confirmacion: generateOrderConfirmationHTML(DEMO_ORDER),
    entrega: generateDeliveryConfirmationHTML(DEMO_ORDER),
    ofertas: generateWeeklyOffersHTML(DEMO_PRODUCTS, "Maria Lopez"),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Mail className="w-5 h-5 text-[#00B4A6] dark:text-[#4ade80]" />
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Templates de Email
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Vista previa de correos automaticos del sistema
          </p>
        </div>
      </div>

      {/* Tabs selector */}
      <div className="flex gap-2 border-b border-[var(--rule-base)]">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              activeTab === t.id
                ? "border-[#00B4A6] text-[#00B4A6] dark:border-[#4ade80] dark:text-[#4ade80]"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Iframe preview */}
      <div className="rounded-xl border border-[var(--rule-base)] overflow-hidden bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-gray-800 border-b border-[var(--rule-base)]">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <div className="w-3 h-3 rounded-full bg-yellow-400" />
          <div className="w-3 h-3 rounded-full bg-green-400" />
          <span className="ml-3 text-xs text-gray-400 dark:text-gray-500 font-mono">
            preview — {tabs.find((t) => t.id === activeTab)?.label}
          </span>
        </div>
        <iframe
          srcDoc={htmlByTab[activeTab]}
          title={`preview-${activeTab}`}
          className="w-full h-[600px] border-0"
          sandbox="allow-same-origin"
        />
      </div>

      {/* Nota de uso */}
      <p className="text-xs text-gray-400 dark:text-gray-600 text-center">
        Datos de muestra. En produccion se usan los datos reales del pedido.
      </p>
    </div>
  );
}
