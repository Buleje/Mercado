/**
 * @prisma-direct ok — Acceso a tablas DesignSystemConfig y DesignPresetCustom
 * vía $queryRaw/$executeRaw porque están fuera del schema Prisma (fase expand).
 *
 * GET    /api/superadmin/design-system             → lista presets oficiales + savedPresets + activo global
 * GET    /api/superadmin/design-system?tenantId=…  → consultar override de un tenant
 * PUT    /api/superadmin/design-system             → cambiar el activo global (slug | customTokens)
 * POST   /api/superadmin/design-system             → varios modos:
 *           {mode:"save-preset", tokens}           → persistir en savedPresetsJson
 *           {mode:"delete-saved-preset", slug}     → eliminar de savedPresetsJson
 *           {mode:"tenant-override", tenantId, presetSlug?, tokensJson?}
 * DELETE /api/superadmin/design-system?tenantId=…  → quitar override per-tenant
 *
 * Solo superadmin role. CSRF aplicado por el proxy.ts a PUT/POST/DELETE.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  DESIGN_PRESETS,
  DEFAULT_PRESET_SLUG,
  getPresetBySlug,
  validateTokens,
  type DesignTokens,
} from "@/lib/design-presets";
import { applyRateLimit } from "@/lib/rate-limit";

async function requirePlatformSession(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return await getPlatformSession(token);
}

// ─── Bootstrap idempotente ────────────────────────────────────────────────────
// Evita necesitar `prisma migrate` para que el módulo arranque en cualquier env.
let _bootstrapped = false;
async function ensureDesignTables() {
  if (_bootstrapped) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DesignSystemConfig" (
        "id"               text PRIMARY KEY,
        "activePresetSlug" text,
        "customTokensJson" jsonb,
        "savedPresetsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "updatedAt"        timestamptz NOT NULL DEFAULT NOW(),
        "updatedBy"        text
      );
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "DesignSystemConfig"
        ADD COLUMN IF NOT EXISTS "customTokensJson" jsonb;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "DesignSystemConfig"
        ADD COLUMN IF NOT EXISTS "savedPresetsJson" jsonb NOT NULL DEFAULT '[]'::jsonb;
    `);
    // Tagged template parametriza ${DEFAULT_PRESET_SLUG} (aunque hoy es
    // constante de código, evita el patrón frágil que un contributor futuro
    // podría confundir con valor user-input).
    await prisma.$executeRaw`
      INSERT INTO "DesignSystemConfig" ("id", "activePresetSlug")
      VALUES ('singleton', ${DEFAULT_PRESET_SLUG})
      ON CONFLICT ("id") DO NOTHING
    `;
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DesignPresetCustom" (
        "tenantId"   text PRIMARY KEY,
        "presetSlug" text,
        "tokensJson" jsonb,
        "updatedAt"  timestamptz NOT NULL DEFAULT NOW()
      );
    `);
    _bootstrapped = true;
  } catch (err) {
    logger.warn("[design-system] bootstrap tables failed", { error: String(err) });
  }
}

interface ConfigRow {
  activePresetSlug: string | null;
  customTokensJson: unknown;
  savedPresetsJson: unknown;
  updatedAt: Date;
  updatedBy: string | null;
}

async function getActiveConfig(): Promise<ConfigRow | null> {
  try {
    const rows = await prisma.$queryRaw<ConfigRow[]>`
      SELECT "activePresetSlug", "customTokensJson", "savedPresetsJson", "updatedAt", "updatedBy"
      FROM "DesignSystemConfig"
      WHERE id = 'singleton'
      LIMIT 1
    `;
    return rows[0] ?? null;
  } catch (err) {
    logger.error("[design-system] getActiveConfig failed", { error: String(err) });
    return null;
  }
}

function parseSavedPresets(raw: unknown): DesignTokens[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (p): p is DesignTokens =>
      !!p && typeof p === "object" && validateTokens(p).length === 0,
  );
}

// ── GET: presets oficiales + saved presets + activo + overrides per-tenant ───

export async function GET(req: NextRequest) {
  const session = await requirePlatformSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDesignTables();

  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId");

  const config = await getActiveConfig();
  const activeSlug = config?.activePresetSlug ?? DEFAULT_PRESET_SLUG;
  const customTokens = (config?.customTokensJson ?? null) as DesignTokens | null;
  const savedPresets = parseSavedPresets(config?.savedPresetsJson);

  // Si piden override de un tenant específico
  if (tenantId) {
    try {
      const rows = await prisma.$queryRaw<
        Array<{ presetSlug: string | null; tokensJson: unknown; updatedAt: Date }>
      >`
        SELECT "presetSlug", "tokensJson", "updatedAt"
        FROM "DesignPresetCustom"
        WHERE "tenantId" = ${tenantId}
        LIMIT 1
      `;
      return NextResponse.json({
        tenantId,
        override: rows[0] ?? null,
        active: { slug: activeSlug, customTokens },
      });
    } catch (err) {
      logger.error("[design-system] tenant override lookup failed", { error: String(err) });
      return NextResponse.json({
        tenantId,
        override: null,
        active: { slug: activeSlug, customTokens },
      });
    }
  }

  return NextResponse.json({
    presets: DESIGN_PRESETS,
    savedPresets,
    active: {
      slug: activeSlug,
      customTokens,
      updatedAt: config?.updatedAt?.toISOString() ?? null,
      updatedBy: config?.updatedBy ?? null,
    },
  });
}

// ── PUT: cambiar el preset activo GLOBAL (slug | customTokens) ───────────────

const ActivateSchema = z.union([
  z.object({ slug: z.string().min(1).max(60) }),
  z.object({ customTokens: z.unknown() }),
]);

export async function PUT(req: NextRequest) {
  const _rl = await applyRateLimit(req, "GENEROUS", "superadmin-design-system"); if (_rl) return _rl;
  const session = await requirePlatformSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureDesignTables();

  const body = await req.json().catch(() => ({}));
  const parsed = ActivateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // Modo customTokens — guarda el JSON completo como override global
  if ("customTokens" in parsed.data) {
    const errors = validateTokens(parsed.data.customTokens);
    if (errors.length > 0) {
      return NextResponse.json({ error: "Tokens inválidos", details: errors }, { status: 400 });
    }
    const tokens = parsed.data.customTokens as DesignTokens;
    try {
      await prisma.$executeRaw`
        UPDATE "DesignSystemConfig"
        SET "activePresetSlug" = ${tokens.meta.slug},
            "customTokensJson" = ${JSON.stringify(tokens)}::jsonb,
            "updatedAt"        = NOW(),
            "updatedBy"        = ${session.username ?? "superadmin"}
        WHERE id = 'singleton'
      `;
      logger.info("[design-system] custom tokens activated", {
        slug: tokens.meta.slug,
        by: session.username,
      });
      return NextResponse.json({
        ok: true,
        active: tokens.meta.slug,
        mode: "custom",
      });
    } catch (err) {
      logger.error("[design-system] activate custom failed", { error: String(err) });
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }
  }

  // Modo slug — preset oficial o saved
  const { slug } = parsed.data;
  const config = await getActiveConfig();
  const savedPresets = parseSavedPresets(config?.savedPresetsJson);
  const preset =
    getPresetBySlug(slug) ?? savedPresets.find((p) => p.meta.slug === slug);

  if (!preset) {
    return NextResponse.json(
      {
        error: `Preset '${slug}' no existe.`,
        validSlugs: [
          ...DESIGN_PRESETS.map((p) => p.meta.slug),
          ...savedPresets.map((p) => p.meta.slug),
        ],
      },
      { status: 404 },
    );
  }

  try {
    // Si el slug es de un saved preset, también guardamos sus tokens en customTokensJson
    // para que resuelva sin lookup extra. Si es oficial, customTokensJson queda en NULL.
    const isOficial = !!getPresetBySlug(slug);
    if (isOficial) {
      await prisma.$executeRaw`
        UPDATE "DesignSystemConfig"
        SET "activePresetSlug" = ${slug},
            "customTokensJson" = NULL,
            "updatedAt"        = NOW(),
            "updatedBy"        = ${session.username ?? "superadmin"}
        WHERE id = 'singleton'
      `;
    } else {
      await prisma.$executeRaw`
        UPDATE "DesignSystemConfig"
        SET "activePresetSlug" = ${slug},
            "customTokensJson" = ${JSON.stringify(preset)}::jsonb,
            "updatedAt"        = NOW(),
            "updatedBy"        = ${session.username ?? "superadmin"}
        WHERE id = 'singleton'
      `;
    }
    logger.info("[design-system] active preset changed", {
      slug,
      by: session.username,
      kind: isOficial ? "oficial" : "custom-saved",
    });
    return NextResponse.json({ ok: true, active: slug, mode: "slug" });
  } catch (err) {
    logger.error("[design-system] activate failed", { error: String(err) });
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

// ── POST: save-preset / delete-saved-preset / tenant-override ────────────────

const PostSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("save-preset"),
    tokens: z.unknown(),
  }),
  z.object({
    mode: z.literal("delete-saved-preset"),
    slug: z.string().min(1).max(60),
  }),
  z.object({
    mode: z.literal("tenant-override"),
    tenantId: z.string().min(1).max(100),
    presetSlug: z.string().min(1).max(60).optional(),
    tokensJson: z.unknown().optional(),
  }),
]);

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "GENEROUS", "superadmin-design-system"); if (_rl) return _rl;
  const session = await requirePlatformSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureDesignTables();

  const body = await req.json().catch(() => ({}));
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // ── save-preset ───────────────────────────────────────────────────────────
  if (parsed.data.mode === "save-preset") {
    const errors = validateTokens(parsed.data.tokens);
    if (errors.length > 0) {
      return NextResponse.json({ error: "Tokens inválidos", details: errors }, { status: 400 });
    }
    const tokens = parsed.data.tokens as DesignTokens;
    if (getPresetBySlug(tokens.meta.slug)) {
      return NextResponse.json(
        { error: `Slug '${tokens.meta.slug}' colisiona con un preset oficial. Cambiá el nombre.` },
        { status: 409 },
      );
    }
    try {
      const config = await getActiveConfig();
      const saved = parseSavedPresets(config?.savedPresetsJson);
      const idx = saved.findIndex((p) => p.meta.slug === tokens.meta.slug);
      if (idx >= 0) saved[idx] = tokens;
      else saved.push(tokens);

      await prisma.$executeRaw`
        UPDATE "DesignSystemConfig"
        SET "savedPresetsJson" = ${JSON.stringify(saved)}::jsonb,
            "updatedAt"        = NOW(),
            "updatedBy"        = ${session.username ?? "superadmin"}
        WHERE id = 'singleton'
      `;
      logger.info("[design-system] saved preset", { slug: tokens.meta.slug });
      return NextResponse.json({ ok: true, savedPresets: saved });
    } catch (err) {
      logger.error("[design-system] save-preset failed", { error: String(err) });
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }
  }

  // ── delete-saved-preset ───────────────────────────────────────────────────
  if (parsed.data.mode === "delete-saved-preset") {
    const slug = parsed.data.slug;
    if (getPresetBySlug(slug)) {
      return NextResponse.json(
        { error: "No se pueden eliminar presets oficiales." },
        { status: 400 },
      );
    }
    try {
      const config = await getActiveConfig();
      const saved = parseSavedPresets(config?.savedPresetsJson).filter(
        (p) => p.meta.slug !== slug,
      );
      await prisma.$executeRaw`
        UPDATE "DesignSystemConfig"
        SET "savedPresetsJson" = ${JSON.stringify(saved)}::jsonb,
            "updatedAt"        = NOW(),
            "updatedBy"        = ${session.username ?? "superadmin"}
        WHERE id = 'singleton'
      `;
      // Si el activo coincide con el eliminado, vuelve a default
      if (config?.activePresetSlug === slug) {
        await prisma.$executeRaw`
          UPDATE "DesignSystemConfig"
          SET "activePresetSlug" = ${DEFAULT_PRESET_SLUG},
              "customTokensJson" = NULL,
              "updatedAt"        = NOW()
          WHERE id = 'singleton'
        `;
      }
      logger.info("[design-system] deleted saved preset", { slug });
      return NextResponse.json({ ok: true, savedPresets: saved });
    } catch (err) {
      logger.error("[design-system] delete-saved failed", { error: String(err) });
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }
  }

  // ── tenant-override ───────────────────────────────────────────────────────
  const { tenantId, presetSlug, tokensJson } = parsed.data;
  if (presetSlug && !getPresetBySlug(presetSlug)) {
    // Permitir slug de saved preset también
    const config = await getActiveConfig();
    const saved = parseSavedPresets(config?.savedPresetsJson);
    if (!saved.find((p) => p.meta.slug === presetSlug)) {
      return NextResponse.json(
        { error: `Preset '${presetSlug}' no existe` },
        { status: 404 },
      );
    }
  }

  try {
    const tokensStr = tokensJson !== undefined ? JSON.stringify(tokensJson) : null;
    await prisma.$executeRaw`
      INSERT INTO "DesignPresetCustom" ("tenantId", "presetSlug", "tokensJson", "updatedAt")
      VALUES (${tenantId}, ${presetSlug ?? null}, ${tokensStr}::jsonb, NOW())
      ON CONFLICT ("tenantId") DO UPDATE
      SET "presetSlug" = EXCLUDED."presetSlug",
          "tokensJson" = EXCLUDED."tokensJson",
          "updatedAt"  = NOW()
    `;
    logger.info("[design-system] tenant override saved", { tenantId, presetSlug });
    return NextResponse.json({ ok: true, tenantId, presetSlug });
  } catch (err) {
    logger.error("[design-system] tenant-override failed", { error: String(err) });
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

// ── DELETE: remover override per-tenant (vuelve a heredar global) ────────────

export async function DELETE(req: NextRequest) {
  const _rl = await applyRateLimit(req, "GENEROUS", "superadmin-design-system"); if (_rl) return _rl;
  const session = await requirePlatformSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureDesignTables();

  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId");
  if (!tenantId) {
    return NextResponse.json({ error: "tenantId requerido" }, { status: 400 });
  }

  try {
    await prisma.$executeRaw`DELETE FROM "DesignPresetCustom" WHERE "tenantId" = ${tenantId}`;
    return NextResponse.json({ ok: true, tenantId });
  } catch (err) {
    logger.error("[design-system] delete override failed", { error: String(err) });
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}
