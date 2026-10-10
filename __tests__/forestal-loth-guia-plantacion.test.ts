import { describe, expect, it } from "vitest";
import {
  datosInicialesLoth,
  guiaEsDePlantacion,
  huecosDelTitulo,
  identidadDelTitulo,
  leyendaDeConstancia,
  leyendaDelTitulo,
  type PiezaGuia,
} from "@/lib/forestal/loth-guia-despacho";
import { papelesGuiaLoth } from "@/lib/forestal/loth-guia-print";
import { documentoGtfLoth, type LothGtfDoc } from "@/lib/forestal/loth-gtf-oficial";

/**
 * ADR-459 ronda 3 — la guía de una plantación se ampara con su REGISTRO.
 * Medido antes: la guía imprimía «Título habilitante N° …» con el de la
 * carátula del libro (o en blanco), porque el plan de una plantación no tiene
 * `tituloHabilitante`.
 */

const REGISTRO = "19-SEC/REG-PLT-2025-096";
const CARATULA = { titularName: "Blas SAC", tituloHabilitante: "CON-25-UCA-0207", resolucionNumber: "RDE 001-2020", ruc: "20123456789" };
const PLANTACION = {
  planType: "PLANTACION",
  planNumber: REGISTRO,
  tituloHabilitante: null,
  resolucionNumber: "096-2025",
  titularName: "Blas SAC",
  arffs: "ATFFS Selva Central",
  region: "Pasco",
  provincia: "Oxapampa",
  distrito: "Oxapampa",
};
const PO = { planType: "PO", planNumber: "PO 12", tituloHabilitante: "CON-25-UCA-0207", resolucionNumber: "RDF 77-2026", titularName: "Blas SAC" };

const BOLAINA: PiezaGuia = {
  codigo: "001-BOL-A",
  arbol: "001-BOL",
  comun: "Bolaina",
  cientifico: "Guazuma crinita",
  cites: false,
  diamMayorM: 0.4,
  diamMenorM: 0.35,
  lengthM: 3,
  volumeM3: 0.4,
};

describe("identidadDelTitulo — plantación", () => {
  it("el código del registro es el título; la carátula (de otro papel) no lo presta", () => {
    const id = identidadDelTitulo({ caratula: CARATULA, plan: PLANTACION });
    expect(id.esPlantacion).toBe(true);
    expect(id.tituloHabilitante).toBe(REGISTRO);
    expect(id.resolucion).toBe("096-2025");
    expect(id.origenRecurso).toBe("plantacion");
    expect(id.planManejoTipo).toBe("Registro de plantación forestal");
  });

  it("sin constancia el (8) queda vacío: no se rellena con la resolución de la carátula", () => {
    const id = identidadDelTitulo({ caratula: CARATULA, plan: { ...PLANTACION, resolucionNumber: null } });
    expect(id.resolucion).toBe("");
  });

  it("un plan cargado como «PO» pero con código REG-PLT es plantación igual", () => {
    const id = identidadDelTitulo({ plan: { ...PLANTACION, planType: "PO" } });
    expect(id.esPlantacion).toBe(true);
    expect(id.origenRecurso).toBe("plantacion");
    expect(id.planManejoTipo).toBe("Registro de plantación forestal");
  });

  it("PO con el registro en su título: la guía imprime el código REG-PLT, no el «PO-…» (revisión ADR-459)", () => {
    const id = identidadDelTitulo({
      plan: { ...PLANTACION, planType: "PO", planNumber: "PO-2025-001", tituloHabilitante: "19-SEC/REG-PLT-2025-096" },
    });
    expect(id.esPlantacion).toBe(true);
    expect(id.tituloHabilitante).toBe("19-SEC/REG-PLT-2025-096");
  });

  it("un PO sigue igual: título habilitante, concesión y resolución del plan", () => {
    const id = identidadDelTitulo({ caratula: CARATULA, plan: PO });
    expect(id.esPlantacion).toBe(false);
    expect(id.tituloHabilitante).toBe("CON-25-UCA-0207");
    expect(id.origenRecurso).toBe("concesion");
    expect(id.resolucion).toBe("RDF 77-2026");
  });

  it("la guía arranca con el registro en (6) — nunca vacío", () => {
    const d = datosInicialesLoth(identidadDelTitulo({ caratula: CARATULA, plan: PLANTACION }), "2026-10-02");
    expect(d.titulos).toEqual([REGISTRO]);
    expect(d.guia.origenRecurso).toBe("plantacion");
    expect(d.guia.resolucion).toBe("096-2025");
  });
});

