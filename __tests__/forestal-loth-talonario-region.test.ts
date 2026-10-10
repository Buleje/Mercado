import { describe, expect, it } from "vitest";
import { gtfDatosVacio } from "@/lib/forestal/ctp-gtf-datos";
import { leerGtfConfirmada } from "@/lib/forestal/gtf-talonario";
import {
  lineasDeLaGuia,
  avisoDeOtroTitular,
  elegirGuiaDelDueno,
  titularParaGuardar,
  chocanEnElLibro,
  conPunto,
  datosInicialesLoth,
  esDelDueno,
  mismoTitular,
  puntosCompuestos,
  faltantesDespachoLoth,
  guiasParaOrigen,
  identidadDelTitulo,
  listasDelTalonario,
  mensajeOtraRegion,
  rellenarGuiaLoth,
  revisarNumeroLoth,
  talonarioDelPlan,
  type GtfUsadaLoth,
  type PiezaGuia,
} from "@/lib/forestal/loth-guia-despacho";
import { ORIGEN_NO_APLICA, papelesGuiaLoth } from "@/lib/forestal/loth-guia-print";

/**
 * El talonario por región (Brandon 29-09-2026). Los números son los que hay en
 * la base: Santa Rosa de Chivis 019-001-0000003 (listas 5, 6) y 0000004
 * (listas 7, 8); Quinchunlla 019-001-0000013 — dos titulares, la MISMA serie.
 */
const SANTA_ROSA = "COMUNIDAD NATIVA SANTA ROSA DE CHIVIS";
const USADAS: GtfUsadaLoth[] = [
  { numero: "019-001-0000004", fuente: "guardada", titular: SANTA_ROSA, permiso: "19-SEC/REG-PLT-2021-017", listas: "7, 8", fecha: "2026-08-15" },
  { numero: "019-001-0000003", fuente: "guardada", titular: SANTA_ROSA, permiso: "19-SEC/REG-PLT-2021-017", listas: "5, 6", fecha: "2026-08-14" },
  { numero: "019-001-0000013", fuente: "guardada", titular: "QUINCHUNLLA PEREZ, NELLY", permiso: "19-SEC/REG-PLT-2018-020", listas: "21" },
  { numero: "010-001-0000014", fuente: "guardada", titular: "SANTOS MUÑOZ JOSE", permiso: "10-HUA-PUE/PER-FMP-2026-007" },
];
const PASCO = { departamento: "Pasco", provincia: "Oxapampa", distrito: "Puerto Bermúdez" };
const dueno = (titular: string, permiso = "", planId: string | null = null) => ({ titular, permiso, planId });

