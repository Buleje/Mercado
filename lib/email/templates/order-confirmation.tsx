import React from "react";

// ──────────────────────────────────────────────
//  Template: Confirmación de pedido al cliente
// ──────────────────────────────────────────────

export interface OrderItem {
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
}

export interface DeliveryAddress {
  street: string;
  reference?: string;
  district?: string;
}

export interface OrderConfirmationProps {
  /** Número / código del pedido */
  orderNumber: string;
  /** Nombre del cliente */
  customerName: string;
  /** Nombre de la tienda */
  storeName: string;
  /** Productos del pedido */
  items: OrderItem[];
  /** Subtotal antes de descuentos */
  subtotal: number;
  /** Descuento aplicado (0 si no hay) */
  discount?: number;
  /** Costo de delivery (0 si recojo en tienda) */
  deliveryCost?: number;
  /** Total final */
  total: number;
  /** Método de pago */
  paymentMethod: "efectivo" | "yape" | "plin" | "tarjeta" | "transferencia";
  /** Si hay delivery, se muestra la dirección */
  deliveryAddress?: DeliveryAddress;
  /** Hora estimada de entrega o recojo (ej. "45 minutos") */
  estimatedTime?: string;
  /** URL para rastrear el pedido */
  trackingUrl?: string;
}

const PRIMARY = "#00A0A0";
const TEXT = "#111827";
const MUTED = "#6b7280";
const BG_LIGHT = "#f9fafb";
const BORDER = "#e5e7eb";
const SUCCESS = "#16a34a";

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  yape: "Yape",
  plin: "Plin",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia bancaria",
};

function fmt(n: number) {
  return `S/ ${n.toFixed(2)}`;
}

