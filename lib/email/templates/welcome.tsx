import React from "react";

// ──────────────────────────────────────────────
//  Template: Bienvenida al nuevo tenant
//  Usado al registrar una bodega nueva en Buleje
// ──────────────────────────────────────────────

export interface WelcomeProps {
  /** Nombre completo de la tienda */
  storeName: string;
  /** Nombre del dueño */
  ownerName: string;
  /** Slug del tenant — usado para construir URL del dashboard */
  slug: string;
  /** Plan contratado (ej. "Starter", "Pro", "Enterprise") */
  plan?: string;
  /** URL base de la plataforma (default: https://buleje.pe) */
  baseUrl?: string;
}

const PRIMARY = "#00A0A0";
const SECONDARY = "#f97316";
const TEXT = "#111827";
const MUTED = "#6b7280";
const BG_LIGHT = "#f9fafb";
const BORDER = "#e5e7eb";

const baseStyle: React.CSSProperties = {
  fontFamily: "'Segoe UI', Arial, sans-serif",
  maxWidth: "600px",
  margin: "0 auto",
  backgroundColor: "#ffffff",
  border: `1px solid ${BORDER}`,
  borderRadius: "12px",
  overflow: "hidden",
};

export default function WelcomeEmail({
  storeName,
  ownerName,
  slug,
  plan = "Starter",
  baseUrl = "https://buleje.pe",
}: WelcomeProps) {
  const dashboardUrl = `${baseUrl}/${slug}/admin`;
  const productsUrl = `${baseUrl}/${slug}/admin/products`;
  const settingsUrl = `${baseUrl}/${slug}/admin/settings`;

  const steps: { num: string; title: string; desc: string; url: string }[] = [
    {
      num: "1",
      title: "Agrega tus productos",
      desc: "Carga tu catálogo con precios, fotos y stock.",
      url: productsUrl,
    },
    {
      num: "2",
      title: "Configura tu tienda",
      desc: "Horario, dirección, métodos de pago y colores.",
      url: settingsUrl,
    },
    {
      num: "3",
      title: "Comparte tu link",
      desc: `Tu tienda ya está en línea: ${baseUrl}/${slug}`,
      url: `${baseUrl}/${slug}`,
    },
  ];

  return (
    <div style={baseStyle}>
      {/* Header */}
      <div
        style={{
          background: `linear-gradient(135deg, ${PRIMARY} 0%, #0097a7 100%)`,
          padding: "36px 24px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "inline-block",
            background: "rgba(255,255,255,0.15)",
            borderRadius: "50%",
            width: "64px",
            height: "64px",
            lineHeight: "64px",
            fontSize: "28px",
            marginBottom: "16px",
          }}
        >
          🏪
        </div>
        <h1
          style={{
            color: "#ffffff",
            margin: "0 0 8px",
            fontSize: "24px",
            fontWeight: "700",
            letterSpacing: "-0.3px",
          }}
        >
          ¡Bienvenido a Buleje!
        </h1>
        <p style={{ color: "rgba(255,255,255,0.85)", margin: 0, fontSize: "15px" }}>
          Tu bodega <strong>{storeName}</strong> está lista para vender
        </p>
      </div>

      {/* Body */}
      <div style={{ padding: "32px 24px" }}>
        <p
          style={{ color: TEXT, fontSize: "16px", margin: "0 0 8px", lineHeight: "1.6" }}
        >
          Hola, <strong>{ownerName}</strong> 👋
        </p>
        <p
          style={{ color: MUTED, fontSize: "14px", margin: "0 0 28px", lineHeight: "1.7" }}
        >
          Tu cuenta en el plan <strong style={{ color: PRIMARY }}>{plan}</strong> fue
          activada correctamente. Sigue estos tres pasos para empezar a recibir pedidos:
        </p>

        {/* Pasos */}
        {steps.map((step) => (
          <div
            key={step.num}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "14px",
              marginBottom: "20px",
              padding: "16px",
              background: BG_LIGHT,
              borderRadius: "10px",
              border: `1px solid ${BORDER}`,
            }}
          >
            <div
              style={{
                minWidth: "36px",
                height: "36px",
                borderRadius: "50%",
                background: PRIMARY,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: "700",
                fontSize: "16px",
                lineHeight: "36px",
                textAlign: "center",
              }}
            >
              {step.num}
            </div>
            <div style={{ flex: 1 }}>
              <p
                style={{
                  margin: "0 0 4px",
                  fontWeight: "700",
                  fontSize: "14px",
                  color: TEXT,
                }}
              >
                {step.title}
              </p>
              <p style={{ margin: "0 0 6px", fontSize: "13px", color: MUTED }}>
                {step.desc}
              </p>
              <a
                href={step.url}
                style={{
                  fontSize: "12px",
                  color: PRIMARY,
                  textDecoration: "none",
                  fontWeight: "600",
                }}
              >
                Ir ahora →
              </a>
            </div>
          </div>
        ))}

        {/* CTA principal */}
        <div style={{ textAlign: "center", margin: "32px 0 8px" }}>
          <a
            href={dashboardUrl}
            style={{
              display: "inline-block",
              background: PRIMARY,
              color: "#ffffff",
              padding: "14px 40px",
              borderRadius: "8px",
              textDecoration: "none",
              fontWeight: "700",
              fontSize: "16px",
              letterSpacing: "0.3px",
            }}
          >
            Ir a mi Panel →
          </a>
        </div>
        <p style={{ textAlign: "center", fontSize: "12px", color: MUTED, margin: "12px 0 0" }}>
          O copia este enlace:{" "}
          <a href={dashboardUrl} style={{ color: PRIMARY }}>
            {dashboardUrl}
          </a>
        </p>
      </div>

      {/* Info plan */}
      <div
        style={{
          background: "#fffbeb",
          borderTop: `1px solid #fde68a`,
          padding: "16px 24px",
          textAlign: "center",
        }}
      >
        <p style={{ margin: 0, fontSize: "13px", color: "#92400e" }}>
          Plan <strong>{plan}</strong> · ¿Necesitas más funciones?{" "}
          <a href={`${baseUrl}/precios`} style={{ color: SECONDARY, fontWeight: "600" }}>
            Ver planes
          </a>
        </p>
      </div>

      {/* Footer */}
      <div
        style={{
          background: BG_LIGHT,
          padding: "20px 24px",
          textAlign: "center",
          borderTop: `1px solid ${BORDER}`,
        }}
      >
        <p style={{ margin: "0 0 4px", fontSize: "12px", color: MUTED }}>
          Buleje — Plataforma SaaS para bodegas y tiendas
        </p>
        <p style={{ margin: 0, fontSize: "11px", color: "#9ca3af" }}>
          Pucallpa, Perú · soporte@buleje.pe
        </p>
      </div>
    </div>
  );
}