describe("talonarioDelPlan — la serie de la región, el correlativo del titular", () => {
  it("dos titulares en 019-001: cada uno sigue SU número", () => {
    const a = talonarioDelPlan({ ubigeo: PASCO, dueno: dueno("Comunidad Nativa Santa Rosa de Chivis") }, USADAS);
    expect(a.region).toMatchObject({ codigo: "019", departamento: "Pasco" });
    expect(a.serie).toBe("019-001");
    expect(a.propuesta?.gtf).toBe("019-001-0000005");
    const b = talonarioDelPlan({ ubigeo: PASCO, dueno: dueno("Quinchunlla Pérez, Nelly") }, USADAS);
    expect(b.propuesta?.gtf).toBe("019-001-0000014");
  });

  it("el mismo título escrito distinto también es del titular", () => {
    const t = talonarioDelPlan({ ubigeo: PASCO, dueno: dueno("C.N. Santa Rosa", "19 SEC REG PLT 2021 017") }, USADAS);
    expect(t.propuesta?.correlativo).toBe(5);
  });

  it("anuladas y la Ficha sin el cero (19-001) cuentan", () => {
    const usadas: GtfUsadaLoth[] = [
      ...USADAS,
      { numero: "19-001-0000006", fuente: "despacho_anulado", titular: SANTA_ROSA, planId: "plan-1" },
    ];
    const t = talonarioDelPlan({ ubigeo: PASCO, dueno: dueno("Otro nombre", "", "plan-1") }, usadas);
    expect(t.propuesta?.gtf).toBe("019-001-0000007");
  });

  it("sin historia en la serie: la serie fija y se pide el correlativo (nunca el 0000001 inventado)", () => {
    const t = talonarioDelPlan({ ubigeo: PASCO, dueno: dueno("CCNN San Luis de Chinchiguani") }, USADAS);
    expect(t.serie).toBe("019-001");
    expect(t.propuesta).toBeNull();
    // Lo que tipea la persona («65») queda con la serie y 7 dígitos.
    expect(leerGtfConfirmada("65", t.serie ?? "", t.digitos)).toEqual({ ok: true, gtf: "019-001-0000065", correlativo: 65 });
  });

  it("el plan de Blas dice «Constitucion» donde va la región: la serie es la de Pasco", () => {
    const t = talonarioDelPlan({ ubigeo: { departamento: "Constitucion" }, dueno: dueno("CCNN San Luis de Chinchiguani") }, USADAS);
    expect(t.region).toMatchObject({ codigo: "019", departamento: "Pasco", deducidoDe: "distrito" });
    expect(t.serie).toBe("019-001");
  });

  it("main: plan en Ucayali con guías viejas sin región → serie 025-001, y la vieja se nombra", () => {
    const viejas: GtfUsadaLoth[] = [{ numero: "001-0000127", fuente: "despacho_anulado", titular: "Maderera El Aguajal SAC" }];
    const t = talonarioDelPlan({ ubigeo: { departamento: "Ucayali" }, dueno: dueno("Maderera El Aguajal SAC") }, viejas);
    expect(t.serie).toBe("025-001");
    expect(t.propuesta).toBeNull();
    expect(t.fueraDeSerie?.numero).toBe("001-0000127");
  });

  it("sin departamento en el plan: sigue la serie del último número del titular, como antes", () => {
    const viejas: GtfUsadaLoth[] = [{ numero: "001-0000127", fuente: "despacho", titular: "Maderera El Aguajal SAC" }];
    const t = talonarioDelPlan({ ubigeo: {}, dueno: dueno("Maderera El Aguajal SAC") }, viejas);
    expect(t.region).toBeNull();
    expect(t.propuesta?.gtf).toBe("001-0000128");
  });
});

describe("revisarNumeroLoth — lo que se pregunta antes de grabar", () => {
  const t = talonarioDelPlan({ ubigeo: PASCO, dueno: dueno(SANTA_ROSA) }, USADAS);

  it("un N° de Huánuco con el plan en Pasco se pregunta", () => {
    const r = revisarNumeroLoth("010-001-0000005", t);
    expect(r.otraRegion).toEqual({ codigo: "010", departamento: "Huanuco" });
    expect(mensajeOtraRegion("010-001-0000005", r.otraRegion!, t.region!)).toBe(
      "El N° 010-001-0000005 es de Huanuco (010) y el plan de estas trozas está en Pasco (019). ¿Es correcto?",
    );
  });

  it("el salto de más de 20 se pregunta; el que sigue, no", () => {
    expect(revisarNumeroLoth("019-001-0000030", t).salto).toBe(25);
    expect(revisarNumeroLoth("019-001-0000005", t)).toMatchObject({ otraRegion: null, salto: null });
    // Un N° sin la forma de SERFOR no dice región: no se pregunta por ella.
    expect(revisarNumeroLoth("001-0000128", t).otraRegion).toBeNull();
  });
});

describe("listas y origen del titular", () => {
  const t = talonarioDelPlan({ ubigeo: PASCO, dueno: dueno(SANTA_ROSA) }, USADAS);

  it("34 trozas de Santa Rosa: listas 9 y 10 (sigue a 7, 8)", () => {
    expect(listasDelTalonario(t, 34).texto).toBe("9, 10");
  });

  it("el origen ofrece las guías vigentes y guardadas, sin anuladas ni la propia, sin duplicar 19-001/019-001", () => {
    const usadas: GtfUsadaLoth[] = [
      ...USADAS,
      { numero: "19-001-0000004", fuente: "despacho", titular: SANTA_ROSA },
      { numero: "019-001-0000009", fuente: "despacho_anulado", titular: SANTA_ROSA },
    ];
    const op = guiasParaOrigen(usadas, "019-001-0000013");
    expect(op.map((o) => o.numero)).toEqual(["019-001-0000004", "019-001-0000003", "010-001-0000014"]);
    expect(op[0].etiqueta).toContain(SANTA_ROSA);
  });
});

