/**
 * «Llenar desde la resolución» (`loth-resolucion-lectura` + `-propuesta`).
 *
 * El texto real es el que el Archivo sacó del certificado de inscripción del
 * plan 096 de Blas (registro de plantación, ATFFS Selva Central), con los
 * datos de las personas cambiados: el responsable legal, el firmante y el RUC.
 * La resolución de bosque es de ejemplo (en la base no hay ninguna aún).
 */
import { describe, expect, it } from "vitest";
import { fechaDeTexto, juntarLecturas, leerResolucionDeTexto, normalizarResolucion, resolucionVacia } from "@/lib/forestal/loth-resolucion-lectura";
import { TOPE_M3_POR_ESPECIE, cuerpoPatchPlan, cuerpoPutEspecies, propuestaContraPlan } from "@/lib/forestal/loth-resolucion-propuesta";
import { marcadasDeInicio } from "@/components/admin/forestal/hooks/use-llenar-resolucion";

/** El OCR crudo del PDF (tesseract, sin IA), tal como queda en `ocrText`. */
const OCR_096 = `Servició Nacional Forestal y i de Fauna Sitvestre CERTIFICADO DE INSCRIPCIÓN EN EL REGISTRO NACIONAL DE PLANTACIONES FORESTALES Registro N": 1 9-SEC/REG-PLT-2025-096 El registro de una plantación de especies forestales no es una modalidad de aprovechamiento de los recursos forestales, tampoco reconoce derechos de propiedad ni de posesión. Las actividades de aprovechamiento son de entera responsabilidad del titular o propietario de la plantación. El registro será cancelado si se determina el empleo de información falsa por parte del solicitante. 1. INFORMACIÓN DEL SOLICITANTE 1.1. Del Responsable legal Nombre y/o Razón Social: PÉREZ RÍOS, JUAN DNI: 00000000 Dirección: Comunidad Nativa Alto San Luis de chinchihuani Distrito: CONSTITUCION Provincia: OXAPAMPA Departamento: 1.2. Del Titular Nombre y/o Razón Social: , COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI RUC: 20000000001 Dirección: COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI Distrito: CONSTITUCION Provincia: OXAPAMPA Departamento: PASCO 2. DATOS DEL PREDIO 2.1. Del Predio Nombre del predio: COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI Área (ha): 15,746.25 Propietario: — , COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI RUC: 20000000001 Ubicación geográfica Este: 521336 Norte: 8918301 DATUM, Zona: WGS84, 18 S “Caserío/Comunidad: SAN LUIS DE CHINCHIHUANI Distrito: CONSTITUCION Provincia: OXAPAMPA Departamento: PASCO Propietario [X] Arrendatario [ ] Posesionario [ ] Especificar el documento que autorice el uso del área para el establecimiento de la plantación: ITULO DE PROPIEDAD N*034-83 3. INFORMACIÓN GENERAL DE LA PLANTACIÓN Área total de la plantación (ha): 0.76 Mes y año de establecimiento de la plantación: Abril de 1980 Sistema de Superficie Especies establecidas plantación Unid. Medida Nombre Científico Macizo ha 0.760 Producción Cedrelinga cateniformis Tornillo 4. OBSERVACIÓN De acuerdo a la información declarada la plantación consiste en tipo Macizo la cantidad 32 arboles de la especie Cedelinga cateniformis "Tornillo" con producción de 161.258 m3 Lugar y Fecha: SELVA CENTRAL, 03 de Septiembre de 2025 Firmado digitalmente FIRMANTE DE PRUEBA 0000000 soft Motivo: el autor del documento Fecha: 03.09.2025 17:07:54 -05:00`;

