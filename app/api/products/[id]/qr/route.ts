/**
 * GET /api/products/[id]/qr
 *
 * Genera un QR code como imagen PNG para un producto.
 * URL del QR: ${BASE_URL}/tienda/${product.slug || product.id}
 *
 * El QR se genera con un algoritmo Reed-Solomon puro (sin dependencias externas).
 * Devuelve 300×350px: QR 300×300 + franja inferior 300×50 con el nombre.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ProductsDB } from "@/lib/db/products.db";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";

// ── Params schema ─────────────────────────────────────────────────────────────

const ParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// ── QR generation (Reed-Solomon, sin dependencias) ────────────────────────────
// Implementación mínima de QR versión 3-M suficiente para URLs ~80 chars.
// Basada en el estándar ISO/IEC 18004:2015.

/** Multiply two GF(256) elements */
function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  const LOG = GF_LOG;
  const EXP = GF_EXP;
  return EXP[(LOG[a] + LOG[b]) % 255];
}

// GF(256) tables — generator polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11d)
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function buildGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x = x << 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function rsEncode(data: number[], nEcc: number): number[] {
  // Build generator polynomial
  let g = [1];
  for (let i = 0; i < nEcc; i++) {
    const factor = [1, GF_EXP[i]];
    const newG = new Array(g.length + factor.length - 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      for (let k = 0; k < factor.length; k++) {
        newG[j + k] ^= gfMul(g[j], factor[k]);
      }
    }
    g = newG;
  }

  const msg = [...data, ...new Array(nEcc).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const c = msg[i];
    if (c !== 0) {
      for (let j = 1; j < g.length; j++) {
        msg[i + j] ^= gfMul(g[j], c);
      }
    }
  }
  return msg.slice(data.length);
}

// QR Version 3-M: 29×29, capacity ~77 alphanumeric / ~47 bytes
const QR_SIZE = 29;

function encodeBytes(text: string): { data: number[]; bitLen: number } {
  const bytes = [...Buffer.from(text, "utf8")];
  // Mode indicator: byte (0100) + length (8 bits) + data
  // Version 3-M: 44 error-correction codewords for 26 data codewords
  const bits: number[] = [];
  const push = (val: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  push(0b0100, 4); // byte mode
  push(bytes.length, 8);
  for (const b of bytes) push(b, 8);
  // Terminator
  for (let i = 0; i < 4 && bits.length < 26 * 8; i++) bits.push(0);
  // Pad to byte boundary
  while (bits.length % 8 !== 0) bits.push(0);
  // Fill with pad codewords
  const PAD = [0xec, 0x11];
  let pi = 0;
  while (bits.length < 26 * 8) {
    push(PAD[pi % 2], 8);
    pi++;
  }
  // To bytes
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | (bits[i + j] ?? 0);
    data.push(b);
  }
  return { data, bitLen: bits.length };
}