describe("partida desarmada y faltantes por casillero", () => {
  const id = identidadDelTitulo({
    plan: { planType: "PLANTACION", titularName: "CCNN SAN LUIS DE CHINCHIGUANI", region: "Constitucion", parcelaCorta: "PC 3", sector: "Alto Chinchihuani" },
  });

  it("la partida sale del plan con el ubigeo del padrón y el texto de SERFOR", () => {
    const d = datosInicialesLoth(id, "2026-09-29");
    expect(d.traslado.partida).toEqual({ direccion: "PC 3, Alto Chinchihuani", departamento: "Pasco", provincia: "Oxapampa", distrito: "Constitución" });
    expect(d.traslado.puntoPartida).toBe("PC 3, Alto Chinchihuani, Constitución, Oxapampa, Pasco");
    // (10)(11)(12): el plan no decía un departamento; el padrón sí.
    expect(d.guia).toMatchObject({ departamento: "Pasco", provincia: "Oxapampa", distrito: "Constitución" });
  });

  it("falta el distrito de la partida: se dice por casillero; la lista vacía con trozas, también", () => {
    const d = datosInicialesLoth(id, "2026-09-29");
    d.traslado.partida.distrito = "";
    const campos = faltantesDespachoLoth(d, { gtfNumber: "019-001-0000065", emision: "2026-09-29", trozas: 3 }).map((f) => f.campo);
    expect(campos).toContain("Partida: distrito");
    expect(campos).not.toContain("Partida: provincia");
    expect(campos).toContain("N° de la lista de trozas");
  });

  it("la llegada se siembra del destinatario (dirección + ubigeo) y la ruta sola se rehace", () => {
    const anterior = {
      ...gtfDatosVacio(),
      destinatario: {
        ...gtfDatosVacio().destinatario,
        nombre: "Inversiones Agroforestales Blas SAC",
        direccion: "JR. JOSE MARIA ARGUEDAS MZA. 24 LOTE 04",
        departamento: "PASCO",
        provincia: "OXAPAMPA",
        distrito: "Constitución",
      },
    };
    const d = rellenarGuiaLoth(datosInicialesLoth(id, "2026-09-29"), { ultimaGuia: anterior, emision: "2026-09-29" });
    expect(d.traslado.llegada.direccion).toBe("JR. JOSE MARIA ARGUEDAS MZA. 24 LOTE 04");
    expect(d.traslado.puntoLlegada).toBe("JR. JOSE MARIA ARGUEDAS MZA. 24 LOTE 04, Constitución, OXAPAMPA, PASCO");
    expect(d.traslado.ruta).toBe(`${d.traslado.puntoPartida} → ${d.traslado.puntoLlegada}`);
  });

  it("cambiar un punto rehace la ruta armada sola; la escrita a mano se respeta", () => {
    const d = datosInicialesLoth(id, "2026-09-29");
    const sola = conPunto({ ...d.traslado, ruta: d.traslado.puntoPartida }, "llegada", { direccion: "Km 12", departamento: "Ucayali" });
    expect(sola.puntoLlegada).toBe("Km 12, Ucayali");
    expect(sola.ruta).toBe(`${d.traslado.puntoPartida} → Km 12, Ucayali`);
    const aMano = conPunto({ ...d.traslado, ruta: "Por la carretera Federico Basadre" }, "llegada", { direccion: "Km 12" });
    expect(aMano.ruta).toBe("Por la carretera Federico Basadre");
  });
});

