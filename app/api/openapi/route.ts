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

import { NextResponse } from "next/server";
import { generateOpenAPIDoc } from "@/lib/openapi/generator";

// Cache en memory — se regenera al hot-reload. En prod este endpoint
// debería ser cacheado por Vercel Edge cache.
let cachedDoc: ReturnType<typeof generateOpenAPIDoc> | null = null;

export async function GET() {
  if (!cachedDoc) {
    cachedDoc = generateOpenAPIDoc();
  }

  return NextResponse.json(cachedDoc, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "X-OpenAPI-Version": "3.1.0",
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
