import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidate } from "@/lib/cache";
import { logger } from "@/lib/logger";

/**
 * ROADMAP ITEM #25 — Feature flags per-tenant
 *
 * Stores per-tenant boolean flags inside Settings.metadata JSON (no new
 * column, no migration). Reuses the existing `lib/flags` PostHog system
 * for global flags — this module adds the tenant-specific override layer.
 *
 * Precedence on read:
 *   1. tenant override (this module)
 *   2. env fallback (existing lib/flags)
 *   3. default (false)
 */

const CACHE_TTL_SEC = 60;
const cacheKey = (tenantId: string) => `tenant-flags:${tenantId}`;

interface FlagsRow {
  featureFlagsJson?: string | null;
}

async function readFlags(tenantId: string): Promise<Record<string, boolean>> {
  return getOrSet(cacheKey(tenantId), CACHE_TTL_SEC, async () => {
    try {
      const row = (await prisma.settings.findFirst({
        where: { tenantId },
        select: { featureFlagsJson: true },
      })) as FlagsRow | null;
      const raw = row?.featureFlagsJson;
      let flags: Record<string, unknown> = {};
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as unknown;
          if (parsed && typeof parsed === "object") {
            flags = parsed as Record<string, unknown>;
          }
        } catch {
          flags = {};
        }
      }
      const result: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(flags)) {
        if (typeof v === "boolean") result[k] = v;
      }
      return result;
    } catch (err) {
      logger.warn("[tenant-flags] read failed", {
        tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
      return {};
    }
  });
}

export async function isTenantFlagEnabled(
  tenantId: string,
  flagName: string,
): Promise<boolean | undefined> {
  const flags = await readFlags(tenantId);
  return flags[flagName];
}

export async function setTenantFlag(
  tenantId: string,
  flagName: string,
  enabled: boolean,
): Promise<boolean> {
  try {
    const current = (await prisma.settings.findFirst({
      where: { tenantId },
      select: { id: true, featureFlagsJson: true },
    })) as { id: number; featureFlagsJson?: string | null } | null;

    let existingFlags: Record<string, boolean> = {};
    if (current?.featureFlagsJson) {
      try {
        const parsed = JSON.parse(current.featureFlagsJson) as unknown;
        if (parsed && typeof parsed === "object") {
          for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
            if (typeof v === "boolean") existingFlags[k] = v;
          }
        }
      } catch {
        existingFlags = {};
      }
    }

    const nextFlags = { ...existingFlags, [flagName]: enabled };

    if (current) {
      await prisma.settings.update({
        where: { id: current.id },
        data: { featureFlagsJson: JSON.stringify(nextFlags) },
      });
    }
    invalidate(cacheKey(tenantId));
    return true;
  } catch (err) {
    logger.error("[tenant-flags] write failed", {
      tenantId,
      flagName,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export async function getTenantFlags(
  tenantId: string,
): Promise<Record<string, boolean>> {
  return readFlags(tenantId);
}