/** Lo que el Archivo agrega cuando además lo describió la IA de texto. */
const DESCRITO_096 = `${OCR_096}

[Descripción] Documento oficial del Servicio Nacional Forestal y de Fauna Silvestre que certifica la inscripción de una plantación forestal de Cedrelinga cateniformis (variedad "Tornillo") en la Comunidad Nativa San Luis de Chinchihuani, distrito Constitución, provincia Oxapampa, departamento Pasco. El responsable legal es Juan Pérez Ríos (DNI 00000000) y el titular es la propia comunidad nativa con RUC 20000000001. La plantación tiene 0.76 ha, establecida en abril de 1980, con 32 árboles y producción estimada de 161.258 m³. El registro lleva el número 19-SEC/REG-PLT-2025-096 y fue firmado digitalmente el 3 de septiembre de 2025. 
[Datos] Número de registro: 19-SEC/REG-PLT-2025-096; Responsable legal: Juan Pérez Ríos (DNI 00000000); Titular: Comunidad Nativa San Luis de Chinchihuani (RUC 20000000001); Área de la plantación: 0.76 ha; Especie plantada: Cedrelinga cateniformis "Tornillo"; Producción estimada: 161.258 m³; Fecha de establecimiento: abril de 1980; Fecha de emisión: 2025-09-03; Ubicación: 521336 E, 8918301 N (WGS84); Documento de autorización: Título de propiedad N°034-83 
[Entidades] Juan Pérez Ríos, Servicio Nacional Forestal y de Fauna Silvestre, Comunidad Nativa San Luis de Chinchihuani, Comunidad Nativa San Luis de Chinchihuani, Distrito Constitución, Provincia Oxapampa, Departamento Pasco, 2025-09-03, abril de 1980 
[Etiquetas] certificado, registro-plantación, forestal, comunidad-nativa, pasco, oxapampa, cedrelinga, plantación`;

const PLAN_096 = {
  id: "plan096",
  planType: "PLANTACION",
  planNumber: "19-SEC/REG-PLT-2025-096",
  resolucionNumber: "19-SEC/REG-PLT-2025-096",
  resolucionDate: "2025-09-03T00:00:00.000Z",
  vigenciaDesde: null,
  vigenciaHasta: null,
  titularName: "COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI",
  arffs: "ATFFS SELVA CENTRAL",
};
const ESPECIES_096 = [{ id: "e1", speciesCommon: "Tornillo", speciesScientific: "Cedrelinga cateniformis", volumenAutorizadoM3: "161.2580", arbolesAutorizados: null }];

const RESOLUCION_PO = `GOBIERNO REGIONAL DE UCAYALI
RESOLUCIÓN DIRECTORAL N° 0123-2024-GRU-GGR-GERFOR
Pucallpa, 15 de marzo de 2024
VISTO: el expediente de fecha 10 de enero de 2024 presentado por MADERERA EL BOSQUE S.A.C.
SE RESUELVE:
ARTÍCULO 1°.- APROBAR el Plan Operativo a favor de MADERERA EL BOSQUE S.A.C., con RUC 20000000002, titular del contrato 25-PUC/C-J-001-04.
ARTÍCULO 2°.- El Plan Operativo tiene vigencia desde el 01 de abril de 2024 hasta el 31 de marzo de 2025.
ARTÍCULO 3°.- Autorizar el aprovechamiento de las siguientes especies: Shihuahuaco (Dipteryx micrantha) 1,250.500 m3; Capirona 300,25 m3; Lupuna 85 m3.
Regístrese y comuníquese. GERFOR UCAYALI`;

describe("leerResolucionDeTexto — certificado real del plan 096", () => {
  it("del OCR crudo saca el registro, la fecha, el titular y el Tornillo con sus 32 árboles", () => {
    const l = leerResolucionDeTexto(OCR_096, [{ comun: "Tornillo", cientifico: "Cedrelinga cateniformis" }]);
    expect(l.numero).toBe("19-SEC/REG-PLT-2025-096");
    expect(l.codigoRegistro).toBe("19-SEC/REG-PLT-2025-096");
    expect(l.fecha).toBe("2025-09-03");
    expect(l.titular).toBe("COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI");
    expect(l.vigenciaDesde).toBeNull();
    expect(l.vigenciaHasta).toBeNull();
    expect(l.especies).toEqual([{ especie: "Tornillo", cientifico: "Cedrelinga cateniformis", volumenM3: 161.258, arboles: 32 }]);
    /* El responsable legal NO es el titular. */
    expect(l.titular).not.toMatch(/PÉREZ/);
  });

  it("con la descripción de la IA agregada dice lo mismo y no inventa un segundo número", () => {
    const l = leerResolucionDeTexto(DESCRITO_096);
    expect(l.numero).toBe("19-SEC/REG-PLT-2025-096");
    expect(l.fecha).toBe("2025-09-03");
    expect(l.especies[0]).toMatchObject({ especie: "Tornillo", volumenM3: 161.258 });
    expect(l.avisos).toEqual([]);
  });

  it("contra el plan 096: lo único nuevo son los 32 árboles", () => {
    const p = propuestaContraPlan(PLAN_096, ESPECIES_096, leerResolucionDeTexto(OCR_096));
    expect(p.filas.every((f) => f.igual)).toBe(true);
    expect(p.especies).toHaveLength(1);
    expect(p.especies[0]).toMatchObject({ idEnPlan: "e1", hoyM3: 161.258, leidoM3: 161.258, arbolesHoy: null, arbolesLeido: 32, igual: false });
    expect(p.sinCambios).toBe(false);
    expect(cuerpoPutEspecies("plan096", p.especies)).toEqual({
      planId: "plan096",
      especies: [{ speciesCommon: "Tornillo", volumenAutorizadoM3: 161.258, arbolesAutorizados: 32 }],
    });
  });
});

