/**
 * GET /api/superadmin/security/audit-snapshot
 *
 * Snapshot estático de la postura de dependencias del repo, leído de
 * package.json + lockfile + process.version. NO ejecuta `npm audit` en
 * runtime (shell exec en serverless es lento y poco confiable; el escaneo
 * real lo hace Dependabot/Snyk/Trivy via webhook → tabla en DB).
 *
 * Sirve para mostrarle al superadmin métricas honestas mientras no hay
 * escáner conectado: cuántas deps, qué tan vieja la lockfile, qué Node
 * está corriendo.
 *
 * Auth: requirePlatformAPI · Rate-limit GENEROUS · Cache-Control no-store
 */
import "server-only";
import { NextRequest } from "next/server";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { secureJson, secureError } from "@/lib/superadmin-response";
import { NextResponse } from "next/server";

interface AuditSnapshot {
  generatedAt: string;
  depsCount: number;
  devDepsCount: number;
  totalDepsCount: number;
  nodeVersion: string;
  lockfileAgeDays: number | null;
  lockfileSizeBytes: number | null;
  packageJsonAgeDays: number | null;
  reactVersion: string | null;
  nextVersion: string | null;
}

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "GENEROUS", "superadmin-audit-snapshot");
  if (rl) return rl;

  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const root = process.cwd();
    const pkgPath = join(root, "package.json");
    const lockPath = join(root, "package-lock.json");

    const [pkgRaw, pkgStat, lockStat] = await Promise.all([
      readFile(pkgPath, "utf8"),
      stat(pkgPath).catch(() => null),
      stat(lockPath).catch(() => null),
    ]);

    const pkg = JSON.parse(pkgRaw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = pkg.dependencies ?? {};
    const devDeps = pkg.devDependencies ?? {};
    const depsCount = Object.keys(deps).length;
    const devDepsCount = Object.keys(devDeps).length;

    const ageInDays = (mtimeMs: number) =>
      Math.floor((Date.now() - mtimeMs) / 86_400_000);

    const snapshot: AuditSnapshot = {
      generatedAt: new Date().toISOString(),
      depsCount,
      devDepsCount,
      totalDepsCount: depsCount + devDepsCount,
      nodeVersion: process.version,
      lockfileAgeDays: lockStat ? ageInDays(lockStat.mtimeMs) : null,
      lockfileSizeBytes: lockStat ? lockStat.size : null,
      packageJsonAgeDays: pkgStat ? ageInDays(pkgStat.mtimeMs) : null,
      reactVersion: deps.react ?? null,
      nextVersion: deps.next ?? null,
    };

    return secureJson(snapshot);
  } catch (err) {
    logger.error("[superadmin/security/audit-snapshot] failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return secureError("No se pudo leer el snapshot", 500);
  }
}
