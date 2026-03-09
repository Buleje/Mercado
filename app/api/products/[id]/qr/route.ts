import { NextResponse, type NextRequest } from "next/server";
import { ProductsDB } from "@/lib/jsondb";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await ProductsDB.getById(Number(id));
  if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  // Generate QR as SVG using a simple approach
  const url = `${req.nextUrl.origin}/#producto-${id}`;
  const qrSvg = generateQRSvg(url, product.name);

  return new NextResponse(qrSvg, {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" },
  });
}

function generateQRSvg(data: string, label: string): string {
  // Use a simple QR-like placeholder with the URL encoded
  // For real QR, we encode the data as a data matrix pattern
  const encoded = encodeURIComponent(data);
  const size = 200;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size + 30}" width="${size}" height="${size + 30}">
  <rect width="${size}" height="${size + 30}" fill="white"/>
  <rect x="10" y="10" width="180" height="180" rx="8" fill="white" stroke="#2d6a4f" stroke-width="2"/>
  <image href="https://api.qrserver.com/v1/create-qr-code/?size=170x170&amp;data=${encoded}" x="15" y="15" width="170" height="170"/>
  <text x="${size / 2}" y="${size + 20}" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#333">${escapeXml(label.slice(0, 30))}</text>
</svg>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