describe("leerResolucionDeTexto — resolución de un PO (ejemplo)", () => {
  const l = leerResolucionDeTexto(RESOLUCION_PO);

  it("número, fecha de la ciudad (no la del expediente), vigencia y titular", () => {
    expect(l.numero).toBe("0123-2024-GRU-GGR-GERFOR");
    expect(l.codigoRegistro).toBeNull();
    expect(l.fecha).toBe("2024-03-15");
    expect(l.vigenciaDesde).toBe("2024-04-01");
    expect(l.vigenciaHasta).toBe("2025-03-31");
    expect(l.titular).toBe("MADERERA EL BOSQUE S.A.C.");
    expect(l.autoridad).toBe("GERFOR UCAYALI");
  });

  it("cada especie con su volumen, en los dos formatos de número", () => {
    expect(l.especies.map((e) => [e.especie, e.volumenM3])).toEqual([
      ["Shihuahuaco", 1250.5],
      ["Capirona", 300.25],
      ["Lupuna", 85],
    ]);
  });

  it("propuesta contra un plan vacío: marca lo vacío, no las especies nuevas, PATCH con las fechas", () => {
    const p = propuestaContraPlan({ id: "po1", planType: "PO", titularName: "Maderera El Bosque SAC" }, [], l);
    expect(p.filas.find((f) => f.campo === "titularName")?.igual).toBe(true);
    expect(p.filas.find((f) => f.campo === "vigenciaHasta")).toMatchObject({ hoy: null, leido: "2025-03-31", igual: false, sugerida: true });
    expect(p.especies.every((e) => e.idEnPlan === null && !e.sinVolumen)).toBe(true);
    /* Una especie nueva cambia lo autorizado: la marca la persona. */
    expect(p.especies.some((e) => e.sugerida)).toBe(false);
    expect([...marcadasDeInicio(p)].sort()).toEqual(["arffs", "resolucionDate", "resolucionNumber", "vigenciaDesde", "vigenciaHasta"]);
    const cambian = p.filas.filter((f) => !f.igual);
    expect(cuerpoPatchPlan("po1", cambian)).toEqual({
      id: "po1",
      resolucionNumber: "0123-2024-GRU-GGR-GERFOR",
      resolucionDate: "2024-03-15",
      vigenciaDesde: "2024-04-01",
      vigenciaHasta: "2025-03-31",
      arffs: "GERFOR UCAYALI",
    });
  });
});

