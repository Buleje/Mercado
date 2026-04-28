import { NextRequest, NextResponse } from "next/server";
import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const BANNERS_PATH = join(process.cwd(), "lib", "data", "promo-banners.json");

const SLOTS = [
  "explorar",
  "explorar-mid",
  "explorar-bottom",
  "bodegas",
  "recetas",
  "ofertas",
  "tiendas-hero",
  "bento",
] as const;

/**
 * Tipos de banner soportados:
 *   - "classic": texto + CTA hacia otra página (default, comportamiento legacy)
 *   - "image":   imagen pura (1600×400 4:1) — texto opcional, CTA opcional
 *   - "promo":   producto/combo embebido — el banner ES la promo, con su propio
 *                botón "Comprar" que dispara compra directa (link a producto/checkout)
 */
const BannerTypeSchema = z.enum(["classic", "image", "promo"]).default("classic");

/** Encuadre (drag/zoom/fit) — laxo para tolerar drags y zooms extremos del editor. */
const ImageAdjustSchema = z
  .object({
    position: z
      .object({
        x: z.number().finite().default(50),
        y: z.number().finite().default(50),
      })
      .passthrough()
      .optional(),
    scale: z.number().finite().default(100),
    fit: z.enum(["cover", "contain"]).default("cover"),
  })
  .partial()
  .passthrough()
  .optional();

/** Posición libre (% relativo al banner) de un overlay. Aceptamos cualquier
 *  número finito — el renderer hace clamp/clip visual, no es responsabilidad
 *  de Zod rechazar drags fuera de rango. */
const AnchorSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
  })
  .passthrough()
  .nullable()
  .optional();

/** Item de la grilla multi-producto. `.passthrough()` para no romper si el
 *  editor agrega campos nuevos antes de que el schema los conozca. */
const PromoItemSchema = z
  .object({
    id: z.string().min(1).max(200),
    source: z.enum(["manual", "linked"]).default("manual"),
    productName: z.string().max(200).default(""),
    productImage: z.string().max(2000).nullable().default(null),
    price: z.number().nonnegative().finite().nullable().default(null),
    oldPrice: z.number().nonnegative().finite().nullable().default(null),
    badge: z.string().max(80).default(""),
    buyHref: z.string().max(2000).default(""),
    buyLabel: z.string().max(80).default("Comprar"),
    linkedStoreSlug: z.string().max(200).nullable().optional(),
    linkedProductId: z.union([z.string(), z.number()]).nullable().optional(),
    imageAdjust: ImageAdjustSchema,
    productAnchor: AnchorSchema,
    buyAnchor: AnchorSchema,
    badgeAnchor: AnchorSchema,
    productSize: z.number().finite().optional(),
    buySize: z.number().finite().optional(),
  })
  .passthrough();

/** Datos de la promo embebida cuando type === "promo". */
const PromoEmbedSchema = z
  .object({
    productName: z.string().max(200).default(""),
    productImage: z.string().max(2000).nullable().default(null),
    price: z.number().nonnegative().finite().nullable().default(null),
    oldPrice: z.number().nonnegative().finite().nullable().default(null),
    badge: z.string().max(80).default(""),
    buyHref: z.string().max(2000).default(""),
    buyLabel: z.string().max(80).default("Comprar"),
    imageAdjust: ImageAdjustSchema,
    items: z.array(PromoItemSchema).max(50).optional(),
  })
  .passthrough()
  .optional();

const BannerSchema = z
  .object({
    id: z.string().min(1).max(200),
    title: z.string().max(200).default(""),
    subtitle: z.string().max(500).optional(),
    imageUrl: z
      .string()
      .nullable()
      .refine(
        (v) => v === null || v === "" || /^(https?:\/\/|\/|data:)/.test(v),
        { message: "imageUrl debe ser https://, /uploads/... o data:..." },
      ),
    ctaHref: z.string().max(2000).default(""),
    ctaLabel: z.string().max(80).default(""),
    bgFrom: z.string().regex(/^#[0-9a-f]{6}$/i),
    bgTo: z.string().regex(/^#[0-9a-f]{6}$/i),
    active: z.boolean(),
    order: z.number().int().min(0).max(999),
    type: BannerTypeSchema,
    imageAdjust: ImageAdjustSchema,
    promo: PromoEmbedSchema,
  })
  .passthrough();

const PutSchema = z.object({
  slot: z.enum(SLOTS),
  banners: z.array(BannerSchema).min(1).max(10),
});

/**
 * GET /api/superadmin/banners — lee todos los slots.
 * PUT /api/superadmin/banners — reemplaza un slot completo con array nuevo.
 *
 * Storage: lib/data/promo-banners.json (file system, MVP).
 * Cuando haya tabla Prisma, reemplazar el read/write file por DB.
 */
export async function GET() {
  try {
    const raw = await readFile(BANNERS_PATH, "utf8");
    return NextResponse.json(JSON.parse(raw));
  } catch (e) {
    console.error("[banners GET] error", e);
    return NextResponse.json({ error: "No se pudieron leer los banners" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({
      path: i.path.join("."),
      code: i.code,
      message: i.message,
    }));
    console.error("[banners PUT] zod issues", JSON.stringify(issues, null, 2));
    return NextResponse.json(
      { error: "Datos inválidos", issues },
      { status: 400 },
    );
  }

  try {
    const raw = await readFile(BANNERS_PATH, "utf8");
    const store = JSON.parse(raw) as Record<string, unknown>;
    store[parsed.data.slot] = parsed.data.banners;
    await writeFile(BANNERS_PATH, JSON.stringify(store, null, 2), "utf8");
    return NextResponse.json({ ok: true, slot: parsed.data.slot, count: parsed.data.banners.length });
  } catch (e) {
    console.error("[banners PUT] error", e);
    return NextResponse.json({ error: "No se pudieron guardar los banners" }, { status: 500 });
  }
}
