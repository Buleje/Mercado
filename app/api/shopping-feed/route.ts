import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@/lib/generated/prisma/client";

const BASE_URL = "https://www.bodegasanmartin.pe";
const STORE_NAME = "Bodega San Martín";

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function GET(req: NextRequest) {
  const db = prisma as unknown as PrismaClient;

  const products = await db.product.findMany({
    where: { active: true },
    select: { id: true, name: true, category: true, price: true, image: true, unit: true, badge: true, stock: true },
  });

  const now = new Date().toUTCString();

  const items = products
    .map(p => {
      const productUrl = `${BASE_URL}/#productos`;
      const imageUrl = p.image && p.image.startsWith("http")
        ? p.image
        : p.image
          ? `${BASE_URL}${p.image}`
          : `${BASE_URL}/placeholder.png`;
      const availability = p.stock === null || p.stock > 0 ? "in stock" : "out of stock";
      const condition = "new";
      const description = esc(`${p.name} · Categoría: ${p.category} · Medida: ${p.unit}`);

      return `
    <item>
      <g:id>${p.id}</g:id>
      <g:title>${esc(p.name)}</g:title>
      <g:description>${description}</g:description>
      <g:link>${esc(productUrl)}</g:link>
      <g:image_link>${esc(imageUrl)}</g:image_link>
      <g:condition>${condition}</g:condition>
      <g:availability>${availability}</g:availability>
      <g:price>${p.price.toFixed(2)} PEN</g:price>
      <g:brand>${esc(STORE_NAME)}</g:brand>
      <g:google_product_category>Food, Beverages &amp; Tobacco</g:google_product_category>
      <g:product_type>${esc(p.category)}</g:product_type>${p.badge ? `\n      <g:custom_label_0>${esc(p.badge)}</g:custom_label_0>` : ""}
    </item>`.trim();
    })
    .join("\n  ");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${esc(STORE_NAME)}</title>
    <link>${BASE_URL}</link>
    <description>Catálogo de productos – ${esc(STORE_NAME)}</description>
    <lastBuildDate>${now}</lastBuildDate>
  ${items}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
