import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parsearConsultaGtf } from "@/lib/forestal/serfor-gtf";
import {
  coincidenciasDe,
  guiaQueCorresponde,
  leerQrDeGuia,
  siguienteGuiaPendiente,
  medidasDeLaGuia,
  numeroRegistroDesdeTexto,
  planearMedidasDesdeGuia,
  relacionDeGuias,
  relacionPermiteAplicar,
  type TrozaDelLibro,
} from "@/lib/forestal/medidas-desde-guia";

/* La ficha REAL de `1-19-0313629` (guía 019-0000003, la que calibró el parser):
   bajada de nuevo el 05-10 y es idéntica a este fixture —
   106/C 100×96×6.5 · 13/A (0000008) 55×51×7.28 · 26/A 93×90×6.33 · 52/A 73×58×9.7. */
const html = readFileSync(join(__dirname, "fixtures", "serfor-gtf-encontrada.html"), "utf8");
const ficha = parsearConsultaGtf(html, "1-19-0313629").gtf!;

const troza = (id: string, codificacion: string | null, extra: Partial<TrozaDelLibro> = {}): TrozaDelLibro => ({
  id, codificacion, d1Cm: null, d2Cm: null, largoM: null, periodoCerrado: null, anulada: false, ...extra,
});

describe("planearMedidasDesdeGuia con la ficha real 1-19-0313629", () => {
  it("la ficha trae 4 trozas con dimensiones", () => {
    expect(ficha.gtfNumber).toBe("019-0000003");
    expect(ficha.trozas.map((t) => t.codificacion)).toEqual(["106/C", "13/A (0000008)", "26/A", "52/A"]);
  });

  it("cruza exacto y flexible (guion, sin barra, paréntesis del precinto) y llena D1/D2 del alta", () => {
    const p = planearMedidasDesdeGuia(
      [troza("a", "106-C", { largoM: 6.5 }), troza("b", "13A"), troza("c", " 26/a "), troza("d", "52/A", { largoM: 9.6 })],
      ficha.trozas,
    );
    expect(p.llenar.map((f) => [f.id, f.coincidencia, f.d1, f.d2, f.diametro, f.largo])).toEqual([
      ["a", "flexible", 100, 96, 98, 6.5],
      ["b", "flexible", 55, 51, 53, 7.28],
      ["c", "exacta", 93, 90, 91.5, 6.33],
      ["d", "exacta", 73, 58, 65.5, 9.7],
    ]);
    expect(p.llenar[1].codigoGuia).toBe("13/A (0000008)");
    expect(p.llenar[0].dimensiones).toBe("100.0 X 96.0 X 6.5");
    expect(p.sinCoincidencia).toEqual({ libro: [], guia: [] });
    expect(coincidenciasDe(p)).toBe(4);
  });

  it("códigos de otra carga (main QA-SEM-001): 0 coincidencias, las dos listas sin pareja", () => {
    const libro = Array.from({ length: 8 }, (_, i) => troza(`q${i}`, `QA-SEM-001/${i + 1}`, { d1Cm: 50, d2Cm: 48 }));
    const p = planearMedidasDesdeGuia(libro, ficha.trozas);
    expect(coincidenciasDe(p)).toBe(0);
    expect(p.llenar).toHaveLength(0);
    expect(p.sinCoincidencia.libro).toHaveLength(8);
    expect(p.sinCoincidencia.guia).toEqual(["106/C", "13/A (0000008)", "26/A", "52/A"]);
  });

  it("nunca pisa: con una punta anotada (guía o planta) va a yaTenian", () => {
    const p = planearMedidasDesdeGuia([troza("a", "26/A", { d1Cm: 92 }), troza("b", "52/A", { d2Cm: 57 })], ficha.trozas);
    expect(p.llenar).toHaveLength(0);
    expect(p.yaTenian.map((y) => y.id)).toEqual(["a", "b"]);
  });

  it("largo que no cuadra (> 30 cm) no se llena: otra pieza o se cortó", () => {
    const p = planearMedidasDesdeGuia([troza("a", "52/A", { largoM: 7.75 }), troza("b", "26/A", { largoM: 6.1 })], ficha.trozas);
    expect(p.largoDistinto).toEqual([{ id: "a", codificacion: "52/A", largoLibro: 7.75, largoGuia: 9.7 }]);
    expect(p.llenar.map((f) => f.id)).toEqual(["b"]);
  });

  it("mes cerrado y guía anulada quedan bloqueadas", () => {
    const p = planearMedidasDesdeGuia(
      [troza("a", "26/A", { periodoCerrado: "setiembre 2026" }), troza("b", "52/A", { anulada: true })],
      ficha.trozas,
    );
    expect(p.bloqueadas.map((b) => [b.id, b.motivo])).toEqual([
      ["a", "mes cerrado (setiembre 2026)"],
      ["b", "el ingreso está anulado"],
    ]);
    expect(p.llenar).toHaveLength(0);
  });
});

