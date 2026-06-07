import React from "react";

// ──────────────────────────────────────────────
//  Template: Recordatorio de deuda de fiado
// ──────────────────────────────────────────────

export interface FiadoReminderProps {
  /** Nombre completo del cliente deudor */
  customerName: string;
  /** Nombre de la tienda */
  storeName: string;
  /** Monto total adeudado */
  amountOwed: number;
  /** Fecha límite de pago (ISO string o texto legible) */
  dueDate: string;
  /** Número de días de atraso (0 = aún no vence) */
  daysOverdue?: number;
  /** Detalle de compras del fiado (opcional) */
  purchases?: Array<{
    date: string;
    description: string;
    amount: number;
  }>;
  /** URL donde el cliente puede ver y pagar su deuda */
  payUrl?: string;
  /** Número de WhatsApp de la tienda para coordinar pago */
  whatsappNumber?: string;
}

const PRIMARY = "#00A0A0";
const SECONDARY = "#f97316";
const TEXT = "#111827";
const MUTED = "#6b7280";
const BG_LIGHT = "#f9fafb";
const BORDER = "#e5e7eb";
const DANGER = "#dc2626";
const WARNING = "#d97706";

function fmt(n: number) {
  return `S/ ${n.toFixed(2)}`;
}

function fmtDate(raw: string) {
  try {
    return new Date(raw).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return raw;
  }
}