describe("el papel: la lista se parte en hojas numeradas y el (36) dice NO APLICA", () => {
  const pieza = (i: number): PiezaGuia => ({
    codigo: `${100 + i}-TOR-A`,
    arbol: `${100 + i}`,
    comun: i % 2 ? "Tornillo" : "Cumala",
    cientifico: null,
    cites: false,
    diamMayorM: 0.7,
    diamMenorM: 0.6,
    lengthM: 3,
    volumeM3: 1,
  });
  const id = identidadDelTitulo({ plan: { planType: "PLANTACION", tituloHabilitante: "19-SEC/REG-PLT-2021-017", titularName: SANTA_ROSA, region: "Pasco" } });
  const datos = datosInicialesLoth(id, "2026-09-29");
  datos.guia.listaTrozasNro = "9";
  const piezas = Array.from({ length: 34 }, (_, i) => pieza(i));

  it("34 trozas: dos listas, N° 9 y 10, cada una en su hoja con «hoja i de 2»", () => {
    const { gtf, lista } = papelesGuiaLoth({ gtfNumber: "019-001-0000005", gtfDate: "2026-09-29", titular: SANTA_ROSA, datos, piezas });
    expect(lista.etiqueta).toBe("34 trozas en 2 hojas · anexo del (35)");
    expect(lista.html.match(/class="doc-parte"/g)).toHaveLength(2);
    expect(lista.html).toContain("Hoja 1 de 2 · anexo del (35)");
    expect(lista.html).toContain("Hoja 2 de 2 · anexo del (35)");
    expect(lista.html).toContain("LISTA ID: 9");
    expect(lista.html).toContain("LISTA ID: 10");
    expect(gtf.html).toMatch(/\(35\)<\/span> <span class="l">Lista\(s\) de Troza\(s\):<\/span> <b>9, 10<\/b>/);
    expect(gtf.html).toContain(ORIGEN_NO_APLICA);
  });

  it("una guía vieja sin N° de lista sigue imprimiendo el de la guía (reimprimir no cambia lo que viajó)", () => {
    const vieja = { ...datos, guia: { ...datos.guia, listaTrozasNro: "" } };
    const { lista } = papelesGuiaLoth({ gtfNumber: "001-0000120", gtfDate: "2026-05-29", titular: SANTA_ROSA, datos: vieja, piezas: piezas.slice(0, 3) });
    expect(lista.html).toContain("LISTA ID: 001-0000120");
    expect(lista.html.match(/class="doc-parte"/g)).toBeNull();
  });

  it("con GTF de origen elegida, se imprime ese N° (no NO APLICA)", () => {
    const conOrigen = { ...datos, guia: { ...datos.guia, gtfOrigenNro: "019-001-0000004" } };
    const { gtf } = papelesGuiaLoth({ gtfNumber: "019-001-0000005", gtfDate: "2026-09-29", titular: SANTA_ROSA, datos: conOrigen, piezas: piezas.slice(0, 2) });
    expect(gtf.html).toContain("019-001-0000004");
    expect(gtf.html).not.toContain(ORIGEN_NO_APLICA);
  });
});

