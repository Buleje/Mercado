/**
 * Las rutas del Libro TH con el filtro por permiso (02-10-2026): la lista, los
 * contadores (`?stats=1`), el Excel y el impreso.
 *
 * Corre el `requireAdmin` REAL (sólo se simula el JWT): sin sesión 401, cajero
 * 403, y el tenant es SIEMPRE el de la sesión aunque el header diga otro. Un
 * plan ajeno o de baja → 404 sin leer el libro; un `planId` mal formado → 400.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => ({
  payload: null as null | { username: string; role: string; tenantId: string },
  list: vi.fn(),
  stats: vi.fn(),
  lineasSinPlan: vi.fn(),
  getPlan: vi.fn(),
}));

vi.mock("@/lib/session", async (real) => ({
  ...(await real<typeof import("@/lib/session")>()),
  getSessionPayload: async () => H.payload,
}));
vi.mock("@/lib/auth/session-revocation", () => ({ isSessionRevoked: () => false }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: async () => null }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: async () => true }));
vi.mock("@/lib/db/forest-loth.db", async (real) => ({
  ...(await real<typeof import("@/lib/db/forest-loth.db")>()),
  ForestLothDB: {
    list: (...a: unknown[]) => H.list(...a),
    stats: (...a: unknown[]) => H.stats(...a),
    lineasSinPlan: (...a: unknown[]) => H.lineasSinPlan(...a),
    getActiveCaratula: async () => ({ titularName: "QA Forestal", tituloHabilitante: "TH-QA-1" }),
  },
}));
vi.mock("@/lib/db/forest-plan.db", () => ({
  ForestPlanDB: { getPlan: (...a: unknown[]) => H.getPlan(...a), markTreeStatusByCode: vi.fn() },
}));

import { GET } from "@/app/api/admin/forestal/loth/route";
import { GET as EXPORT } from "@/app/api/admin/forestal/loth/export/route";

const PO12 = "cmpq6yhdu000073vzx1khmlap";
const PLAN_PO12 = {
  id: PO12,
  tenantId: "t-main",
  planType: "PO",
  planNumber: "PO 12",
  alias: null,
  titularName: "Comunidad QA",
  tituloHabilitante: "17-QA/C-J-012-26",
  resolucionNumber: "RDF 012-2026",
};
const LINEA = {
  id: "l1",
  section: "tala",
  lineNo: 1,
  planId: PO12,
  status: "registrado",
  entryDate: "2026-09-30T12:00:00.000Z",
  createdAt: "2026-09-30T15:00:00.000Z",
  treeCode: "001-TOR",
  speciesCommon: "Tornillo",
  volumeM3: "2.5",
};

const pedir = (path: string, query: string, conSesion = true, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost/api/admin/forestal/${path}${query}`, {
    headers: { ...(conSesion ? { cookie: "buleje-admin-sess=token-falso" } : {}), ...headers },
  });
const lista = (q: string, conSesion = true, headers: Record<string, string> = {}) => GET(pedir("loth", q, conSesion, headers));

const como = (role: string, tenantId = "t-main") => {
  H.payload = { username: `qa-${role}`, role, tenantId };
};

beforeEach(() => {
  H.payload = null;
  H.list.mockReset().mockResolvedValue({ entries: [LINEA], total: 1 });
  H.stats.mockReset().mockResolvedValue([{ section: "tala", count: 1, totalVolumeM3: 2.5, totalQuantity: 0 }]);
  H.lineasSinPlan.mockReset().mockResolvedValue(0);
  // Sólo el plan de ESTE negocio existe: el `tenantId` va en el where de getPlan.
  H.getPlan.mockReset().mockImplementation(async (tenantId: string, id: string) =>
    tenantId === "t-main" && id === PO12 ? PLAN_PO12 : null,
  );
});

describe("GET /api/admin/forestal/loth — la lista filtra por permiso", () => {
  it("sin sesión → 401, sin leer nada", async () => {
    const r = await lista(`?section=tala&planId=${PO12}&solo=1`, false);
    expect(r.status).toBe(401);
    expect(H.list).not.toHaveBeenCalled();
  });

  it("cajero → 403", async () => {
    como("cajero");
    const r = await lista(`?planId=${PO12}&solo=1`);
    expect(r.status).toBe(403);
    expect(H.list).not.toHaveBeenCalled();
  });

  it("?planId=…&solo=1 → la base recibe el filtro estricto, con el tenant de la sesión", async () => {
    como("admin");
    const r = await lista(`?section=tala&includeAnnulled=1&planId=${PO12}&solo=1`);
    expect(r.status).toBe(200);
    expect(H.getPlan).toHaveBeenCalledWith("t-main", PO12);
    expect(H.list).toHaveBeenCalledWith(
      "t-main",
      expect.objectContaining({ section: "tala", includeAnnulled: true, permiso: { tipo: "plan", planId: PO12, conSinPlan: false } }),
    );
  });

  it("?planId=… sin solo → ese plan y las sin plan (el alcance del balance)", async () => {
    como("owner");
    await lista(`?planId=${PO12}`);
    expect(H.list.mock.calls[0][1].permiso).toEqual({ tipo: "plan", planId: PO12, conSinPlan: true });
  });

  it("el plan de OTRO negocio → 404 y no se lee el libro (aunque el header diga ese negocio)", async () => {
    como("admin", "t-blas");
    const r = await lista(`?planId=${PO12}&solo=1`, true, { "x-tenant-id": "t-main" });
    expect(r.status).toBe(404);
    expect(H.getPlan).toHaveBeenCalledWith("t-blas", PO12);
    expect(H.list).not.toHaveBeenCalled();
  });

  it("almacenero con el header de OTRO negocio → 403 del requireAdmin real", async () => {
    como("almacenero", "t-main");
    const r = await lista(`?planId=${PO12}&solo=1`, true, { "x-tenant-id": "t-blas" });
    expect(r.status).toBe(403);
    expect(H.list).not.toHaveBeenCalled();
  });

  it("planId mal formado → 400 con el motivo", async () => {
    como("admin");
    const r = await lista(`?planId=${encodeURIComponent("x' OR '1'='1")}`);
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ error: "invalid_query", message: "El permiso no es válido." });
    expect(H.list).not.toHaveBeenCalled();
  });

  it("planId=sin-plan → sólo las líneas sin plan, sin buscar un plan con ese id", async () => {
    como("admin");
    await lista("?planId=sin-plan");
    expect(H.getPlan).not.toHaveBeenCalled();
    expect(H.list.mock.calls[0][1].permiso).toEqual({ tipo: "sin-plan" });
  });

  it("sin planId → el libro entero, como siempre", async () => {
    como("admin");
    await lista("?section=trozado");
    expect(H.list.mock.calls[0][1].permiso).toBeNull();
  });
});

describe("GET /api/admin/forestal/loth?stats=1 — los contadores", () => {
  it("con planId solo → estricto; trae cuántas líneas no tienen plan", async () => {
    como("admin");
    H.lineasSinPlan.mockResolvedValue(3);
    const r = await lista(`?stats=1&planId=${PO12}&solo=1`);
    expect(r.status).toBe(200);
    expect(H.stats).toHaveBeenCalledWith("t-main", undefined, { tipo: "plan", planId: PO12, conSinPlan: false });
    expect(await r.json()).toEqual({ stats: [{ section: "tala", count: 1, totalVolumeM3: 2.5, totalQuantity: 0 }], lineasSinPlan: 3 });
  });

  it("el informe de ejecución (?stats=1&planId= sin solo) conserva su alcance: plan + sin plan", async () => {
    como("admin");
    await lista(`?stats=1&planId=${PO12}`);
    expect(H.stats).toHaveBeenCalledWith("t-main", undefined, { tipo: "plan", planId: PO12, conSinPlan: true });
  });

  it("plan ajeno → 404 (como antes)", async () => {
    como("admin");
    const r = await lista("?stats=1&planId=plan-de-otro");
    expect(r.status).toBe(404);
    expect(H.stats).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/forestal/loth/export — el Excel del permiso", () => {
  const libro = async (r: Response) => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await r.arrayBuffer()) as unknown as ArrayBuffer);
    return wb;
  };

  it("?planId=…&solo=1 → sólo ese permiso, y lo dice en la Carátula, en cada hoja y en el nombre", async () => {
    como("admin");
    const r = await EXPORT(pedir("loth/export", `?format=xlsx&planId=${PO12}&solo=1`));
    expect(r.status).toBe(200);
    expect(H.list.mock.calls[0]).toEqual(["t-main", expect.objectContaining({ includeAnnulled: true, permiso: { tipo: "plan", planId: PO12, conSinPlan: false } })]);
    expect(r.headers.get("Content-Disposition")).toMatch(/filename="libro-loth-PO-12-\d{4}-\d{2}-\d{2}\.xlsx"/);

    const wb = await libro(r);
    const caratula = wb.getWorksheet("Carátula");
    const celdas: string[] = [];
    caratula?.eachRow((row) => celdas.push(`${row.getCell(1).value}=${row.getCell(2).value}`));
    expect(celdas).toContain("Permiso=PO 12 (PO)");
    expect(celdas).toContain("Titular del permiso=Comunidad QA");
    expect(celdas).toContain("Título habilitante=17-QA/C-J-012-26");
    expect(String(wb.worksheets[1].getCell(1, 1).value)).toBe("1. Tala (volteo) — Permiso PO 12");
    expect(String(wb.getWorksheet("Resumen")?.getCell("A1").value)).toBe("RESUMEN POR SECCIÓN — Permiso PO 12");
  });

  it("sin permiso → el libro entero; la Carátula lo dice, las hojas no repiten «Todos»", async () => {
    como("admin");
    const r = await EXPORT(pedir("loth/export", "?format=xlsx"));
    expect(r.status).toBe(200);
    expect(H.list.mock.calls[0][1].permiso).toBeNull();
    expect(r.headers.get("Content-Disposition")).toMatch(/filename="libro-loth-\d{4}-\d{2}-\d{2}\.xlsx"/);
    const wb = await libro(r);
    const celdas: string[] = [];
    wb.getWorksheet("Carátula")?.eachRow((row) => celdas.push(`${row.getCell(1).value}=${row.getCell(2).value}`));
    expect(celdas).toContain("Permiso=Todos los permisos del libro");
    expect(String(wb.worksheets[1].getCell(1, 1).value)).toBe("1. Tala (volteo)");
  });

  it("plan de otro negocio → 404, sin armar el Excel", async () => {
    como("admin", "t-blas");
    const r = await EXPORT(pedir("loth/export", `?format=xlsx&planId=${PO12}&solo=1`));
    expect(r.status).toBe(404);
    expect(H.list).not.toHaveBeenCalled();
  });

  it("sin sesión → 401", async () => {
    const r = await EXPORT(pedir("loth/export", `?format=xlsx&planId=${PO12}&solo=1`, false));
    expect(r.status).toBe(401);
  });
});

describe("Libro LO-TH impreso de un permiso", () => {
  function ventanaFalsa() {
    const escrito: string[] = [];
    const w = {
      print: vi.fn(),
      focus: vi.fn(),
      close: vi.fn(),
      document: {
        open: vi.fn(() => {
          escrito.length = 0;
        }),
        write: vi.fn((h: string) => {
          escrito.push(h);
        }),
        close: vi.fn(),
        getElementById: vi.fn(() => ({ addEventListener: vi.fn() })),
      },
    };
    return { w, html: () => escrito.join("") };
  }

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = new URL(url, "http://localhost");
        if (u.pathname.endsWith("/caratula")) return new Response(JSON.stringify({ active: { titularName: "QA Forestal" } }), { status: 200 });
        return new Response(JSON.stringify({ entries: [LINEA], total: 1 }), { status: 200 });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("pide las páginas con el filtro y dice arriba de qué permiso es", async () => {
    const { printLothLibro } = await import("@/lib/forestal/loth-print");
    const v = ventanaFalsa();
    await printLothLibro({ ventana: v.w as unknown as Window, permiso: { tipo: "plan", planId: PO12, conSinPlan: false }, plan: PLAN_PO12 });
    const urls = (fetch as unknown as { mock: { calls: [string][] } }).mock.calls.map((c) => c[0]);
    expect(urls).toContain(`/api/admin/forestal/loth?limit=500&offset=0&includeAnnulled=1&planId=${PO12}&solo=1`);
    const html = v.html();
    expect(html).toContain("Libro de Operaciones — Títulos Habilitantes · Permiso PO 12");
    expect(html).toContain("data-libro-permiso");
    expect(html).toContain("<span>Permiso</span><b>PO 12 (PO)</b>");
    expect(html).toContain("<span>Resolución</span><b>RDF 012-2026</b>");
  });

  it("el permiso se escapa (el nombre lo tipea el usuario)", async () => {
    const { printLothLibro } = await import("@/lib/forestal/loth-print");
    const v = ventanaFalsa();
    await printLothLibro({
      ventana: v.w as unknown as Window,
      permiso: { tipo: "plan", planId: PO12, conSinPlan: false },
      plan: { ...PLAN_PO12, planNumber: "<img src=x onerror=alert(1)>" },
    });
    expect(v.html()).not.toContain("<img src=x");
    expect(v.html()).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
});
