/**
 * GET /api/og/negocios
 *
 * OpenGraph image dedicada para la landing B2B /negocios (1200x630).
 * Cuando alguien comparte buleje.pe/negocios en WhatsApp, Facebook o X,
 * se muestra esta imagen con la propuesta de valor real (0% comisión,
 * setup 5 min, Yape, SUNAT) en vez del OG genérico.
 *
 * IMPORTANTE: next/og usa Satori, que NO resuelve CSS variables
 * (var(--accent)). Todos los colores van en hex literal de la marca:
 *   teal primary #00B4A6 · teal bright #00D4C8 · navy #0f172a.
 */

import { ImageResponse } from "next/og";
import { type NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";

const TEAL = "#00B4A6";
const TEAL_BRIGHT = "#00D4C8";
const NAVY = "#0f172a";

export async function GET(req: NextRequest) {
  const rl = applyRateLimit(req, "STRICT", "og-negocios");
  if (rl) return rl;
  void NextResponse; // keep import alive across edits

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          flexDirection: "column",
          padding: "64px 72px",
          background: `linear-gradient(135deg, ${NAVY} 0%, #134e4a 60%, ${NAVY} 100%)`,
          fontFamily: "Arial, sans-serif",
          position: "relative",
        }}
      >
        {/* Top accent bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 8,
            background: `linear-gradient(90deg, ${TEAL}, ${TEAL_BRIGHT}, #f97316)`,
          }}
        />

        {/* Glow decorativo */}
        <div
          style={{
            position: "absolute",
            top: -120,
            right: -120,
            width: 480,
            height: 480,
            borderRadius: 480,
            background: "rgba(0,212,200,0.16)",
          }}
        />

        {/* Header: logo + kicker */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background: `linear-gradient(145deg, ${TEAL}, ${TEAL_BRIGHT})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 28px rgba(0,180,166,0.45)",
            }}
          >
            <span
              style={{
                fontSize: 44,
                fontWeight: 900,
                color: "#ffffff",
                fontFamily: "Arial Black, Arial, sans-serif",
              }}
            >
              B
            </span>
          </div>
          <span
            style={{
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: 4,
              textTransform: "uppercase",
              color: TEAL_BRIGHT,
            }}
          >
            Para tu negocio · Pucallpa
          </span>
        </div>

        {/* Headline */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 40,
          }}
        >
          <span
            style={{
              fontSize: 66,
              fontWeight: 900,
              color: "#ffffff",
              lineHeight: 1.05,
              maxWidth: 980,
            }}
          >
            Software para tu bodega o tienda
          </span>
          <span
            style={{
              fontSize: 30,
              fontWeight: 500,
              color: "rgba(255,255,255,0.72)",
              marginTop: 18,
              maxWidth: 880,
            }}
          >
            Tu tienda online en 5 minutos. Cobrás con Yape, vendés con delivery
            y emitís boletas SUNAT.
          </span>
        </div>

        {/* 0% comisión highlight + chips */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 28,
            marginTop: "auto",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 88, fontWeight: 900, color: TEAL_BRIGHT, lineHeight: 1 }}>
              0%
            </span>
            <span style={{ fontSize: 26, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>
              comisión por venta
            </span>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, maxWidth: 520 }}>
            {["Setup 5 min", "Yape · Plin", "SUNAT", "Delivery", "Fiado digital"].map(
              (chip) => (
                <div
                  key={chip}
                  style={{
                    display: "flex",
                    padding: "10px 18px",
                    borderRadius: 50,
                    background: "rgba(255,255,255,0.10)",
                    border: "1px solid rgba(0,212,200,0.35)",
                    color: "#ffffff",
                    fontSize: 20,
                    fontWeight: 700,
                  }}
                >
                  {chip}
                </div>
              ),
            )}
          </div>
        </div>

        {/* Bottom URL */}
        <span
          style={{
            marginTop: 28,
            fontSize: 20,
            fontWeight: 700,
            color: "rgba(255,255,255,0.5)",
          }}
        >
          buleje.pe/negocios
        </span>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
