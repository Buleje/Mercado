import { describe, expect, it } from "vitest";
import {
  htmlListaTrozas,
  piezasListadas,
  subtotalesPorEspecie,
  totalListado,
  type TrozaListada,
} from "@/lib/forestal/ctp-lista-trozas";

const troza = (over: Partial<TrozaListada> = {}): TrozaListada => ({
  codificacion: "106/B",
  especieComun: "Copaiba",
  especieCientifica: "Copaifera reticulata Ducke",
  producto: "Madera en rollo",
  d1Cm: 105, d2Cm: 101, largoM: 6.16,
  cantidad: 1, volumenM3: 5.133,
  ...over,
});

const base = { titular: "COMUNIDAD NATIVA SAN LUIS", numero: "0000004", trozas: [] as TrozaListada[] };

describe("totalListado", () => {
  it("suma lo LISTADO, que es lo que se está movilizando", () => {
    const t = totalListado([troza({ volumenM3: 5.133 }), troza({ volumenM3: 5.474 }), troza({ volumenM3: 2.704 })]);
    expect(t).toBe(13.311);
  });

  it("una troza sin volumen no rompe el total", () => {
    expect(totalListado([troza({ volumenM3: 2.5 }), troza({ volumenM3: null })])).toBe(2.5);
  });

  it("sin trozas el total es 0, no NaN", () => {
    expect(totalListado([])).toBe(0);
  });
});

describe("htmlListaTrozas", () => {
  it("NO recalcula el volumen: imprime el que declaró el libro", () => {
    // Si acá se volviera a aplicar Huber, un redondeo distinto haría que la
    // lista y el Libro dijeran volúmenes distintos de la misma pieza — que es
    // exactamente el cruce que hace un fiscalizador.
    const html = htmlListaTrozas({ ...base, trozas: [troza({ volumenM3: 9.999, d1Cm: 105, d2Cm: 101, largoM: 6.16 })] });
    expect(html).toContain("9.999");
    expect(html).not.toContain("5.133");
  });

  it("numera las filas y trae los casilleros del formato", () => {
    const html = htmlListaTrozas({ ...base, trozas: [troza(), troza({ codificacion: "14/A" })] });
    for (const c of ["(2) Codificación", "(3) Dimensiones", "(4) D1", "(5) D2", "(6) L", "(7)"]) {
      expect(html).toContain(c);
    }
    expect(html).toContain("LISTA ID: 0000004");
  });

  it("las dimensiones van con la precisión de cada una: cm con 1, largo con 2", () => {
    const html = htmlListaTrozas({ ...base, trozas: [troza({ d1Cm: 72, d2Cm: 58, largoM: 8.15 })] });
    expect(html).toContain(">72.0<");
    expect(html).toContain(">58.0<");
    expect(html).toContain(">8.15<");
  });

  it("una medida ausente queda en blanco, no en 0 — un 0 afirma que se midió", () => {
    const html = htmlListaTrozas({ ...base, trozas: [troza({ d1Cm: null, largoM: null })] });
    expect(html).not.toContain(">0.0<");
  });

  it("sin trozas lo dice, en vez de una tabla vacía que parece un error", () => {
    expect(htmlListaTrozas(base)).toContain("Sin trozas listadas");
  });

  it("escapa el contenido: una especie con < no rompe el documento", () => {
    const html = htmlListaTrozas({ ...base, trozas: [troza({ especieComun: "<script>x</script>" })] });
    expect(html).not.toContain("<script>x");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("subtotalesPorEspecie — el cruce contra el (37) de la guía", () => {
  it("agrupa por especie y ordena de mayor a menor volumen", () => {
    const s = subtotalesPorEspecie([
      troza({ especieComun: "Copaiba", volumenM3: 2 }),
      troza({ especieComun: "Tornillo", especieCientifica: "Cedrelinga cateniformis", volumenM3: 9 }),
      troza({ especieComun: "Copaiba", volumenM3: 3 }),
    ]);
    expect(s.map((x) => x.especie)).toEqual(["Tornillo", "Copaiba"]);
    expect(s[0]).toMatchObject({ piezas: 1, volumenM3: 9, cientifico: "Cedrelinga cateniformis" });
    expect(s[1]).toMatchObject({ piezas: 2, volumenM3: 5 });
  });

  it("una troza sin especie declarada no se pierde: se agrupa aparte", () => {
    const s = subtotalesPorEspecie([troza({ especieComun: null, especieCientifica: null, volumenM3: 4 })]);
    expect(s).toHaveLength(1);
    expect(s[0].especie).toBe("Sin especie declarada");
  });

  it("las piezas salen de la CANTIDAD de la fila, no de contar filas", () => {
    expect(piezasListadas([troza({ cantidad: 3 }), troza({ cantidad: 2 })])).toBe(5);
    // Sin cantidad declarada, una fila es una pieza.
    expect(piezasListadas([troza({ cantidad: null })])).toBe(1);
  });
});

describe("el resumen por especie sólo aparece cuando informa algo", () => {
  it("con una sola especie no se dibuja: repetiría el total de abajo", () => {
    const html = htmlListaTrozas({ ...base, trozas: [troza(), troza()] });
    expect(html).not.toContain("Resumen por especie");
  });

  it("con dos o más, sí — y con el porcentaje de cada una", () => {
    const html = htmlListaTrozas({
      ...base,
      trozas: [troza({ volumenM3: 3 }), troza({ especieComun: "Tornillo", volumenM3: 1 })],
    });
    expect(html).toContain("Resumen por especie");
    expect(html).toContain("75.0");
  });
});
