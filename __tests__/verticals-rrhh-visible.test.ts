import { describe, expect, it } from "vitest";
import { SUPPORTED_INDUSTRIES, filterTabsForVertical, getVerticalConfig } from "@/lib/verticals/registry";

/*
 * Recursos Humanos (ADR-414) es de todo negocio: una bodega también tiene gente
 * que marca asistencia. El filtro vertical del sidebar oculta EN SILENCIO lo que
 * no está en `enabled` — así se fue RRHH de la barra lateral de escritorio de un
 * negocio «bodega» (2026-09-14) mientras el menú del celular sí lo mostraba.
 */
describe("Recursos Humanos se ve en la barra lateral de todos los rubros", () => {
  it.each(SUPPORTED_INDUSTRIES)("rubro «%s»: rrhh queda visible", (industry) => {
    expect(filterTabsForVertical(industry, ["rrhh"]).visible).toContain("rrhh");
  });

  it("un negocio sin rubro cae en «otro» y también lo ve", () => {
    expect(getVerticalConfig(undefined).industry).toBe("otro");
    expect(filterTabsForVertical(undefined, ["rrhh"]).visible).toContain("rrhh");
  });

  it("ningún rubro lo oculta a propósito", () => {
    for (const industry of SUPPORTED_INDUSTRIES) {
      expect(getVerticalConfig(industry).modules.hidden.map(String)).not.toContain("rrhh");
    }
  });
});

describe("Tareas se ve en la barra lateral de todos los rubros", () => {
  // Misma causa que RRHH: la categoría «Equipo» sólo trae `tareas` y no estaba en
  // ninguna lista del registro, así que el filtro vertical la ocultaba (2026-09-14).
  it.each(SUPPORTED_INDUSTRIES)("rubro «%s»: tareas queda visible", (industry) => {
    expect(filterTabsForVertical(industry, ["tareas"]).visible).toContain("tareas");
  });
});
