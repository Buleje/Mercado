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
import { type NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  // SECURITY 2026-05-06 (audit storefront H07): rate limit + truncate.
  // Antes atacante mandaba ?title=AAA*5000 en loop → spike CPU de sharp +
  // cobro Vercel functions. Cap a 80/160 chars y RL STRICT.
  const rl = applyRateLimit(req, "STRICT", "og");
  if (rl) return rl;

  const rawTitle = req.nextUrl.searchParams.get("title") ?? "Buleje";
  const rawSubtitle =
    req.nextUrl.searchParams.get("subtitle") ??
    "Software ERP para Bodegas y Tiendas del Peru";
  const title = rawTitle.slice(0, 80);
  const subtitle = rawSubtitle.slice(0, 160);
  void NextResponse; // keep import alive across edits

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
            background: "linear-gradient(90deg, var(--accent), #10b981, #ff6b5b)",
          }}
        />

        {/* Logo circle */}
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 20,
            background: "linear-gradient(145deg, var(--accent), var(--accent-dark))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 24,
            boxShadow: "0 8px 32px color-mix(in oklab, var(--accent) 30%, transparent)",
          }}
        >
          <span
            style={{
              fontSize: 48,
              fontWeight: 900,
              color: "#ff6b5b",
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
      // Audit SEO 2026-05-31: cache explícito. La imagen OG cambia poquísimo
      // (solo si cambia title/subtitle), así que los scrapers de WhatsApp /
      // Facebook / Twitter y el CDN de Vercel deben cachearla en vez de
      // re-renderizarla en cada preview (era `no-store` → preview lento).
      // immutable + s-maxage largo; stale-while-revalidate para refrescos suaves.
      headers: {
        "Cache-Control":
          "public, immutable, no-transform, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
      },
    },
  );
}
