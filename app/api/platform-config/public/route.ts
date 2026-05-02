import "server-only";
import { NextResponse } from "next/server";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import {
  PLATFORM_CONFIG_KEYS,
  flatToNested,
} from "@/lib/platform-config";

/**
 * GET /api/platform-config/public
 *
 * Endpoint público (sin auth) que devuelve la configuración platform
 * para que la consuman landing, registro, storefront, etc.
 *
 * Hoy retorna toda la PlatformConfig porque ningún campo es secreto
 * (un Yape number es para que el cliente te pague). Si mañana se
 * agrega un secret (api key, etc), filtrá acá antes de retornar.
 */
export async function GET() {
  const all = await PlatformSettingsDB.getAll();
  const flat: Record<string, unknown> = {};
  for (const k of Object.keys(PLATFORM_CONFIG_KEYS)) {
    if (k in all) flat[k] = all[k];
  }
  const config = flatToNested(flat);
  return NextResponse.json({ config }, {
    headers: {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
