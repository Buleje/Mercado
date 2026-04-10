/**
 * GET /api/og?title=...&subtitle=...
 *
 * Dynamic OpenGraph image generator for social sharing.
 * When someone shares a Buleje link on WhatsApp, Facebook, or Twitter,
 * this generates a branded 1200x630 image.
 *
 * Query params:
 *   ?title=Buleje ERP           (main text)
 *   ?subtitle=Software para...  (secondary text)
 *
 * Also serves as the static /og-image.jpg fallback.
 */

import { ImageResponse } from "next/og";
import { type NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const title = req.nextUrl.searchParams.get("title") ?? "Buleje";
  const subtitle =
    req.nextUrl.searchParams.get("subtitle") ??
    "Software ERP para Bodegas y Tiendas del Peru";

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
          fontFamily: "Arial, sans-serif",
        }}
      >
        {/* Top accent bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 6,
            background: "linear-gradient(90deg, #00B4A6, #10b981, #f97316)",
          }}
        />

        {/* Logo circle */}
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 20,
            background: "linear-gradient(145deg, #00B4A6, #009690)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 24,
            boxShadow: "0 8px 32px rgba(0,180,166,0.3)",
          }}
        >
          <span
            style={{
              fontSize: 48,
              fontWeight: 900,
              color: "#f97316",
              fontFamily: "Arial Black, Arial, sans-serif",
            }}
          >
            B
          </span>
        </div>

        {/* Title */}
        <h1
          style={{
            fontSize: 56,
            fontWeight: 900,
            color: "#ffffff",
            margin: 0,
            textAlign: "center",
            lineHeight: 1.1,
            maxWidth: 900,
          }}
        >
          {title}
        </h1>

        {/* Subtitle */}
        <p
          style={{
            fontSize: 24,
            color: "rgba(255,255,255,0.7)",
            margin: "16px 0 0 0",
            textAlign: "center",
            maxWidth: 700,
          }}
        >
          {subtitle}
        </p>

        {/* Feature chips */}
        <div
          style={{
            display: "flex",
            gap: 12,
            marginTop: 32,
          }}
        >
          {["Inventario", "POS", "Delivery", "SUNAT", "Fiado Digital"].map(
            (feature) => (
              <div
                key={feature}
                style={{
                  padding: "8px 16px",
                  borderRadius: 50,
                  background: "rgba(255,255,255,0.1)",
                  color: "rgba(255,255,255,0.8)",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                {feature}
              </div>
            ),
          )}
        </div>

        {/* Bottom URL */}
        <p
          style={{
            position: "absolute",
            bottom: 24,
            fontSize: 16,
            color: "rgba(255,255,255,0.4)",
            fontWeight: 500,
          }}
        >
          buleje.pe
        </p>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
