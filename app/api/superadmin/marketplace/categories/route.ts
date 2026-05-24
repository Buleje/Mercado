import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";

/**
 * GET/PATCH /api/superadmin/marketplace/categories
 *
 * Storage: `lib/data/marketplace-categories.json`. Modelo:
 *   {
 *     [categoryId]: {
 *       label, description, imageUrl, active (true=visible),
 *       subcategories: SubCategory[]
 *     }
 *   }
 *
 * SubCategory = { id, label, description, imageUrl, active, linkedStoreSlugs[] }
 */

const STORE_PATH = join(process.cwd(), "lib", "data", "marketplace-categories.json");

const DEFAULTS = {
  restaurante: { label: "Restaurantes", description: "Sabor de la casa" },
  bodega: { label: "Bodegas", description: "Lo de siempre, cerca" },
  fruteria: { label: "Mercado", description: "Frescos del día" },
  farmacia: { label: "Farmacias", description: "Tu botiquín" },
  ferreteria: { label: "Ferreterías", description: "Para reparar y construir" },
  polleria: { label: "Pollerías", description: "Brasa de barrio" },
  panaderia: { label: "Panaderías", description: "Recién horneado" },
  licoreria: { label: "Licorerías", description: "Para la reunión" },
  carniceria: { label: "Carnicerías", description: "Cortes frescos" },
  minimarket: { label: "Minimarkets", description: "Todo en un lugar" },
  tecnologia: { label: "Tecnología", description: "Gadgets & accesorios" },
} as const;

type SubCategoryRecord = {
  id: string;
  label: string;
  description: string;
  imageUrl: string | null;
  active: boolean;
  linkedStoreSlugs: string[];
};

type CategoryRecord = {
  label: string;
  description: string;
  imageUrl: string | null;
  active: boolean;
  /** Tiendas vinculadas a esta categoría PRINCIPAL (paso 1 del filtro de /tiendas). */
  linkedStoreSlugs: string[];
  subcategories: SubCategoryRecord[];
};

type StoreFile = {
  /** Override manual de zona por slug — fallback cuando store.zone está vacío. */
  storeZones: Record<string, string>;
  categories: Record<string, CategoryRecord>;
};

async function loadStore(): Promise<StoreFile> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const meta = (parsed["_meta"] ?? {}) as { storeZones?: Record<string, string> };
    const storeZones = (meta.storeZones && typeof meta.storeZones === "object") ? meta.storeZones : {};
    const categories: Record<string, CategoryRecord> = {};
    for (const [id, def] of Object.entries(DEFAULTS)) {
      const cur = (parsed[id] ?? {}) as Partial<CategoryRecord>;
      categories[id] = {
        label: cur.label ?? def.label,
        description: cur.description ?? def.description,
        imageUrl: cur.imageUrl ?? null,
        active: cur.active ?? true,
        linkedStoreSlugs: Array.isArray(cur.linkedStoreSlugs) ? cur.linkedStoreSlugs : [],
        subcategories: Array.isArray(cur.subcategories) ? (cur.subcategories as SubCategoryRecord[]) : [],
      };
    }
    return { storeZones, categories };
  } catch {
    const categories: Record<string, CategoryRecord> = {};
    for (const [id, v] of Object.entries(DEFAULTS)) {
      categories[id] = { ...v, imageUrl: null, active: true, linkedStoreSlugs: [], subcategories: [] };
    }
    return { storeZones: {}, categories };
  }
}

async function saveStore(file: StoreFile): Promise<void> {
  // Estructura de disco: claves de categoría a primer nivel + `_meta` opcional.
  const out: Record<string, unknown> = { _meta: { storeZones: file.storeZones } };
  for (const [id, cat] of Object.entries(file.categories)) out[id] = cat;
  await writeFile(STORE_PATH, JSON.stringify(out, null, 2), "utf8");
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const session = await getPlatformSession(token);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const file = await loadStore();
    const categories = Object.entries(DEFAULTS).map(([id, def]) => {
      const cur = file.categories[id];
      return {
        id,
        label: cur.label,
        description: cur.description,
        imageUrl: cur.imageUrl,
        active: cur.active,
        linkedStoreSlugs: cur.linkedStoreSlugs ?? [],
        subcategories: cur.subcategories.map((s) => ({
          id: s.id,
          label: s.label,
          description: s.description,
          imageUrl: s.imageUrl,
          active: s.active,
          linkedStoreSlugs: s.linkedStoreSlugs ?? [],
        })),
        defaultLabel: def.label,
        defaultDescription: def.description,
      };
    });
    return NextResponse.json({ categories, storeZones: file.storeZones });
  } catch (err) {
    logger.error("[superadmin/marketplace/categories GET]", { error: String(err) });
    return NextResponse.json(
      { error: "server_error", detail: String(err) },
      { status: 500 },
    );
  }
}

const SubCategorySchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(60),
  description: z.string().max(160).default(""),
  imageUrl: z
    .string()
    .max(500)
    .refine((v) => v === "" || /^(https?:\/\/|\/)/.test(v), {
      message: "imageUrl debe ser URL https:// o path /uploads/...",
    })
    .nullable()
    .optional(),
  active: z.boolean().default(true),
  linkedStoreSlugs: z.array(z.string().min(1).max(120)).default([]),
});

const PatchSchema = z.object({
  id: z.string().min(1),
  label: z.string().max(40).optional(),
  description: z.string().max(120).optional(),
  imageUrl: z
    .string()
    .max(500)
    .refine((v) => v === "" || /^(https?:\/\/|\/)/.test(v), {
      message: "imageUrl debe ser URL https:// o path /uploads/...",
    })
    .optional(),
  active: z.boolean().optional(),
  /** Vínculo a tiendas para la CATEGORÍA PRINCIPAL (paso 1 del filtro de /tiendas). */
  linkedStoreSlugs: z.array(z.string().min(1).max(120)).optional(),
  /** Override manual de zona por slug — fallback cuando store.zone está vacío. */
  storeZones: z.record(z.string().min(1), z.string().max(80)).optional(),
  subcategories: z.array(SubCategorySchema).optional(),
});

export async function PATCH(req: NextRequest) {
  const _rl = await applyRateLimit(req, "GENEROUS", "superadmin-marketplace-categories"); if (_rl) return _rl;
  if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const session = await getPlatformSession(token);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch((err) => {
    logger.warn("[superadmin/categories] body parse failed", { error: String(err) });
    return null;
  });
  if (!body) return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });
  }

  const known = (DEFAULTS as Record<string, { label: string; description: string }>)[parsed.data.id];
  if (!known) {
    return NextResponse.json({ error: "unknown_category" }, { status: 400 });
  }

  try {
    const file = await loadStore();
    const cur = file.categories[parsed.data.id];
    const next: CategoryRecord = {
      label: parsed.data.label ?? cur.label,
      description: parsed.data.description ?? cur.description,
      imageUrl: parsed.data.imageUrl === "" ? null : parsed.data.imageUrl ?? cur.imageUrl,
      active: parsed.data.active ?? cur.active,
      linkedStoreSlugs:
        parsed.data.linkedStoreSlugs !== undefined
          ? Array.from(new Set(parsed.data.linkedStoreSlugs))
          : cur.linkedStoreSlugs,
      subcategories:
        parsed.data.subcategories !== undefined
          ? parsed.data.subcategories.map((s) => ({
              id: s.id,
              label: s.label,
              description: s.description ?? "",
              imageUrl: s.imageUrl === "" ? null : s.imageUrl ?? null,
              active: s.active,
              linkedStoreSlugs: s.linkedStoreSlugs,
            }))
          : cur.subcategories,
    };
    file.categories[parsed.data.id] = next;
    if (parsed.data.storeZones) {
      // Merge: keys con valor vacío se eliminan del map.
      const mergedZones = { ...file.storeZones };
      for (const [slug, zone] of Object.entries(parsed.data.storeZones)) {
        const trimmed = (zone ?? "").trim();
        if (trimmed === "") delete mergedZones[slug];
        else mergedZones[slug] = trimmed;
      }
      file.storeZones = mergedZones;
    }
    await saveStore(file);
    return NextResponse.json({
      ok: true,
      id: parsed.data.id,
      value: next,
      storeZones: file.storeZones,
    });
  } catch (err) {
    logger.error("[superadmin/marketplace/categories PATCH]", { error: String(err) });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