describe("piezas", () => {
  it("fechas escritas", () => {
    expect(fechaDeTexto("03 de Septiembre de 2025")).toBe("2025-09-03");
    expect(fechaDeTexto("1° de setiembre del 2024")).toBe("2024-09-01");
    expect(fechaDeTexto("03.09.2025")).toBe("2025-09-03");
    expect(fechaDeTexto("31 de febrero de 2024")).toBeNull();
  });

  it("un papel que no es resolución vuelve vacío", () => {
    expect(resolucionVacia(leerResolucionDeTexto("Boleta de venta 001-2345 total S/ 25.00"))).toBe(true);
  });

  it("«otra especie» en el texto no es la especie comodín del catálogo", () => {
    const r = leerResolucionDeTexto("Se autoriza el aprovechamiento de Tornillo 120,50 m3. Para otra especie (especificar) 15,00 m3 se pedirá ampliación.");
    expect(r.especies.map((e) => e.especie)).not.toContain("Otra especie (especificar)");
  });

  it("la vigencia en años se avisa en vez de calcularse", () => {
    const l = leerResolucionDeTexto("Resolución N° 045-2023-X, el permiso tiene vigencia de 5 años.");
    expect(l.vigenciaHasta).toBeNull();
    expect(l.avisos.join(" ")).toMatch(/en años/);
  });

  it("la IA manda, el texto completa y lo que no coincide se avisa", () => {
    const texto = leerResolucionDeTexto(OCR_096);
    const ia = normalizarResolucion({
      numero: "19-SEC/REG-PLT-2025-069",
      fecha: "2025-09-03",
      vigenciaDesde: null,
      vigenciaHasta: null,
      titular: null,
      autoridad: "ATFFS Selva Central",
      especies: [],
      nota: null,
    });
    const j = juntarLecturas(ia, texto);
    expect(j.numero).toBe("19-SEC/REG-PLT-2025-069");
    expect(j.titular).toBe("COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI");
    expect(j.autoridad).toBe("ATFFS Selva Central");
    expect(j.especies[0]?.especie).toBe("Tornillo");
    expect(j.avisos.some((a) => a.startsWith("N°:"))).toBe(true);
  });
});

/* Security 25-10: un papel plantado no puede inflar el permiso con un clic. */
describe("lo que viene marcado: sólo lo que falta", () => {
  it("un dato que ya tienes y el papel contradice viene sin marcar", () => {
    const plan = { ...PLAN_096, titularName: "ASOCIACIÓN AGROFORESTAL EL PROGRESO", resolucionDate: "2025-08-01T00:00:00.000Z" };
    const p = propuestaContraPlan(plan, ESPECIES_096, leerResolucionDeTexto(OCR_096));
    const titular = p.filas.find((f) => f.campo === "titularName");
    const fecha = p.filas.find((f) => f.campo === "resolucionDate");
    expect(titular).toMatchObject({ igual: false, sugerida: false, leido: "COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI" });
    expect(fecha).toMatchObject({ igual: false, sugerida: false, leido: "2025-09-03" });
    expect(marcadasDeInicio(p).has("titularName")).toBe(false);
    expect(marcadasDeInicio(p).has("resolucionDate")).toBe(false);
  });

  it("un volumen que sube viene sin marcar; completar los árboles que faltaban, sí", () => {
    const sube = propuestaContraPlan(PLAN_096, [{ ...ESPECIES_096[0]!, volumenAutorizadoM3: "100.0000" }], leerResolucionDeTexto(OCR_096));
    expect(sube.especies[0]).toMatchObject({ hoyM3: 100, leidoM3: 161.258, sugerida: false, sobreTope: false });
    expect(marcadasDeInicio(sube).size).toBe(0);
    /* El mismo papel contra el plan real: el m³ coincide y sólo completa los 32 árboles. */
    const completa = propuestaContraPlan(PLAN_096, ESPECIES_096, leerResolucionDeTexto(OCR_096));
    expect(completa.especies[0]).toMatchObject({ arbolesHoy: null, arbolesLeido: 32, sugerida: true });
  });

  it("más de 50.000 m³ por especie sale en rojo, sin marcar, y no viaja al PUT aunque la marquen", () => {
    expect(TOPE_M3_POR_ESPECIE).toBe(50_000);
    const papel = leerResolucionDeTexto("Se autoriza el aprovechamiento de Tornillo 60000 m3.");
    const p = propuestaContraPlan(PLAN_096, ESPECIES_096, papel);
    expect(p.especies[0]).toMatchObject({ leidoM3: 60000, sobreTope: true, sugerida: false });
    expect(cuerpoPutEspecies("plan096", p.especies)).toBeNull();
  });
});

describe("lectura en tiempo lineal (security 25-10)", () => {
  it("60.000 dígitos seguidos se leen en menos de 200 ms", () => {
    const t0 = performance.now();
    leerResolucionDeTexto(`Tornillo ${"9".repeat(60_000)} m3 y ${"1.".repeat(30_000)} arboles`);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});
