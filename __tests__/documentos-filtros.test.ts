import { describe, it, expect } from "vitest";
import {
  cumpleFiltros, cuantosFiltrosActivos, familiasPresentes, FILTROS_VACIOS,
  type DocFiltrable, type FiltrosDoc,
} from "@/lib/documentos/filtros-doc";

/**
 * Los filtros deciden qué archivos VE la persona. Si se equivocan, un documento
 * que existe parece perdido — que es peor que no tener filtro.
 */

const AHORA = new Date("2026-07-28T15:00:00.000Z");

function doc(over: Partial<DocFiltrable> = {}): DocFiltrable {
  return {
    name: "boleta.pdf",
    mimeType: "application/pdf",
    size: 500 * 1024,
    uploadedAt: "2026-07-28T09:00:00.000Z",
    expiresAt: null,
    ...over,
  };
}

const con = (parcial: Partial<FiltrosDoc>): FiltrosDoc => ({ ...FILTROS_VACIOS, ...parcial });

describe("filtro por tipo de archivo", () => {
  it("sin tipos elegidos, pasa todo", () => {
    expect(cumpleFiltros(doc(), FILTROS_VACIOS, AHORA)).toBe(true);
    expect(cumpleFiltros(doc({ name: "x.zip", mimeType: "application/zip" }), FILTROS_VACIOS, AHORA)).toBe(true);
  });

  it("deja pasar sólo el tipo elegido", () => {
    const soloPdf = con({ familias: ["pdf"] });
    expect(cumpleFiltros(doc(), soloPdf, AHORA)).toBe(true);
    expect(cumpleFiltros(doc({ name: "precios.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), soloPdf, AHORA)).toBe(false);
  });

  it("varios tipos a la vez son un O, no un Y", () => {
    const f = con({ familias: ["pdf", "planilla"] });
    expect(cumpleFiltros(doc(), f, AHORA)).toBe(true);
    expect(cumpleFiltros(doc({ name: "a.csv", mimeType: "text/csv" }), f, AHORA)).toBe(true);
    expect(cumpleFiltros(doc({ name: "foto.jpg", mimeType: "image/jpeg" }), f, AHORA)).toBe(false);
  });

  it("un .json cae en documentos de texto, no en 'otros'", () => {
    const f = con({ familias: ["texto"] });
    expect(cumpleFiltros(doc({ name: "config.json", mimeType: "application/json" }), f, AHORA)).toBe(true);
  });
});

describe("filtro por peso", () => {
  const MB = 1024 * 1024;
  it("los cortes no se pisan ni dejan huecos", () => {
    const casos: [number, "chico" | "mediano" | "grande"][] = [
      [500 * 1024, "chico"],
      [MB, "mediano"],
      [10 * MB, "mediano"],
      [10 * MB + 1, "grande"],
    ];
    for (const [size, esperado] of casos) {
      for (const filtro of ["chico", "mediano", "grande"] as const) {
        expect(
          cumpleFiltros(doc({ size }), con({ peso: filtro }), AHORA),
          `${size} bytes con filtro ${filtro}`,
        ).toBe(filtro === esperado);
      }
    }
  });
});

describe("filtro por fecha de subida", () => {
  /**
   * Las fechas se comparan en hora LOCAL, que es la que ve la persona. Los
   * casos se arman con horas locales explícitas y no con textos en UTC: en
   * Perú (UTC-5) un "2026-07-28T02:00Z" es en realidad ayer a las 9 de la
   * noche, y un test escrito así estaría midiendo el huso horario, no el
   * filtro.
   */
  const local = (y: number, m: number, d: number, h: number) =>
    new Date(y, m - 1, d, h, 0, 0).toISOString();

  it("'hoy' arranca a la medianoche local, no 24 horas atrás", () => {
    const estaManana = doc({ uploadedAt: local(2026, 7, 28, 8) });
    const ayerDeNoche = doc({ uploadedAt: local(2026, 7, 27, 21) });
    expect(cumpleFiltros(estaManana, con({ subido: "hoy" }), AHORA)).toBe(true);
    expect(cumpleFiltros(ayerDeNoche, con({ subido: "hoy" }), AHORA)).toBe(false);
  });

  it("'este mes' arranca el día 1, no 30 días atrás", () => {
    expect(cumpleFiltros(doc({ uploadedAt: local(2026, 7, 1, 10) }), con({ subido: "mes" }), AHORA)).toBe(true);
    expect(cumpleFiltros(doc({ uploadedAt: local(2026, 6, 30, 10) }), con({ subido: "mes" }), AHORA)).toBe(false);
  });

  it("'este año' deja fuera el año pasado", () => {
    expect(cumpleFiltros(doc({ uploadedAt: local(2026, 1, 2, 10) }), con({ subido: "anio" }), AHORA)).toBe(true);
    expect(cumpleFiltros(doc({ uploadedAt: local(2025, 12, 31, 10) }), con({ subido: "anio" }), AHORA)).toBe(false);
  });
});

describe("filtro por vencimiento", () => {
  it("distingue vencido de por vencer, sin superponerlos", () => {
    const vencido = doc({ expiresAt: "2026-07-20T00:00:00.000Z" });
    const porVencer = doc({ expiresAt: "2026-08-10T00:00:00.000Z" });
    const lejano = doc({ expiresAt: "2027-01-01T00:00:00.000Z" });

    expect(cumpleFiltros(vencido, con({ vencimiento: "vencidos" }), AHORA)).toBe(true);
    expect(cumpleFiltros(vencido, con({ vencimiento: "por-vencer" }), AHORA)).toBe(false);
    expect(cumpleFiltros(porVencer, con({ vencimiento: "por-vencer" }), AHORA)).toBe(true);
    expect(cumpleFiltros(porVencer, con({ vencimiento: "vencidos" }), AHORA)).toBe(false);
    expect(cumpleFiltros(lejano, con({ vencimiento: "por-vencer" }), AHORA)).toBe(false);
  });

  it("separa los que tienen fecha de los que no", () => {
    const sin = doc({ expiresAt: null });
    const conFecha = doc({ expiresAt: "2027-01-01T00:00:00.000Z" });
    expect(cumpleFiltros(sin, con({ vencimiento: "sin-fecha" }), AHORA)).toBe(true);
    expect(cumpleFiltros(conFecha, con({ vencimiento: "sin-fecha" }), AHORA)).toBe(false);
    expect(cumpleFiltros(conFecha, con({ vencimiento: "con-fecha" }), AHORA)).toBe(true);
    expect(cumpleFiltros(sin, con({ vencimiento: "con-fecha" }), AHORA)).toBe(false);
  });

  it("un archivo sin fecha nunca aparece como vencido", () => {
    expect(cumpleFiltros(doc({ expiresAt: null }), con({ vencimiento: "vencidos" }), AHORA)).toBe(false);
  });
});

describe("los filtros se combinan", () => {
  it("hay que cumplir todos los grupos, no alguno", () => {
    const f = con({ familias: ["pdf"], peso: "chico", subido: "hoy" });
    expect(cumpleFiltros(doc(), f, AHORA)).toBe(true);
    // El mismo documento pero pesado ya no entra.
    expect(cumpleFiltros(doc({ size: 20 * 1024 * 1024 }), f, AHORA)).toBe(false);
  });
});

describe("cuantosFiltrosActivos", () => {
  it("cuenta grupos, no opciones: tres tipos siguen siendo un filtro", () => {
    expect(cuantosFiltrosActivos(FILTROS_VACIOS)).toBe(0);
    expect(cuantosFiltrosActivos(con({ familias: ["pdf", "planilla", "texto"] }))).toBe(1);
    expect(cuantosFiltrosActivos(con({ familias: ["pdf"], peso: "chico", vencimiento: "vencidos" }))).toBe(3);
  });
});

describe("familiasPresentes", () => {
  it("sólo devuelve lo que hay, ordenado por cuántos son", () => {
    const docs = [
      doc(),
      doc({ name: "b.pdf" }),
      doc({ name: "c.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    ];
    const presentes = familiasPresentes(docs);
    expect(presentes).toEqual([
      { familia: "pdf", cuantos: 2 },
      { familia: "planilla", cuantos: 1 },
    ]);
    expect(presentes.some((p) => p.familia === "video")).toBe(false);
  });

  it("sin documentos no ofrece ningún tipo", () => {
    expect(familiasPresentes([])).toEqual([]);
  });
});
