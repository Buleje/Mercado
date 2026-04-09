import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { logger } from "@/lib/logger";
import { newTraceId, toErrorPayload } from "@/lib/api-error";

export const dynamic = "force-dynamic";

const BASE_URL = "https://www.buleje.pe";
const STORE_NAME = "Buleje";

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function GET(_req: NextRequest) {
  const traceId = newTraceId();
  try {
    const db = prisma as unknown as PrismaClient;

    const products = await db.product.findMany({
      where: { active: true },
      select: { id: true, name: true, category: true, price: true, image: true, unit: true, badge: true, stock: true },
    });
    logger.info("[shopping-feed] generating feed", { traceId, productCount: products.length });

  const now = new Date().toUTCString();

  const items = products
    .map(p => {
      // FIX Q3: link debe apuntar a la página del producto, NO al home con anchor
      // (Google Merchant rechaza URLs con fragment #).
      const productUrl = `${BASE_URL}/tienda/${p.id}`;
      const imageUrl = p.image && p.image.startsWith("http")
        ? p.image
        : p.image
          ? `${BASE_URL}${p.image}`
          : `${BASE_URL}/placeholder.png`;
      const availability = p.stock === null || p.stock > 0 ? "in stock" : "out of stock";
      const condition = "new";
      const description = esc(`${p.name} · Categoría: ${p.category} · Medida: ${p.unit}`);
      // Google Merchant requiere al menos uno de: gtin, mpn, brand + identifier_exists.
      // Como no tenemos GTIN para la mayoría de productos locales, declaramos identifier_exists=no
      // y mantenemos brand como el nombre de la tienda (fallback aceptado).
      const identifierExists = "no";

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
      <g:identifier_exists>${identifierExists}</g:identifier_exists>
      <g:google_product_category>Food, Beverages &amp; Tobacco</g:google_product_category>
      <g:product_type>${esc(p.category)}</g:product_type>
      <g:shipping>
        <g:country>PE</g:country>
        <g:region>Ucayali</g:region>
        <g:service>Delivery local</g:service>
        <g:price>0.00 PEN</g:price>
      </g:shipping>${p.badge ? `\n      <g:custom_label_0>${esc(p.badge)}</g:custom_label_0>` : ""}
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
        "x-trace-id": traceId,
      },
    });
  } catch (err) {
    logger.error("[shopping-feed] error generating feed", {
      traceId,
      err: err instanceof Error ? err.message : String(err),
    });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
