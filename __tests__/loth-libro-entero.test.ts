// @vitest-environment node
/**
 * Tests — el Libro LO-TH impreso y en Excel van ENTEROS (29-09).
 *
 * Antes los dos pedían una sola página de 500 líneas: un libro de 650 se
 * declaraba ante SERFOR (RDE 264-2019) con 500 y nada lo decía. Además el
 * impreso se mandaba a imprimir solo. Lo que se prueba:
 *   - la lectura por páginas junta 650 de 650, sin duplicar si una línea
 *     aparece en dos páginas, y dice «Se muestran N de M» si choca con el tope;
 *   - la ruta del Excel entrega un .xlsx con las 650 líneas (camino real:
 *     GET → páginas de la DB → exceljs);
 *   - el impreso trae las 650 filas, sin `window.print()` automático y con el
 *     botón «Imprimir / Guardar como PDF» atado desde afuera.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { avisoLibroIncompleto, leerLibroEntero } from "@/lib/forestal/loth-libro-entero";
import { LOTH_SECTIONS } from "@/lib/forestal/loth-constants";

/** 650 líneas repartidas en las 6 secciones, con el N° de línea repetido entre carátulas. */
function libroDe(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `e${String(i).padStart(4, "0")}`,
    tenantId: "t-qa",
    section: LOTH_SECTIONS[i % LOTH_SECTIONS.length],
    lineNo: Math.floor(i / 12) + 1,
    entryDate: "2026-08-01T00:00:00.000Z",
    createdAt: "2026-08-03T15:00:00.000Z",
    status: i % 50 === 0 ? "anulado" : "registrado",
    treeCode: `${i}-TOR`,
    trozaCode: `${i}-TOR-A`,
    speciesCommon: "Tornillo",
    volumeM3: "1.2345",
  }));
}

/** La lectura del libro de la DB: tope de 500 por página, como `ForestLothDB.list`. */
function paginador(libro: ReturnType<typeof libroDe>) {
  return vi.fn(async (_tenant: string, f: { limit?: number; offset?: number }) => {
    const limit = Math.min(Math.max(f.limit ?? 100, 1), 500);
    const offset = Math.max(f.offset ?? 0, 0);
    return { entries: libro.slice(offset, offset + limit), total: libro.length };
  });
}

describe("leerLibroEntero", () => {
  it("650 líneas → las 650, en dos páginas", async () => {
    const libro = libroDe(650);
    const pedidas: number[] = [];
    const r = await leerLibroEntero(async (offset, limit) => {
      pedidas.push(offset);
      return { entries: libro.slice(offset, offset + limit), total: libro.length };
    });
    expect(r.entries).toHaveLength(650);
    expect(r.total).toBe(650);
    expect(r.truncado).toBe(false);
    expect(pedidas).toEqual([0, 500]);
    expect(avisoLibroIncompleto({ mostradas: r.entries.length, total: r.total })).toBeNull();
  });

  it("una línea repetida entre dos páginas se cuenta una vez", async () => {
    const libro = libroDe(650);
    const r = await leerLibroEntero(async (offset, limit) => {
      // La 2ª página empieza una antes (el libro cambió entre las dos lecturas).
      const desde = offset === 0 ? 0 : offset - 1;
      return { entries: libro.slice(desde, desde + limit), total: libro.length };
    });
    expect(new Set(r.entries.map((e) => e.id)).size).toBe(r.entries.length);
    expect(r.entries).toHaveLength(650);
  });

  it("si choca con el tope, lo dice: «Se muestran 500 de 650»", async () => {
    const libro = libroDe(650);
    const r = await leerLibroEntero(async (offset, limit) => ({ entries: libro.slice(offset, offset + limit), total: 650 }), {
      topePaginas: 1,
    });
    expect(r.truncado).toBe(true);
    expect(avisoLibroIncompleto({ mostradas: r.entries.length, total: r.total })).toBe(
      "Se muestran 500 de 650 líneas del libro: este documento NO está completo.",
    );
  });

  it("un libro vacío es una sola lectura", async () => {
    const leer = vi.fn(async () => ({ entries: [] as { id: string }[], total: 0 }));
    const r = await leerLibroEntero(leer);
    expect(r).toEqual({ entries: [], total: 0, truncado: false });
    expect(leer).toHaveBeenCalledTimes(1);
  });
});

