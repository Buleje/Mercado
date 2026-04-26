import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { logger } from "@/lib/logger";

/**
 * GET/PATCH /api/superadmin/marketplace/categories
 *
 * Gestiona imágenes y textos de las categorías principales del marketplace.
 * Storage: `lib/data/marketplace-categories.json` (mismo patrón que
 * promo-banners). Cuando exista tabla Prisma, reemplazar.
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

type CategoryRecord = {
  label: string;
  description: string;
  imageUrl: string | null;
  active: boolean;
};

async function loadStore(): Promise<Record<string, CategoryRecord>> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    const init: Record<string, CategoryRecord> = {};
    for (const [id, v] of Object.entries(DEFAULTS)) {
      init[id] = { ...v, imageUrl: null, active: true };
    }
    return init;
  }
}

async function saveStore(data: Record<string, CategoryRecord>): Promise<void> {
  await writeFile(STORE_PATH, JSON.stringify(data, null, 2), "utf8");
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const session = await getPlatformSession(token);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const store = await loadStore();
    const categories = Object.entries(DEFAULTS).map(([id, def]) => {
      const cur = store[id] ?? { label: def.label, description: def.description, imageUrl: null, active: true };
      return {
        id,
        label: cur.label ?? def.label,
        description: cur.description ?? def.description,
        imageUrl: cur.imageUrl ?? null,
        active: cur.active ?? true,
        defaultLabel: def.label,
        defaultDescription: def.description,
      };
    });
    return NextResponse.json({ categories });
  } catch (err) {
    logger.error("[superadmin/marketplace/categories GET]", { error: String(err) });
    return NextResponse.json(
      { error: "server_error", detail: String(err) },
      { status: 500 },
    );
  }
}

const PatchSchema = z.object({
  id: z.string().min(1),
  label: z.string().max(40).optional(),
  description: z.string().max(120).optional(),
  // Acepta tanto URL absoluta (https://...) como path relativo (/uploads/...)
  // emitido por el fallback local del endpoint /api/superadmin/upload.
  imageUrl: z
    .string()
    .max(500)
    .refine((v) => v === "" || /^(https?:\/\/|\/)/.test(v), {
      message: "imageUrl debe ser URL https:// o path /uploads/...",
    })
    .optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
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
    const store = await loadStore();
    const cur = store[parsed.data.id] ?? {
      label: known.label,
      description: known.description,
      imageUrl: null,
      active: true,
    };
    const next: CategoryRecord = {
      label: parsed.data.label ?? cur.label,
      description: parsed.data.description ?? cur.description,
      imageUrl: parsed.data.imageUrl === "" ? null : parsed.data.imageUrl ?? cur.imageUrl,
      active: parsed.data.active ?? cur.active,
    };
    store[parsed.data.id] = next;
    await saveStore(store);
    return NextResponse.json({ ok: true, id: parsed.data.id, value: next });
  } catch (err) {
    logger.error("[superadmin/marketplace/categories PATCH]", { error: String(err) });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
