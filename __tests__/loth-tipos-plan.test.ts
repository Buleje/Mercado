/**
 * Los documentos de gestión forestal y sus reglas.
 *
 * Verificado contra la Directiva RJ 001-2018-OSINFOR y el D.S. 018-2015-MINAGRI:
 * cada sigla corresponde a un título habilitante distinto, no son variantes de
 * lo mismo.
 */

import { describe, it, expect } from "vitest";
import {
  TIPOS_PLAN,
  TIPOS_PLAN_LISTA,
  metaDe,
  pideCampo,
  especialidadSugerida,
  plazoInformeEjecucion,
  DIAS_INFORME_EJECUCION,
} from "@/lib/forestal/loth-tipos-plan";

describe("catálogo de tipos", () => {
  it("están los cinco que se gestionan desde la pantalla", () => {
    expect(TIPOS_PLAN).toEqual(["PGMF", "PO", "PMFI", "DEMA", "PLANTACION"]);
    expect(TIPOS_PLAN_LISTA).toHaveLength(5);
  });

  it("cada tipo dice para qué título habilitante es — es lo que el ingeniero reconoce", () => {
    expect(metaDe("PGMF").para).toContain("Concesiones");
    expect(metaDe("PO").para).toContain("concesión");
    expect(metaDe("PMFI").para).toContain("predios privados");
    expect(metaDe("DEMA").para).toContain("comunidades");
    expect(metaDe("PLANTACION").para).toContain("Plantaciones");
  });

  it("ninguno queda sin ayuda ni sin nombre completo", () => {
    for (const m of TIPOS_PLAN_LISTA) {
      expect(m.nombre.length).toBeGreaterThan(5);
      expect(m.ayuda.length).toBeGreaterThan(20);
    }
  });

  it("un tipo desconocido no rompe la pantalla: cae en PO", () => {
    expect(metaDe("XX").key).toBe("PO");
    expect(metaDe(null).key).toBe("PO");
    expect(metaDe(undefined).key).toBe("PO");
  });

  it("acepta la sigla en minúscula (viene así de una importación vieja)", () => {
    expect(metaDe("dema").key).toBe("DEMA");
  });
});

describe("campos por tipo — no se piden datos que no existen para ese documento", () => {
  it("una plantación no tiene parcela de corta ni título habilitante de bosque", () => {
    expect(pideCampo("PLANTACION", "parcelaCorta")).toBe(false);
    expect(pideCampo("PLANTACION", "tituloHabilitante")).toBe(false);
  });

  it("el PGMF es el marco: la parcela de corta es del Plan Operativo", () => {
    expect(pideCampo("PGMF", "parcelaCorta")).toBe(false);
    expect(pideCampo("PO", "parcelaCorta")).toBe(true);
  });

  it("PMFI y DEMA sí usan los dos", () => {
    for (const t of ["PMFI", "DEMA"]) {
      expect(pideCampo(t, "parcelaCorta")).toBe(true);
      expect(pideCampo(t, "tituloHabilitante")).toBe(true);
    }
  });
});

describe("regente forestal", () => {
  it("concesiones y predios privados lo exigen", () => {
    expect(metaDe("PGMF").regente).toBe("obligatorio");
    expect(metaDe("PO").regente).toBe("obligatorio");
    expect(metaDe("PMFI").regente).toBe("obligatorio");
  });

  it("en DEMA es según el caso, no siempre", () => {
    expect(metaDe("DEMA").regente).toBe("segun_caso");
  });

  it("la especialidad se sugiere según el documento (Registro Nacional de Regentes)", () => {
    expect(especialidadSugerida("PLANTACION")).toBe("plantaciones");
    expect(especialidadSugerida("PO")).toBe("maderable");
  });
});

describe("plazo del informe de ejecución (45 días de la Directiva OSINFOR)", () => {
  const HOY = new Date("2026-09-21T00:00:00.000Z");

  it("no cuenta plazo si el año operativo todavía no terminó", () => {
    expect(plazoInformeEjecucion("2026-12-31", HOY)).toBeNull();
  });

  it("terminado el año operativo, vence a los 45 días", () => {
    const p = plazoInformeEjecucion("2026-09-01", HOY);
    expect(p).not.toBeNull();
    expect(p!.diasRestantes).toBe(DIAS_INFORME_EJECUCION - 20);
    expect(p!.estado).toBe("en_plazo");
  });

  it("a diez días o menos avisa", () => {
    const p = plazoInformeEjecucion("2026-08-10", HOY);
    expect(p!.estado).toBe("por_vencer");
  });

  it("pasados los 45 días está vencido y lo dice con días negativos", () => {
    const p = plazoInformeEjecucion("2026-07-01", HOY);
    expect(p!.estado).toBe("vencido");
    expect(p!.diasRestantes).toBeLessThan(0);
  });

  it("sin fecha, o con una ilegible, no inventa un plazo", () => {
    expect(plazoInformeEjecucion(null, HOY)).toBeNull();
    expect(plazoInformeEjecucion("mañana", HOY)).toBeNull();
  });
});
