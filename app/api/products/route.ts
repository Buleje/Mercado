/**
 * GET/POST /api/products  — LEGACY (unversioned)
 *
 * DEPRECATED: This endpoint is kept only for backward compatibility.
 * New clients MUST use `/api/v1/products`. See docs/api-versioning-strategy.md.
 *
 * The handlers below re-export from `/api/v1/products` and wrap the response
 * with `deprecatedResponse()` which adds:
 *   - `Deprecation: true`
 *   - `Link: </api/v1/products>; rel="successor-version"`
 *
 * Sunset date: to be announced 6 months before removal.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  GET as V1_GET,
  POST as V1_POST,
} from "@/app/api/v1/products/route";
import { deprecatedResponse } from "@/lib/api-version";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const res = await V1_GET(req);
    return deprecatedResponse(res, "/api/v1/products");

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const res = await V1_POST(req);
    return deprecatedResponse(res, "/api/v1/products");

  } catch (e) {
    logger.error("[post] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