describe("talonarios POR TITULAR: el mismo N° de otro titular no frena (hallazgos #3 y #6)", () => {
  const usadas: GtfUsadaLoth[] = [
    { numero: "019-001-0000012", fuente: "despacho", titular: SANTA_ROSA, planId: "plan-chivis" },
    { numero: "019-001-0000013", fuente: "guardada", titular: "QUINCHUNLLA PEREZ, NELLY", permiso: "19-SEC/REG-PLT-2018-020" },
  ];

  it("Chivis propone 013 y lo puede registrar; Quinchunlla propone 014", () => {
    const chivis = { titular: SANTA_ROSA, permiso: "", planId: "plan-chivis" };
    const tc = talonarioDelPlan({ ubigeo: PASCO, dueno: chivis }, usadas);
    expect(tc.propuesta?.gtf).toBe("019-001-0000013");
    const r = revisarNumeroLoth("019-001-0000013", tc, chivis);
    expect(r.repetida).toBeNull();
    expect(r.deOtroTitular?.titular).toBe("QUINCHUNLLA PEREZ, NELLY");
    expect(avisoDeOtroTitular(r.deOtroTitular!)).toBe(
      "Ese N° también figura en una guía de QUINCHUNLLA PEREZ, NELLY: es otro talonario, revisa que el papel sea el tuyo.",
    );
    const tq = talonarioDelPlan({ ubigeo: PASCO, dueno: dueno("Nelly Quinchunlla Pérez") }, usadas);
    expect(tq.propuesta?.gtf).toBe("019-001-0000014");
  });

  it("el mismo N° del MISMO titular en este libro sí frena (anulada incluida), escrito como sea", () => {
    const chivis = { titular: "C.N. Santa Rosa de Chivis", permiso: "", planId: null };
    const tc = talonarioDelPlan({ ubigeo: PASCO, dueno: chivis }, usadas);
    expect(revisarNumeroLoth("19-001-12", tc, chivis).repetida?.numero).toBe("019-001-0000012");
  });

  it("sin titular de un lado: frena por las dudas", () => {
    expect(chocanEnElLibro({ titular: "" }, { titular: SANTA_ROSA })).toBe(true);
    expect(chocanEnElLibro({ titular: SANTA_ROSA }, { titular: null })).toBe(true);
    expect(chocanEnElLibro({ titular: SANTA_ROSA }, { titular: "QUINCHUNLLA PEREZ, NELLY" })).toBe(false);
    expect(chocanEnElLibro({ titular: "CCNN SANTA ROSA DE CHIVIS" }, { titular: SANTA_ROSA })).toBe(true);
  });

  it("la guía de SERFOR del mismo titular con ese N° no frena, pero se dice", () => {
    const u: GtfUsadaLoth[] = [{ numero: "019-001-0000004", fuente: "ingreso", titular: SANTA_ROSA }];
    const t = talonarioDelPlan({ ubigeo: PASCO, dueno: dueno(SANTA_ROSA) }, u);
    const r = revisarNumeroLoth("019-001-0000004", t, dueno(SANTA_ROSA));
    expect(r.repetida).toBeNull();
    expect(r.deSerfor?.fuente).toBe("ingreso");
  });
});

describe("mismoTitular — el mismo titular escrito distinto (hallazgo #4)", () => {
  it("abreviaturas, tildes, puntuación y una letra de más o de menos en una palabra larga", () => {
    expect(mismoTitular("CCNN SAN LUIS DE CHINCHIGUANI", "COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI")).toBe(true);
    expect(mismoTitular("C.N. Santa Rosa de Chivis", SANTA_ROSA)).toBe(true);
    expect(mismoTitular("CC.NN. SANTA ROSA DE CHIVIS", SANTA_ROSA)).toBe(true);
    expect(mismoTitular("Maderera El Aguajal S.A.C.", "MADERERA EL AGUAJAL SAC")).toBe(true);
    expect(mismoTitular("Transportes Selva E.I.R.L.", "TRANSPORTES SELVA EIRL")).toBe(true);
    expect(mismoTitular("QUINCHUNLLA PEREZ, NELLY", "Nelly Quinchunlla Pérez")).toBe(true);
  });

  it("dos comunidades distintas no se unen", () => {
    expect(mismoTitular(SANTA_ROSA, "COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI")).toBe(false);
    expect(mismoTitular("CN SAN MIGUEL", "CN SAN MANUEL")).toBe(false);
    expect(mismoTitular("CN SANTA ROSA", "CN SANTA ROSITA")).toBe(false);
    expect(mismoTitular("PEREZ GARCIA JUAN", "PEREZ GARCIA JUAN CARLOS")).toBe(false);
    expect(mismoTitular("", SANTA_ROSA)).toBe(false);
  });

  it("primero el título: dos formas del mismo permiso son el mismo dueño", () => {
    expect(esDelDueno({ titular: "Otro nombre", permiso: "19-SEC/PER-FMC-2024-008" }, { titular: "X", permiso: "19 SEC PER FMC 2024 008" })).toBe(true);
  });
});

