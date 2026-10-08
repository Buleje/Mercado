/**
 * ADR-481 — «Nuevo ingreso › Desde tu Libro TH»: qué guías del TH se listan,
 * cuáles se pueden traer con todo y por qué no las otras. Las reglas son las
 * del pase y de «Recibir» (N° tramo a tramo + dueño, RUC del destinatario,
 * lista de trozas completa).
 */
import { describe, expect, it } from "vitest";
import { cruzarGuiasTh, guiaPorNumero, type GuiaThCruda } from "@/lib/forestal/guias-th-por-ingresar";

const RUC = "20605859438";
const datos = (rucDestino: string) => ({
  titulos: ["19-SEC/REG-PLT-2025-096"],
  propietario: { nombre: "COMUNIDAD NATIVA SAN LUIS", docTipo: "RUC", docNumero: "20111111111" },
  destinatario: { nombre: "INVERSIONES AGROFORESTALES BLAS", docTipo: "RUC", docNumero: rucDestino },
  guia: { distrito: "Masisea", provincia: "Coronel Portillo", departamento: "Ucayali" },
});
const items = [
  { code: "12A (0000001)", species: "Tornillo", volumeM3: 1.25, diamMayorM: 0.8, diamMenorM: 0.7, lengthM: 4 },
  { code: "12B (0000002)", species: "Tornillo", volumeM3: 1.0, diamMayorM: 0.7, diamMenorM: 0.6, lengthM: 4 },
  { code: "7A (0000003)", species: "Shihuahuaco", volumeM3: 2.5, diamMayorM: 1, diamMenorM: 0.9, lengthM: 3.5 },
];

const guia = (o: Partial<GuiaThCruda> = {}): GuiaThCruda => ({
  id: "g1",
  gtfNumber: "019-001-0000001",
  gtfDate: new Date("2026-10-07T00:00:00.000Z"),
  titularName: "COMUNIDAD NATIVA SAN LUIS",
  tituloHabilitante: "19-SEC/REG-PLT-2025-096",
  origen: null,
  items,
  volumenTotalM3: 4.75,
  piezasTotal: 3,
  gtfDatos: datos(RUC),
  createdAt: "2026-10-07T10:00:00.000Z",
  ...o,
});

