import { describe, expect, it } from "vitest";
import {
  datosInicialesLoth,
  detallePorEspecie,
  faltantesDespachoLoth,
  huecosDelTitulo,
  identidadDelTitulo,
  listaDeTrozas,
  piezasDeItems,
  planesDeLasTrozas,
  proponerGtfLoth,
  rellenarGuiaLoth,
  totalM3,
  type PiezaGuia,
} from "@/lib/forestal/loth-guia-despacho";
import { gtfDatosSchema, gtfDatosVacio, leerGtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { papelesGuiaLoth } from "@/lib/forestal/loth-guia-print";

/** Las trozas C y D del 85-TOR del tenant de QA (medidas reales del Trozado). */
const pieza = (p: Partial<PiezaGuia> & { codigo: string }): PiezaGuia => ({
  arbol: "85-TOR",
  comun: "Tornillo",
  cientifico: "Cedrelinga cateniformis",
  cites: false,
  diamMayorM: 0.7,
  diamMenorM: 0.6,
  lengthM: 3,
  volumeM3: 0.995,
  ...p,
});
const C = pieza({ codigo: "85-TOR-C" });
const D = pieza({ codigo: "85-TOR-D", diamMayorM: 0.6, diamMenorM: 0.6, lengthM: 4, volumeM3: 1.131 });

describe("detallePorEspecie — el casillero (37)", () => {
  it("una línea por especie, con trozas contadas y m³ sumados", () => {
    const d = detallePorEspecie([C, D]);
    expect(d).toEqual([
      {
        cientifico: "Cedrelinga cateniformis",
        comun: "Tornillo",
        tipoProducto: "Madera en rollo",
        presentacion: "Trozas",
        cantidad: 2,
        unidad: "Metros cúbicos",
        total: 2.126,
      },
    ]);
  });

  it("«Tornillo» y «TORNILLO (Cedrelinga…)» son la misma especie (claveEspecie)", () => {
    const d = detallePorEspecie([C, pieza({ codigo: "90-TOR-A", comun: "TORNILLO (Cedrelinga cateniformis)", volumeM3: 1 })]);
    expect(d).toHaveLength(1);
    expect(d[0].cantidad).toBe(2);
  });

  it("ordena por volumen y completa el binomio que falta con el catálogo", () => {
    const d = detallePorEspecie(
      [C, pieza({ codigo: "7-CAP-A", arbol: "7-CAP", comun: "Capirona", cientifico: null, volumeM3: 3.2 })],
      (comun) => (comun === "Capirona" ? "Calycophyllum spruceanum" : null),
    );
    expect(d.map((x) => x.comun)).toEqual(["Capirona", "Tornillo"]);
    expect(d[0].cientifico).toBe("Calycophyllum spruceanum");
  });

  it("sin binomio en la troza ni en el catálogo, el casillero queda vacío (no se inventa)", () => {
    const d = detallePorEspecie([pieza({ codigo: "1-X-A", comun: "Shihuahuaco", cientifico: null })]);
    expect(d[0].cientifico).toBe("");
  });
});

describe("listaDeTrozas — la lista que acompaña la guía", () => {
  it("D1 y D2 en centímetros, L en metros, cantidad 1 y el volumen del Trozado", () => {
    const [c] = listaDeTrozas([C]);
    expect(c).toEqual({
      codificacion: "85-TOR-C",
      especieComun: "Tornillo",
      especieCientifica: "Cedrelinga cateniformis",
      producto: "Madera en rollo",
      d1Cm: 70,
      d2Cm: 60,
      largoM: 3,
      cantidad: 1,
      volumenM3: 0.995,
    });
  });

  it("ordena por árbol y, dentro, por código como se lee (9 antes que 10)", () => {
    const l = listaDeTrozas([
      pieza({ codigo: "10-TOR-A", arbol: "10-TOR" }),
      pieza({ codigo: "85-TOR-B" }),
      pieza({ codigo: "9-TOR-A", arbol: "9-TOR" }),
      pieza({ codigo: "85-TOR-A" }),
    ]);
    expect(l.map((f) => f.codificacion)).toEqual(["9-TOR-A", "10-TOR-A", "85-TOR-A", "85-TOR-B"]);
  });

  it("el total del (37) es la suma de sus líneas y cada línea redondea sus trozas UNA vez (regla GTF)", () => {
    const piezas = [C, D, pieza({ codigo: "7-CAP-A", arbol: "7-CAP", comun: "Capirona", volumeM3: 0.3333 })];
    const lineas = detallePorEspecie(piezas);
    const porEspecie = Math.round(lineas.reduce((a, l) => a + l.total, 0) * 1000) / 1000;
    const porTroza = listaDeTrozas(piezas).reduce((a, f) => a + (f.volumenM3 ?? 0), 0);
    // El «Volumen Total» del papel = Σ de las líneas ya redondeadas, exacto.
    expect(totalM3(piezas)).toBe(porEspecie);
    expect(totalM3(piezas)).toBe(2.459);
    // Contra la lista troza por troza sólo difiere el redondeo: medio milésimo por línea.
    expect(Math.abs(porTroza - totalM3(piezas))).toBeLessThanOrEqual(0.0005 * lineas.length);
  });
});

describe("planesDeLasTrozas", () => {
  it("una guía, un título: detecta trozas de dos planes", () => {
    expect(planesDeLasTrozas([{ planId: "a" }, { planId: "a" }])).toEqual(["a"]);
    expect(planesDeLasTrozas([{ planId: "a" }, { planId: "b" }])).toHaveLength(2);
  });
});

describe("identidadDelTitulo — (2)–(12) sin tipear", () => {
  const plan = {
    planType: "PO",
    tituloHabilitante: "17-CPO/C-J-001-02",
    resolucionNumber: "RDF N° 001-2026-GOREU-GERFOR",
    titularName: "Maderera El Aguajal SAC",
    arffs: "GERFOR Ucayali",
    region: "Ucayali",
    parcelaCorta: "PC 12",
  };

  it("el plan de las trozas manda: título, resolución, autoridad, plan y ubicación", () => {
    const id = identidadDelTitulo({ plan, caratula: { titularName: "Maderera El Aguajal SAC", ruc: "20600000001", domicilio: "Jr. Tacna 123" } });
    expect(id).toMatchObject({
      titular: "Maderera El Aguajal SAC",
      tituloHabilitante: "17-CPO/C-J-001-02",
      resolucion: "RDF N° 001-2026-GOREU-GERFOR",
      autoridad: "GERFOR Ucayali",
      planManejoTipo: "Plan Operativo (PO)",
      // Un PO es de una concesión: la casilla (5) que se cruza.
      origenRecurso: "concesion",
      departamento: "Ucayali",
      docTipo: "RUC",
      docNumero: "20600000001",
      domicilio: "Jr. Tacna 123",
    });
  });

  it("la carátula de OTRO titular no presta su RUC al nombre del plan", () => {
    const id = identidadDelTitulo({ plan, caratula: { titularName: "Otra Empresa SAC", ruc: "20999999999" } });
    expect(id.titular).toBe("Maderera El Aguajal SAC");
    expect(id.docNumero).toBe("");
    expect(id.fuentes.caratula).toBe(false);
  });

  it("el código del título dice el tipo: PER-FMC es un permiso (DEMA)", () => {
    const id = identidadDelTitulo({
      plan: { planType: "DEMA", tituloHabilitante: "19-SEC/PER-FMC-2024-008", titularName: "C.N. San Luis de Chinchihuani" },
    });
    expect(id.origenRecurso).toBe("permiso");
    expect(id.planManejoTipo).toBe("Declaración de Manejo (DEMA)");
  });

  it("sin ninguna fuente del tipo, la casilla (5) queda sin cruzar", () => {
    const id = identidadDelTitulo({ plan: { titularName: "X", tituloHabilitante: "ABC-1" } });
    expect(id.origenRecurso).toBe("");
    expect(id.planManejoTipo).toBe("");
  });
});

describe("datosInicialesLoth — el MISMO esquema de la guía del CTP", () => {
  const id = identidadDelTitulo({
    plan: { planType: "PO", tituloHabilitante: "17-CPO/C-J-001-02", titularName: "Maderera El Aguajal SAC", arffs: "GERFOR Ucayali", region: "Ucayali", parcelaCorta: "PC 12" },
  });

  it("valida contra gtfDatosSchema y sobrevive a leerGtfDatos con los casilleros del título", () => {
    const d = datosInicialesLoth(id, "2026-09-28");
    expect(gtfDatosSchema.safeParse(d).success).toBe(true);
    const leido = leerGtfDatos(JSON.parse(JSON.stringify(d)));
    expect(leido.guia).toMatchObject({ autoridad: "GERFOR Ucayali", origenRecurso: "concesion", planManejoTipo: "Plan Operativo (PO)", departamento: "Ucayali" });
    expect(leido.titulos).toEqual(["17-CPO/C-J-001-02"]);
    expect(leido.propietario).toMatchObject({ nombre: "Maderera El Aguajal SAC", esElCtp: true });
    expect(leido.traslado).toMatchObject({ puntoPartida: "PC 12, Ucayali", fechaInicio: "2026-09-28" });
  });

  it("una guía del CTP guardada antes de estos casilleros se lee con los nuevos en blanco", () => {
    const vieja = { guia: { autoridad: "ATFFS", planManejoTipo: "", guiaRemisionNro: "", listaTrozasNro: "", gtfOrigenNro: "" } };
    const leido = leerGtfDatos(vieja);
    expect(leido.guia.autoridad).toBe("ATFFS");
    expect(leido.guia.resolucion).toBe("");
    expect(leido.guia.origenRecurso).toBe("");
    expect(gtfDatosVacio().guia.distrito).toBe("");
  });

  it("lo que el libro no sabe se nombra (no bloquea)", () => {
    const d = datosInicialesLoth(id, "2026-09-28");
    expect(huecosDelTitulo(d)).toEqual(["(8) N° de resolución", "(11) Provincia", "(12) Distrito"]);
  });
});

describe("faltantesDespachoLoth — lo que impide registrar", () => {
  it("pide número, trozas y lo que pide un control (misma regla del CTP)", () => {
    const f = faltantesDespachoLoth(gtfDatosVacio(), { gtfNumber: "", emision: "2026-09-28", trozas: 0 });
    const campos = f.map((x) => x.campo);
    expect(campos.slice(0, 2)).toEqual(["N° de GTF", "Trozas que salen"]);
    expect(campos).toContain("Destinatario");
    expect(campos).toContain("Placa del vehículo");
    // La fecha de inicio sale de la emisión: no se pide aparte.
    expect(campos).not.toContain("Fecha de inicio del traslado");
  });
});

describe("proponerGtfLoth — el talonario del titular", () => {
  it("sigue la serie del último número: 001-0000122 → 001-0000123", () => {
    const p = proponerGtfLoth([
      { numero: "001-0000122", fuente: "despacho_anulado" },
      { numero: "001-0000120", fuente: "despacho" },
    ]);
    expect(p?.gtf).toBe("001-0000123");
  });

  it("019-0000001 y 19-0000001 son la misma serie (tramos por valor)", () => {
    const p = proponerGtfLoth([{ numero: "019-0000001", fuente: "despacho" }, { numero: "19-0000005", fuente: "despacho" }]);
    expect(p?.correlativo).toBe(6);
  });

  it("sin guías anteriores no hay serie de dónde partir", () => {
    expect(proponerGtfLoth([])).toBeNull();
    expect(proponerGtfLoth([{ numero: "SIN-SERIE", fuente: "despacho" }])).toBeNull();
  });
});

describe("papelesGuiaLoth — la GTF y la lista con el formato del CTP", () => {
  const id = identidadDelTitulo({
    plan: { planType: "DEMA", tituloHabilitante: "19-SEC/PER-FMC-2024-008", titularName: "C.N. San Luis de Chinchihuani", arffs: "ATFFS Selva Central", region: "Pasco", provincia: "Oxapampa", distrito: "Puerto Bermúdez" },
  });
  const datos = datosInicialesLoth(id, "2026-09-28");
  datos.destinatario = { ...datos.destinatario, nombre: "Inversiones Agroforestales Blas SAC", direccion: "Carretera Federico Basadre km 12" };

  it("la GTF lleva el título (5)(6)(9), el detalle por especie y apunta a su lista (35)", () => {
    const { gtf } = papelesGuiaLoth({ gtfNumber: "019-0000001", gtfDate: "2026-09-28", titular: id.titular, datos, piezas: [C, D] });
    expect(gtf.html).toContain("19-SEC/PER-FMC-2024-008");
    expect(gtf.html).toContain("Declaración de Manejo (DEMA)");
    expect(gtf.html).toContain("Madera en rollo");
    expect(gtf.html).toContain("Metros cúbicos");
    expect(gtf.html).toContain("2.126");
    expect(gtf.html).toContain("Inversiones Agroforestales Blas SAC");
    expect(gtf.html).toMatch(/\(35\)<\/span> <span class="l">Lista\(s\) de Troza\(s\):<\/span> <b>019-0000001<\/b>/);
    // Original + 2 copias.
    expect(gtf.html.match(/class="gs-tira"/g)).toHaveLength(3);
    // (5): la casilla «Permiso» cruzada.
    expect(gtf.html).toMatch(/Permiso<\/span><span class="bx">X<\/span>/);
  });

  it("la lista trae cada troza con D1·D2 en cm y el total", () => {
    const { lista } = papelesGuiaLoth({ gtfNumber: "019-0000001", gtfDate: "2026-09-28", titular: id.titular, datos, piezas: [C, D] });
    expect(lista.html).toContain("85-TOR-C");
    expect(lista.html).toContain("85-TOR-D");
    expect(lista.html).toContain("70.0");
    expect(lista.html).toContain("2.126");
    expect(lista.etiqueta).toBe("2 trozas · anexo del (35)");
  });

  it("antes de registrar, el papel dice que es un borrador", () => {
    const { gtf, lista } = papelesGuiaLoth({ gtfNumber: "019-0000001", gtfDate: "2026-09-28", titular: id.titular, datos, piezas: [C], borrador: true });
    expect(gtf.html).toContain("Borrador");
    expect(lista.html).toContain("Borrador");
  });
});

describe("rellenarGuiaLoth — hereda el transporte, no el propietario ni el bosque", () => {
  const id = identidadDelTitulo({
    plan: { planType: "DEMA", tituloHabilitante: "19-SEC/PER-FMC-2024-008", titularName: "Juan Pérez", parcelaCorta: "PC 3", region: "Pasco" },
    caratula: { titularName: "Juan Pérez", dni: "40404040" },
  });
  const anterior = {
    ...gtfDatosVacio(),
    propietario: { ...gtfDatosVacio().propietario, nombre: "Otro Dueño SAC", docTipo: "RUC" as const, docNumero: "20111111111" },
    destinatario: { ...gtfDatosVacio().destinatario, nombre: "Inversiones Agroforestales Blas SAC", direccion: "Km 12" },
    transportista: { ...gtfDatosVacio().transportista, nombre: "Transportes Selva EIRL", docNumero: "20222222222" },
    vehiculo: { ...gtfDatosVacio().vehiculo, placa: "ABC-123", conductor: "Pedro Ruiz", licencia: "Q40404040" },
    traslado: { ...gtfDatosVacio().traslado, puntoPartida: "Otro bosque", puntoLlegada: "Pucallpa" },
  };

  it("el titular con DNI sigue con DNI y el transporte sale de la guía anterior", () => {
    const d = rellenarGuiaLoth(datosInicialesLoth(id, "2026-09-28"), { ultimaGuia: anterior, emision: "2026-09-28" });
    expect(d.propietario).toMatchObject({ nombre: "Juan Pérez", docTipo: "DNI", docNumero: "40404040" });
    expect(d.destinatario.nombre).toBe("Inversiones Agroforestales Blas SAC");
    expect(d.transportista.nombre).toBe("Transportes Selva EIRL");
    expect(d.vehiculo).toMatchObject({ placa: "ABC-123", conductor: "Pedro Ruiz" });
    // La partida es la del plan de ESTAS trozas, no la del viaje anterior.
    expect(d.traslado.puntoPartida).toBe("PC 3, Pasco");
    // La llegada, como en el CTP: el domicilio del destinatario.
    expect(d.traslado.puntoLlegada).toBe("Km 12");
    expect(d.titulos).toEqual(["19-SEC/PER-FMC-2024-008"]);
  });

  it("sin guía anterior, transporte privado: el transportista es el titular", () => {
    const d = rellenarGuiaLoth(datosInicialesLoth(id, "2026-09-28"), { ultimaGuia: null, emision: "2026-09-28" });
    expect(d.transportista).toMatchObject({ nombre: "Juan Pérez", docNumero: "40404040" });
  });
});

describe("piezasDeItems — reimprimir una guía emitida", () => {
  it("lee la foto de ForestGtf.items y descarta basura", () => {
    const p = piezasDeItems([
      { code: "85-TOR-C", treeCode: "85-TOR", species: "Tornillo", scientific: "Cedrelinga cateniformis", diamMayorM: 0.7, diamMenorM: "0.6", lengthM: 3, volumeM3: 0.995 },
      null,
      "x",
    ]);
    expect(p).toEqual([{ codigo: "85-TOR-C", arbol: "85-TOR", comun: "Tornillo", cientifico: "Cedrelinga cateniformis", cites: false, diamMayorM: 0.7, diamMenorM: 0.6, lengthM: 3, volumeM3: 0.995 }]);
    expect(piezasDeItems(null)).toEqual([]);
  });
});
