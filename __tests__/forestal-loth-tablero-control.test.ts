/**
 * Control del permiso (ADR-459): permiso por troza, antigüedad en el patio en
 * días de Pucallpa, la etiqueta leída con la pistola, la banda del plan y lo
 * que sale afuera (Excel, WhatsApp, reporte impreso escapado).
 */

import { describe, expect, it } from "vitest";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import { cascadaDelPlan } from "@/lib/forestal/loth-saldo-cascada";
import {
  PLAN_SIN_PLAN,
  antiguedadEnPatio,
  construirTablero,
  diaDelLibro,
  filtrarPorPlan,
  filtrarTablero,
  leerBusquedaTablero,
  planesDe,
  resolverLectura,
  resumirTablero,
  resumirViejas,
} from "@/lib/forestal/loth-tablero-trozas";
import { bandaDelPlan, planDesdeJson, vigenciaDelPlan, type PlanTablero } from "@/lib/forestal/loth-tablero-permiso";
import {
  despachadasHoy,
  enlaceWhatsapp,
  fechaConDia,
  hojasDelControl,
  htmlReporteControl,
  nombreArchivoControl,
  textoWhatsappControl,
  type DatosControl,
} from "@/lib/forestal/loth-tablero-reporte";
import { textoFichaDeTrozaLoth } from "@/lib/forestal/ficha-texto-troza";

function linea(p: Partial<Omit<LothEntryDTO, "volumeM3">> & { section: string; volumeM3?: number | null }): LothEntryDTO {
  const { volumeM3, ...resto } = p;
  return {
    ...resto,
    id: p.id ?? Math.random().toString(36).slice(2),
    lineNo: p.lineNo ?? 1,
    section: p.section,
    entryDate: p.entryDate ?? "2026-09-01T00:00:00.000Z",
    treeCode: p.treeCode ?? null,
    trozaCode: p.trozaCode ?? null,
    speciesCommon: p.speciesCommon ?? null,
    speciesScientific: p.speciesScientific ?? null,
    diamMayorM: p.diamMayorM ?? null,
    diamMenorM: p.diamMenorM ?? null,
    lengthM: p.lengthM ?? null,
    gtfNumber: p.gtfNumber ?? null,
    status: p.status ?? "registrado",
    discarded: p.discarded ?? false,
    consumoInterno: p.consumoInterno ?? false,
    cites: p.cites ?? false,
    planId: p.planId ?? null,
    volumeM3: volumeM3 == null ? null : String(volumeM3),
  } as unknown as LothEntryDTO;
}

/* 01:00 UTC del 2-10 = 20:00 del 1-10 en Pucallpa: la hora que hacía mal la cuenta. */
const NOCHE_LIMA = new Date("2026-10-02T01:00:00.000Z");

describe("diaDelLibro — el día como lo vive Pucallpa", () => {
  it("medianoche UTC exacta es un día sin hora: se lee tal cual", () => {
    expect(diaDelLibro("2026-09-22T00:00:00.000Z")).toBe("2026-09-22");
  });
  it("una hora real se pasa a Lima (las 21:00 del 28 no son el 29)", () => {
    expect(diaDelLibro("2026-05-29T02:00:00.000Z")).toBe("2026-05-28");
    expect(diaDelLibro("2026-05-28T23:50:43.115Z")).toBe("2026-05-28");
  });
  it("una fecha guardada como medianoche de Lima (05:00 UTC) cae en su día", () => {
    expect(diaDelLibro("2026-11-02T05:00:00.000Z")).toBe("2026-11-02");
  });
  it("vacío o roto → null", () => {
    expect(diaDelLibro(null)).toBeNull();
    expect(diaDelLibro("no es fecha")).toBeNull();
  });
});

