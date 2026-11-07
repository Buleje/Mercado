/**
 * Contrato del cableado documento↔entidad (ADR-502). Lo que se fija y ningún
 * tipo ve: que los papeles sensibles NO los vea el cajero, que el tag de
 * colaborador sea el MISMO que el de asistencia (no partir la identidad), y que
 * las carpetas/segmentos no se rompan con un `/` en el nombre.
 */

import { describe, it, expect } from "vitest";
import {
  tagEntidad,
  esTagDeEntidad,
  rutaCarpetaEntidad,
  segmentoCarpeta,
  etiquetasDeEntidad,
  ROLES_ENTIDAD_SENSIBLE,
} from "@/lib/documentos/enlaces-entidad";
import { tagColaborador } from "@/lib/rrhh/asistencia-fotos";

describe("enlaces-entidad", () => {
  it("los papeles sensibles no los ve el cajero", () => {
    expect(ROLES_ENTIDAD_SENSIBLE).toEqual(["admin", "owner"]);
    expect((ROLES_ENTIDAD_SENSIBLE as readonly string[]).includes("cajero")).toBe(false);
  });

  it("el tag ata el documento a su entidad y se reconoce", () => {
    expect(tagEntidad("tercero", "abc")).toBe("tercero:abc");
    expect(tagEntidad("permiso", " 25-UCA ")).toBe("permiso:25-UCA");
    expect(esTagDeEntidad("tercero:abc")).toBe(true);
    expect(esTagDeEntidad("forestal")).toBe(false);
  });

  it("colaborador reusa el MISMO tag que asistencia (una sola identidad)", () => {
    expect(tagEntidad("colaborador", "col1")).toBe(tagColaborador("col1"));
  });

  it("la carpeta por entidad no se rompe con un / en el nombre", () => {
    expect(rutaCarpetaEntidad("tercero", "ACME SAC")).toEqual(["Terceros", "ACME SAC"]);
    expect(rutaCarpetaEntidad("colaborador", "Juan", "2026-W42")).toEqual(["Equipo", "Pagos", "Juan", "2026-W42"]);
    expect(segmentoCarpeta("a/b\\c")).toBe("a b c");
    expect(segmentoCarpeta("   ")).toBe("Sin nombre");
  });

  it("las etiquetas mezclan humanas (buscar) + la de máquina (atar)", () => {
    const tags = etiquetasDeEntidad("tercero", "abc", "ACME SAC", ["estado de cuenta"]);
    expect(tags).toContain("tercero");
    expect(tags).toContain("estado de cuenta");
    expect(tags).toContain("tercero:abc");
  });
});
