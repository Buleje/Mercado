/**
 * app/api/superadmin/project-intel/route.ts
 *
 * Endpoint de datos en vivo para /superadmin/project-intel.
 *
 * Lee 2 archivos del repo en cada request:
 *   - docs/practicas-2026-audit.md — parsea la fila "Total" para los
 *     conteos ✅/⚠️/❌/➖ del Excel 2026 (48 prácticas)
 *   - docs/TECH-DEBT.md — cuenta items TD-XXX por estado
 *
 * NO mide TS errors en vivo — `npx tsc --noEmit` tarda >30s y bloquea la
 * request. El count de errores TS queda hardcoded o es nullable.
 *
 * Fallback: si algo falla el parse, devuelve el shape vacío para que el
 * frontend degrade a las constantes hardcodeadas sin romper.
 *
 * Cache: `revalidate: 300` (5 minutos). No es data time-sensitive.
 */

export const revalidate = 300;

import { NextResponse, type NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { logger } from "@/lib/logger";

// ─── Response shape ─────────────────────────────────────────────────────────

export interface ProjectIntelData {
  excel2026: {
    applied: number;
    partial: number;
    missing: number;
    na: number;
    total: number;
    source: "docs/practicas-2026-audit.md" | "hardcoded-fallback";
    lastUpdated: string | null;
  };
  techDebt: {
    total: number;
    open: number;
    inProgress: number;
    closed: number;
    bySeverity: Record<string, number>;
  };
  tsErrors: {
    count: number | null;
    lastMeasured: string | null;
    note: string;
  };
  generatedAt: string;
}

// ─── GET handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Auth guard: superadmin only
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  const session = token ? await getPlatformSession(token) : null;
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projectRoot = process.cwd();
  const auditPath = join(projectRoot, "docs", "practicas-2026-audit.md");
  const techDebtPath = join(projectRoot, "docs", "TECH-DEBT.md");

  // ── Parse practicas-2026-audit.md ────────────────────────────────────────
  const excel2026 = await parsePracticasAudit(auditPath);

  // ── Parse TECH-DEBT.md ───────────────────────────────────────────────────
  const techDebt = await parseTechDebt(techDebtPath);

  // ── TS errors count — hardcoded (medir en vivo tarda >30s) ────────────────
  const tsErrors = {
    count: 251, // Medido manualmente en commit a7e742c, update cuando avance
    lastMeasured: "2026-04-06",
    note: "Manual measurement. Live count would block request (tsc takes >30s)",
  };

  const data: ProjectIntelData = {
    excel2026,
    techDebt,
    tsErrors,
    generatedAt: new Date().toISOString(),
  };

  return NextResponse.json(data);
}

// ─── Parsers ────────────────────────────────────────────────────────────────

async function parsePracticasAudit(
  path: string,
): Promise<ProjectIntelData["excel2026"]> {
  try {
    const content = await readFile(path, "utf8");
    // Buscar la fila "Total" del resumen ejecutivo. Formato:
    // | **Total** | **48** | **28** | **13** | **3** | **4** |
    const totalMatch = content.match(
      /\|\s*\*\*Total\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|/,
    );

    // Buscar fecha de last updated en el front del archivo
    const lastUpdatedMatch = content.match(/\*\*Última actualización:\*\*\s*([^\n]+)/);
    const lastUpdated = lastUpdatedMatch?.[1]?.trim() ?? null;

    if (totalMatch) {
      return {
        total: Number(totalMatch[1]),
        applied: Number(totalMatch[2]),
        partial: Number(totalMatch[3]),
        missing: Number(totalMatch[4]),
        na: Number(totalMatch[5]),
        source: "docs/practicas-2026-audit.md",
        lastUpdated,
      };
    }

    logger.warn("[project-intel] Could not parse Total row in audit doc");
    return fallbackExcel2026();
  } catch (e) {
    logger.warn("[project-intel] Failed to read audit doc", {
      error: (e as Error).message,
    });
    return fallbackExcel2026();
  }
}

function fallbackExcel2026(): ProjectIntelData["excel2026"] {
  return {
    applied: 28,
    partial: 13,
    missing: 3,
    na: 4,
    total: 48,
    source: "hardcoded-fallback",
    lastUpdated: null,
  };
}

async function parseTechDebt(
  path: string,
): Promise<ProjectIntelData["techDebt"]> {
  try {
    const content = await readFile(path, "utf8");

    // Count TD-XXX occurrences in tables
    const tdMatches = content.match(/\|\s*TD-\d+\s*\|/g) ?? [];
    const total = tdMatches.length;

    // Count by status indicators in the status column
    const openCount = (content.match(/🔓\s*Abierto/g) ?? []).length;
    const inProgressCount = (content.match(/🟡\s*En progreso/g) ?? []).length;
    const closedCount = (content.match(/✅\s*(Cerrado|cerrado|CERRADA)/g) ?? []).length;

    // Severity buckets (🔴 🟠 🟡 🟢)
    const bySeverity: Record<string, number> = {
      critical: (content.match(/🔴\s*(Cr[ií]tica|Critical|Crítico|cr[ií]tico)/g) ?? []).length,
      high: (content.match(/🟠\s*(Alta|High|alto)/g) ?? []).length,
      medium: (content.match(/🟡\s*(Media|Medium|medio)/g) ?? []).length,
      low: (content.match(/🟢\s*(Baja|Low|bajo)/g) ?? []).length,
    };

    return {
      total,
      open: openCount,
      inProgress: inProgressCount,
      closed: closedCount,
      bySeverity,
    };
  } catch (e) {
    logger.warn("[project-intel] Failed to read tech-debt doc", {
      error: (e as Error).message,
    });
    return {
      total: 0,
      open: 0,
      inProgress: 0,
      closed: 0,
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
    };
  }
}
