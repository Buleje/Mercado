/**
 * GET /api/marketplace/ruc-lookup?ruc=20XXXXXXXXX
 *
 * Variante PÚBLICA (sin auth) de /api/sunat/lookup-ruc para el formulario de
 * registro de tiendas del marketplace. Un dueño que aún no tiene cuenta debe
 * poder autocompletar su razón social + dirección desde SUNAT con su RUC.
 *
 * Protección: rate limit estricto (es un proxy a un servicio gratuito) + solo
 * acepta RUCs válidos (11 dígitos, empieza en 1/2). NO expone nada que no esté
 * ya en la consulta RUC pública de SUNAT.
 *
 * Cache en memoria 1h por RUC para no gastar el rate limit del upstream.
 */

import { NextResponse, type NextRequest } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

interface RucResult {
  ruc: string;
  razonSocial: string | null;
  nombreComercial: string | null;
  estado: string | null;
  condicion: string | null;
  direccion: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  ubigeo: string | null;
}

interface ApisNetPeResponse {
  numeroDocumento?: string;
  nombre?: string; // apis.net.pe pone la razón social aquí
  razonSocial?: string;
  nombreComercial?: string;
  estado?: string;
  condicion?: string;
  direccion?: string;
  departamento?: string;
  provincia?: string;
  distrito?: string;
  ubigeo?: string;
}

const cache = new Map<string, { value: RucResult; ts: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h

function isValidRuc(ruc: string): boolean {
  return /^[12]\d{10}$/.test(ruc);
}

export async function GET(req: NextRequest) {
  const rateLimited = applyRateLimit(req, "MODERATE", "marketplace-ruc-lookup");
  if (rateLimited) return rateLimited;

  const ruc = (req.nextUrl.searchParams.get("ruc") ?? "").trim();
  if (!isValidRuc(ruc)) {
    return NextResponse.json(
      { error: "RUC inválido. Debe tener 11 dígitos y empezar en 1 o 2." },
      { status: 400 },
    );
  }

  const cached = cache.get(ruc);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json({ ...cached.value, source: "cache" });
  }

  try {
    const upstream = await fetch(
      `https://api.apis.net.pe/v1/ruc?numero=${encodeURIComponent(ruc)}`,
      {
        headers: { Accept: "application/json", "User-Agent": "Buleje-Marketplace/1.0" },
        signal: AbortSignal.timeout(8000),
      },
    );

    if (!upstream.ok) {
      if (upstream.status === 404) {
        return NextResponse.json({ error: "RUC no encontrado en SUNAT", ruc }, { status: 404 });
      }
      logger.warn("[marketplace-ruc] upstream non-ok", { ruc, status: upstream.status });
      return NextResponse.json(
        { error: "Servicio SUNAT no disponible. Escribe el nombre manualmente.", ruc },
        { status: 503 },
      );
    }

    const data = (await upstream.json()) as ApisNetPeResponse;
    const result: RucResult = {
      ruc: data.numeroDocumento ?? ruc,
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
    logger.warn("[marketplace-ruc] fetch error", {
      ruc,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "No se pudo consultar SUNAT. Escribe el nombre manualmente.", ruc },
      { status: 503 },
    );
  }
}
