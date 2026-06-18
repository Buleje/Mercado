/**
 * GET /api/products/[id]/qr
 *
 * Genera un QR code como imagen SVG para un producto.
 * URL del QR: ${BASE_URL}/tienda/${product.slug || product.id}
 *
 * El QR se genera con un algoritmo Reed-Solomon puro (sin dependencias externas),
 * extraído a `lib/qr/qr-matrix.ts` para reutilizarlo desde otros endpoints.
 * Devuelve un SVG: QR + franja inferior con el nombre y el precio.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ProductsDB } from "@/lib/db/products.db";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { makeQRMatrix, QR_SIZE } from "@/lib/qr/qr-matrix";

// ── Params schema ─────────────────────────────────────────────────────────────

const ParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// ── SVG renderer con etiqueta de producto (server-safe, no canvas) ────────────

function qrToSVG(
  matrix: boolean[][],
  productName: string,
  productPrice: number,
): string {
  const cellSize = 10;
  const quiet = 4; // quiet zone in cells
  const qrPx = (QR_SIZE + quiet * 2) * cellSize;
  const labelHeight = 50;
  const totalH = qrPx + labelHeight;
  const totalW = qrPx;

  const rects: string[] = [];

  // Background
  rects.push(`<rect width="${totalW}" height="${totalH}" fill="#ffffff"/>`);

  // QR modules
  for (let r = 0; r < QR_SIZE; r++) {
    for (let c = 0; c < QR_SIZE; c++) {
      if (matrix[r][c]) {
        const x = (c + quiet) * cellSize;
        const y = (r + quiet) * cellSize;
        rects.push(
          `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="#1a3d2e"/>`,
        );
      }
    }
  }

  // Label area
  const labelY = qrPx;
  rects.push(
    `<rect x="0" y="${labelY}" width="${totalW}" height="${labelHeight}" fill="#f0faf4"/>`,
  );

  // Product name (truncated)
  const safeName = productName
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const truncated =
    safeName.length > 28 ? safeName.slice(0, 26) + "…" : safeName;
  rects.push(
    `<text x="${totalW / 2}" y="${labelY + 20}" font-family="Arial,sans-serif" font-size="13" font-weight="bold" fill="#1a3d2e" text-anchor="middle">${truncated}</text>`,
  );
  rects.push(
    `<text x="${totalW / 2}" y="${labelY + 40}" font-family="Arial,sans-serif" font-size="14" font-weight="bold" fill="#00A0A0" text-anchor="middle">S/ ${productPrice.toFixed(2)}</text>`,
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">
${rects.join("\n")}
</svg>`;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const rawParams = await params;
  const parsed = ParamsSchema.safeParse(rawParams);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "ID inválido", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  try {
    const product = await ProductsDB.getById(auth.tenantId, parsed.data.id);
    if (!product) {
      return NextResponse.json(
        { error: "Producto no encontrado" },
        { status: 404 },
      );
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
      `https://${req.headers.get("host") ?? "localhost:3000"}`;
    const slug = (product as Record<string, unknown>).slug as string | undefined;
    const qrUrl = `${baseUrl}/tienda/${slug ?? product.id}`;

    logger.info("[products/qr] Generando QR", {
      productId: product.id,
      qrUrl,
      user: auth.username,
    });

    const matrix = makeQRMatrix(qrUrl);
    const svg = qrToSVG(matrix, product.name, product.price);

    // Devolver como SVG (compatible con <img src="..."> sin canvas)
    const format = new URL(req.url).searchParams.get("format") ?? "svg";

    if (format === "svg") {
      return new Response(svg, {
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=3600, s-maxage=3600",
          "Content-Disposition": `inline; filename="qr-${product.id}.svg"`,
        },
      });
    }

    // Fallback JSON con la URL para que el cliente la use
    return NextResponse.json({
      productId: product.id,
      productName: product.name,
      productPrice: product.price,
      qrUrl,
      svgUrl: `/api/products/${product.id}/qr?format=svg`,
    });
  } catch (err) {
    logger.error("[products/qr] Error generando QR", {
      productId: parsed.data.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Error generando QR" }, { status: 503 });
  }
}