describe("la serie del propio titular y las guías que entraron como ingresos (hallazgo #5)", () => {
  it("C.N. San Luis numera sin el tramo del medio (019-0000001): sigue 019-0000002", () => {
    const ingresos: GtfUsadaLoth[] = [
      { numero: "019-0000001", fuente: "ingreso", titular: "COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI", permiso: "19-SEC/PER-FMC-2024-008", listas: "L-19-0300920" },
      ...USADAS,
    ];
    const t = talonarioDelPlan({ ubigeo: { departamento: "Constitucion" }, dueno: dueno("CCNN SAN LUIS DE CHINCHIGUANI") }, ingresos);
    expect(t.serie).toBe("019");
    expect(t.propuesta?.gtf).toBe("019-0000002");
    // «L-19-0300920» es un código, no listas: no hay de dónde seguir.
    expect(listasDelTalonario(t, 10).texto).toBeNull();
  });
});

describe("el servidor rearma la partida y la llegada impresas (hallazgo #8)", () => {
  it("el texto del cliente no se cree cuando hay casilleros", () => {
    const tr = {
      ...gtfDatosVacio().traslado,
      puntoPartida: "lo que diga el navegador",
      puntoLlegada: "otro texto",
      partida: { direccion: "PC 3", departamento: "Pasco", provincia: "Oxapampa", distrito: "Constitución" },
    };
    const r = puntosCompuestos(tr);
    expect(r.puntoPartida).toBe("PC 3, Constitución, Oxapampa, Pasco");
    // Sin casilleros de llegada (una guía vieja), queda el texto que había.
    expect(r.puntoLlegada).toBe("otro texto");
  });
});

describe("el titular que se guarda lo decide el servidor", () => {
  it("el del navegador, si difiere, se ignora y se devuelve para el log", () => {
    expect(titularParaGuardar("CCNN SAN LUIS DE CHINCHIGUANI", "Otro Titular SAC")).toEqual({
      titular: "CCNN SAN LUIS DE CHINCHIGUANI",
      ignorado: "Otro Titular SAC",
    });
    expect(titularParaGuardar(" CCNN SAN LUIS ", "CCNN SAN LUIS")).toEqual({ titular: "CCNN SAN LUIS", ignorado: null });
    expect(titularParaGuardar("", "Del navegador")).toEqual({ titular: null, ignorado: "Del navegador" });
    expect(titularParaGuardar("X", null)).toEqual({ titular: "X", ignorado: null });
  });
});

describe("elegirGuiaDelDueno — el N° solo no identifica la guía", () => {
  const dos = [
    { id: "q", titular: "QUINCHUNLLA PEREZ, NELLY", permiso: "19-SEC/REG-PLT-2018-020" },
    { id: "c", titular: SANTA_ROSA, permiso: "19-SEC/REG-PLT-2021-017" },
  ];
  const de = (x: (typeof dos)[number]) => x;

  it("dos titulares, el mismo N°: con identidad la suya, sin identidad «ambigua»", () => {
    expect(elegirGuiaDelDueno(dos, { titular: "C.N. Santa Rosa de Chivis" }, de)).toMatchObject({ estado: "una", guia: { id: "c" } });
    expect(elegirGuiaDelDueno(dos, { permiso: "19-SEC/REG-PLT-2018-020" }, de)).toMatchObject({ estado: "una", guia: { id: "q" } });
    expect(elegirGuiaDelDueno(dos, null, de).estado).toBe("ambigua");
    expect(elegirGuiaDelDueno(dos, { titular: "CCNN SAN LUIS" }, de).estado).toBe("ninguna");
  });

  it("varias del MISMO dueño son la misma guía (un ingreso por especie); una sin dueño conocido no objeta", () => {
    const iguales = [dos[1], { ...dos[1], id: "c2" }];
    expect(elegirGuiaDelDueno(iguales, null, de)).toMatchObject({ estado: "una", guia: { id: "c" } });
    expect(elegirGuiaDelDueno([{ id: "x", titular: "", permiso: "" }], { titular: SANTA_ROSA }, de)).toMatchObject({ estado: "una" });
    expect(elegirGuiaDelDueno([{ id: "x", titular: "", permiso: "" }, { id: "y", titular: "", permiso: "" }], { titular: SANTA_ROSA }, de).estado).toBe("ambigua");
  });
});