describe("planearMedidasDesdeGuia: lo que no se adivina", () => {
  it("dos candidatas en forma flexible = ambigua, no se empareja ni cuenta como sin pareja", () => {
    const guia = [
      { codificacion: "62-B", dimensiones: "76 X 74 X 7.75" },
      { codificacion: "62/B", dimensiones: "70 X 68 X 6.00" },
      { codificacion: "85B", dimensiones: "60 X 58 X 5.00" },
    ];
    const p = planearMedidasDesdeGuia([troza("a", "62B"), troza("b", "85B")], guia);
    expect(p.ambiguas).toEqual([{ codigo: "62B", candidatos: ["62-B", "62/B", "62B"] }]);
    expect(p.llenar.map((f) => f.id)).toEqual(["b"]);
    expect(p.sinCoincidencia).toEqual({ libro: [], guia: [] });
  });

  it("el mismo código dos veces en el libro = ambigua", () => {
    const p = planearMedidasDesdeGuia([troza("a", "116-A"), troza("b", "116-A")], [{ codificacion: "116-A", dimensiones: "64 X 64 X 6.22" }]);
    expect(p.llenar).toHaveLength(0);
    expect(p.ambiguas).toHaveLength(1);
    expect(p.ambiguas[0].codigo).toBe("116-A");
  });

  it("ADR-477: el código único del libro («12A-0001», «13/A (0000008)-0003») empareja flexible con el de la guía", () => {
    const guia = [
      { codificacion: "12A", dimensiones: "55 X 51 X 7" },
      { codificacion: "13/A (0000008)", dimensiones: "40 X 38 X 5" },
    ];
    const p = planearMedidasDesdeGuia([troza("a", "12A-0001"), troza("b", "13/A (0000008)-0003")], guia);
    expect(p.llenar.map((f) => [f.id, f.d1, f.coincidencia, f.codigoGuia])).toEqual([
      ["a", 55, "flexible", "12A"],
      ["b", 40, "flexible", "13/A (0000008)"],
    ]);
  });

  it("la exacta gana: `13/A` y `13A` en la guía, cada una con la suya", () => {
    const guia = [
      { codificacion: "13/A", dimensiones: "55 X 51 X 7" },
      { codificacion: "13A", dimensiones: "40 X 38 X 5" },
    ];
    const p = planearMedidasDesdeGuia([troza("a", "13/A"), troza("b", "13A")], guia);
    expect(p.llenar.map((f) => [f.id, f.d1, f.coincidencia])).toEqual([["a", 55, "exacta"], ["b", 40, "exacta"]]);
  });

  it("código en la guía sin medidas legibles → sinDato (con dos números no se inventa la otra punta)", () => {
    const guia = [
      { codificacion: "241A", dimensiones: "64 X 6.22" },
      { codificacion: "182A", dimensiones: null },
    ];
    const p = planearMedidasDesdeGuia([troza("a", "241A"), troza("b", "182A"), troza("c", null)], guia);
    expect(p.sinDato.map((s) => s.id)).toEqual(["a", "b"]);
    expect(p.sinCoincidencia.libro).toEqual(["(sin código)"]);
  });

  it("medidasDeLaGuia lee D1 × D2 × largo como el alta, con coma decimal", () => {
    expect(medidasDeLaGuia("64 X 64 X 6.22")).toEqual({ d1: 64, d2: 64, diametro: 64, largo: 6.22 });
    expect(medidasDeLaGuia("75,5 x 70 x 7,1")).toEqual({ d1: 75.5, d2: 70, diametro: 72.75, largo: 7.1 });
    expect(medidasDeLaGuia("64 X 6.22")).toBeNull();
    /* Revisión 05-10: en metros o con el largo primero no cabe en una troza → vacío, no D1 = 5 cm. */
    expect(medidasDeLaGuia("5.00 X 0.85 X 0.80")).toBeNull();
    expect(medidasDeLaGuia("105.0 x 101.0 x 6.16")).toEqual({ d1: 105, d2: 101, diametro: 103, largo: 6.16 });
    expect(medidasDeLaGuia("64 X 64 X 62")).toBeNull();
    expect(medidasDeLaGuia("")).toBeNull();
  });
});

describe("relacionDeGuias", () => {
  it("misma, sufijo, distinta y sin número", () => {
    expect(relacionDeGuias("019-0000003", "19-3")).toBe("misma");
    expect(relacionDeGuias("010-001-0000005", "001-0000005")).toBe("sufijo");
    expect(relacionDeGuias("010-001-0000005", "019-0000003")).toBe("distinta");
    expect(relacionDeGuias("QA-SEM-001", "019-0000003")).toBe("distinta");
    expect(relacionDeGuias("010-001-0000005", "0000005")).toBe("distinta");
    expect(relacionDeGuias("010-001-0000005", null)).toBe("sin_numero");
    expect(relacionPermiteAplicar("sufijo")).toBe(true);
    expect(relacionPermiteAplicar("sin_numero")).toBe(false);
  });
});

