import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { logger } from "@/lib/logger";
import { bestMatchFromGeocode } from "@/lib/peru-ubigeo";

/**
 * GET /api/marketplace/reverse-geocode?lat=-8.379&lng=-74.553
 *
 * Toma coordenadas y devuelve {departamento, provincia, distrito, address}
 * usando Nominatim (OpenStreetMap) + matching contra ubigeo INEI.
 *
 * Pública (no requiere auth). Rate-limited por IP en Nominatim.
 */
const QuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    lat: searchParams.get("lat"),
    lng: searchParams.get("lng"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "lat y lng requeridos (numeros)" },
      { status: 400 },
    );
  }

  const { lat, lng } = parsed.data;
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=es&zoom=18`;

  try {
    const resp = await fetch(url, {
      headers: {
        // Nominatim requiere User-Agent identificativo (TOS).
        "User-Agent": "Buleje/1.0 (https://www.buleje.pe)",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) {
      logger.warn("[reverse-geocode] nominatim non-ok", { status: resp.status, lat, lng });
      return NextResponse.json({ error: "Geocoder no disponible" }, { status: 502 });
    }
    const data = (await resp.json()) as {
      display_name?: string;
      address?: {
        road?: string;
        house_number?: string;
        suburb?: string;
        city_district?: string;
        city?: string;
        county?: string;
        state?: string;
      };
    };

    const addr = data.address ?? {};
    const match = bestMatchFromGeocode({
      state: addr.state ?? null,
      county: addr.county ?? null,
      city: addr.city ?? null,
      suburb: addr.suburb ?? null,
      city_district: addr.city_district ?? null,
    });

    const street = [addr.road, addr.house_number].filter(Boolean).join(" ").trim();
    // Round 23: shape extendida con códigos completos para que el cliente
    // (checkout/entrega) pueda hidratar dropdowns sin importar el dataset
    // INEI completo (~350KB). Backwards-compat: nombres flat preservados.
    return NextResponse.json({
      lat,
      lng,
      // Backwards-compat (nombres flat):
      departamento: match.departamento?.nombre ?? null,
      provincia: match.provincia?.nombre ?? null,
      distrito: match.distrito?.nombre ?? null,
      direccion: street || null,
      displayName: data.display_name ?? null,
      // Round 23: shape para checkout (códigos + nombres):
      street: street || null,
      match: {
        departamento: match.departamento
          ? { code: match.departamento.code, nombre: match.departamento.nombre }
          : null,
        provincia: match.provincia
          ? { code: match.provincia.code, nombre: match.provincia.nombre }
          : null,
        distrito: match.distrito
          ? { code: match.distrito.code, nombre: match.distrito.nombre }
          : null,
      },
    });
  } catch (err) {
    logger.error("[reverse-geocode] failed", { error: String(err), lat, lng });
    return NextResponse.json({ error: "Geocoder no disponible" }, { status: 502 });
  }
}
