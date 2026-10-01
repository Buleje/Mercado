/**
 * El color de marca elegido tiene que arrastrar TODA su escala.
 *
 * El acento del DS no es un color: son seis tokens. `--accent` es el tono base,
 * y media UI usa los derivados — el CTA del login es `bg-[var(--accent-600)]`,
 * los hovers usan `--accent-dark`, los tintes `--accent-soft`/`-muted`.
 *
 * El override del tenant pisaba SÓLO `--accent`. Un negocio que elegía su color
 * quedaba con la pantalla partida: el tono nuevo en los textos y los KPIs, y el
 * turquesa del DS en los botones y los hovers. Dos identidades a la vez, que es
 * como se ve (2026-09-06, reporte de Brandon sobre el login del panel).
 */

import { describe, it, expect } from "vitest";
import { brandColorOverridesCss } from "@/lib/platform-config.server";
import { PLATFORM_CONFIG_DEFAULTS } from "@/lib/platform-config";

const config = (primary?: string, secondary?: string) => ({
  ...PLATFORM_CONFIG_DEFAULTS,
  brand: {
    ...PLATFORM_CONFIG_DEFAULTS.brand,
    ...(primary ? { primaryColor: primary } : {}),
    ...(secondary ? { secondaryColor: secondary } : {}),
  },
});

describe("brandColorOverridesCss", () => {
  it("con el color por defecto no emite nada (manda el DS)", () => {
    expect(brandColorOverridesCss(config())).toBeNull();
  });

  it("un color propio arrastra los seis tokens del acento", () => {
    const css = brandColorOverridesCss(config("#ff6b5b")) ?? "";
    for (const token of ["--accent:", "--accent-600:", "--accent-dark:", "--accent-ink:", "--accent-soft:", "--accent-muted:"]) {
      expect(css).toContain(token);
    }
    expect(css).toContain("--brand-primary:");
  });

  it("EL BUG: los derivados no pueden quedarse en el turquesa del DS", () => {
    const css = brandColorOverridesCss(config("#ff6b5b")) ?? "";
    // Ninguno de los valores del acento del DS puede sobrevivir al override.
    for (const turquesa of ["#008787", "#007575", "#006B6B", "#00A0A0"]) {
      expect(css).not.toContain(turquesa);
    }
    // Y cada derivado sale del color elegido.
    expect(css.match(/#ff6b5b/gi)?.length ?? 0).toBeGreaterThanOrEqual(6);
  });

  it("los derivados se mezclan en oklab, no en RGB", () => {
    // En RGB un derivado de un color cálido se ensucia; oklab mantiene la
    // luminosidad percibida en cualquier hue.
    const css = brandColorOverridesCss(config("#ff6b5b")) ?? "";
    expect(css).toContain("color-mix(in oklab");
    expect(css).not.toContain("color-mix(in srgb");
  });

  it("los tintes van contra transparent, no contra black", () => {
    const css = brandColorOverridesCss(config("#ff6b5b")) ?? "";
    expect(css).toMatch(/--accent-soft: color-mix\(in oklab, #ff6b5b 6%, transparent\)/i);
    expect(css).toMatch(/--accent-muted: color-mix\(in oklab, #ff6b5b 13%, transparent\)/i);
  });

  it("un color inválido no se interpola (anti stored-XSS)", () => {
    const css = brandColorOverridesCss(config("red; } body { display:none")) ?? "";
    expect(css).not.toContain("display:none");
  });

  it("el secundario sigue siendo un token suelto, sin escala", () => {
    const css = brandColorOverridesCss(config(undefined, "#123456")) ?? "";
    expect(css).toContain("--brand-secondary:");
    expect(css).not.toContain("--accent-600:");
  });
});
