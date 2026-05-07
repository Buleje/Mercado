/**
 * GET /api/design-system/active?tenantId=...
 *
 * Endpoint público (cacheado 60s) que devuelve los DesignTokens efectivos
 * para un tenant. Resuelve la herencia:
 *   1. Si el tenant tiene `DesignPresetCustom.tokensJson` → usa esos.
 *   2. Si el tenant tiene `DesignPresetCustom.presetSlug` → usa ese preset
 *      (oficial o saved).
 *   3. Si la config global tiene `customTokensJson` → usa esos.
 *   4. Si la config global tiene `activePresetSlug` que matchea oficial o
 *      saved → usa ese.
 *   5. Caso contrario → DEFAULT_PRESET_SLUG.
 *
 * El admin shell (DesignTokensProvider) consulta este endpoint en el
 * primer mount y cachea localmente para inyectar como CSS variables.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  DEFAULT_PRESET_SLUG,
  getPresetBySlug,
  validateTokens,
  type DesignTokens,
} from "@/lib/design-presets";

interface ConfigRow {
  activePresetSlug: string | null;
  customTokensJson: unknown;
  savedPresetsJson: unknown;
}

function parseSavedPresets(raw: unknown): DesignTokens[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (p): p is DesignTokens =>
      !!p && typeof p === "object" && validateTokens(p).length === 0,
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId");

  // Resolver config global (slug + customTokens + savedPresets)
  let config: ConfigRow | null = null;
  try {
    const rows = await prisma.$queryRaw<ConfigRow[]>`
      SELECT "activePresetSlug", "customTokensJson", "savedPresetsJson"
      FROM "DesignSystemConfig" WHERE id = 'singleton' LIMIT 1
    `;
    config = rows[0] ?? null;
  } catch (err) {
    logger.warn("[design-system/active] global lookup failed", { error: String(err) });
  }

  const activeGlobalSlug = config?.activePresetSlug ?? DEFAULT_PRESET_SLUG;
  const globalCustomTokens =
    config?.customTokensJson && validateTokens(config.customTokensJson).length === 0
      ? (config.customTokensJson as DesignTokens)
      : null;
  const savedPresets = parseSavedPresets(config?.savedPresetsJson);

  // Resolver override per-tenant si vino tenantId
  let resolvedTokens: DesignTokens | null = null;
  let source:
    | "tenant-custom"
    | "tenant-preset"
    | "global-custom"
    | "global-saved"
    | "global-oficial"
    | "default" = "default";

  if (tenantId) {
    try {
      const rows = await prisma.$queryRaw<
        Array<{ presetSlug: string | null; tokensJson: unknown }>
      >`
        SELECT "presetSlug", "tokensJson" FROM "DesignPresetCustom"
        WHERE "tenantId" = ${tenantId} LIMIT 1
      `;
      const override = rows[0];
      if (
        override?.tokensJson &&
        typeof override.tokensJson === "object" &&
        validateTokens(override.tokensJson).length === 0
      ) {
        resolvedTokens = override.tokensJson as DesignTokens;
        source = "tenant-custom";
      } else if (override?.presetSlug) {
        const fromOficial = getPresetBySlug(override.presetSlug);
        const fromSaved = savedPresets.find((p) => p.meta.slug === override.presetSlug);
        if (fromOficial) {
          resolvedTokens = fromOficial;
          source = "tenant-preset";
        } else if (fromSaved) {
          resolvedTokens = fromSaved;
          source = "tenant-preset";
        }
      }
    } catch (err) {
      logger.warn("[design-system/active] tenant override lookup failed", {
        error: String(err),
        tenantId,
      });
    }
  }

  if (!resolvedTokens) {
    if (globalCustomTokens) {
      resolvedTokens = globalCustomTokens;
      source = "global-custom";
    } else {
      const fromOficial = getPresetBySlug(activeGlobalSlug);
      const fromSaved = savedPresets.find((p) => p.meta.slug === activeGlobalSlug);
      if (fromOficial) {
        resolvedTokens = fromOficial;
        source = "global-oficial";
      } else if (fromSaved) {
        resolvedTokens = fromSaved;
        source = "global-saved";
      } else {
        resolvedTokens = getPresetBySlug(DEFAULT_PRESET_SLUG);
        source = "default";
      }
    }
  }

  return NextResponse.json(
    {
      tokens: resolvedTokens,
      source,
      activeGlobalSlug,
      tenantId,
    },
    {
      headers: {
        // Cache 60s para alivar la consulta — el admin igual recachea on focus.
        "Cache-Control": "private, max-age=60",
      },
    },
  );
}
