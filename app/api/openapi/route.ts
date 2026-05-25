/**
 * app/api/openapi/route.ts
 *
 * GET /api/openapi — devuelve el spec OpenAPI 3.1 dinámicamente.
 *
 * Permite a clientes externos (Postman, Insomnia, code generators) consumir
 * el spec en runtime sin depender de public/openapi.json estático.
 *
 * Headers CORS permisivos — el spec es público por diseño (es documentación).
 */

import { NextRequest, NextResponse } from "next/server";
import { generateOpenAPIDoc } from "@/lib/openapi/generator";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

// SECURITY 2026-05-12 (pentest N5 audit): race condition al cold-start.
// Antes `if (!cachedDoc) cachedDoc = generateOpenAPIDoc()` ejecutaba el
// generador en N lambdas concurrentes warming. Ahora usamos una promesa
// compartida para deduplicar el work.
let cachedDocPromise: Promise<ReturnType<typeof generateOpenAPIDoc>> | null = null;

export async function GET(req: NextRequest) {
  try {
    // SECURITY 2026-05-12 (pentest N4 audit): rate-limit GENEROUS para evitar
    // scraping bot del spec (reconnaissance pasiva sin rate previo).
    const _rl = await applyRateLimit(req, "GENEROUS", "openapi-spec");
    if (_rl) return _rl;

    if (!cachedDocPromise) {
      cachedDocPromise = Promise.resolve(generateOpenAPIDoc());
    }
    const doc = await cachedDocPromise;

    return NextResponse.json(doc, {
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "X-OpenAPI-Version": "3.1.0",
      },
    });

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function OPTIONS() {
  try {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Max-Age": "86400",
      },
    });

  } catch (e) {
    logger.error("[options] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
