/**
 * Tests del módulo Design System.
 *
 * Cubre:
 *  - Cada preset cumple el shape DesignTokens (sin keys faltantes ni extras).
 *  - Los slugs son únicos y kebab-case.
 *  - getPresetBySlug devuelve null para slug inexistente.
 *  - tokensToCssVars produce todas las CSS vars que el shell consume.
 *  - tokensToCssString genera CSS válido.
 */

import { describe, it, expect } from "vitest";
import {
  DESIGN_PRESETS,
  DEFAULT_PRESET_SLUG,
  getPresetBySlug,
  tokensToCssVars,
  tokensToCssString,
} from "@/lib/design-presets";

describe("DESIGN_PRESETS catálogo", () => {
  it("contiene al menos 5 presets", () => {
    expect(DESIGN_PRESETS.length).toBeGreaterThanOrEqual(5);
  });

  it("incluye el slug default", () => {
    const found = DESIGN_PRESETS.find((p) => p.meta.slug === DEFAULT_PRESET_SLUG);
    expect(found).toBeDefined();
  });

  it("todos los slugs son únicos", () => {
    const slugs = DESIGN_PRESETS.map((p) => p.meta.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("todos los slugs son kebab-case (minúsculas + guiones)", () => {
    for (const p of DESIGN_PRESETS) {
      expect(p.meta.slug, `${p.meta.name} slug inválido`).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  it("todos los presets tienen las secciones obligatorias", () => {
    for (const p of DESIGN_PRESETS) {
      expect(p.meta).toHaveProperty("name");
      expect(p.meta).toHaveProperty("description");
      expect(p.colors).toHaveProperty("accent");
      expect(p.colors).toHaveProperty("surfaceRaised");
      expect(p.colors).toHaveProperty("textPrimary");
      expect(p.colors).toHaveProperty("ruleBase");
      expect(p.typography).toHaveProperty("fontHeading");
      expect(p.typography).toHaveProperty("fontBody");
      expect(p.typography).toHaveProperty("sizeBase");
      expect(p.typography).toHaveProperty("sizeScale");
      expect(p.spacing).toHaveProperty("base");
      expect(p.spacing).toHaveProperty("density");
      expect(p.radius).toHaveProperty("md");
      expect(p.radius).toHaveProperty("lg");
      expect(p.shadows).toHaveProperty("md");
      expect(p.shadows).toHaveProperty("accent");
      expect(p.motion).toHaveProperty("durBase");
      expect(p.motion).toHaveProperty("easing");
      expect(p.buttons).toHaveProperty("height");
      expect(p.buttons).toHaveProperty("radius");
    }
  });

  it("density es uno de comfortable | compact | spacious", () => {
    for (const p of DESIGN_PRESETS) {
      expect(["compact", "comfortable", "spacious"]).toContain(p.spacing.density);
    }
  });

  it("buttons.radius referencia una key existente en radius", () => {
    for (const p of DESIGN_PRESETS) {
      expect(p.radius).toHaveProperty(p.buttons.radius);
    }
  });
});

describe("getPresetBySlug", () => {
  it("devuelve el preset para slug válido", () => {
    expect(getPresetBySlug("buleje-default")).toBeTruthy();
    expect(getPresetBySlug("buleje-default")?.meta.name).toBe("Buleje Default");
  });

  it("devuelve null para slug inexistente", () => {
    expect(getPresetBySlug("no-existe")).toBeNull();
    expect(getPresetBySlug("")).toBeNull();
  });
});

describe("tokensToCssVars", () => {
  it("genera todas las CSS vars que el shell del admin consume", () => {
    const tokens = getPresetBySlug(DEFAULT_PRESET_SLUG)!;
    const vars = tokensToCssVars(tokens);

    // Vars críticas — si una falta, el admin pierde colores
    const required = [
      "--accent",
      "--accent-dark",
      "--accent-soft",
      "--surface-canvas",
      "--surface-raised",
      "--surface-sunken",
      "--text-primary",
      "--text-secondary",
      "--text-tertiary",
      "--rule-base",
      "--rule-strong",
      "--data-success",
      "--data-warning",
      "--data-error",
      "--font-heading",
      "--font-body",
      "--ts-base",
      "--radius-md",
      "--radius-lg",
      "--shadow-md",
      "--shadow-accent",
      "--dur-base",
      "--easing",
      "--btn-height",
      "--btn-radius",
    ];
    for (const key of required) {
      expect(vars, `falta ${key}`).toHaveProperty(key);
    }
  });

  it("todos los valores son strings (necesarios para CSS)", () => {
    const tokens = getPresetBySlug(DEFAULT_PRESET_SLUG)!;
    const vars = tokensToCssVars(tokens);
    for (const [k, v] of Object.entries(vars)) {
      expect(typeof v, `${k} debe ser string`).toBe("string");
      expect(v.length, `${k} no puede ser vacío`).toBeGreaterThan(0);
    }
  });

  it("--btn-radius resuelve al valor real del radius referenciado", () => {
    const tokens = getPresetBySlug(DEFAULT_PRESET_SLUG)!;
    const vars = tokensToCssVars(tokens);
    expect(vars["--btn-radius"]).toBe(tokens.radius[tokens.buttons.radius]);
  });
});

describe("tokensToCssString", () => {
  it("genera CSS válido con scope :root por default", () => {
    const tokens = getPresetBySlug(DEFAULT_PRESET_SLUG)!;
    const css = tokensToCssString(tokens);
    expect(css).toMatch(/^:root \{/);
    expect(css).toContain("--accent:");
    expect(css).toContain("--surface-raised:");
    expect(css).toMatch(/\}$/);
  });

  it("acepta scope custom", () => {
    const tokens = getPresetBySlug(DEFAULT_PRESET_SLUG)!;
    const css = tokensToCssString(tokens, "[data-design-preset='x']");
    expect(css).toMatch(/^\[data-design-preset='x'\] \{/);
  });

  it("varios presets producen CSS diferente", () => {
    const a = tokensToCssString(getPresetBySlug("buleje-default")!);
    const b = tokensToCssString(getPresetBySlug("dark-pro")!);
    expect(a).not.toBe(b);
  });
});

describe("paridad cross-preset", () => {
  it("todos los presets tienen exactamente las mismas keys de CSS vars", () => {
    const reference = Object.keys(tokensToCssVars(DESIGN_PRESETS[0])).sort();
    for (const p of DESIGN_PRESETS.slice(1)) {
      const keys = Object.keys(tokensToCssVars(p)).sort();
      expect(keys, `${p.meta.slug} difiere del reference`).toEqual(reference);
    }
  });
});