describe("Excel del LO-TH (ruta real)", () => {
  const libro = libroDe(650);
  const list = paginador(libro);

  beforeEach(() => {
    vi.resetModules();
    list.mockClear();
    vi.doMock("@/lib/require-admin", () => ({ requireAdmin: async () => ({ tenantId: "t-qa", role: "admin" }) }));
    vi.doMock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
    vi.doMock("@/lib/specializations", () => ({ isSpecializationEnabled: async () => true }));
    vi.doMock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
    vi.doMock("@/lib/db/forest-loth.db", () => ({
      ForestLothDB: { list, getActiveCaratula: async () => ({ titularName: "QA Forestal" }) },
    }));
    // Las medidas del despacho (`conTrozado`) se prueban en forestal-loth-despacho-impreso.
    vi.doMock("@/lib/db/forest-loth-despacho.db", () => ({
      ForestLothDespachoDB: { conTrozado: async (_t: string, entries: unknown[]) => entries },
    }));
  });
  afterEach(() => {
    vi.doUnmock("@/lib/db/forest-loth.db");
    vi.doUnmock("@/lib/db/forest-loth-despacho.db");
  });

  it("650 líneas → el .xlsx trae las 650 (y lo declara en la cabecera)", async () => {
    const { GET } = await import("@/app/api/admin/forestal/loth/export/route");
    const res = await GET(new NextRequest("http://localhost/api/admin/forestal/loth/export?format=xlsx"));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Libro-Lineas")).toBe("650/650");
    // Las dos páginas, con el tope de 500 de la lectura del libro.
    expect(list.mock.calls.map((c) => [c[1].offset, c[1].limit])).toEqual([[0, 500], [500, 500]]);

    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as unknown as ArrayBuffer);
    // Fila 1 = título de la sección, fila 2 = cabecera; los datos desde la 3.
    const hojas = wb.worksheets.filter((w) => w.name !== "Carátula" && w.name !== "Resumen");
    expect(hojas).toHaveLength(6);
    const lineas = hojas.reduce((a, w) => a + Math.max(0, w.actualRowCount - 2), 0);
    expect(lineas).toBe(650);
    // Completo: sin la leyenda de «Se muestran N de M».
    expect(String(wb.getWorksheet("Carátula")?.getCell("A3").value ?? "")).toBe("");
  });

  it("un libro incompleto lo dice en la Carátula del Excel", async () => {
    const { buildLothWorkbook } = await import("@/lib/forestal/loth-export");
    const buf = await buildLothWorkbook({
      caratula: null,
      entries: libro.slice(0, 500),
      totalLibro: 650,
      generatedAtISO: "2026-09-29T12:00:00.000Z",
    });
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(String(wb.getWorksheet("Carátula")?.getCell("A3").value)).toMatch(/^Se muestran 500 de 650 líneas/);
  });
});

describe("Excel del LO-TH con más de 2000 trozas despachadas", () => {
  // La lectura de trozados pide de a 2000 códigos (`TANDA_CODIGOS`, las tandas
  // viven en `trozadosDeCodigos` desde el 08-10); el Excel lleva el libro
  // entero: 2500 despachos tienen que salir con su m³, no 2000. Camino real:
  // ruta → `conTrozado` → `trozadosDeCodigos` → prisma (falso).
  const despachos = Array.from({ length: 2500 }, (_, i) => ({
    id: `d${String(i).padStart(4, "0")}`,
    tenantId: "t-qa",
    section: "despacho_troza",
    lineNo: i + 1,
    entryDate: "2026-08-01T00:00:00.000Z",
    createdAt: "2026-08-03T15:00:00.000Z",
    status: "registrado",
    planId: null,
    treeCode: null,
    trozaCode: `${i}-TOR-A`,
    speciesCommon: null,
    volumeM3: null,
  }));
  const list = paginador(despachos as unknown as ReturnType<typeof libroDe>);
  const findMany = vi.fn(async (args: { where: { trozaCode: { in: string[] } } }) =>
    args.where.trozaCode.in.map((c, i) => ({
      id: `t-${c}`,
      planId: null,
      trozaCode: c,
      lineNo: i + 1,
      status: "registrado",
      createdAt: "2026-08-02T00:00:00.000Z",
      treeCode: c.replace(/-A$/, ""),
      speciesCommon: "Tornillo",
      speciesScientific: null,
      cites: false,
      diamMayorM: "0.60",
      diamMenorM: "0.50",
      lengthM: "4.00",
      volumeM3: "0.5000",
    })),
  );

  beforeEach(() => {
    vi.resetModules();
    findMany.mockClear();
    vi.doMock("@/lib/require-admin", () => ({ requireAdmin: async () => ({ tenantId: "t-qa", role: "admin" }) }));
    vi.doMock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
    vi.doMock("@/lib/specializations", () => ({ isSpecializationEnabled: async () => true }));
    vi.doMock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
    vi.doMock("@/lib/db/forest-loth.db", () => ({ ForestLothDB: { list, getActiveCaratula: async () => null } }));
    vi.doMock("@/lib/prisma", () => ({ prisma: { forestLothEntry: { findMany } } }));
  });
  afterEach(() => {
    vi.doUnmock("@/lib/db/forest-loth.db");
    vi.doUnmock("@/lib/prisma");
  });

  it("pide los trozados de a 2000 y las 2500 líneas salen con su m³ (Resumen = 1250)", async () => {
    const { GET } = await import("@/app/api/admin/forestal/loth/export/route");
    const res = await GET(new NextRequest("http://localhost/api/admin/forestal/loth/export?format=xlsx"));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Libro-Lineas")).toBe("2500/2500");
    expect(findMany.mock.calls.map((c) => c[0].where.trozaCode.in.length)).toEqual([2000, 500]);

    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as unknown as ArrayBuffer);
    const rs = wb.getWorksheet("Resumen");
    let fila: (string | number)[] = [];
    rs?.eachRow((row) => {
      const v = row.values as (string | number)[];
      if (v[1] === "3. Despacho de trozas") fila = v.slice(1);
    });
    expect(fila).toEqual(["3. Despacho de trozas", 2500, 0, 0, 1250]);
  });
});