describe("rótulos", () => {
  it("guiaEsDePlantacion lee lo que la guía guardó", () => {
    expect(guiaEsDePlantacion({ titulos: [REGISTRO] })).toBe(true);
    expect(guiaEsDePlantacion({ titulos: ["X"], guia: { origenRecurso: "plantacion" } })).toBe(true);
    expect(guiaEsDePlantacion({ titulos: ["CON-25-UCA-0207"], guia: { origenRecurso: "concesion" } })).toBe(false);
    expect(guiaEsDePlantacion({ titulos: [] })).toBe(false);
  });

  it("la leyenda dice registro o título, y nada sin código", () => {
    expect(leyendaDelTitulo(REGISTRO, true)).toBe(`Registro de plantación N° ${REGISTRO}`);
    expect(leyendaDelTitulo("PO 12", false)).toBe("Título habilitante N° PO 12");
    expect(leyendaDelTitulo("", true)).toBe("");
  });

  it("la constancia no se duplica si ya trae su palabra", () => {
    expect(leyendaDeConstancia("096-2025")).toBe("Constancia N° 096-2025");
    expect(leyendaDeConstancia("Constancia N° 096-2025")).toBe("Constancia N° 096-2025");
    expect(leyendaDeConstancia(" ")).toBe("");
  });

  it("el hueco del (8) habla de constancia en una plantación", () => {
    const d = datosInicialesLoth(identidadDelTitulo({ plan: { ...PLANTACION, resolucionNumber: null } }), "2026-10-02");
    expect(huecosDelTitulo(d)).toContain("(8) N° de constancia del registro");
    const po = datosInicialesLoth(identidadDelTitulo({ plan: { ...PO, resolucionNumber: null } }), "2026-10-02");
    expect(huecosDelTitulo(po)).toContain("(8) N° de resolución");
  });
});

describe("hoja impresa y lista", () => {
  const datos = datosInicialesLoth(identidadDelTitulo({ caratula: CARATULA, plan: PLANTACION }), "2026-10-02");
  const g = { gtfNumber: "019-0000001", gtfDate: "2026-10-02", titular: "Blas SAC", datos, piezas: [BOLAINA] };

  it("la GTF dice «Registro de plantación N° …» y la constancia, no «Título habilitante N°»", () => {
    const { gtf, lista } = papelesGuiaLoth(g);
    expect(gtf.html).toContain(`Registro de plantación N° ${REGISTRO}`);
    expect(gtf.html).toContain("Constancia N° 096-2025");
    expect(gtf.html).not.toContain("Título habilitante N°");
    expect(gtf.html).toContain("Salida de la plantación");
    expect(gtf.html).toContain("plantación forestal inscrita en el registro");
    expect(gtf.html).toMatch(/Plantación<\/span><span class="bx">X<\/span>/);
    expect(lista.html).toContain(`Registro de plantación N° ${REGISTRO}`);
    expect(lista.html).not.toContain("Título habilitante N°");
  });

  it("la de un PO sigue diciendo «Título habilitante N°» y «Salida del bosque»", () => {
    const po = datosInicialesLoth(identidadDelTitulo({ caratula: CARATULA, plan: PO }), "2026-10-02");
    const { gtf, lista } = papelesGuiaLoth({ ...g, datos: po });
    expect(gtf.html).toContain("Título habilitante N° CON-25-UCA-0207");
    expect(gtf.html).toContain("Salida del bosque");
    expect(gtf.html).not.toContain("Registro de plantación N°");
    expect(lista.html).toContain("Título habilitante N° CON-25-UCA-0207");
  });
});

describe("guía ya registrada (lista de guías) — documentoGtfLoth", () => {
  const base: LothGtfDoc = {
    gtfNumber: "019-0000001",
    gtfDate: "2026-10-02",
    tipo: "troza",
    titularName: "Blas SAC",
    tituloHabilitante: REGISTRO,
    parcelaCorta: null,
    transportista: null,
    transportistaDoc: null,
    conductor: null,
    conductorLicencia: null,
    placaVehiculo: null,
    origen: null,
    destino: null,
    observations: null,
    status: "emitida",
    annulledReason: null,
    volumenTotalM3: 0.4,
    items: [{ code: "001-BOL-A", species: "Bolaina", volumeM3: 0.4 }],
  };

  it("el registro guardado sale en (6) con la casilla «Plantación», aunque la carátula tenga otro título", () => {
    const { cuerpo } = documentoGtfLoth(base, { tituloHabilitante: "CON-25-UCA-0207" });
    expect(cuerpo).toContain(REGISTRO);
    expect(cuerpo).not.toContain("CON-25-UCA-0207");
    expect(cuerpo).toMatch(/Plantación<\/span><span class="bx">X<\/span>/);
  });

  it("una guía de concesión conserva la casilla de siempre", () => {
    const { cuerpo } = documentoGtfLoth({ ...base, tituloHabilitante: "CON-25-UCA-0207" }, null);
    expect(cuerpo).toMatch(/Concesión<\/span><span class="bx">X<\/span>/);
  });
});