describe("construirTablero — permiso y días en patio", () => {
  const filas = construirTablero(
    [
      linea({ id: "t1", section: "trozado", trozaCode: "85-TOR-C", planId: "PO12", entryDate: "2026-09-01T00:00:00.000Z", volumeM3: 0.995 }),
      linea({ id: "t2", section: "trozado", trozaCode: "SP-1", planId: null, entryDate: "2026-09-20T00:00:00.000Z", volumeM3: 1 }),
      linea({ id: "t3", section: "trozado", trozaCode: "85-TOR-A", planId: "PO12", volumeM3: 1.471 }),
      linea({ section: "despacho_troza", trozaCode: "85-TOR-A", planId: "PO12", gtfNumber: "001-0000120", entryDate: "2026-10-01T00:00:00.000Z" }),
    ],
    NOCHE_LIMA,
  );
  const c = filas.find((f) => f.code === "85-TOR-C")!;

  it("cuenta los días en el día de Lima, no en el de UTC (a las 20:00 no se adelanta uno)", () => {
    expect(c.diasEnPatio).toBe(30);
    expect(c.diaTrozado).toBe("2026-09-01");
  });
  it("cada troza lleva el plan de la línea que la creó y el id de su Trozado", () => {
    expect(c.planId).toBe("PO12");
    expect(c.trozadoId).toBe("t1");
    expect(filas.find((f) => f.code === "SP-1")?.planId).toBeNull();
  });
  it("filtrarPorPlan: todos, uno, y «Sin plan»", () => {
    expect(filtrarPorPlan(filas, null)).toHaveLength(3);
    expect(filtrarPorPlan(filas, "PO12").map((f) => f.code).sort()).toEqual(["85-TOR-A", "85-TOR-C"]);
    expect(filtrarPorPlan(filas, PLAN_SIN_PLAN).map((f) => f.code)).toEqual(["SP-1"]);
    expect(filtrarPorPlan(filas, "OTRO")).toHaveLength(0);
  });
  it("planesDe dice cuántos permisos hay en lo elegido", () => {
    expect(planesDe(filas)).toHaveLength(2);
    expect(planesDe(filas.filter((f) => f.planId === "PO12"))).toEqual(["PO12"]);
  });
});

describe("antigüedad en el patio — ámbar ≥ 15 días, rojo ≥ 30", () => {
  const a = (dias: number | null, estado: "disponible" | "despachada" = "disponible") => antiguedadEnPatio({ estado, diasEnPatio: dias });
  it("los bordes", () => {
    expect(a(14)).toBeNull();
    expect(a(15)).toBe("atencion");
    expect(a(29)).toBe("atencion");
    expect(a(30)).toBe("critico");
  });
  it("lo que ya salió no envejece en el patio", () => {
    expect(a(90, "despachada")).toBeNull();
  });
  it("resumirViejas cuenta ≥15 y, de ésas, ≥30; el filtro «solo viejas» las deja solas", () => {
    const filas = construirTablero(
      [
        linea({ section: "trozado", trozaCode: "V30", entryDate: "2026-09-01T00:00:00.000Z", volumeM3: 2 }),
        linea({ section: "trozado", trozaCode: "V16", entryDate: "2026-09-15T00:00:00.000Z", volumeM3: 1 }),
        linea({ section: "trozado", trozaCode: "N1", entryDate: "2026-09-30T00:00:00.000Z", volumeM3: 1 }),
      ],
      NOCHE_LIMA,
    );
    expect(resumirViejas(filas)).toEqual({ n: 2, m3: 3, criticas: 1 });
    expect(filtrarTablero(filas, { soloViejas: true }).map((f) => f.code)).toEqual(["V30", "V16"]);
  });
});

describe("la etiqueta leída con la pistola", () => {
  const entry = linea({
    section: "trozado",
    trozaCode: "85-TOR-C",
    treeCode: "85-TOR",
    speciesCommon: "Tornillo",
    speciesScientific: "Cedrelinga cateniformis",
    volumeM3: 0.995,
  });
  const filas = construirTablero(
    [entry, linea({ section: "trozado", trozaCode: "85-TOR-C2" }), linea({ section: "trozado", trozaCode: "85-TOR-D" })],
    NOCHE_LIMA,
  );
  const ficha = textoFichaDeTrozaLoth(entry, { tituloHabilitante: "17-CPO/C-J-001-02", planNumber: "PO 12" });

  it("la ficha real del QR grande (con saltos de línea) da el código", () => {
    expect(leerBusquedaTablero(ficha)).toEqual({ tipo: "etiqueta", codigo: "85-TOR-C" });
  });
  it("la pistola sin Enter la pega toda en el campo: igual da el código", () => {
    const pegada = ficha.replace(/\n/g, "");
    expect(leerBusquedaTablero(pegada)).toEqual({ tipo: "etiqueta", codigo: "85-TOR-C" });
  });
  it("el QR chico (/verificar/<código>) también", () => {
    expect(leerBusquedaTablero("http://localhost:3000/verificar/85-TOR-C")).toEqual({ tipo: "etiqueta", codigo: "85-TOR-C" });
  });
  it("una línea suelta de la ficha no busca nada; la de una pieza sin código, avisa", () => {
    expect(leerBusquedaTablero("🌳 Tornillo").tipo).toBe("linea-ficha");
    expect(leerBusquedaTablero("TROZA —").tipo).toBe("sin-codigo");
  });
  it("un tipeo sigue siendo búsqueda por «contiene»", () => {
    expect(leerBusquedaTablero("tor")).toEqual({ tipo: "texto", q: "tor" });
    expect(filtrarTablero(filas, { texto: "85-TOR-C" })).toHaveLength(2);
  });
  it("con la etiqueta el filtro es EXACTO: 85-TOR-C no trae a 85-TOR-C2", () => {
    expect(filtrarTablero(filas, { texto: ficha }).map((f) => f.code)).toEqual(["85-TOR-C"]);
  });
  it("Enter: la etiqueta encuentra su troza; un código exacto tipeado (barras) también", () => {
    expect(resolverLectura(filas, ficha)).toMatchObject({ estado: "una", fila: { code: "85-TOR-C" } });
    expect(resolverLectura(filas, "85-tor-d")).toMatchObject({ estado: "una", fila: { code: "85-TOR-D" } });
  });
  it("Enter: una etiqueta de otra troza dice cuál buscó; un tipeo a medias no hace nada", () => {
    expect(resolverLectura(filas, "TROZA 99-XX-Z")).toEqual({ estado: "ninguna", codigo: "99-XX-Z" });
    expect(resolverLectura(filas, "85-TOR")).toEqual({ estado: "ignorar" });
  });
});

