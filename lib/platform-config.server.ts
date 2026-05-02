import "server-only";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import {
  PLATFORM_CONFIG_DEFAULTS,
  PLATFORM_CONFIG_KEYS,
  flatToNested,
  type PlatformConfig,
} from "@/lib/platform-config";

/**
 * lib/platform-config.server.ts — fetch del PlatformConfig en server
 * components (root layout, páginas SSR). Reusa el cache de
 * PlatformSettingsDB.getAll() (5 min) — no agregamos otro layer.
 *
 * Brandon mayo 2026: el root layout llama esta función para inyectar
 * los colores y el nombre de marca antes del primer paint, evitando
 * el flash de "verde Buleje default" cuando el cliente cambió a su
 * propia paleta.
 */
export async function getPlatformConfigSSR(): Promise<PlatformConfig> {
  try {
    const all = await PlatformSettingsDB.getAll();
    const flat: Record<string, unknown> = {};
    for (const k of Object.keys(PLATFORM_CONFIG_KEYS)) {
      if (k in all) flat[k] = all[k];
    }
    return flatToNested(flat);
  } catch {
    // Si la DB no responde, defaults — el sitio sigue funcionando con la
    // identidad por defecto de Buleje. Mejor degradar que romper.
    return PLATFORM_CONFIG_DEFAULTS;
  }
}

/**
 * Devuelve un bloque CSS `:root` con los CSS vars de marca aplicados.
 * Inyectar en `<head>` o al inicio de `<body>` para evitar FOUC.
 *
 * Sólo emite vars cuyos valores difieran del default — así no
 * sobreescribimos los tokens del DS si el cliente todavía no
 * configuró nada.
 */
export function brandColorOverridesCss(cfg: PlatformConfig): string | null {
  const overrides: string[] = [];
  if (cfg.brand.primaryColor && cfg.brand.primaryColor !== PLATFORM_CONFIG_DEFAULTS.brand.primaryColor) {
    overrides.push(`--brand-primary: ${cfg.brand.primaryColor};`);
    overrides.push(`--accent: ${cfg.brand.primaryColor};`);
  }
  if (cfg.brand.secondaryColor && cfg.brand.secondaryColor !== PLATFORM_CONFIG_DEFAULTS.brand.secondaryColor) {
    overrides.push(`--brand-secondary: ${cfg.brand.secondaryColor};`);
  }
  if (overrides.length === 0) return null;
  return `:root{${overrides.join("")}}`;
}
