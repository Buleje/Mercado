/**
 * Tests — «Escanear troza» del Control del permiso (Libro TH).
 *
 * La etiqueta del Libro TH trae tres lecturas de la misma pieza (ADR-436): la
 * ficha en texto (QR grande), `/verificar/<código>` (QR chico) y el Code128.
 * Se arman con los MISMOS generadores que imprimen la etiqueta: si el formato
 * de la etiqueta cambia y el lector no, esto falla.
 */
import { describe, expect, it } from "vitest";
import {
  agregarARafaga,
  buscarEnTablero,
  csvRafaga,
  fechaConDia,
  leerQrTrozaLoth,
  resumirRafaga,
  textoResumenRafaga,
  type LecturaRafaga,
} from "@/lib/forestal/loth-qr-troza";
import { textoFichaDeTrozaLoth } from "@/lib/forestal/ficha-texto-troza";
import { construirTablero } from "@/lib/forestal/loth-tablero-trozas";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";

const base = {
  despachoCode: null,
  isRama: false,
  speciesScientific: null,
  cites: false,
  diamMayorM: null,
  diamMenorM: null,
  lengthM: null,
  productType: null,
  quantity: null,
  unit: null,
  pieces: null,
  gtfNumber: null,
  discarded: false,
  consumoInterno: false,
  observations: null,
  status: "registrado" as const,
  annulledReason: null,
  gpsLat: null,
  gpsLng: null,
  photoUrl: null,
  treeCode: null,
  speciesCommon: null,
  volumeM3: null,
  planId: null,
};
let seq = 0;
const l = (
  p: Partial<LothEntryDTO> & Pick<LothEntryDTO, "section" | "trozaCode">,
): LothEntryDTO => ({
  ...base,
  id: `e${++seq}`,
  lineNo: seq,
  entryDate: "2026-09-10T00:00:00.000Z",
  ...p,
});

const TROZADO_111A = l({
  section: "trozado",
  trozaCode: "111-A",
  treeCode: "111",
  speciesCommon: "Shihuahuaco",
  speciesScientific: "Dipteryx micrantha",
  volumeM3: "4.9510",
  diamMayorM: "0.82",
  diamMenorM: "0.78",
  lengthM: "9.5",
});
const ENTRIES: LothEntryDTO[] = [
  TROZADO_111A,
  l({
    section: "trozado",
    trozaCode: "111-B",
    treeCode: "111",
    speciesCommon: "Shihuahuaco",
    volumeM3: "3.2000",
  }),
  l({
    section: "trozado",
    trozaCode: "002-TOR-A",
    treeCode: "002-TOR",
    speciesCommon: "Tornillo",
    volumeM3: "1.5150",
  }),
  l({
    section: "trozado",
    trozaCode: "118",
    treeCode: "050",
    speciesCommon: "Cumala",
    volumeM3: "0.9000",
  }),
  l({
    section: "despacho_troza",
    trozaCode: "111-A",
    gtfNumber: "019-0000002",
    entryDate: "2026-09-29T00:00:00.000Z",
  }),
];
const TABLERO = construirTablero(ENTRIES, new Date("2026-09-30T12:00:00Z"));

describe("leerQrTrozaLoth · las tres lecturas de la etiqueta y el tipeo", () => {
  it("QR grande: la ficha en texto que imprime la etiqueta → su código", () => {
    const ficha = textoFichaDeTrozaLoth(TROZADO_111A, {
      tituloHabilitante: "25-UCA/C-OPB-A-011-17",
      planNumber: "POA 3",
    });
    expect(ficha.startsWith("TROZA 111-A\n")).toBe(true);
    expect(leerQrTrozaLoth(ficha)).toEqual({ tipo: "codigo", codigo: "111-A" });
  });

  it("QR chico: `/verificar/<código>` con el origen del tenant, codificado", () => {
    const url = `https://blas.buleje.pe/verificar/${encodeURIComponent("13/A (0000008)")}`;
    expect(leerQrTrozaLoth(url)).toEqual({ tipo: "codigo", codigo: "13/A (0000008)" });
    expect(leerQrTrozaLoth("https://blas.buleje.pe/verificar/111-A")).toEqual({
      tipo: "codigo",
      codigo: "111-A",
    });
  });

  it("Code128 o texto tipeado a mano: el código pelado, sin importar mayúsculas ni espacios", () => {
    expect(leerQrTrozaLoth("111-A")).toEqual({ tipo: "codigo", codigo: "111-A" });
    expect(leerQrTrozaLoth("  002-tor-a \n")).toEqual({ tipo: "codigo", codigo: "002-TOR-A" });
  });

  it("la pistola tipea la ficha línea por línea: la primera trae el código, el resto se calla", () => {
    expect(leerQrTrozaLoth("TROZA 111-A")).toEqual({ tipo: "codigo", codigo: "111-A" });
    expect(leerQrTrozaLoth("🌳 Shihuahuaco")).toEqual({ tipo: "linea-ficha" });
    expect(leerQrTrozaLoth("📦 4.951 m³")).toEqual({ tipo: "linea-ficha" });
    expect(leerQrTrozaLoth("──────")).toEqual({ tipo: "linea-ficha" });
  });

  it("`TROZA —` (pieza impresa sin código) no se busca como código", () => {
    expect(leerQrTrozaLoth("TROZA —\n🌳 Tornillo")).toEqual({ tipo: "sin-codigo" });
  });

  it("el QR de una troza del Libro CTP (`/admin/q/<id>`) es de otro libro", () => {
    expect(leerQrTrozaLoth("https://blas.buleje.pe/admin/q/cmfTrozaAAAA0001")).toEqual({
      tipo: "otro-libro",
    });
  });

  it("vacío o una dirección que no es de una troza → null", () => {
    expect(leerQrTrozaLoth("")).toBeNull();
    expect(leerQrTrozaLoth("   ")).toBeNull();
    expect(leerQrTrozaLoth("https://blas.buleje.pe/verificar/lote/L-01")).toBeNull();
    expect(leerQrTrozaLoth("https://google.com/")).toBeNull();
  });
});