describe("cruzarGuiasTh", () => {
  it("una guía propia sin ingreso se puede traer con todo: titular, permiso, origen, especies, trozas y m³", () => {
    const r = cruzarGuiasTh({ guias: [guia()], ingresos: [], guardadas: [], rucPropio: RUC });
    expect(r.ingresadas).toEqual([]);
    expect(r.porIngresar).toHaveLength(1);
    const g = r.porIngresar[0];
    expect(g).toMatchObject({
      gtfId: "g1",
      gtfDate: "2026-10-07",
      titular: "COMUNIDAD NATIVA SAN LUIS",
      permiso: "19-SEC/REG-PLT-2025-096",
      origen: "Masisea, Coronel Portillo, Ucayali",
      trozas: 3,
      volumenM3: 4.75,
      guardadaId: null,
      lista: true,
      motivo: null,
    });
    expect(g.especies).toEqual(["Tornillo", "Shihuahuaco"]);
  });

  it("ya entró: un ingreso vivo con el mismo N° escrito distinto (tramo a tramo) y del mismo permiso", () => {
    const r = cruzarGuiasTh({
      guias: [guia()],
      ingresos: [{ gtfNumber: "19-1-1", providerName: "CCNN SAN LUIS", originCode: "19-SEC/REG-PLT-2025-096" }],
      guardadas: [],
      rucPropio: RUC,
    });
    expect(r.porIngresar).toEqual([]);
    expect(r.ingresadas).toEqual([{ gtfId: "g1", gtfNumber: "019-001-0000001" }]);
  });

  it("el mismo N° de OTRO titular y OTRO permiso no es esta guía: sigue por ingresar", () => {
    const r = cruzarGuiasTh({
      guias: [guia()],
      ingresos: [{ gtfNumber: "019-001-0000001", providerName: "MADERERA EL AGUAJAL SAC", originCode: "17-CPO/C-J-001-02" }],
      guardadas: [],
      rucPropio: RUC,
    });
    expect(r.porIngresar).toHaveLength(1);
    expect(r.ingresadas).toEqual([]);
  });

  it("la guardada del mismo dueño se reusa; la de otro titular con el mismo N° frena con su motivo", () => {
    const mia = cruzarGuiasTh({
      guias: [guia()],
      ingresos: [],
      guardadas: [{ id: "q1", gtfNumber: "19-001-0000001", titularNombre: "COMUNIDAD NATIVA SAN LUIS", permisoCodigo: "19-SEC/REG-PLT-2025-096" }],
      rucPropio: RUC,
    });
    expect(mia.porIngresar[0]).toMatchObject({ guardadaId: "q1", lista: true });

    const ajena = cruzarGuiasTh({
      guias: [guia()],
      ingresos: [],
      guardadas: [{ id: "q2", gtfNumber: "019-001-0000001", titularNombre: "MADERERA EL AGUAJAL SAC", permisoCodigo: "17-CPO/C-J-001-02" }],
      rucPropio: RUC,
    });
    expect(ajena.porIngresar[0].lista).toBe(false);
    expect(ajena.porIngresar[0].motivo).toMatch(/otro talonario/);

    // Mismo titular, otro permiso: «Recibir» la rechazaría → no se ofrece.
    const otroPermiso = cruzarGuiasTh({
      guias: [guia()],
      ingresos: [],
      guardadas: [{ id: "q3", gtfNumber: "019-001-0000001", titularNombre: "COMUNIDAD NATIVA SAN LUIS", permisoCodigo: "OTRO-PERMISO-2020" }],
      rucPropio: RUC,
    });
    expect(otroPermiso.porIngresar[0]).toMatchObject({ lista: false });
    expect(otroPermiso.porIngresar[0].motivo).toMatch(/no parece la misma guía/);
  });

  it("no va a tu planta, la Ficha sin RUC o la lista sin volumen: se lista con su motivo y sin botón", () => {
    const otra = cruzarGuiasTh({ guias: [guia({ gtfDatos: datos("20999999999") })], ingresos: [], guardadas: [], rucPropio: RUC });
    expect(otra.porIngresar[0]).toMatchObject({ lista: false });
    expect(otra.porIngresar[0].motivo).toMatch(/no a tu planta/);

    const sinRuc = cruzarGuiasTh({ guias: [guia()], ingresos: [], guardadas: [], rucPropio: null });
    expect(sinRuc.porIngresar[0].motivo).toMatch(/Ficha del CTP/);

    const sinVolumen = cruzarGuiasTh({
      guias: [guia({ items: [{ code: "1", species: "Tornillo", volumeM3: null }] })],
      ingresos: [],
      guardadas: [],
      rucPropio: RUC,
    });
    expect(sinVolumen.porIngresar[0].lista).toBe(false);
    // Sin lista que alcance, el m³ que se muestra es el declarado, no una suma inventada.
    expect(sinVolumen.porIngresar[0].volumenM3).toBe(4.75);
  });

  it("la misma guía emitida dos veces (reemisión) cuenta una vez: la más nueva", () => {
    const r = cruzarGuiasTh({
      guias: [guia({ id: "vieja", createdAt: "2026-10-07T06:00:00.000Z" }), guia({ id: "nueva", createdAt: "2026-10-07T09:00:00.000Z" })],
      ingresos: [],
      guardadas: [],
      rucPropio: RUC,
    });
    expect(r.porIngresar.map((g) => g.gtfId)).toEqual(["nueva"]);
  });

  it("primero las que se pueden traer", () => {
    const r = cruzarGuiasTh({
      guias: [guia({ id: "ajena", gtfNumber: "019-001-0000009", gtfDatos: datos("20999999999") }), guia({ id: "propia", gtfNumber: "019-001-0000002" })],
      ingresos: [],
      guardadas: [],
      rucPropio: RUC,
    });
    expect(r.porIngresar.map((g) => g.gtfId)).toEqual(["propia", "ajena"]);
  });
});

describe("guiaPorNumero — el puente «Ingresar al CTP» sólo sabe el N°", () => {
  const base = cruzarGuiasTh({ guias: [guia()], ingresos: [], guardadas: [], rucPropio: RUC }).porIngresar;
  it("encuentra la guía escrita con otros ceros", () => {
    const e = guiaPorNumero(base, "19-001-1");
    expect(e.estado).toBe("una");
  });
  it("dos titulares con el mismo N° → ambigua, nunca la primera", () => {
    const dos = cruzarGuiasTh({
      guias: [
        guia(),
        guia({ id: "g2", titularName: "MADERERA EL AGUAJAL SAC", tituloHabilitante: "17-CPO/C-J-001-02", createdAt: "2026-10-06T10:00:00.000Z" }),
      ],
      ingresos: [],
      guardadas: [],
      rucPropio: RUC,
    }).porIngresar;
    expect(dos).toHaveLength(2);
    expect(guiaPorNumero(dos, "019-001-0000001").estado).toBe("ambigua");
  });
  it("otro N° → ninguna", () => {
    expect(guiaPorNumero(base, "019-001-0000002").estado).toBe("ninguna");
  });
});