describe("mismoTitular — revisión 29-09: palabras vacías y el género (hallazgo 2)", () => {
  it("DE, DEL, LA, Y no distinguen: «SANTA ROSA DE CHIVIS» = «SANTA ROSA CHIVIS»", () => {
    expect(mismoTitular("COMUNIDAD NATIVA SANTA ROSA DE CHIVIS", "CN SANTA ROSA CHIVIS")).toBe(true);
    expect(mismoTitular("Inversiones de la Selva y del Oriente SAC", "INVERSIONES SELVA ORIENTE S.A.C.")).toBe(true);
  });

  it("la última letra es el género, no un tipeo: FERNANDO ≠ FERNANDA (y una de más al final tampoco)", () => {
    expect(mismoTitular("QUISPE ROJAS FERNANDO", "QUISPE ROJAS FERNANDA")).toBe(false);
    expect(mismoTitular("GABRIELA TORRES", "GABRIEL TORRES")).toBe(false);
  });

  it("menos de 7 letras, exactas: MIGUEL ≠ MANUEL, ROSITA ≠ ROSITO", () => {
    expect(mismoTitular("CN SAN MIGUEL", "CN SAN MANUEL")).toBe(false);
    expect(mismoTitular("CN SANTA ROSITA", "CN SANTA ROSITO")).toBe(false);
  });

  it("CHINCHIGUANI/CHINCHIHUANI (una letra en el medio de una palabra larga) sigue uniendo", () => {
    expect(mismoTitular("CCNN SAN LUIS DE CHINCHIGUANI", "COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI")).toBe(true);
  });
});

describe("lineasDeLaGuia — anular una guía toca sólo SUS líneas (hallazgo 3)", () => {
  const lineas = [
    { id: "a1", trozaCode: "85-TOR-C", planId: "plan-a" },
    { id: "a2", trozaCode: "85-TOR-D", planId: "plan-a" },
    { id: "b1", trozaCode: "12-CUM-A", planId: "plan-b" },
  ];
  const titulares: Record<string, string> = { "plan-a": SANTA_ROSA, "plan-b": "QUINCHUNLLA PEREZ, NELLY" };
  const tit = (id: string) => titulares[id] ?? null;

  it("con la lista de trozas, sus trozas", () => {
    const g = { items: [{ code: "85-TOR-C" }], planId: null, titularName: null };
    expect(lineasDeLaGuia(g, lineas, { otrasConElNumero: 1 }).map((l) => l.id)).toEqual(["a1"]);
  });

  it("hecha a mano (sin códigos) y el N° es sólo suyo: todas, como antes", () => {
    const g = { items: [], planId: null, titularName: null };
    expect(lineasDeLaGuia(g, lineas, { otrasConElNumero: 0 }).map((l) => l.id)).toEqual(["a1", "a2", "b1"]);
  });

  it("hecha a mano y OTRO titular tiene el mismo N°: por el plan, o por el titular de los planes", () => {
    expect(lineasDeLaGuia({ items: [], planId: "plan-b", titularName: null }, lineas, { otrasConElNumero: 1 }).map((l) => l.id)).toEqual(["b1"]);
    expect(
      lineasDeLaGuia({ items: null, planId: null, titularName: "C.N. Santa Rosa de Chivis" }, lineas, { otrasConElNumero: 1, titularDePlan: tit }).map((l) => l.id),
    ).toEqual(["a1", "a2"]);
  });

  it("sin forma de saber de quién son: ninguna (no se anula lo del otro)", () => {
    expect(lineasDeLaGuia({ items: [], planId: null, titularName: null }, lineas, { otrasConElNumero: 1, titularDePlan: tit })).toEqual([]);
  });
});