describe("buscarEnTablero · el código contra el tablero ya cargado", () => {
  it("encuentra la troza exacta, con su estado y su GTF", () => {
    const r = buscarEnTablero(TABLERO, "111-a");
    expect(r.estado).toBe("una");
    if (r.estado !== "una") return;
    expect(r.fila.code).toBe("111-A");
    expect(r.fila.estado).toBe("despachada");
    expect(r.fila.gtf).toBe("019-0000002");
  });

  it("comparación exacta: «11» no es «111-A» ni «118»", () => {
    expect(buscarEnTablero(TABLERO, "11")).toEqual({ estado: "ninguna", codigo: "11" });
  });

  it("el código de un árbol con varias trozas ofrece sus trozas", () => {
    const r = buscarEnTablero(TABLERO, "111");
    expect(r.estado).toBe("arbol");
    if (r.estado !== "arbol") return;
    expect(r.filas.map((f) => f.code).sort()).toEqual(["111-A", "111-B"]);
  });

  it("el código de un árbol con UNA troza va directo a esa troza", () => {
    const r = buscarEnTablero(TABLERO, "002-TOR");
    expect(r.estado === "una" && r.fila.code).toBe("002-TOR-A");
  });

  it("una troza que no está en el libro → ninguna, con el código leído", () => {
    expect(buscarEnTablero(TABLERO, "999-Z")).toEqual({ estado: "ninguna", codigo: "999-Z" });
  });

  it("de punta a punta: la ficha impresa se lee y se encuentra", () => {
    const leido = leerQrTrozaLoth(textoFichaDeTrozaLoth(TROZADO_111A));
    expect(leido?.tipo).toBe("codigo");
    if (leido?.tipo !== "codigo") return;
    const r = buscarEnTablero(TABLERO, leido.codigo);
    expect(r.estado === "una" && r.fila.especie).toBe("Shihuahuaco");
  });
});

describe("fechaConDia", () => {
  it("«martes 29/09», con el día de la fecha del libro (UTC), no el del reloj de Lima", () => {
    expect(fechaConDia("2026-09-29T00:00:00.000Z")).toBe("martes 29/09");
    expect(fechaConDia("2026-09-10")).toBe("jueves 10/09");
    expect(fechaConDia(null)).toBeNull();
    expect(fechaConDia("ayer")).toBeNull();
  });
});

describe("modo ráfaga · contar el patio", () => {
  const fila = (c: string) => TABLERO.find((f) => f.code === c) ?? null;
  const armar = (lecturas: Array<[string, string | null]>): LecturaRafaga[] =>
    lecturas.reduce<LecturaRafaga[]>(
      (acc, [cod, c]) => agregarARafaga(acc, cod, c ? fila(c) : null).lista,
      [],
    );

  it("la misma etiqueta leída dos veces es UNA troza con dos lecturas", () => {
    const primera = agregarARafaga([], "118", fila("118"));
    expect(primera.repetida).toBe(false);
    const segunda = agregarARafaga(primera.lista, "118", fila("118"));
    expect(segunda.repetida).toBe(true);
    expect(segunda.lista).toHaveLength(1);
    expect(segunda.lista[0]!.veces).toBe(2);
  });

  it("un desconocido repetido tampoco se cuenta dos veces", () => {
    const lista = armar([
      ["999-Z", null],
      ["999-z", null],
    ]);
    expect(lista).toHaveLength(1);
  });

  it("«Leídas 4 · 3 en este permiso · 1 desconocida», con las ya salidas aparte", () => {
    const lista = armar([
      ["118", "118"],
      ["111-A", "111-A"],
      ["002-TOR-A", "002-TOR-A"],
      ["999-Z", null],
      ["118", "118"],
    ]);
    const r = resumirRafaga(lista);
    expect(r).toEqual({ leidas: 4, enPermiso: 3, desconocidas: 1, noDisponibles: 1, m3: 7.366 });
    expect(textoResumenRafaga(r)).toBe("Leídas 4 · 3 en este permiso · 1 desconocida");
    expect(textoResumenRafaga(resumirRafaga(armar([["118", "118"]])))).toBe(
      "Leídas 1 · 1 en este permiso",
    );
  });

  it("CSV con `;`, coma decimal, una fila por troza en el orden leído", () => {
    const csv = csvRafaga(
      armar([
        ["111-A", "111-A"],
        ["999-Z", null],
        ["111-A", "111-A"],
      ]),
    );
    const lineas = csv.split("\r\n");
    expect(lineas).toHaveLength(3);
    expect(lineas[0]).toBe(
      "N°;Código leído;En este permiso;Árbol;Especie;Vol. m³;Estado;GTF;Placa;Fecha salida;Días en patio;Lecturas",
    );
    expect(lineas[1]).toBe(
      "1;111-A;Sí;111;Shihuahuaco;4,951;Despachada;019-0000002;;2026-09-29;19;2",
    );
    expect(lineas[2]).toBe("2;999-Z;No;;;;No está en este permiso;;;;;1");
  });

  it("un código leído que empieza con = no se vuelve fórmula en Excel", () => {
    const csv = csvRafaga(armar([["=CMD|X", null]]));
    expect(csv.split("\r\n")[1]).toContain("'=CMD|X");
  });
});
