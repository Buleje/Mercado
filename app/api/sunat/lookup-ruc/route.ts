/**
 * GET /api/sunat/lookup-ruc?ruc=20XXXXXXXXX
 *
 * Proxy server-side a apis.net.pe (servicio publico gratuito) para consultar
 * datos de un RUC peruano. Devuelve razon social, direccion, estado, etc.
 *
 * Cache en memoria 1h por RUC para evitar rate limit del servicio gratuito.
 *
 * Auth: requiere admin (cualquier rol). Para evitar abuso del proxy desde
 * usuarios anonimos.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

interface SunatLookupResult {
  ruc: string;
  razonSocial: string | null;
  nombreComercial?: string | null;
  estado?: string | null;
  condicion?: string | null;
  direccion?: string | null;
  departamento?: string | null;
  provincia?: string | null;
  distrito?: string | null;
  ubigeo?: string | null;
}

interface ApisNetPeResponse {
  numeroDocumento?: string;
  // apis.net.pe usa "nombre"; otras envoltorios usan "razonSocial"
  nombre?: string;
  razonSocial?: string;
  nombreComercial?: string;
  tipoContribuyente?: string;
  estado?: string;
  condicion?: string;
  direccion?: string;
  departamento?: string;
  provincia?: string;
  distrito?: string;
  ubigeo?: string;
}

// ── Cache simple en memoria ──────────────────────────────────────────────────
const cache = new Map<string, { value: SunatLookupResult; ts: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

function isValidRuc(ruc: string): boolean {
  return /^[12]\d{10}$/.test(ruc);
}

export async function GET(req: NextRequest) {
  const rateLimited = applyRateLimit(req, "MODERATE", "sunat-lookup-ruc");
  if (rateLimited) return rateLimited;

  // SECURITY 2026-05-06 (pentest H11): solo admin. Antes almacenero podía
  // iterar el padrón SUNAT.
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const ruc = (req.nextUrl.searchParams.get("ruc") ?? "").trim();
  if (!isValidRuc(ruc)) {
    return NextResponse.json(
      { error: "RUC invalido. Debe tener 11 digitos y empezar en 1 o 2." },
      { status: 400 },
    );
  }

  // Cache hit
  const cached = cache.get(ruc);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json({ ...cached.value, source: "cache" });
  }

  // Llamar al servicio publico apis.net.pe (gratis, sin token).
  // Si falla, devolver 404 con mensaje claro para que la UI muestre fallback.
  try {
    const upstream = await fetch(
      `https://api.apis.net.pe/v1/ruc?numero=${encodeURIComponent(ruc)}`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "Buleje-Admin/1.0",
        },
        signal: AbortSignal.timeout(8000),
      },
    );

    if (!upstream.ok) {
      // 404: ruc no existe; 429: rate limit
      if (upstream.status === 404) {
        return NextResponse.json(
          { error: "RUC no encontrado en SUNAT", ruc },
          { status: 404 },
        );
      }
      // 422 = el padrón rechaza el número (dígito verificador que no cierra).
      // Verificado 2026-08-12: apis.net.pe responde 422 `{"error":"RUC invalido"}`.
      // Sin este caso, un RUC mal tipeado se reportaba como "servicio caído" y
      // el usuario reintentaba con el mismo número esperando otra respuesta.
      if (upstream.status === 422) {
        return NextResponse.json(
          { error: "SUNAT no reconoce ese RUC: revisá los dígitos.", ruc },
          { status: 404 },
        );
      }
      logger.warn("[sunat-lookup] upstream non-ok", { ruc, status: upstream.status });
      return NextResponse.json(
        { error: "Servicio SUNAT no disponible. Completa los datos manualmente.", ruc },
        { status: 503 },
      );
    }

    const data = (await upstream.json()) as ApisNetPeResponse;
    const result: SunatLookupResult = {
      ruc: data.numeroDocumento ?? ruc,
      // apis.net.pe pone la razon social en "nombre"
      razonSocial: data.razonSocial ?? data.nombre ?? null,
      nombreComercial: data.nombreComercial ?? null,
      estado: data.estado ?? null,
      condicion: data.condicion ?? null,
      direccion: data.direccion ?? null,
      departamento: data.departamento ?? null,
      provincia: data.provincia ?? null,
      distrito: data.distrito ?? null,
      ubigeo: data.ubigeo ?? null,
    };

    cache.set(ruc, { value: result, ts: Date.now() });

    return NextResponse.json({ ...result, source: "sunat" });
  } catch (err) {
    logger.warn("[sunat-lookup] fetch error", {
      ruc,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "No se pudo consultar SUNAT (timeout o red). Completa los datos manualmente.", ruc },
      { status: 503 },
    );
  }
}