const PO12: PlanTablero = planDesdeJson({
  id: "PO12",
  planType: "PO",
  planNumber: "PO 12",
  tituloHabilitante: "17-CPO/C-J-001-02",
  titularName: "Maderera El Aguajal SAC",
  resolucionNumber: "RDF N° 001-2026-GOREU-GERFOR",
  resolucionDate: "2026-01-15T00:00:00.000Z",
  vigenciaDesde: "2026-01-15T00:00:00.000Z",
  vigenciaHasta: "2027-01-14T00:00:00.000Z",
  estado: "vigente",
  isActive: true,
})!;

describe("el permiso de la banda", () => {
  it("planDesdeJson exige id", () => {
    expect(planDesdeJson({ planNumber: "x" })).toBeNull();
    expect(PO12.planNumber).toBe("PO 12");
  });
  it("vigencia: días que faltan, vence hoy, vencida", () => {
    expect(vigenciaDelPlan(PO12, "2026-10-02")).toMatchObject({ texto: "Faltan 104 días", tono: "ok", diasQueFaltan: 104 });
    expect(vigenciaDelPlan(PO12, "2026-12-20").tono).toBe("atencion");
    expect(vigenciaDelPlan(PO12, "2027-01-14").texto).toBe("Vence hoy");
    expect(vigenciaDelPlan(PO12, "2027-01-17")).toMatchObject({ texto: "Vencida hace 3 días", tono: "vencida" });
  });
  it("una fecha guardada a medianoche de Lima (Blas: 05:00 UTC) cuenta bien", () => {
    expect(vigenciaDelPlan({ ...PO12, vigenciaHasta: "2026-11-02T05:00:00.000Z" }, "2026-10-02").diasQueFaltan).toBe(31);
  });
  it("una plantación sin fecha de fin no vence; un plan cerrado se dice cerrado", () => {
    const plt = { ...PO12, planType: "PLANTACION", vigenciaHasta: null };
    expect(vigenciaDelPlan(plt, "2026-10-02")).toMatchObject({ texto: "Sin vencimiento", tono: "sin-fecha" });
    expect(vigenciaDelPlan({ ...PO12, estado: "cerrado" }, "2026-10-02")).toMatchObject({ texto: "Cerrado", tono: "vencida" });
  });
  it("en una plantación la base se llama «Registrado»; en un PO, «Autorizado»", () => {
    expect(bandaDelPlan(PO12, "2026-10-02")).toMatchObject({ tipo: "PO", baseLabel: "Autorizado", esPlantacion: false, nombre: "PO 12" });
    const plt = bandaDelPlan({ ...PO12, planType: "PO", planNumber: "19-SEC/REG-PLT-2025-096" }, "2026-10-02");
    expect(plt).toMatchObject({ tipo: "Plantación", baseLabel: "Registrado", esPlantacion: true });
  });
});

