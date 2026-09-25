/**
 * Documento imprimible del RNPF (ADR-380) — el papel que se presenta ante la
 * ARFFS. Lo que se testea: que nunca se filtre "undefined"/"null" al papel
 * (un dato vacío se ve vacío, no como un bug de JS), que el encabezado y la
 * declaración jurada mantengan el texto oficial, y que Inscripción/Actualización
 * se marquen sin ambigüedad.
 */
import { describe, expect, it } from "vitest";
import { buildPlantacionHtml } from "@/lib/forestal/plantacion-print";
import type { PlantacionInput } from "@/lib/forestal/plantacion-tramite";

const base: PlantacionInput = {
  tipoTramite: "inscripcion",
  bloques: [],
};

describe("buildPlantacionHtml", () => {
  it("nunca filtra undefined/null al HTML — un campo vacío se ve vacío, no como bug", () => {
    const html = buildPlantacionHtml({ datos: base, codigoInterno: "RPF-2026-0001" });
    expect(html).not.toMatch(/undefined/);
    expect(html).not.toMatch(/\bnull\b/);
  });

  it("trae el encabezado oficial completo (el CSS lo pasa a mayúsculas, el texto fuente va en oración)", () => {
    const html = buildPlantacionHtml({ datos: base, codigoInterno: "RPF-2026-0001" });
    expect(html.toUpperCase()).toContain("FORMATO ÚNICO PARA LA INSCRIPCIÓN/ACTUALIZACIÓN DE PLANTACIONES");
    expect(html.toUpperCase()).toContain("REGISTRO NACIONAL DE PLANTACIONES FORESTALES");
  });

  it("marca Inscripción o Actualización sin ambigüedad (nunca las dos a la vez)", () => {
    const inscripcion = buildPlantacionHtml({ datos: { ...base, tipoTramite: "inscripcion" }, codigoInterno: "RPF-2026-0001" });
    const onInscripcion = (inscripcion.match(/class="rpf-tipo on"/g) ?? []).length + (inscripcion.match(/"on">Inscripción/g) ?? []).length;
    expect(inscripcion).toMatch(/on">Inscripción/);
    expect(inscripcion).not.toMatch(/on">Actualización/);

    const actualizacion = buildPlantacionHtml({ datos: { ...base, tipoTramite: "actualizacion" }, codigoInterno: "RPF-2026-0001" });
    expect(actualizacion).toMatch(/on">Actualización/);
    expect(actualizacion).not.toMatch(/on">Inscripción/);
  });

  it("el código interno siempre se marca como administrativo, distinto del SERFOR", () => {
    const html = buildPlantacionHtml({ datos: base, codigoInterno: "RPF-2026-0001" });
    expect(html).toContain("RPF-2026-0001");
    expect(html).toContain("NO es el código SERFOR");
  });

  it("nunca inventa un código SERFOR si no se declaró", () => {
    const html = buildPlantacionHtml({ datos: base, codigoInterno: "RPF-2026-0001" });
    expect(html).not.toContain("Código de Plantación SERFOR");
  });

  it("muestra el código SERFOR cuando el usuario lo declaró", () => {
    const html = buildPlantacionHtml({ datos: { ...base, codigoPlantacionSerfor: "22-SAM/REG-PLT-2024-032" }, codigoInterno: "RPF-2026-0001" });
    expect(html).toContain("22-SAM/REG-PLT-2024-032");
  });

  it("la declaración jurada conserva las tres obligaciones del texto oficial", () => {
    const html = buildPlantacionHtml({ datos: base, codigoInterno: "RPF-2026-0001" });
    expect(html).toContain("artículo 34 del TUO de la Ley N° 27444");
    expect(html).toContain("visitas inspectivas");
    expect(html).toContain("cambio de la titularidad de la plantación");
  });

  it("una especie CITES dispara el aviso en el bloque que la tiene", () => {
    const datos: PlantacionInput = {
      ...base,
      bloques: [
        {
          numero: 1,
          vertices: [],
          especies: [{ nombreComun: "Caoba", nombreCientifico: "Swietenia macrophylla", cites: true, citesProcedencia: "Vivero certificado XYZ" }],
        },
      ],
    };
    const html = buildPlantacionHtml({ datos, codigoInterno: "RPF-2026-0001" });
    expect(html).toContain("CITES");
    expect(html).toContain("Vivero certificado XYZ");
  });
});
