import React from "react";

// ──────────────────────────────────────────────
//  Template: Actualización de estado de delivery
// ──────────────────────────────────────────────

export type DeliveryStatus =
  | "recibido"
  | "preparando"
  | "en_camino"
  | "cerca"
  | "entregado"
  | "no_entregado";

export interface DeliveryUpdateProps {
  /** Nombre del cliente */
  customerName: string;
  /** Nombre de la tienda */
  storeName: string;
  /** Número de pedido */
  orderNumber: string;
  /** Estado actual del delivery */
  status: DeliveryStatus;
  /** Nombre del repartidor */
  deliveryPersonName?: string;
  /** Hora estimada de entrega (ej. "3:30 PM", "15 minutos") */
  estimatedTime?: string;
  /** Dirección de entrega */
  deliveryAddress?: string;
  /** URL para rastrear en tiempo real */
  trackingUrl?: string;
  /** Mensaje personalizado adicional */
  customMessage?: string;
}

const PRIMARY = "#00A0A0";
const TEXT = "#111827";
const MUTED = "#6b7280";
const BG_LIGHT = "#f9fafb";
const BORDER = "#e5e7eb";

interface StatusConfig {
  label: string;
  emoji: string;
  description: string;
  headerBg: string;
  badgeBg: string;
  badgeColor: string;
}

const STATUS_CONFIG: Record<DeliveryStatus, StatusConfig> = {
  recibido: {
    label: "Pedido recibido",
    emoji: "📋",
    description: "Recibimos tu pedido y lo estamos verificando.",
    headerBg: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
    badgeBg: "#ede9fe",
    badgeColor: "#4f46e5",
  },
  preparando: {
    label: "Preparando tu pedido",
    emoji: "👨‍🍳",
    description: "Estamos alistando todos tus productos con cuidado.",
    headerBg: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
    badgeBg: "#fff7ed",
    badgeColor: "#c2410c",
  },
  en_camino: {
    label: "En camino",
    emoji: "🛵",
    description: "Tu repartidor ya salió con tu pedido.",
    headerBg: `linear-gradient(135deg, ${PRIMARY} 0%, #0097a7 100%)`,
    badgeBg: "#ccfbf1",
    badgeColor: "#00A0A0",
  },
  cerca: {
    label: "¡Ya casi llega!",
    emoji: "📍",
    description: "Tu repartidor está a pocas cuadras de tu dirección.",
    headerBg: "linear-gradient(135deg, #16a34a 0%, #15803d 100%)",
    badgeBg: "#dcfce7",
    badgeColor: "#15803d",
  },
  entregado: {
    label: "Pedido entregado",
    emoji: "✅",
    description: "Tu pedido fue entregado exitosamente. ¡Que lo disfrutes!",
    headerBg: "linear-gradient(135deg, #16a34a 0%, #166534 100%)",
    badgeBg: "#dcfce7",
    badgeColor: "#166534",
  },
  no_entregado: {
    label: "No se pudo entregar",
    emoji: "❌",
    description:
      "No encontramos a nadie en la dirección. Por favor contáctanos para reprogramar.",
    headerBg: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)",
    badgeBg: "#fef2f2",
    badgeColor: "#b91c1c",
  },
};

// Pasos del timeline en orden
const TIMELINE_STEPS: DeliveryStatus[] = [
  "recibido",
  "preparando",
  "en_camino",
  "entregado",
];

function getStepIndex(status: DeliveryStatus): number {
  const idx = TIMELINE_STEPS.indexOf(status);
  if (status === "cerca") return 2; // mismo nivel que en_camino
  if (status === "no_entregado") return -1;
  return idx;
}

