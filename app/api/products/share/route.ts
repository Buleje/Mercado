/**
 * GET /api/products/share?id=123
 *
 * Generates shareable links for a product — WhatsApp, copy link, social.
 * Used by the "Share" button on product detail pages.
 *
 * No auth required (public products).
 */

import { type NextRequest, NextResponse } from "next/server";
import { CatalogoPublicoDB } from "@/lib/db/catalogo-publico.db";
import { resolverNegocioPublico } from "@/lib/tienda-publica/negocio-publico";
import { urlDeImagen, urlDeProducto, origenDe } from "@/lib/tienda-publica/feed-productos";
import { logger } from "@/lib/logger";

// F7: TTL de tokens de share — 7 días en segundos
const SHARE_LINK_TTL_SECONDS = 7 * 24 * 60 * 60;

function buildShareExpiry(): { exp: number; expiresAt: string } {
  const exp = Math.floor(Date.now() / 1000) + SHARE_LINK_TTL_SECONDS;
  const expiresAt = new Date(exp * 1000).toISOString();
  return { exp, expiresAt };
}

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
    // El negocio de la página que pide el enlace (host o `/t/<slug>` de origen,
    // vía proxy). Antes: `x-tenant-id ?? "main"` crudo y enlace fijo a
    // www.buleje.pe con «Buleje» en el texto, para cualquier negocio.
    const r = await resolverNegocioPublico({
      tienda: null,
      tenantCrudo: req.headers.get("x-tenant-id"),
      origen: req.nextUrl.origin,
    });
    if (!r.ok) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }
    const { negocio } = r;

    const product = await CatalogoPublicoDB.producto(negocio.tenantId, productId);
    const productUrl = product ? urlDeProducto(negocio.base, product.nombre) : null;
    if (!product || !productUrl) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    const price = product.precio;
    const unidad = product.unidad || "und";

    const whatsappText = `Mira este producto en ${negocio.nombre}: ${product.nombre} a S/${price.toFixed(2)}/${unidad} 🛒\n${productUrl}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(whatsappText)}`;

    const twitterText = `${product.nombre} a S/${price.toFixed(2)} en ${negocio.nombre} 🛒`;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(twitterText)}&url=${encodeURIComponent(productUrl)}`;

    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(productUrl)}`;

    // F7: Incluir expiry en el payload del token
    const { exp, expiresAt } = buildShareExpiry();

    return NextResponse.json({
      product: {
        name: product.nombre,
        price,
        image: urlDeImagen(origenDe(negocio.base), product.imagen) ?? product.imagen,
        url: productUrl,
      },
      share: {
        whatsapp: whatsappUrl,
        twitter: twitterUrl,
        facebook: facebookUrl,
        copyLink: productUrl,
        text: whatsappText,
      },
      token: {
        exp,
        expiresAt,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[products/share] GET error", { err: message, productId });
    return NextResponse.json({ error: "No se pudo armar el enlace." }, { status: 500 });
  }
}
