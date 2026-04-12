import React from "react";

// ──────────────────────────────────────────────
//  Template: Recibo de pago
// ──────────────────────────────────────────────

export interface PaymentReceiptProps {
  /** Número de recibo o boleta */
  receiptNumber?: string;
  /** Número de pedido asociado */
  orderNumber: string;
  /** Nombre del cliente */
  customerName: string;
  /** Nombre de la tienda */
  storeName: string;
  /** Monto pagado */
  amount: number;
  /** Método de pago utilizado */
  paymentMethod: "efectivo" | "yape" | "plin" | "tarjeta" | "transferencia";
  /** Número de operación Yape/Plin/transferencia (si aplica) */
  transactionId?: string;
  /** Fecha y hora del pago (ISO string) */
  paidAt: string;
  /** Serie y número de boleta SUNAT si existe, ej. "B001-00000123" */
  sunatVoucher?: string;
  /** URL para descargar la boleta PDF */
  voucherUrl?: string;
}

const PRIMARY = "#00B4A6";
const TEXT = "#111827";
const MUTED = "#6b7280";
const BG_LIGHT = "#f9fafb";
const BORDER = "#e5e7eb";
const SUCCESS = "#16a34a";

const PAYMENT_META: Record<
  string,
  { label: string; icon: string; color: string }
> = {
  efectivo: { label: "Efectivo", icon: "💵", color: SUCCESS },
  yape: { label: "Yape", icon: "📱", color: "#7c3aed" },
  plin: { label: "Plin", icon: "📱", color: "#0ea5e9" },
  tarjeta: { label: "Tarjeta", icon: "💳", color: "#1d4ed8" },
  transferencia: { label: "Transferencia bancaria", icon: "🏦", color: TEXT },
};

function fmt(n: number) {
  return `S/ ${n.toFixed(2)}`;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("es-PE", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function PaymentReceiptEmail({
  receiptNumber,
  orderNumber,
  customerName,
  storeName,
  amount,
  paymentMethod,
  transactionId,
  paidAt,
  sunatVoucher,
  voucherUrl,
}: PaymentReceiptProps) {
  const meta = PAYMENT_META[paymentMethod] ?? {
    label: paymentMethod,
    icon: "💳",
    color: TEXT,
  };

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
          background: `linear-gradient(135deg, ${PRIMARY} 0%, #0097a7 100%)`,
          padding: "28px 24px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "40px", marginBottom: "10px" }}>🧾</div>
        <h1
          style={{
            color: "#ffffff",
            margin: "0 0 6px",
            fontSize: "22px",
            fontWeight: "700",
          }}
        >
          Recibo de pago
        </h1>
        <p style={{ color: "rgba(255,255,255,0.85)", margin: 0, fontSize: "14px" }}>
          {storeName}
        </p>
      </div>

      {/* Monto destacado */}
      <div
        style={{
          background: "#ecfdf5",
          border: `1px solid #bbf7d0`,
          borderRadius: "10px",
          margin: "24px 24px 0",
          padding: "24px",
          textAlign: "center",
        }}
      >
        <p
          style={{
            margin: "0 0 4px",
            fontSize: "13px",
            fontWeight: "600",
            color: MUTED,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          Monto pagado
        </p>
        <p
          style={{
            margin: 0,
            fontSize: "40px",
            fontWeight: "800",
            color: SUCCESS,
            letterSpacing: "-1px",
          }}
        >
          {fmt(amount)}
        </p>
        <p style={{ margin: "8px 0 0", fontSize: "13px", color: SUCCESS }}>
          Pago recibido correctamente ✓
        </p>
      </div>

      {/* Detalle */}
      <div style={{ padding: "24px" }}>
        <p
          style={{
            fontWeight: "700",
            fontSize: "11px",
            color: MUTED,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            margin: "0 0 12px",
          }}
        >
          Información del pago
        </p>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
          {[
            { label: "Cliente", value: customerName },
            { label: "Pedido #", value: orderNumber },
            ...(receiptNumber ? [{ label: "Recibo #", value: receiptNumber }] : []),
            { label: "Fecha", value: fmtDate(paidAt) },
            {
              label: "Método",
              value: `${meta.icon} ${meta.label}`,
              valueStyle: { color: meta.color, fontWeight: "700" as const },
            },
            ...(transactionId
              ? [{ label: "N° operación", value: transactionId }]
              : []),
            ...(sunatVoucher
              ? [{ label: "Comprobante SUNAT", value: sunatVoucher }]
              : []),
          ].map((row, idx) => (
            <tr
              key={idx}
              style={{
                borderBottom: `1px solid ${BORDER}`,
                background: idx % 2 === 0 ? "#ffffff" : BG_LIGHT,
              }}
            >
              <td
                style={{
                  padding: "11px 4px",
                  color: MUTED,
                  fontSize: "13px",
                  width: "45%",
                }}
              >
                {row.label}
              </td>
              <td
                style={{
                  padding: "11px 4px",
                  color: TEXT,
                  fontSize: "13px",
                  fontWeight: "600",
                  ...(row.valueStyle ?? {}),
                }}
              >
                {row.value}
              </td>
            </tr>
          ))}
        </table>
      </div>

      {/* CTA boleta PDF */}
      {voucherUrl && (
        <div style={{ padding: "0 24px 24px", textAlign: "center" }}>
          <a
            href={voucherUrl}
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
            Descargar comprobante PDF
          </a>
        </div>
      )}

      {/* Nota SUNAT */}
      {sunatVoucher && (
        <div
          style={{
            background: "#fffbeb",
            borderTop: `1px solid #fde68a`,
            padding: "14px 24px",
            textAlign: "center",
          }}
        >
          <p style={{ margin: 0, fontSize: "12px", color: "#92400e" }}>
            Este comprobante ({sunatVoucher}) fue emitido electrónicamente conforme a
            la normativa SUNAT.
          </p>
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
          Guarda este recibo para cualquier consulta futura.
        </p>
      </div>
    </div>
  );
}
