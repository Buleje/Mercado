/**
 * GET /api/products/share?id=123
 *
 * Generates shareable links for a product — WhatsApp, copy link, social.
 * Used by the "Share" button on product detail pages.
 *
 * No auth required (public products).
 */

import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { slugify } from "@/data/products";

export async function GET(req: NextRequest) {
  const productIdStr = req.nextUrl.searchParams.get("id");
  if (!productIdStr) {
    return NextResponse.json({ error: "id requerido" }, { status: 400 });
  }

  const productId = parseInt(productIdStr, 10);
  if (isNaN(productId)) {
    return NextResponse.json({ error: "id invalido" }, { status: 400 });
  }

  try {
    const hdrs = await headers();
    const tenantId = hdrs.get("x-tenant-id") ?? "main";

    const product = await prisma.product.findFirst({
      where: { id: productId, tenantId, active: true },
      select: { name: true, price: true, image: true, unit: true },
    });

    if (!product) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.buleje.pe";
    const slug = slugify(product.name);
    const productUrl = `${baseUrl}/tienda/${slug}`;
    const price = Number(product.price);

    const whatsappText = `Mira este producto en Buleje: ${product.name} a S/${price.toFixed(2)}/${product.unit ?? "und"} 🛒\n${productUrl}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(whatsappText)}`;

    const twitterText = `${product.name} a S/${price.toFixed(2)} en @BulejePeru 🛒`;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(twitterText)}&url=${encodeURIComponent(productUrl)}`;

    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(productUrl)}`;

    return NextResponse.json({
      product: {
        name: product.name,
        price,
        image: product.image,
        url: productUrl,
      },
      share: {
        whatsapp: whatsappUrl,
        twitter: twitterUrl,
        facebook: facebookUrl,
        copyLink: productUrl,
        text: whatsappText,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
