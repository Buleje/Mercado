/**
 * Tablero de control del permiso — el estado de cada troza sale del libro, no
 * de un contador aparte.
 */

import { describe, it, expect } from "vitest";
import {
  construirTablero,
  resumirTablero,
  filtrarTablero,
  especiesDelTablero,
  type EstadoTroza,
} from "@/lib/forestal/loth-tablero-trozas";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";

/**
 * Línea mínima con lo que el tablero mira.
 *
 * `volumeM3` viaja como **string**: es un Decimal de Prisma serializado. Si el
 * helper lo tipara como number, el test pasaría con una forma que la API nunca
 * manda — y el `Number(...)` del tablero quedaría sin cubrir.
 */
function linea(p: Partial<Omit<LothEntryDTO, "volumeM3">> & { section: string; volumeM3?: number | null }): LothEntryDTO {
  const { volumeM3, ...resto } = p;
  return {
    ...resto,
    id: p.id ?? Math.random().toString(36).slice(2),
    lineNo: p.lineNo ?? 1,
    section: p.section,
    entryDate: p.entryDate ?? "2026-09-01T00:00:00.000Z",
    createdAt: p.createdAt ?? "2026-09-01T00:00:00.000Z",
    treeCode: p.treeCode ?? null,
    trozaCode: p.trozaCode ?? null,
    speciesCommon: p.speciesCommon ?? null,
    gtfNumber: p.gtfNumber ?? null,
    status: p.status ?? "registrado",
    discarded: p.discarded ?? false,
    consumoInterno: p.consumoInterno ?? false,
    cites: p.cites ?? false,
    volumeM3: volumeM3 == null ? null : String(volumeM3),
  } as unknown as LothEntryDTO;
}

const HOY = new Date("2026-09-21T00:00:00.000Z");

describe("construirTablero — un estado por troza, derivado de las tres secciones", () => {
  it("trozada y nada más ⇒ disponible", () => {
    const t = construirTablero([linea({ section: "trozado", trozaCode: "A-1", volumeM3: 2 })], HOY);
    expect(t).toHaveLength(1);
    expect(t[0].estado).toBe("disponible");
  });

  it("trozada + despachada ⇒ despachada, y trae su GTF", () => {
    const t = construirTablero(
      [
        linea({ section: "trozado", trozaCode: "A-1", volumeM3: 2 }),
        linea({ section: "despacho_troza", trozaCode: "A-1", gtfNumber: "001-0000120" }),
      ],
      HOY,
    );
    expect(t[0].estado).toBe("despachada");
    expect(t[0].gtf).toBe("001-0000120");
  });

  it("trozada + consumida ⇒ consumida", () => {
    const t = construirTablero(
      [
        linea({ section: "trozado", trozaCode: "A-1" }),
        linea({ section: "consumo_troza", trozaCode: "A-1" }),
      ],
      HOY,
    );
    expect(t[0].estado).toBe("consumida");
  });

  it("despachada SIN trozado ⇒ fantasma (el libro tiene un hueco)", () => {
    const t = construirTablero([linea({ section: "despacho_troza", trozaCode: "X-9" })], HOY);
    expect(t[0].estado).toBe("fantasma");
  });

  it("trozada y marcada descartada ⇒ descartada, no disponible", () => {
    const t = construirTablero([linea({ section: "trozado", trozaCode: "A-1", discarded: true })], HOY);
    expect(t[0].estado).toBe("descartada");
  });

  it("una línea ANULADA no cuenta: la troza vuelve a estar disponible", () => {
    const t = construirTablero(
      [
        linea({ section: "trozado", trozaCode: "A-1" }),
        linea({ section: "despacho_troza", trozaCode: "A-1", status: "anulado" }),
      ],
      HOY,
    );
    expect(t[0].estado).toBe("disponible");
  });

  it("despachada Y consumida: gana despachada (es la que tiene documento del otro lado)", () => {
    const t = construirTablero(
      [
        linea({ section: "trozado", trozaCode: "A-1" }),
        linea({ section: "despacho_troza", trozaCode: "A-1", gtfNumber: "G-1" }),
        linea({ section: "consumo_troza", trozaCode: "A-1" }),
      ],
      HOY,
    );
    expect(t[0].estado).toBe("despachada");
  });

  it("las líneas sin código de troza se ignoran (no inventa una troza vacía)", () => {
    const t = construirTablero([linea({ section: "tala", treeCode: "001-TOR" })], HOY);
    expect(t).toHaveLength(0);
  });

  it("cuenta los días en patio sólo de lo que sigue disponible", () => {
    const t = construirTablero(
      [
        linea({ section: "trozado", trozaCode: "A-1", entryDate: "2026-09-01T00:00:00.000Z" }),
        linea({ section: "trozado", trozaCode: "B-1", entryDate: "2026-09-19T00:00:00.000Z" }),
        linea({ section: "trozado", trozaCode: "C-1" }),
        linea({ section: "despacho_troza", trozaCode: "C-1" }),
      ],
      HOY,
    );
    const a = t.find((x) => x.code === "A-1");
    const c = t.find((x) => x.code === "C-1");
    expect(a?.diasEnPatio).toBe(20);
    expect(c?.diasEnPatio).toBeNull();
  });

  it("ordena primero lo disponible, y dentro de eso lo más viejo", () => {
    const t = construirTablero(
      [
        linea({ section: "trozado", trozaCode: "NUEVA", entryDate: "2026-09-20T00:00:00.000Z" }),
        linea({ section: "trozado", trozaCode: "VIEJA", entryDate: "2026-08-01T00:00:00.000Z" }),
        linea({ section: "trozado", trozaCode: "SALIO" }),
        linea({ section: "despacho_troza", trozaCode: "SALIO" }),
      ],
      HOY,
    );
    expect(t.map((x) => x.code)).toEqual(["VIEJA", "NUEVA", "SALIO"]);
  });
});

