import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { invalidate } from "@/lib/cache";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";

const BodySchema = z.object({
  prompt: z.string().min(2).max(200).optional(),
  force: z.boolean().optional(),
});

type RouteCtx = { params: Promise<{ id: string }> };

function buildUnsplashFallback(productName: string): string {
  const slug = productName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(",");
  const seed = encodeURIComponent(productName).slice(0, 32);
  return `https://source.unsplash.com/400x400/?${encodeURIComponent(slug || "product,grocery")}&sig=${seed}`;
}

async function tryXaiImage(prompt: string): Promise<string | null> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-2-image",
        prompt,
        n: 1,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      logger.warn("[generate-image] xAI failed", { status: res.status, err: errText.slice(0, 200) });
      return null;
    }
    const data = await res.json();
    const url = data?.data?.[0]?.url;
    return typeof url === "string" ? url : null;
  } catch (err) {
    logger.warn("[generate-image] xAI exception", { err: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const _rl = await applyRateLimit(req, "MODERATE", "products-X-generate-image"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const productId = Number(id);
  if (!Number.isFinite(productId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  let raw: unknown = {};
  try { raw = await req.json(); } catch { /* body opcional */ }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const product = await prisma.product.findFirst({
    where: { id: productId, tenantId: auth.tenantId },
    select: { id: true, name: true, category: true, image: true },
  });
  if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  if (product.image && !parsed.data.force) {
    return NextResponse.json({ url: product.image, source: "existing" });
  }

  const prompt =
    parsed.data.prompt ??
    `Producto de bodega: ${product.name} (${product.category}). Foto realista frontal sobre fondo blanco neutro, estilo catálogo e-commerce, iluminación de estudio.`;

  const xaiUrl = await tryXaiImage(prompt);
  const finalUrl = xaiUrl ?? buildUnsplashFallback(product.name);
  const source = xaiUrl ? "xai-grok" : "unsplash-fallback";

  await prisma.product.update({
    where: { id: productId },
    data: { image: finalUrl },
  });

  try { invalidate(`products:${auth.tenantId}`); } catch { /* noop */ }

  return NextResponse.json({ url: finalUrl, source });
}
