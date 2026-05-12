/**
 * app/api/csp-report/route.ts
 *
 * Endpoint receptor de CSP violation reports (ADR P3-11 audit 2026-05-12).
 *
 * El browser envia POST con JSON cuando bloquea una violación de CSP:
 *  {
 *    "csp-report": {
 *      "blocked-uri": "https://evil.com/script.js",
 *      "document-uri": "https://buleje.pe/admin",
 *      "violated-directive": "script-src 'self' ...",
 *      ...
 *    }
 *  }
 *
 * Estrategia:
 *  - Rate-limit STRICT (atacante puede spammear con falsos positivos)
 *  - Log a Sentry como warning (no flood)
 *  - NO persistir a DB (volumen alto, valor bajo)
 *  - Deduplicar in-memory por hash (violated-directive + blocked-uri)
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

// Dedupe in-memory: hash → timestamp. TTL 1h para no spammear Sentry.
const recentReports = new Map<string, number>();
const DEDUPE_TTL_MS = 60 * 60 * 1000;

function reportHash(violation: Record<string, unknown>): string {
  const directive = String(violation["violated-directive"] ?? "");
  const blocked = String(violation["blocked-uri"] ?? "");
  return `${directive}::${blocked}`;
}

function isDuplicate(hash: string): boolean {
  const now = Date.now();
  // Cleanup viejos
  for (const [k, ts] of recentReports.entries()) {
    if (now - ts > DEDUPE_TTL_MS) recentReports.delete(k);
  }
  if (recentReports.has(hash)) return true;
  recentReports.set(hash, now);
  return false;
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "STRICT", "csp-report");
  if (_rl) return _rl;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    // CSP reports vienen con clave "csp-report" (formato W3C original)
    // o como objeto plano (Report API más nuevo)
    const violation =
      (body as Record<string, unknown>)["csp-report"] ??
      body;
    if (!violation || typeof violation !== "object") {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const v = violation as Record<string, unknown>;
    const hash = reportHash(v);
    if (isDuplicate(hash)) {
      return NextResponse.json({ ok: true, deduped: true });
    }

    logger.warn("[csp-violation]", {
      directive: v["violated-directive"],
      blockedUri: v["blocked-uri"],
      documentUri: v["document-uri"],
      sourceFile: v["source-file"],
      lineNumber: v["line-number"],
      referrer: v["referrer"],
      ua: req.headers.get("user-agent")?.slice(0, 200),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[csp-report] handler error", { err: String(err) });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
