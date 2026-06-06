/**
 * Sanity tests para lib/design-tokens.ts
 *
 * Objetivo: verificar que el token file exporta los valores de marca
 * correctos y que la estructura es coherente. No testa CSS — solo el
 * objeto TypeScript que se importa en componentes y charts.
 */
import { describe, it, expect } from "vitest";
import { tokens, chartColors } from "../../lib/design-tokens";

describe("design-tokens — sanity checks", () => {
  describe("color.primary", () => {
    it("DEFAULT es el Turquesa oficial #00A0A0 (paleta B 2026-06-05)", () => {
      expect(tokens.color.primary.DEFAULT).toBe("#00A0A0");
    });

    it("dark es #009690 (hover/active)", () => {
      expect(tokens.color.primary.dark).toBe("#009690");
    });

    it("light es #33C4B8", () => {
      expect(tokens.color.primary.light).toBe("#33C4B8");
    });

    it("bright es #00D4D4 (accent interactivo)", () => {
      expect(tokens.color.primary.bright).toBe("#00D4D4");
    });
  });

  describe("color.secondary", () => {
    it("DEFAULT es Orange 500 #f97316", () => {
      expect(tokens.color.secondary.DEFAULT).toBe("#f97316");
    });

    it("dark es Orange 600 #ea580c", () => {
      expect(tokens.color.secondary.dark).toBe("#ea580c");
    });
  });

  describe("estados semánticos", () => {
    it("danger es Red 500", () => {
      expect(tokens.color.danger).toBe("#ef4444");
    });

    it("success es Emerald 500", () => {
      expect(tokens.color.success).toBe("#10b981");
    });

    it("warning es Amber 500", () => {
      expect(tokens.color.warning).toBe("#f59e0b");
    });

    it("info es Sky 500", () => {
      expect(tokens.color.info).toBe("#0ea5e9");
    });
  });

  describe("spacing", () => {
    it("moduleStack es una clase Tailwind válida", () => {
      expect(tokens.spacing.moduleStack).toBe("space-y-4");
    });

    it("sectionStack es una clase Tailwind válida", () => {
      expect(tokens.spacing.sectionStack).toBe("space-y-6");
    });
  });

  describe("radius", () => {
    it("default, card y pill son clases Tailwind válidas", () => {
      expect(tokens.radius.default).toBe("rounded-lg");
      expect(tokens.radius.card).toBe("rounded-xl");
      expect(tokens.radius.pill).toBe("rounded-full");
    });
  });

  describe("chartColors (alias)", () => {
    it("apunta al mismo primary que tokens.color.primary.DEFAULT", () => {
      expect(chartColors.primary).toBe(tokens.color.primary.DEFAULT);
    });

    it("exporta los 6 colores semánticos", () => {
      const keys = Object.keys(chartColors);
      expect(keys).toEqual(
        expect.arrayContaining(["primary", "secondary", "danger", "success", "warning", "info"])
      );
    });
  });
});
