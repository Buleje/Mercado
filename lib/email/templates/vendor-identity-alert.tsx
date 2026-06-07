import React from "react";

/**
 * Template: alerta al vendor cuando RENIEC/SUNAT detecta degradación
 * de su identidad (RUC NO HABIDO, RUC no encontrado, DNI ya no existe).
 *
 * Usado como BACKUP cuando WhatsApp falla o el vendor no tiene phone
 * registrado, solo email.
 *
 * Audit ref: TD-058 capa 7 — fallback de comunicación al vendor.
 */

export type AlertKind = "ruc-changed" | "ruc-not-found" | "dni-not-found";

export interface VendorIdentityAlertProps {
  businessName: string;
  kind: AlertKind;
  /** Last 4 dígitos del RUC para citar */
  rucLast4?: string;
  /** URL al panel admin del tenant */
  adminUrl: string;
}

const PRIMARY = "#00A0A0";
const ERROR = "#dc2626";
const WARNING = "#f59e0b";
const TEXT = "#111827";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";
const BG = "#ffffff";

const TITLE_BY_KIND: Record<AlertKind, string> = {
  "ruc-changed": "Tu RUC pasó a estado no apto para facturar",
  "ruc-not-found": "Tu RUC no figura en SUNAT",
  "dni-not-found": "El DNI registrado ya no figura en RENIEC",
};

const BODY_BY_KIND: Record<AlertKind, string> = {
  "ruc-changed":
    "Tu RUC quedó en un estado que SUNAT considera no apto para facturar. Tus facturas dejarán de ser deducibles para tus clientes hasta que regularices tu situación tributaria.",
  "ruc-not-found":
    "El RUC que registraste no fue encontrado en el padrón de SUNAT. Esto puede deberse a un error de digitación o a que aún no completaste la inscripción.",
  "dni-not-found":
    "El DNI registrado como contacto principal ya no existe en RENIEC. Esto puede indicar un cambio de documento, registro incorrecto o un evento que afecta tu cuenta.",
};

const SEVERITY_COLOR: Record<AlertKind, string> = {
  "ruc-changed": ERROR,
  "ruc-not-found": ERROR,
  "dni-not-found": WARNING,
};

const baseStyle: React.CSSProperties = {
  fontFamily: "'Segoe UI', Arial, sans-serif",
  maxWidth: "600px",
  margin: "0 auto",
  backgroundColor: BG,
  border: `1px solid ${BORDER}`,
  borderRadius: "12px",
  overflow: "hidden",
};

export default function VendorIdentityAlertEmail({
  businessName,
  kind,
  rucLast4,
  adminUrl,
}: VendorIdentityAlertProps) {
  const accent = SEVERITY_COLOR[kind];
  return (
    <div style={baseStyle}>
      {/* Header */}
      <div
        style={{
          padding: "24px",
          backgroundColor: accent,
          color: "#ffffff",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "12px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            opacity: 0.85,
          }}
        >
          Alerta de identidad · Buleje
        </p>
        <h1
          style={{
            margin: "8px 0 0",
            fontSize: "22px",
            fontWeight: 800,
            lineHeight: 1.3,
          }}
        >
          {TITLE_BY_KIND[kind]}
        </h1>
      </div>

      {/* Body */}
      <div style={{ padding: "24px", color: TEXT }}>
        <p style={{ margin: "0 0 12px", fontSize: "15px", fontWeight: 600 }}>
          Hola {businessName},
        </p>
        <p style={{ margin: "0 0 16px", fontSize: "14px", lineHeight: 1.6, color: TEXT }}>
          {BODY_BY_KIND[kind]}
        </p>
        {rucLast4 && (
          <p
            style={{
              margin: "0 0 16px",
              fontSize: "13px",
              color: MUTED,
              fontFamily: "monospace",
            }}
          >
            Tu RUC: ***{rucLast4}
          </p>
        )}
        <p
          style={{
            margin: "0 0 20px",
            fontSize: "14px",
            lineHeight: 1.6,
            color: TEXT,
          }}
        >
          Revisa el detalle y los pasos para regularizar desde tu panel admin:
        </p>
        <a
          href={adminUrl}
          style={{
            display: "inline-block",
            padding: "12px 20px",
            backgroundColor: PRIMARY,
            color: "#ffffff",
            textDecoration: "none",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: 700,
          }}
        >
          Revisar identidad
        </a>

        {/* Why this matters */}
        <div
          style={{
            marginTop: "24px",
            padding: "16px",
            backgroundColor: "#fef3c7",
            border: `1px solid ${WARNING}`,
            borderRadius: "8px",
            fontSize: "13px",
            color: TEXT,
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: WARNING }}>¿Por qué te llega este correo?</strong>
          <br />
          Buleje verifica diariamente la identidad de los vendors del marketplace
          contra RENIEC y SUNAT (cumplimiento Ley 29733). Te avisamos por correo
          porque no pudimos contactarte por WhatsApp o porque ese canal no
          estaba habilitado.
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "16px 24px",
          backgroundColor: "#f9fafb",
          borderTop: `1px solid ${BORDER}`,
          fontSize: "12px",
          color: MUTED,
          textAlign: "center",
        }}
      >
        Buleje · Marketplace de bodegas y tiendas del Perú
        <br />
        Pucallpa, Ucayali
      </div>
    </div>
  );
}