describe("numeroRegistroDesdeTexto", () => {
  it("acepta el número o el enlace del QR; un enlace sin el parámetro no se adivina", () => {
    expect(numeroRegistroDesdeTexto(" 1-19-0313629 ")).toBe("1-19-0313629");
    expect(
      numeroRegistroDesdeTexto(
        "https://sniffs.serfor.gob.pe/control/gtf/consultas/consultarGtf.do?nuRegistroGuia=1-19-0313629&tipoBusqueda=GTF&tipoSeguimiento=MAP",
      ),
    ).toBe("1-19-0313629");
    expect(numeroRegistroDesdeTexto("https://x.pe/consultas.do?nuRegistroGuia=1%2D19%2D0313629")).toBe("1-19-0313629");
    expect(numeroRegistroDesdeTexto("https://sniffs.serfor.gob.pe/control/gtf/consultas.do")).toBeNull();
    expect(numeroRegistroDesdeTexto("")).toBeNull();
  });
});

describe("ambigua flexible con el código repetido en el libro", () => {
  it("se informa una sola vez, con los candidatos de los dos lados", () => {
    const p = planearMedidasDesdeGuia([troza("a", "62-B"), troza("b", "62 B")], [{ codificacion: "62/B", dimensiones: "76 X 74 X 7.75" }]);
    expect(p.llenar).toHaveLength(0);
    expect(p.ambiguas).toEqual([{ codigo: "62-B", candidatos: ["62/B", "62-B", "62 B"] }]);
    expect(p.sinCoincidencia).toEqual({ libro: [], guia: [] });
  });
});

/* ── El QR de la GTF con la cámara y «guía tras guía» (05-10) ── */

describe("leerQrDeGuia — lo que leyó la cámara", () => {
  it("el enlace de la consulta SNIFFS da el N° de registro", () => {
    expect(
      leerQrDeGuia("https://sniffs.serfor.gob.pe/control/gtf/consultas/consultarGtf.do?nuRegistroGuia=1-19-0313629&tipoBusqueda=GTF&tipoSeguimiento=MAP"),
    ).toEqual({ ok: true, registro: "1-19-0313629" });
    expect(leerQrDeGuia(" 2-17-0002328 ")).toEqual({ ok: true, registro: "2-17-0002328" });
  });
  it("un enlace de SERFOR sin el parámetro, o con basura, no se adivina", () => {
    expect(leerQrDeGuia("https://sniffs.serfor.gob.pe/control/gtf/consultas.do")).toMatchObject({ ok: false, motivo: expect.stringMatching(/sin el N° de registro/) });
    expect(leerQrDeGuia("https://x.pe/c.do?nuRegistroGuia=abc")).toMatchObject({ ok: false });
  });
  it("la etiqueta de una troza, un certificado propio o un número suelto NO son la guía", () => {
    expect(leerQrDeGuia("116-A")).toMatchObject({ ok: false, motivo: expect.stringMatching(/Leí «116-A»/) });
    expect(leerQrDeGuia("12345")).toMatchObject({ ok: false });
    expect(leerQrDeGuia("https://buleje.pe/verificar/ABC123")).toMatchObject({ ok: false, motivo: expect.stringMatching(/este sistema/) });
    expect(leerQrDeGuia("https://otro.com/x")).toMatchObject({ ok: false, motivo: expect.stringMatching(/no es de SERFOR/) });
    expect(leerQrDeGuia("")).toMatchObject({ ok: false });
  });
});

describe("guiaQueCorresponde y siguienteGuiaPendiente", () => {
  const blas = ["010-001-0000005", "010-001-0000009", "010-001-0000014"];
  it("la ficha 001-0000009 es de la 010-001-0000009 (sufijo); sin pareja o con dos, null", () => {
    expect(guiaQueCorresponde(blas, "001-0000009")).toBe("010-001-0000009");
    expect(guiaQueCorresponde(blas, "019-0000003")).toBeNull();
    expect(guiaQueCorresponde(["010-001-0000009", "020-001-0000009"], "001-0000009")).toBeNull();
    expect(guiaQueCorresponde(blas, null)).toBeNull();
  });
  it("pasa a la siguiente sin hacer, da la vuelta y termina en null", () => {
    expect(siguienteGuiaPendiente(blas, blas[0], new Set([blas[0]]))).toBe(blas[1]);
    expect(siguienteGuiaPendiente(blas, blas[2], new Set([blas[2]]))).toBe(blas[0]);
    expect(siguienteGuiaPendiente(blas, blas[1], new Set([blas[0], blas[1]]))).toBe(blas[2]);
    expect(siguienteGuiaPendiente(blas, blas[1], new Set(blas))).toBeNull();
  });
});