export default function OrderConfirmationEmail({
  orderNumber,
  customerName,
  storeName,
  items,
  subtotal,
  discount = 0,
  deliveryCost = 0,
  total,
  paymentMethod,
  deliveryAddress,
  estimatedTime,
  trackingUrl,
}: OrderConfirmationProps) {
  const isDelivery = !!deliveryAddress;

  return (
    <div
      style={{
        fontFamily: "'Segoe UI', Arial, sans-serif",
        maxWidth: "600px",
        margin: "0 auto",
        backgroundColor: "#ffffff",
        border: `1px solid ${BORDER}`,
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: SUCCESS,
          padding: "28px 24px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "36px", marginBottom: "10px" }}>✅</div>
        <h1
          style={{
            color: "#ffffff",
            margin: "0 0 6px",
            fontSize: "22px",
            fontWeight: "700",
          }}
        >
          Pedido confirmado
        </h1>
        <p style={{ color: "rgba(255,255,255,0.85)", margin: 0, fontSize: "14px" }}>
          #{orderNumber} · {storeName}
        </p>
      </div>

      {/* Saludo */}
      <div style={{ padding: "24px 24px 0" }}>
        <p style={{ color: TEXT, fontSize: "15px", margin: "0 0 6px", lineHeight: "1.6" }}>
          Hola, <strong>{customerName}</strong> 🙌
        </p>
        <p style={{ color: MUTED, fontSize: "14px", margin: "0 0 20px", lineHeight: "1.7" }}>
          Recibimos tu pedido y ya lo estamos preparando.
          {estimatedTime && ` Tiempo estimado: `}
          {estimatedTime && <strong style={{ color: PRIMARY }}>{estimatedTime}</strong>}
          {estimatedTime && "."}
        </p>
      </div>

      {/* Tabla de productos */}
      <div style={{ padding: "0 24px 24px" }}>
        <p
          style={{
            fontWeight: "700",
            fontSize: "13px",
            color: MUTED,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            margin: "0 0 10px",
          }}
        >
          Detalle del pedido
        </p>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "14px",
            border: `1px solid ${BORDER}`,
            borderRadius: "8px",
            overflow: "hidden",
          }}
        >
          <thead>
            <tr style={{ background: BG_LIGHT }}>
              <th
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  color: MUTED,
                  fontWeight: "600",
                  fontSize: "12px",
                  borderBottom: `1px solid ${BORDER}`,
                }}
              >
                Producto
              </th>
              <th
                style={{
                  textAlign: "center",
                  padding: "10px 8px",
                  color: MUTED,
                  fontWeight: "600",
                  fontSize: "12px",
                  borderBottom: `1px solid ${BORDER}`,
                }}
              >
                Cant.
              </th>
              <th
                style={{
                  textAlign: "right",
                  padding: "10px 12px",
                  color: MUTED,
                  fontWeight: "600",
                  fontSize: "12px",
                  borderBottom: `1px solid ${BORDER}`,
                }}
              >
                Precio
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr
                key={idx}
                style={{ borderBottom: `1px solid ${BORDER}` }}
              >
                <td style={{ padding: "10px 12px", color: TEXT }}>
                  {item.name}
                  <span style={{ color: MUTED, fontSize: "12px" }}> ({item.unit})</span>
                </td>
                <td style={{ padding: "10px 8px", color: MUTED, textAlign: "center" }}>
                  x{item.quantity}
                </td>
                <td
                  style={{
                    padding: "10px 12px",
                    textAlign: "right",
                    fontWeight: "600",
                    color: TEXT,
                  }}
                >
                  {fmt(item.unitPrice * item.quantity)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {subtotal !== total && (
              <tr style={{ background: BG_LIGHT }}>
                <td
                  colSpan={2}
                  style={{ padding: "8px 12px", color: MUTED, fontSize: "13px" }}
                >
                  Subtotal
                </td>
                <td
                  style={{
                    padding: "8px 12px",
                    textAlign: "right",
                    color: MUTED,
                    fontSize: "13px",
                  }}
                >
                  {fmt(subtotal)}
                </td>
              </tr>
            )}
            {discount > 0 && (
              <tr style={{ background: BG_LIGHT }}>
                <td
                  colSpan={2}
                  style={{ padding: "6px 12px", color: SUCCESS, fontSize: "13px" }}
                >
                  Descuento aplicado
                </td>
                <td
                  style={{
                    padding: "6px 12px",
                    textAlign: "right",
                    color: SUCCESS,
                    fontSize: "13px",
                    fontWeight: "600",
                  }}
                >
                  −{fmt(discount)}
                </td>
              </tr>
            )}
            {deliveryCost > 0 && (
              <tr style={{ background: BG_LIGHT }}>
                <td
                  colSpan={2}
                  style={{ padding: "6px 12px", color: MUTED, fontSize: "13px" }}
                >
                  Costo de delivery
                </td>
                <td
                  style={{
                    padding: "6px 12px",
                    textAlign: "right",
                    color: MUTED,
                    fontSize: "13px",
                  }}
                >
                  +{fmt(deliveryCost)}
                </td>
              </tr>
            )}
            <tr style={{ background: "#ecfdf5" }}>
              <td
                colSpan={2}
                style={{
                  padding: "12px 12px",
                  fontWeight: "700",
                  color: TEXT,
                  fontSize: "15px",
                }}
              >
                Total
              </td>
              <td
                style={{
                  padding: "12px 12px",
                  textAlign: "right",
                  fontWeight: "700",
                  color: SUCCESS,
                  fontSize: "18px",
                }}
              >
                {fmt(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Info pago + entrega */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          padding: "0 24px 24px",
          flexWrap: "wrap",
        }}
      >
        {/* Pago */}
        <div
          style={{
            flex: "1 1 200px",
            background: BG_LIGHT,
            border: `1px solid ${BORDER}`,
            borderRadius: "8px",
            padding: "14px",
          }}
        >
          <p
            style={{
              margin: "0 0 6px",
              fontSize: "11px",
              fontWeight: "700",
              color: MUTED,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Pago
          </p>
          <p style={{ margin: 0, fontSize: "14px", fontWeight: "600", color: TEXT }}>
            💳 {PAYMENT_LABELS[paymentMethod] ?? paymentMethod}
          </p>
        </div>

        {/* Entrega */}
        <div
          style={{
            flex: "1 1 200px",
            background: BG_LIGHT,
            border: `1px solid ${BORDER}`,
            borderRadius: "8px",
            padding: "14px",
          }}
        >
          <p
            style={{
              margin: "0 0 6px",
              fontSize: "11px",
              fontWeight: "700",
              color: MUTED,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            {isDelivery ? "Dirección de entrega" : "Recojo en tienda"}
          </p>
          {isDelivery && deliveryAddress ? (
            <p style={{ margin: 0, fontSize: "13px", color: TEXT, lineHeight: "1.5" }}>
              📍 {deliveryAddress.street}
              {deliveryAddress.district && `, ${deliveryAddress.district}`}
              {deliveryAddress.reference && (
                <span style={{ color: MUTED, display: "block", fontSize: "12px" }}>
                  Ref: {deliveryAddress.reference}
                </span>
              )}
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: "13px", color: TEXT }}>
              🏪 {storeName}
            </p>
          )}
        </div>
      </div>

      {/* CTA rastreo */}
      {trackingUrl && (
        <div style={{ padding: "0 24px 28px", textAlign: "center" }}>
          <a
            href={trackingUrl}
            style={{
              display: "inline-block",
              background: PRIMARY,
              color: "#ffffff",
              padding: "12px 32px",
              borderRadius: "8px",
              textDecoration: "none",
              fontWeight: "700",
              fontSize: "14px",
            }}
          >
            Rastrear mi pedido →
          </a>
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          background: BG_LIGHT,
          padding: "16px 24px",
          textAlign: "center",
          borderTop: `1px solid ${BORDER}`,
        }}
      >
        <p style={{ margin: "0 0 4px", fontSize: "12px", color: MUTED }}>
          {storeName} — powered by Buleje
        </p>
        <p style={{ margin: 0, fontSize: "11px", color: "#9ca3af" }}>
          ¿Problemas con tu pedido? Responde este correo.
        </p>
      </div>
    </div>
  );
}