export default function DeliveryUpdateEmail({
  customerName,
  storeName,
  orderNumber,
  status,
  deliveryPersonName,
  estimatedTime,
  deliveryAddress,
  trackingUrl,
  customMessage,
}: DeliveryUpdateProps) {
  const config = STATUS_CONFIG[status];
  const currentStep = getStepIndex(status);

  const timelineLabels: Record<string, string> = {
    recibido: "Recibido",
    preparando: "Preparando",
    en_camino: "En camino",
    entregado: "Entregado",
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
          background: config.headerBg,
          padding: "28px 24px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "44px", marginBottom: "10px" }}>{config.emoji}</div>
        <h1
          style={{
            color: "#ffffff",
            margin: "0 0 6px",
            fontSize: "22px",
            fontWeight: "700",
          }}
        >
          {config.label}
        </h1>
        <p style={{ color: "rgba(255,255,255,0.85)", margin: 0, fontSize: "14px" }}>
          Pedido #{orderNumber} · {storeName}
        </p>
      </div>

      {/* Timeline (solo para estados normales, no no_entregado) */}
      {status !== "no_entregado" && (
        <div
          style={{
            padding: "24px 24px 0",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              position: "relative",
            }}
          >
            {TIMELINE_STEPS.map((step, idx) => {
              const isDone = idx <= currentStep;
              const isActive = idx === currentStep || (status === "cerca" && idx === 2);
              return (
                <React.Fragment key={step}>
                  {/* Línea conectora */}
                  {idx > 0 && (
                    <div
                      style={{
                        flex: 1,
                        height: "3px",
                        background: idx <= currentStep ? PRIMARY : "#e5e7eb",
                        margin: "0 4px",
                        marginBottom: "20px",
                      }}
                    />
                  )}
                  {/* Paso */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <div
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "50%",
                        background: isDone ? PRIMARY : "#e5e7eb",
                        border: isActive ? `3px solid ${PRIMARY}` : "3px solid transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: isDone ? "#fff" : "#9ca3af",
                        fontSize: "14px",
                        fontWeight: "700",
                        boxSizing: "border-box",
                      }}
                    >
                      {isDone ? "✓" : idx + 1}
                    </div>
                    <span
                      style={{
                        fontSize: "10px",
                        color: isDone ? PRIMARY : MUTED,
                        fontWeight: isDone ? "700" : "400",
                        textAlign: "center",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {timelineLabels[step]}
                    </span>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* Body */}
      <div style={{ padding: "24px" }}>
        <p style={{ color: TEXT, fontSize: "15px", margin: "0 0 6px", lineHeight: "1.6" }}>
          Hola, <strong>{customerName}</strong>
        </p>
        <p style={{ color: MUTED, fontSize: "14px", margin: "0 0 20px", lineHeight: "1.7" }}>
          {customMessage ?? config.description}
        </p>

        {/* Info cards */}
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          {/* Repartidor */}
          {deliveryPersonName && (
            <div
              style={{
                flex: "1 1 160px",
                background: BG_LIGHT,
                border: `1px solid ${BORDER}`,
                borderRadius: "8px",
                padding: "14px",
              }}
            >
              <p
                style={{
                  margin: "0 0 4px",
                  fontSize: "10px",
                  fontWeight: "700",
                  color: MUTED,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Repartidor
              </p>
              <p style={{ margin: 0, fontSize: "14px", fontWeight: "600", color: TEXT }}>
                🛵 {deliveryPersonName}
              </p>
            </div>
          )}

          {/* Hora estimada */}
          {estimatedTime && status !== "entregado" && status !== "no_entregado" && (
            <div
              style={{
                flex: "1 1 160px",
                background: config.badgeBg,
                border: `1px solid ${config.badgeColor}33`,
                borderRadius: "8px",
                padding: "14px",
              }}
            >
              <p
                style={{
                  margin: "0 0 4px",
                  fontSize: "10px",
                  fontWeight: "700",
                  color: MUTED,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Hora estimada
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: "14px",
                  fontWeight: "700",
                  color: config.badgeColor,
                }}
              >
                🕐 {estimatedTime}
              </p>
            </div>
          )}

          {/* Dirección */}
          {deliveryAddress && (
            <div
              style={{
                flex: "1 1 100%",
                background: BG_LIGHT,
                border: `1px solid ${BORDER}`,
                borderRadius: "8px",
                padding: "14px",
              }}
            >
              <p
                style={{
                  margin: "0 0 4px",
                  fontSize: "10px",
                  fontWeight: "700",
                  color: MUTED,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Dirección de entrega
              </p>
              <p style={{ margin: 0, fontSize: "13px", color: TEXT }}>
                📍 {deliveryAddress}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* CTA rastreo */}
      {trackingUrl && status !== "entregado" && status !== "no_entregado" && (
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
            Rastrear en tiempo real →
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
          ¿Problemas con tu entrega? Responde este correo.
        </p>
      </div>
    </div>
  );
}
