import { describe, it, expect } from "vitest";
import { seccionesDossier, armarDossier, type DatosDossier } from "@/lib/forestal/ctp-dossier";

const base: DatosDossier = {
  ficha: { razonSocial: "Maderera del Ucayali SAC", ruc: "20601234567", codigoCtp: "CTP-025" },
  periodoLabel: "Julio 2026",
  score: 90,
  ingresos: [],
  produccion: [],
  despachos: [],
  saldos: [],
  guias: [],
  anexos: [],
  pendientes: [],
  emitidoEn: new Date("2026-07-28T12:00:00.000Z"),
};

const linea = (over = {}) => ({
  section: "ingreso",
  entryDate: new Date("2026-07-15T00:00:00.000Z"),
  gtfNumber: "001-0000122",
  speciesCommon: "Tornillo",
  productType: "Trozas",
  quantity: 9,
  unit: "pz",
  volumeM3: 6.8,
  ...over,
});

describe("seccionesDossier", () => {
  it("arma las 6 secciones numeradas en orden de revisión", () => {
    const s = seccionesDossier(base);
    expect(s.map((x) => x.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(s[0].titulo).toContain("Ingresos");
    expect(s[2].titulo).toContain("Despachos");
    expect(s[5].titulo).toContain("Anexos");
  });

  it("una sección vacía se declara, no se omite", () => {
    const s = seccionesDossier(base);
    expect(s).toHaveLength(6);
    expect(s[0].registros).toBe(0);
    expect(s[0].html).toContain("Sin ingresos registrados");
  });

  it("cuenta los registros de cada sección", () => {
    const s = seccionesDossier({ ...base, ingresos: [linea(), linea()], despachos: [linea()] });
    expect(s[0].registros).toBe(2);
    expect(s[2].registros).toBe(1);
  });

  it("marca el saldo negativo (es EL hallazgo de una fiscalización)", () => {
    const s = seccionesDossier({
      ...base,
      saldos: [{ label: "Tornillo", ingresoM3: 5, consumidoM3: 8, saldoM3: -3 }],
    });
    expect(s[3].html).toContain('class="neg"');
  });

  it("un saldo positivo no se marca", () => {
    const s = seccionesDossier({
      ...base,
      saldos: [{ label: "Tornillo", ingresoM3: 8, consumidoM3: 5, saldoM3: 3 }],
    });
    expect(s[3].html).not.toContain('class="neg"');
  });

  it("las fechas date-only no se corren un día (timeZone UTC)", () => {
    const s = seccionesDossier({ ...base, ingresos: [linea()] });
    expect(s[0].html).toContain("15/07/2026");
  });

  it("escapa el contenido para que un nombre con < > no rompa el documento", () => {
    const s = seccionesDossier({ ...base, ingresos: [linea({ speciesCommon: "<script>x</script>" })] });
    expect(s[0].html).not.toContain("<script>");
    expect(s[0].html).toContain("&lt;script&gt;");
  });
});

describe("armarDossier", () => {
  it("incluye portada, identidad e índice", () => {
    const html = armarDossier(base);
    expect(html).toContain("Carpeta de fiscalización");
    expect(html).toContain("Maderera del Ucayali SAC");
    expect(html).toContain("Julio 2026");
    expect(html).toContain("Contenido");
  });

  it("muestra el score cuando lo hay", () => {
    expect(armarDossier(base)).toContain("90/100");
  });

  it("sin pendientes lo dice explícitamente", () => {
    expect(armarDossier(base)).toContain("Sin pendientes abiertos");
  });

  it("los pendientes se declaran en la portada", () => {
    const html = armarDossier({
      ...base,
      pendientes: [{ titulo: "Guías del monte sin ingresar", cantidad: 2 }],
    });
    expect(html).toContain("Guías del monte sin ingresar");
    expect(html).toContain("<strong>2</strong>");
  });

  it("cada sección arranca en página nueva", () => {
    const html = armarDossier(base);
    expect(html.match(/class="seccion"/g) ?? []).toHaveLength(6);
  });
});

/**
 * Sección 2 (Consumos) y Apartado 2 (Retrozado) en la carpeta de fiscalización.
 *
 * Son OPCIONALES a propósito: `undefined` = no se consultó y la sección no sale;
 * `[]` = se consultó y no hubo. Una carpeta que afirma "sin consumos" cuando en
 * realidad nadie preguntó es una declaración falsa ante la autoridad.
 */
describe("Consumos y Retrozado en el dossier", () => {
  const consumo = {
    nro: 1,
    fecha: "2026-07-30T00:00:00.000Z",
    tipoProducto: "rolliza",
    especieComun: "Tornillo",
    especieCientifica: "Cedrelinga catenaeformis",
    codigoOrigen: "POA-118",
    fuenteOrigen: "RD-549",
    unidad: "m3",
    cantidad: 8.45,
    lote: "",
    observaciones: "Corrida #1",
    gtf: "001-0000120",
    woodEntryId: "w1",
    corridaId: "c1",
  };
  const retrozo = {
    nro: 1,
    fecha: "2026-07-14",
    codigoOrigen: "52/A",
    volumenInicial: 3.268,
    codigoRetrozado: "52/A-1",
    nombreComun: "Sapotillo",
    nombreCientifico: "Matisia bicolor Ducke",
    diametroMayorCm: 73,
    diametroMenorCm: 66,
    longitudM: 4.8,
    volumenFinal: 1.8209,
    descarte: false,
    observaciones: "",
    gtf: "019-0000003",
  };

  it("sin consultar, la carpeta sigue teniendo sus 6 secciones", () => {
    expect(seccionesDossier(base)).toHaveLength(6);
  });

  it("consultadas y vacías, se declaran", () => {
    const s = seccionesDossier({ ...base, consumos: [], retrozos: [] });
    expect(s).toHaveLength(8);
    expect(s.find((x) => x.titulo.includes("Consumos"))?.html).toContain("Sin consumos atribuidos");
    expect(s.find((x) => x.titulo.includes("Retrozado"))?.html).toContain("Sin retrozado registrado");
  });

  it("van en el orden en que pasan las cosas: ingreso → retrozado → consumo → producción", () => {
    const s = seccionesDossier({ ...base, consumos: [consumo], retrozos: [retrozo] });
    const orden = s.map((x) => x.titulo);
    expect(orden[0]).toContain("Ingresos");
    expect(orden[1]).toContain("Retrozado");
    expect(orden[2]).toContain("Consumos");
    expect(orden[3]).toContain("Producción");
    // La numeración se recalcula: el índice de la portada no puede saltearse un número.
    expect(s.map((x) => x.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("muestra de qué guía salió cada consumo", () => {
    const s = seccionesDossier({ ...base, consumos: [consumo] });
    const sec = s.find((x) => x.titulo.includes("Consumos"))!;
    expect(sec.registros).toBe(1);
    expect(sec.html).toContain("001-0000120");
    expect(sec.html).toContain("8.450");
  });

  it("marca el descarte del retrozado: es volumen que no vuelve como producto", () => {
    const s = seccionesDossier({
      ...base,
      retrozos: [{ ...retrozo, descarte: true, observaciones: "punta podrida" }],
    });
    const sec = s.find((x) => x.titulo.includes("Retrozado"))!;
    expect(sec.html).toContain("DESCARTE");
    expect(sec.html).toContain('class="neg"');
  });
});
