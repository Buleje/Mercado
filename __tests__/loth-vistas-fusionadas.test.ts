/**
 * Compactación del Libro TH (17-10): 10 → 7 vistas. Las que dejaron el riel
 * siguen llegando a su sección — por el alias del libro (módulo ya montado) y
 * por la migración de la URL al cargar (`?tab=…&vista=monte` del WhatsApp).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolverDestino } from "@/lib/admin/destino-tab";
import { LOTH_VISTAS } from "@/lib/admin/subvistas-modulos";
import {
  ALIAS_FUSIONADAS_TH,
  SUBS_CONTROL,
  SUBS_CUMPLIMIENTO_TH,
  SUBS_GTF,
  destinoFusionadoTh,
} from "@/components/admin/forestal/loth-vistas-fusionadas";

const TAB = "loth-libro-operaciones";

describe("Libro TH — vistas fusionadas", () => {
  it("las tres que dejaron el riel el 17-10 caen en su sección", () => {
    expect(destinoFusionadoTh("trazabilidad")).toEqual({ vista: "tablero", sub: "arbol" });
    expect(destinoFusionadoTh("cierre")).toEqual({ vista: "cumplimiento", sub: "cerrar" });
    expect(destinoFusionadoTh("monte")).toEqual({ vista: "gtf", sub: "monte" });
    expect(destinoFusionadoTh("extraccion")).toEqual({ vista: "tablero", sub: "extraccion" });
    expect(destinoFusionadoTh("analitica")).toEqual({ vista: "rentabilidad" });
    expect(destinoFusionadoTh("secciones")).toBeNull();
    expect(destinoFusionadoTh("toString")).toBeNull();
  });

  it("cada sección destino existe en la vista que la absorbe", () => {
    const subsDe: Record<string, readonly string[]> = { tablero: SUBS_CONTROL, cumplimiento: SUBS_CUMPLIMIENTO_TH, gtf: SUBS_GTF };
    for (const [vieja, d] of Object.entries(ALIAS_FUSIONADAS_TH)) {
      const destino = destinoFusionadoTh(vieja)!;
      expect(destino.vista).toBe(d);
      if (destino.sub) expect(subsDe[destino.vista], vieja).toContain(destino.sub);
    }
  });

  it("ninguna vista vieja sigue en el riel y el riel queda en 7 (2 · 3 · 2)", () => {
    const keys = LOTH_VISTAS.map((v) => v.key);
    expect(keys).toHaveLength(7);
    for (const vieja of Object.keys(ALIAS_FUSIONADAS_TH)) expect(keys).not.toContain(vieja);
  });

  it("la URL vieja se migra con su sección al cargar el panel", () => {
    expect(resolverDestino(TAB, "monte")).toMatchObject({ tab: TAB, vista: "gtf", sub: "monte" });
    expect(resolverDestino(TAB, "cierre")).toMatchObject({ tab: TAB, vista: "cumplimiento", sub: "cerrar" });
    expect(resolverDestino(TAB, "trazabilidad")).toMatchObject({ tab: TAB, vista: "tablero", sub: "arbol" });
  });

  it("el libro borra el `?sub=` de cada vista con secciones al salir (y `trabajo` con GTF)", () => {
    const src = readFileSync(join(process.cwd(), "components/admin/forestal/LothLibroOperaciones.tsx"), "utf8");
    const params = src.match(/paramsDeVista:\s*\{([^}]+)\}/)?.[1] ?? "";
    expect(params).toMatch(/tablero:\s*\["sub"\]/);
    expect(params).toMatch(/cumplimiento:\s*\["sub"\]/);
    expect(params).toMatch(/gtf:\s*\["sub",\s*"trabajo"\]/);
  });
});
