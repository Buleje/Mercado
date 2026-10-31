/**
 * ADR-512 · la guía se lee con el tenantId de la sesión: una de otro negocio
 * no existe; anulada o sin emitir no se pide corregir.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const m = vi.hoisted(() => ({
  gtf: vi.fn(),
  caratula: vi.fn(async () => null),
  ctp: vi.fn(),
  hermanas: vi.fn(async (): Promise<unknown[]> => []),
  ficha: vi.fn(),
  traza: vi.fn(),
  contratos: vi.fn(),
}));
vi.mock("@/lib/db/forest-gtf.db", () => ({ ForestGtfDB: { getById: m.gtf } }));
vi.mock("@/lib/db/forest-loth.db", () => ({ ForestLothDB: { getActiveCaratula: m.caratula } }));
vi.mock("@/lib/db/forest-ctp.db", () => ({ ForestCtpDB: { getById: m.ctp, despachosDeLasGuias: m.hermanas } }));
vi.mock("@/lib/db/forest-ctp-ficha.db", () => ({ ForestCtpFichaDB: { get: m.ficha } }));
vi.mock("@/lib/db/forest-ctp-despacho.db", () => ({ ForestCtpDespachoDB: { trazabilidadCompleta: m.traza } }));
vi.mock("@/lib/db/forest-contrato.db", () => ({ ForestContratoDB: { list: m.contratos } }));

import { leerGuiaParaCorreccion } from "@/lib/soporte/correccion-guia-guias";
import { resolverCambios } from "@/lib/soporte/correccion-guia-dice";
import { emptyCtpFicha } from "@/lib/forestal/ctp-ficha-types";

/** Un despacho del CTP como lo devuelve la base (sólo lo que el lector usa). */
const despacho = (lineNo: number, extra: Record<string, unknown> = {}) => ({
  id: `desp_${lineNo}`,
  section: "despacho",
  status: "registrado",
  deletedAt: null,
  lineNo,
  entryDate: new Date("2026-10-20T00:00:00Z"),
  gtfNumber: "019-001-0000077",
  gtfDatos: null,
  productType: "Madera aserrada",
  speciesCommon: "Tornillo",
  speciesScientific: "Cedrelinga cateniformis",
  presentacion: "PIEZAS",
  cites: false,
  quantity: "3.5",
  unit: "m3",
  pieces: 120,
  destino: "Lima",
  ...extra,
});

beforeEach(() => vi.clearAllMocks());

describe("Libro TH", () => {
  it("de otro negocio (la base no la encuentra con MI tenant) → no_existe", async () => {
    m.gtf.mockResolvedValue(null);
    expect(await leerGuiaParaCorreccion("t-mio", "loth_gtf", "gtf-ajena")).toEqual({ ok: false, error: "no_existe" });
    expect(m.gtf).toHaveBeenCalledWith("t-mio", "gtf-ajena");
  });

  it("anulada → no_emitida (anulada), sin armar la hoja", async () => {
    m.gtf.mockResolvedValue({ id: "g", status: "anulada", gtfNumber: "001" });
    expect(await leerGuiaParaCorreccion("t-mio", "loth_gtf", "g")).toEqual({ ok: false, error: "no_emitida", estado: "anulada" });
    expect(m.caratula).not.toHaveBeenCalled();
  });

  it("sin tenant no lee nada", () => {
    expect(() => leerGuiaParaCorreccion("", "loth_gtf", "g")).toThrow("tenantId");
  });
});

describe("Guía de salida del CTP", () => {
  it("un registro que no es despacho → no_existe", async () => {
    m.ctp.mockResolvedValue({ id: "c", section: "ingreso", status: "registrado", gtfNumber: "019-1" });
    expect(await leerGuiaParaCorreccion("t-mio", "ctp_despacho", "c")).toEqual({ ok: false, error: "no_existe" });
    expect(m.ctp).toHaveBeenCalledWith("t-mio", "c");
  });

  it("anulado → no_emitida (anulada); sin número → no_emitida (sin_emitir)", async () => {
    m.ctp.mockResolvedValue({ id: "c", section: "despacho", status: "anulado", gtfNumber: "019-1" });
    expect(await leerGuiaParaCorreccion("t-mio", "ctp_despacho", "c")).toEqual({ ok: false, error: "no_emitida", estado: "anulada" });
    m.ctp.mockResolvedValue({ id: "c", section: "despacho", status: "registrado", gtfNumber: "  " });
    expect(await leerGuiaParaCorreccion("t-mio", "ctp_despacho", "c")).toEqual({ ok: false, error: "no_emitida", estado: "sin_emitir" });
    expect(m.traza).not.toHaveBeenCalled();
  });
});

