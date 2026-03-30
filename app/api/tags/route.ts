export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";

// ── Tags se persisten en Settings.featureFlagsJson bajo la clave "custom_tags" ──
// featureFlagsJson es un campo JSON libre por tenant, ideal para extensiones sin migración.

type TagColor = "teal" | "blue" | "violet" | "amber" | "rose" | "emerald" | "orange" | "gray";
type Entity = "product" | "customer" | "order";

interface TagRecord {
  name: string;
  color: TagColor;
  entity: Entity;
  count: number;
}

// ── Helpers de persistencia ───────────────────────────────────────────────────

async function readFeatureFlags(tenantId: string): Promise<Record<string, unknown>> {
  const setting = await prisma.settings.findFirst({ where: { tenantId } });
  if (!setting?.featureFlagsJson) return {};
  try { return JSON.parse(setting.featureFlagsJson) as Record<string, unknown>; } catch { return {}; }
}

async function writeFeatureFlags(tenantId: string, flags: Record<string, unknown>): Promise<void> {
  await prisma.settings.upsert({
    where: { tenantId },
    create: { tenantId, featureFlagsJson: JSON.stringify(flags) },
    update: { featureFlagsJson: JSON.stringify(flags) },
  });
}

async function loadTags(tenantId: string): Promise<TagRecord[]> {
  const flags = await readFeatureFlags(tenantId);
  const raw = flags["custom_tags"];
  if (!Array.isArray(raw)) return [];
  return raw as TagRecord[];
}

async function saveTags(tenantId: string, tags: TagRecord[]): Promise<void> {
  const flags = await readFeatureFlags(tenantId);
  flags["custom_tags"] = tags;
  await writeFeatureFlags(tenantId, flags);
}

// ── GET /api/tags?entity=product|customer|order ──────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero", "analista", "manager"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const entity = req.nextUrl.searchParams.get("entity") as Entity | null;
    const tags = await loadTags(auth.tenantId);
    const filtered = entity ? tags.filter((t) => t.entity === entity) : tags;
    return NextResponse.json(filtered);
  } catch (e) {
    logger.error("[tags] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error al cargar etiquetas" }, { status: 503 });
  }
}

// ── POST /api/tags ────────────────────────────────────────────────────────────

const PostSchema = z.object({
  name:   z.string().min(1).max(30).trim(),
  color:  z.enum(["teal", "blue", "violet", "amber", "rose", "emerald", "orange", "gray"]),
  entity: z.enum(["product", "customer", "order"]),
});

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const parsed = PostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
    }
    const { name, color, entity } = parsed.data;

    const tags = await loadTags(auth.tenantId);
    if (tags.some((t) => t.name.toLowerCase() === name.toLowerCase() && t.entity === entity)) {
      return NextResponse.json({ error: "Ya existe una etiqueta con ese nombre" }, { status: 409 });
    }

    const newTag: TagRecord = { name, color, entity, count: 0 };
    tags.push(newTag);
    await saveTags(auth.tenantId, tags);

    return NextResponse.json({ ok: true, tag: newTag }, { status: 201 });
  } catch (e) {
    logger.error("[tags] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error al crear etiqueta" }, { status: 503 });
  }
}

// ── DELETE /api/tags?name=...&entity=... ─────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const name   = req.nextUrl.searchParams.get("name");
    const entity = req.nextUrl.searchParams.get("entity") as Entity | null;

    if (!name || !entity) {
      return NextResponse.json({ error: "Faltan parámetros name y entity" }, { status: 400 });
    }

    const tags = await loadTags(auth.tenantId);
    const updated = tags.filter(
      (t) => !(t.name.toLowerCase() === name.toLowerCase() && t.entity === entity)
    );

    if (updated.length === tags.length) {
      return NextResponse.json({ error: "Etiqueta no encontrada" }, { status: 404 });
    }

    await saveTags(auth.tenantId, updated);
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[tags] DELETE error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error al eliminar etiqueta" }, { status: 503 });
  }
}