export default function FiadoReminderEmail({
  customerName,
  storeName,
  amountOwed,
  dueDate,
  daysOverdue = 0,
  purchases,
  payUrl,
  whatsappNumber,
}: FiadoReminderProps) {
  const isOverdue = daysOverdue > 0;
  const urgencyColor = isOverdue ? DANGER : WARNING;
  const urgencyBg = isOverdue ? "#fef2f2" : "#fffbeb";
  const urgencyBorder = isOverdue ? "#fecaca" : "#fde68a";

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
          background: isOverdue
            ? `linear-gradient(135deg, ${DANGER} 0%, #b91c1c 100%)`
            : `linear-gradient(135deg, ${WARNING} 0%, #b45309 100%)`,
          padding: "28px 24px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "36px", marginBottom: "10px" }}>
          {isOverdue ? "⚠️" : "🔔"}
        </div>
        <h1
          style={{
            color: "#ffffff",
            margin: "0 0 6px",
            fontSize: "22px",
            fontWeight: "700",
          }}
        >
          {isOverdue ? "Fiado vencido" : "Recordatorio de fiado"}
        </h1>
        <p style={{ color: "rgba(255,255,255,0.85)", margin: 0, fontSize: "14px" }}>
          {storeName}
        </p>
      </div>

      {/* Saludo */}
      <div style={{ padding: "24px 24px 0" }}>
        <p style={{ color: TEXT, fontSize: "15px", margin: "0 0 6px", lineHeight: "1.6" }}>
          Hola, <strong>{customerName}</strong> 👋
        </p>
        <p
          style={{ color: MUTED, fontSize: "14px", margin: "0 0 20px", lineHeight: "1.7" }}
        >
          {isOverdue
            ? `Te escribimos desde ${storeName} porque tienes un fiado vencido hace ${daysOverdue} ${daysOverdue === 1 ? "día" : "días"}. Por favor regulariza tu cuenta.`
            : `Te escribimos desde ${storeName} para recordarte que tienes un fiado pendiente. La fecha límite se acerca.`}
        </p>
      </div>

      {/* Monto destacado */}
      <div
        style={{
          background: urgencyBg,
          border: `1px solid ${urgencyBorder}`,
          borderRadius: "10px",
          margin: "0 24px 20px",
          padding: "20px",
          textAlign: "center",
        }}
      >
        <p
          style={{
            margin: "0 0 4px",
            fontSize: "12px",
            fontWeight: "700",
            color: MUTED,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          Monto adeudado
        </p>
        <p
          style={{
            margin: "0 0 8px",
            fontSize: "40px",
            fontWeight: "800",
            color: urgencyColor,
            letterSpacing: "-1px",
          }}
        >
          {fmt(amountOwed)}
        </p>
        <p style={{ margin: 0, fontSize: "13px", color: urgencyColor, fontWeight: "600" }}>
          {isOverdue
            ? `Vencido el ${fmtDate(dueDate)} · ${daysOverdue} ${daysOverdue === 1 ? "día" : "días"} de atraso`
            : `Fecha límite: ${fmtDate(dueDate)}`}
        </p>
      </div>

      {/* Detalle de compras */}
      {purchases && purchases.length > 0 && (
        <div style={{ padding: "0 24px 20px" }}>
          <p
            style={{
              fontWeight: "700",
              fontSize: "11px",
              color: MUTED,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              margin: "0 0 10px",
            }}
          >
            Detalle de compras al fiado
          </p>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "13px",
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
                    padding: "9px 10px",
                    color: MUTED,
                    fontWeight: "600",
                    fontSize: "11px",
                    borderBottom: `1px solid ${BORDER}`,
                  }}
                >
                  Fecha
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "9px 10px",
                    color: MUTED,
                    fontWeight: "600",
                    fontSize: "11px",
                    borderBottom: `1px solid ${BORDER}`,
                  }}
                >
                  Descripción
                </th>
                <th
                  style={{
                    textAlign: "right",
                    padding: "9px 10px",
                    color: MUTED,
                    fontWeight: "600",
                    fontSize: "11px",
                    borderBottom: `1px solid ${BORDER}`,
                  }}
                >
                  Monto
                </th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p, idx) => (
                <tr
                  key={idx}
                  style={{
                    borderBottom: `1px solid ${BORDER}`,
                    background: idx % 2 === 0 ? "#ffffff" : BG_LIGHT,
                  }}
                >
                  <td style={{ padding: "9px 10px", color: MUTED, whiteSpace: "nowrap" }}>
                    {fmtDate(p.date)}
                  </td>
                  <td style={{ padding: "9px 10px", color: TEXT }}>
                    {p.description}
                  </td>
                  <td
                    style={{
                      padding: "9px 10px",
                      textAlign: "right",
                      fontWeight: "600",
                      color: TEXT,
                    }}
                  >
                    {fmt(p.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: urgencyBg }}>
                <td
                  colSpan={2}
                  style={{
                    padding: "10px",
                    fontWeight: "700",
                    color: TEXT,
                    fontSize: "14px",
                  }}
                >
                  Total
                </td>
                <td
                  style={{
                    padding: "10px",
                    textAlign: "right",
                    fontWeight: "800",
                    color: urgencyColor,
                    fontSize: "16px",
                  }}
                >
                  {fmt(amountOwed)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Opciones de pago */}
      <div style={{ padding: "0 24px 24px" }}>
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
          ¿Cómo pagar?
        </p>
        <div
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              flex: "1 1 160px",
              background: BG_LIGHT,
              border: `1px solid ${BORDER}`,
              borderRadius: "8px",
              padding: "14px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "24px", marginBottom: "6px" }}>🏪</div>
            <p style={{ margin: 0, fontSize: "13px", fontWeight: "600", color: TEXT }}>
              En la tienda
            </p>
            <p style={{ margin: "4px 0 0", fontSize: "12px", color: MUTED }}>
              Paga directo en {storeName}
            </p>
          </div>
          <div
            style={{
              flex: "1 1 160px",
              background: BG_LIGHT,
              border: `1px solid ${BORDER}`,
              borderRadius: "8px",
              padding: "14px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "24px", marginBottom: "6px" }}>📱</div>
            <p style={{ margin: 0, fontSize: "13px", fontWeight: "600", color: TEXT }}>
              Yape / Plin
            </p>
            <p style={{ margin: "4px 0 0", fontSize: "12px", color: MUTED }}>
              Transferencia digital
            </p>
          </div>
        </div>
      </div>

      {/* CTAs */}
      <div
        style={{
          padding: "0 24px 28px",
          display: "flex",
          gap: "12px",
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {payUrl && (
          <a
            href={payUrl}
            style={{
              display: "inline-block",
              background: PRIMARY,
              color: "#ffffff",
              padding: "12px 28px",
              borderRadius: "8px",
              textDecoration: "none",
              fontWeight: "700",
              fontSize: "14px",
            }}
          >
            Ver mi cuenta
          </a>
        )}
        {whatsappNumber && (
          <a
            href={`https://wa.me/${whatsappNumber.replace(/\D/g, "")}?text=${encodeURIComponent(`Hola, soy ${customerName}. Quisiera coordinar el pago de mi fiado de ${fmt(amountOwed)}.`)}`}
            style={{
              display: "inline-block",
              background: "#25d366",
              color: "#ffffff",
              padding: "12px 28px",
              borderRadius: "8px",
              textDecoration: "none",
              fontWeight: "700",
              fontSize: "14px",
            }}
          >
            Escribir por WhatsApp
          </a>
        )}
      </div>

      {/* Nota amable */}
      <div
        style={{
          background: "#f0fdf4",
          borderTop: `1px solid #bbf7d0`,
          padding: "14px 24px",
          textAlign: "center",
        }}
      >
        <p style={{ margin: 0, fontSize: "13px", color: "#166534" }}>
          Si ya realizaste el pago, ignora este mensaje. ¡Gracias por tu confianza!
        </p>
      </div>

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
          Pucallpa, Perú
        </p>
      </div>
    </div>
  );
}