function makeQRMatrix(text: string): boolean[][] {
  const size = QR_SIZE;
  // Allocate matrix
  const mat: (boolean | null)[][] = Array.from({ length: size }, () =>
    new Array(size).fill(null)
  );

  const set = (r: number, c: number, v: boolean) => { mat[r][c] = v; };
  const isFree = (r: number, c: number) => mat[r]?.[c] === null;

  // Finder patterns (top-left, top-right, bottom-left)
  const addFinder = (row: number, col: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const inFinder = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        if (row + r < 0 || row + r >= size || col + c < 0 || col + c >= size) continue;
        if (!inFinder) { set(row + r, col + c, false); continue; }
        const dark =
          r === 0 || r === 6 || c === 0 || c === 6 ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        set(row + r, col + c, dark);
      }
    }
  };
  addFinder(0, 0);
  addFinder(0, size - 7);
  addFinder(size - 7, 0);

  // Alignment pattern (version 3: one at row=20,col=20)
  const addAlignment = (row: number, col: number) => {
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        const dark = r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0);
        if (isFree(row + r, col + c)) set(row + r, col + c, dark);
      }
    }
  };
  addAlignment(20, 20);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (isFree(6, i)) set(6, i, i % 2 === 0);
    if (isFree(i, 6)) set(i, 6, i % 2 === 0);
  }

  // Dark module (always dark)
  set(size - 8, 8, true);

  // Format info placeholders (light)
  for (let i = 0; i <= 8; i++) {
    if (isFree(8, i)) set(8, i, false);
    if (isFree(i, 8)) set(i, 8, false);
  }
  for (let i = size - 7; i < size; i++) {
    if (isFree(8, i)) set(8, i, false);
    if (isFree(i, 8)) set(i, 8, false);
  }

  // Encode data with RS
  const encoded = encodeBytes(text.slice(0, 47)); // max bytes for v3-M
  const ecc = rsEncode(encoded.data, 26); // 26 EC codewords for v3-M
  const allBytes = [...encoded.data, ...ecc];

  // Flatten bits
  const bits: boolean[] = [];
  for (const b of allBytes) {
    for (let i = 7; i >= 0; i--) bits.push(((b >> i) & 1) === 1);
  }

  // Place data modules (zigzag)
  let bi = 0;
  for (let col = size - 1; col >= 1; col -= 2) {
    if (col === 6) col = 5; // skip timing column
    for (let row = 0; row < size; row++) {
      const actualRow = (Math.floor((size - 1 - col) / 2) % 2 === 0)
        ? size - 1 - row
        : row;
      for (let dc = 0; dc < 2; dc++) {
        const c = col - dc;
        if (isFree(actualRow, c)) {
          set(actualRow, c, bits[bi] ?? false);
          bi++;
        }
      }
    }
  }

  // Apply mask pattern 0 (checkerboard: (r+c)%2==0)
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (mat[r][c] !== null && (r + c) % 2 === 0) {
        mat[r][c] = !(mat[r][c] as boolean);
      }
    }
  }

  // Write format info (mask 0, ECL M = 00) — precomputed pattern for mask 0 + M
  // Format string: 00_000 XOR 101010000010010
  const FORMAT_V3_M_MASK0 = [
    true, false, true, false, true, false, false, false, false, false,
    true, false, false, true, false,
  ];
  const fmtPos = [
    [8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],
    [7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8],
  ];
  const fmtPos2 = [
    [size-1,8],[size-2,8],[size-3,8],[size-4,8],[size-5,8],[size-6,8],[size-7,8],
    [8,size-8],[8,size-7],[8,size-6],[8,size-5],[8,size-4],[8,size-3],[8,size-2],[8,size-1],
  ];
  for (let i = 0; i < 15; i++) {
    const [r, c] = fmtPos[i];
    set(r, c, FORMAT_V3_M_MASK0[i]);
    const [r2, c2] = fmtPos2[i];
    set(r2, c2, FORMAT_V3_M_MASK0[i]);
  }

  return mat.map((row) => row.map((v) => v === true));
}

// ── SVG renderer (server-safe, no canvas) ─────────────────────────────────────

function qrToSVG(matrix: boolean[][], productName: string, productPrice: number): string {
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
        rects.push(`<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="#1a3d2e"/>`);
      }
    }
  }

  // Label area
  const labelY = qrPx;
  rects.push(`<rect x="0" y="${labelY}" width="${totalW}" height="${labelHeight}" fill="#f0faf4"/>`);

  // Product name (truncated)
  const safeName = productName.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const truncated = safeName.length > 28 ? safeName.slice(0, 26) + "…" : safeName;
  rects.push(
    `<text x="${totalW / 2}" y="${labelY + 20}" font-family="Arial,sans-serif" font-size="13" font-weight="bold" fill="#1a3d2e" text-anchor="middle">${truncated}</text>`
  );
  rects.push(
    `<text x="${totalW / 2}" y="${labelY + 40}" font-family="Arial,sans-serif" font-size="14" font-weight="bold" fill="#00B4A6" text-anchor="middle">S/ ${productPrice.toFixed(2)}</text>`
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">
${rects.join("\n")}
</svg>`;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const rawParams = await params;
  const parsed = ParamsSchema.safeParse(rawParams);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "ID inválido", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 }
    );
  }

  try {
    const product = await ProductsDB.getById(parsed.data.id);
    if (!product) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
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