describe("Libro LO-TH impreso", () => {
  const libro = libroDe(650);

  /** Una ventana de mentira: guarda lo que se escribe y el botón que se ata. */
  function ventanaFalsa() {
    const escrito: string[] = [];
    const escuchas: Record<string, () => void> = {};
    const w = {
      print: vi.fn(),
      focus: vi.fn(),
      close: vi.fn(),
      document: {
        open: vi.fn(() => { escrito.length = 0; }),
        write: vi.fn((h: string) => { escrito.push(h); }),
        close: vi.fn(),
        getElementById: vi.fn((id: string) => ({
          addEventListener: (_ev: string, fn: () => void) => { escuchas[id] = fn; },
        })),
      },
    };
    return { w, html: () => escrito.join(""), escuchas };
  }

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = new URL(url, "http://localhost");
        if (u.pathname.endsWith("/caratula")) {
          return new Response(JSON.stringify({ active: { titularName: "QA Forestal" } }), { status: 200 });
        }
        const limit = Math.min(Number(u.searchParams.get("limit")) || 100, 500);
        const offset = Number(u.searchParams.get("offset")) || 0;
        return new Response(JSON.stringify({ entries: libro.slice(offset, offset + limit), total: libro.length }), { status: 200 });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("650 líneas → el impreso trae las 650, sin imprimirse solo", async () => {
    const { printLothLibro } = await import("@/lib/forestal/loth-print");
    const v = ventanaFalsa();
    await printLothLibro({ ventana: v.w as unknown as Window });
    const html = v.html();

    const filas = html.match(/<tr(?: class="[a-z]+")?>\s*<td class="r">/g) ?? [];
    expect(filas).toHaveLength(650);
    // Pidió las dos páginas, con anuladas (el libro muestra las subsanaciones).
    const urls = (fetch as unknown as { mock: { calls: [string][] } }).mock.calls.map((c) => c[0]);
    expect(urls.filter((u) => u.includes("offset="))).toEqual([
      "/api/admin/forestal/loth?limit=500&offset=0&includeAnnulled=1",
      "/api/admin/forestal/loth?limit=500&offset=500&includeAnnulled=1",
    ]);

    // Sin auto-print: ni script en el documento ni print() al abrir.
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/window\.print/);
    expect(v.w.print).not.toHaveBeenCalled();
    expect(html).toContain("Imprimir / Guardar como PDF");
    expect(html).toContain("Content-Security-Policy");
    // El botón imprime (atado desde afuera, la CSP no deja correr script).
    v.escuchas["loth-print"]?.();
    expect(v.w.print).toHaveBeenCalledTimes(1);
    // Completo: sin leyenda.
    expect(html).not.toContain("data-libro-incompleto");
  });

  it("si el servidor falla, cierra la ventana y lo dice", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    const { printLothLibro } = await import("@/lib/forestal/loth-print");
    const v = ventanaFalsa();
    await expect(printLothLibro({ ventana: v.w as unknown as Window })).rejects.toThrow(/HTTP 500/);
    expect(v.w.close).toHaveBeenCalled();
  });
});
