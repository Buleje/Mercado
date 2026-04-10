import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Buleje — Sistema ERP para bodegas y minimarkets en Perú";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0a0f0d 0%, #121f17 50%, #0a0f0d 100%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "32px",
          }}
        >
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "16px",
              background: "#00B4A6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "32px",
              fontWeight: 800,
              color: "white",
            }}
          >
            B
          </div>
          <span
            style={{
              fontSize: "48px",
              fontWeight: 800,
              color: "#00B4A6",
              letterSpacing: "-1px",
            }}
          >
            Buleje
          </span>
        </div>

        {/* Título */}
        <h1
          style={{
            fontSize: "40px",
            fontWeight: 700,
            color: "white",
            textAlign: "center",
            margin: "0 80px 16px",
            lineHeight: 1.2,
          }}
        >
          Tu bodega, en línea
        </h1>

        {/* Subtítulo */}
        <p
          style={{
            fontSize: "22px",
            color: "#94a3b8",
            textAlign: "center",
            margin: "0 100px 40px",
            lineHeight: 1.4,
          }}
        >
          Sistema completo de gestión para bodegas y minimarkets en Perú.
          POS, inventario, delivery, WhatsApp y 100+ módulos.
        </p>

        {/* CTA */}
        <div
          style={{
            display: "flex",
            gap: "16px",
            alignItems: "center",
          }}
        >
          <div
            style={{
              background: "#00B4A6",
              color: "white",
              padding: "14px 32px",
              borderRadius: "12px",
              fontSize: "20px",
              fontWeight: 700,
            }}
          >
            Empieza gratis
          </div>
          <span style={{ color: "#64748b", fontSize: "18px" }}>
            Desde S/0/mes
          </span>
        </div>

        {/* Footer */}
        <p
          style={{
            position: "absolute",
            bottom: "24px",
            fontSize: "14px",
            color: "#475569",
          }}
        >
          buleje.pe — Pucallpa, Perú
        </p>
      </div>
    ),
    { ...size },
  );
}