describe("resumirTablero", () => {
  const filas = construirTablero(
    [
      linea({ section: "trozado", trozaCode: "A-1", volumeM3: 2.5 }),
      linea({ section: "trozado", trozaCode: "A-2", volumeM3: null }),
      linea({ section: "trozado", trozaCode: "B-1", volumeM3: 3 }),
      linea({ section: "despacho_troza", trozaCode: "B-1" }),
    ],
    HOY,
  );

  it("suma por estado", () => {
    const r = resumirTablero(filas);
    const disp = r.find((x) => x.estado === "disponible")!;
    expect(disp.n).toBe(2);
    expect(disp.m3).toBe(2.5);
  });

  it("una troza sin volumen se cuenta pero NO suma 0 disimulado", () => {
    const disp = resumirTablero(filas).find((x) => x.estado === "disponible")!;
    expect(disp.sinVolumen).toBe(1);
  });

  it("devuelve los cinco estados aunque estén en cero, para que el tablero no cambie de forma", () => {
    expect(resumirTablero([])).toHaveLength(5);
    expect(resumirTablero([]).every((r) => r.n === 0)).toBe(true);
  });
});

describe("filtrarTablero", () => {
  const filas = construirTablero(
    [
      linea({ section: "trozado", trozaCode: "TOR-1", treeCode: "001-TOR", speciesCommon: "Tornillo" }),
      linea({ section: "trozado", trozaCode: "CAP-1", treeCode: "002-CAP", speciesCommon: "Capirona" }),
      linea({ section: "despacho_troza", trozaCode: "CAP-1", gtfNumber: "001-0000120" }),
    ],
    HOY,
  );

  it("busca por código de troza, de árbol, por especie y por GTF", () => {
    expect(filtrarTablero(filas, { texto: "TOR-1" })).toHaveLength(1);
    expect(filtrarTablero(filas, { texto: "002-CAP" })).toHaveLength(1);
    expect(filtrarTablero(filas, { texto: "tornillo" })).toHaveLength(1);
    expect(filtrarTablero(filas, { texto: "0000120" })).toHaveLength(1);
  });

  it("filtra por estado", () => {
    const soloDisp = filtrarTablero(filas, { estados: ["disponible"] as EstadoTroza[] });
    expect(soloDisp).toHaveLength(1);
    expect(soloDisp[0].code).toBe("TOR-1");
  });

  it("sin filtros devuelve todo", () => {
    expect(filtrarTablero(filas, {})).toHaveLength(2);
  });

  it("lista las especies presentes, ordenadas", () => {
    expect(especiesDelTablero(filas)).toEqual(["Capirona", "Tornillo"]);
  });
});