describe("ítems: alias de troza y «Línea #N» (fase 2)", () => {
  it("Libro TH: la troza se nombra por el código impreso, el único del libro o el id; otra → item_desconocido", async () => {
    m.gtf.mockResolvedValue({
      id: "g1",
      status: "emitida",
      gtfNumber: "019-001-0000482",
      gtfDate: new Date("2026-09-02T00:00:00Z"),
      tipo: "trozas",
      titularName: "PEREZ",
      gtfDatos: null,
      items: [
        { code: "12A (0000002)", codigoGuia: "12A", trozadoId: "trz_1", species: "Tornillo", diamMayorM: 0.6, diamMenorM: 0.5, lengthM: 4, volumeM3: 0.95 },
        { code: "T-2", trozadoId: "trz_2", species: "Cumala", diamMayorM: 0.5, diamMenorM: 0.4, lengthM: 3, volumeM3: 0.5 },
      ],
    });
    const r = await leerGuiaParaCorreccion("t1", "loth_gtf", "g1");
    expect(m.gtf).toHaveBeenCalledWith("t1", "g1");
    if (!r.ok) throw new Error("debía leerse");
    const pedir = (clave: string) => resolverCambios(r.guia, [{ donde: "item", clave, correcto: "x" }]);
    for (const clave of ["12A", "12A (0000002)", "trz_1"]) {
      expect(pedir(clave)).toMatchObject({ ok: true, cambios: [{ etiqueta: "Troza 12A" }] });
    }
    const t2 = pedir("trz_2");
    expect(t2).toMatchObject({ ok: true, cambios: [{ etiqueta: "Troza T-2" }] });
    expect(t2.ok && t2.cambios[0]?.dice).toContain("Cumala");
    expect(pedir("NO-EXISTE-1")).toEqual({ ok: false, error: "item_desconocido", clave: "NO-EXISTE-1" });
  });

  it("CTP: un renglón por línea vigente de la guía (mismo N° y día); dice desde la línea guardada", async () => {
    m.ctp.mockResolvedValue(despacho(7));
    m.hermanas.mockResolvedValue([
      despacho(7),
      despacho(8, { speciesCommon: "Cumala", speciesScientific: "Virola sp.", quantity: "1.25", pieces: 30 }),
      despacho(9, { status: "anulado" }),
      despacho(10, { entryDate: new Date("2026-08-01T00:00:00Z") }),
    ]);
    m.ficha.mockResolvedValue(emptyCtpFicha());
    m.traza.mockImplementation(async (_t: string, id: string) => ({
      corridas: [{ guias: [id === "desp_7" ? "019-001-0000010" : "019-001-0000011"] }],
      trozas: id === "desp_8" ? [{ id: "wl_1", codificacion: "A-15", volumenM3: 0.612, gtfIngreso: "019-001-0000011" }] : [],
    }));
    m.contratos.mockResolvedValue([]);

    const r = await leerGuiaParaCorreccion("t1", "ctp_despacho", "desp_7");
    expect(m.hermanas).toHaveBeenCalledWith("t1", ["019-001-0000077"]);
    expect(m.traza.mock.calls.map((c) => c[1])).toEqual(["desp_7", "desp_8"]);
    if (!r.ok) throw new Error("debía leerse");
    expect(r.guia.filas.map((f) => f.clave)).toEqual(["Línea #7", "Línea #8", "A-15"]);
    expect(r.guia.casilleros.get("34h")?.dice).toBe("4.750");

    const ok = resolverCambios(r.guia, [
      { donde: "item", clave: "Línea #8", correcto: "Cumala 32 piezas" },
      { donde: "item", clave: "desp_7", correcto: "Tornillo 118 piezas" },
      { donde: "item", clave: "wl_1", correcto: "0,598 m³" },
    ]);
    if (!ok.ok) throw new Error("debía resolverse");
    expect(ok.cambios.map((c) => c.etiqueta)).toEqual(["Línea #8", "Línea #7", "Troza A-15"]);
    expect(ok.cambios[0]?.dice).toBe("Cumala (Virola sp.) · Madera aserrada · presentación PIEZAS · cantidad 30 · total 1.250 m3");
    // La anulada y la de otro día con el mismo N° no son de esta guía.
    for (const clave of ["Línea #9", "Línea #10"]) {
      expect(resolverCambios(r.guia, [{ donde: "item", clave, correcto: "x" }])).toEqual({ ok: false, error: "item_desconocido", clave });
    }
  });
});

describe("corre en el servidor", () => {
  it("ningún módulo que importan el lector y el armado de `dice` lleva \"use client\" (llamarlo desde la ruta tira)", () => {
    const fuentes = ["lib/soporte/correccion-guia-guias.ts", "lib/soporte/correccion-guia-dice.ts"].map((f) => readFileSync(f, "utf8")).join("\n");
    const modulos = [...new Set([...fuentes.matchAll(/from "@\/(lib\/[^"]+)"/g)].map((x) => x[1]))];
    expect(modulos.length).toBeGreaterThan(5);
    const conDirectiva = modulos.filter((mod) => {
      const f = [`${mod}.ts`, `${mod}.tsx`].find((x) => existsSync(x));
      return f ? /^\s*["']use client["']/.test(readFileSync(f, "utf8")) : false;
    });
    expect(conDirectiva).toEqual([]);
  });
});