describe("lo que sale afuera", () => {
  const filas = construirTablero(
    [
      linea({ section: "trozado", trozaCode: "85-TOR-C", treeCode: "85-TOR", speciesCommon: "Tornillo", planId: "PO12", entryDate: "2026-05-28T23:50:44.063Z", volumeM3: 0.995 }),
      linea({ section: "trozado", trozaCode: "85-TOR-D", treeCode: "85-TOR", speciesCommon: "<img src=x onerror=alert(1)>", planId: "PO12", entryDate: "2026-05-28T23:50:44.462Z", volumeM3: 1.131 }),
      linea({ section: "trozado", trozaCode: "85-TOR-A", speciesCommon: "Tornillo", planId: "PO12", volumeM3: 1.471 }),
      linea({ section: "despacho_troza", trozaCode: "85-TOR-A", planId: "PO12", gtfNumber: "001-0000120", entryDate: "2026-10-02T00:00:00.000Z" }),
    ],
    new Date("2026-10-02T15:00:00.000Z"),
  );
  const cascada = cascadaDelPlan([
    { species: "Tornillo", cites: false, autorizado: 80, talado: 5.003, trozado: 4.887, movilizado: 2.761, consumido: 0 },
    { species: "Shihuahuaco", cites: false, autorizado: 60, talado: 0, trozado: 0, movilizado: 0, consumido: 0 },
  ]);
  const datos: DatosControl = {
    permiso: bandaDelPlan({ ...PO12, titularName: 'Aguajal <b>"SAC"</b>' }, "2026-10-02"),
    filas,
    resumen: resumirTablero(filas),
    viejas: resumirViejas(filas),
    cascada,
    hoyKey: "2026-10-02",
  };

  it("la fecha como la dice Brandon: «viernes 02/10»", () => {
    expect(fechaConDia("2026-10-02")).toBe("viernes 02/10");
  });
  it("despachadas hoy: por el día de la salida", () => {
    expect(despachadasHoy(filas, "2026-10-02").map((f) => f.code)).toEqual(["85-TOR-A"]);
    expect(despachadasHoy(filas, "2026-10-01")).toHaveLength(0);
  });
  it("el resumen de WhatsApp dice patio, viejas, hoy y lo que queda en pie", () => {
    const txt = textoWhatsappControl(datos);
    expect(txt).toContain("*Control del permiso* · PO 12");
    expect(txt).toContain("viernes 02/10");
    expect(txt).toContain("En patio: 2 trozas · 2.126 m³");
    expect(txt).toContain("Más de 15 días en patio: 2 (2 con más de 30)");
    expect(txt).toContain("Despachadas hoy: 1 · 1.471 m³");
    expect(txt).toContain("Le queda en pie: 134.997 de 140.000 m³ autorizados");
  });
  it("el enlace de WhatsApp lleva el texto codificado", () => {
    const url = enlaceWhatsapp("a & b\nc");
    expect(url).toBe("https://wa.me/?text=a%20%26%20b%0Ac");
  });
  it("el Excel trae Resumen, Trozas, Saldo por especie y Permiso; los m³ como número", () => {
    const hojas = hojasDelControl(datos);
    expect(hojas.map((h) => h.nombre)).toEqual(["Resumen", "Trozas", "Saldo por especie", "Permiso"]);
    const trozas = hojas[1]!.filas;
    expect(trozas).toHaveLength(3);
    expect(trozas[0]).toMatchObject({ "Cód. troza": "85-TOR-C", "Volumen m³": 0.995, "Trozada el": "28/05/2026", Antigüedad: "Más de 30 días" });
    const saldo = hojas[2]!.filas;
    expect(saldo.at(-1)).toMatchObject({ Especie: "Total", "Autorizado m³": 140, "En patio m³": 2.126 });
  });
  it("sin plan elegido no hay hoja de saldo (se salta al exportar)", () => {
    expect(hojasDelControl({ ...datos, permiso: null, cascada: null })[2]!.filas).toHaveLength(0);
  });
  it("el reporte impreso escapa TODO texto (un nombre con HTML no se ejecuta)", () => {
    const { body, title } = htmlReporteControl(datos);
    expect(body).not.toContain("<img src=x");
    expect(body).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(body).not.toContain("<b>\"SAC\"</b>");
    expect(body).toContain("Aguajal &lt;b&gt;&quot;SAC&quot;&lt;/b&gt;");
    expect(body).toContain("Trozas en el patio (2)");
    expect(title).toBe("Control del permiso · PO 12");
  });
  it("el nombre del archivo es un slug con la fecha", () => {
    expect(nombreArchivoControl("19-SEC/REG-PLT-2025-096", "2026-10-02")).toBe("control-del-permiso-19-sec-reg-plt-2025-096-2026-10-02");
    expect(nombreArchivoControl("PO 12", "2026-10-02", "eleccion")).toBe("control-del-permiso-po-12-eleccion-2026-10-02");
  });
});
