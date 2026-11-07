import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";

/**
 * GET /api/search (⌘K del panel) con el `requireAdmin` REAL: qué grupos ve
 * cada rol, que el tenant sale del JWT (nunca del header) y que los grupos
 * del aserradero usan los mismos roles que sus rutas.
 */
const H = vi.hoisted(() => ({
  payload: null as null | { username: string; role: string; tenantId: string },
  specs: new Set<string>(["spec:forestal:ctp-libro", "spec:forestal:loth-libro"]),
  llamadas: [] as { metodo: string; tenantId: string; extra?: unknown }[],
}));

vi.mock("@/lib/session", async (real) => ({
  ...(await real<typeof import("@/lib/session")>()),
  getSessionPayload: async () => H.payload,
}));
vi.mock("@/lib/auth/session-revocation", () => ({ isSessionRevoked: () => false }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: async (_t: string, spec: string) => H.specs.has(spec) }));
vi.mock("@/lib/inventario/stock-minimo.server", () => ({ minimoGlobalDelNegocio: async () => 5 }));
vi.mock("@/lib/db/forest-anexos.db", () => ({
  ForestAnexosDB: {
    list: async (tenantId: string) => {
      H.llamadas.push({ metodo: "anexos", tenantId });
      return [{ id: "ax1", numero: "2-19-0491391", gtf: "19-001-0000071", fecha: "2026-10-20", empresa: "Blas", totalPiezas: 3, totalM3: 4.5, permiso: "19-SEC/REG-PLT-2025-167" }];
    },
  },
}));
vi.mock("@/lib/db/buscador-panel.db", () => {
  const fila = (metodo: string, valor: unknown) => async (tenantId: string, _q: string, extra?: unknown) => {
    H.llamadas.push({ metodo, tenantId, extra });
    return [valor];
  };
  return {
    BuscadorPanelDB: {
      productos: fila("productos", { id: 1, name: "Arroz 0000071", category: "Abarrotes", price: 4.5, stock: 2, stockMin: null }),
      clientes: fila("clientes", { phone: "999000071", name: "Cliente 0000071", location: "" }),
      pedidos: fila("pedidos", { id: "P0000071", customerName: "Ana", total: 10, createdAt: new Date("2026-10-20T15:00:00Z"), status: "pendiente" }),
      proveedores: fila("proveedores", { id: "s1", name: "Prov 0000071", phone: null, ruc: null }),
      guias: fila("guias", { id: "we1", origen: "ingreso", gtfNumber: "19-001-0000071", quien: "Blas", fecha: new Date("2026-10-20T00:00:00Z"), volumenM3: 12.5, anulada: false }),
      trozas: fila("trozas", { id: "tz1", codificacion: "0000071-A", codigoPlanta: null, especie: "Tornillo", gtfNumber: "19-001-0000071", loteCodigo: null, estado: "patio" }),
      permisos: fila("permisos", { id: "c1", codigo: "19-SEC/REG-PLT-0000071", alias: null, titularNombre: "Blas", tipo: null, vigenciaHasta: null, estado: "vigente" }),
      permisosRelacionados: async (tenantId: string, ids: string[], codigos: string[]) => {
        H.llamadas.push({ metodo: "permisosRelacionados", tenantId, extra: { ids, codigos } });
        return [{ id: "c167", codigo: "19-SEC/REG-PLT-2025-167", alias: null, titularNombre: "Blas", tipo: null, vigenciaHasta: null, estado: "vigente" }];
      },
      lotes: fila("lotes", { id: "l1", code: "L-0000071", especie: "Tornillo", status: "abierto", permiso: null, fechaApertura: new Date("2026-10-01T12:00:00Z") }),
      partes: fila("partes", { id: "p1", nombre: "Maderera 0000071", roles: ["proveedor"], docTipo: "RUC", docNumero: "20100000071" }),
      trabajadores: fila("trabajadores", { id: "w1", nombre: "Mario 0000071", apodo: null, puesto: "Aserrador", estado: "ACTIVO" }),
    },
  };
});

import { GET } from "@/app/api/search/route";
import { ROLES_FORESTAL_LECTURA } from "@/lib/admin/busqueda-remota";

interface Respuesta { results?: { id: string; type: string; href?: string; subtitle: string; sinContar?: boolean; entidad?: string }[]; error?: string }

async function buscar(q: string, opts: { sinCookie?: boolean; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { ...(opts.sinCookie ? {} : { cookie: "buleje-admin-sess=token-falso" }), ...opts.headers };
  const res = await GET(new NextRequest(`http://localhost/api/search?q=${encodeURIComponent(q)}`, { headers }));
  return { status: res.status, body: (await res.json()) as Respuesta, cache: res.headers.get("cache-control") };
}
const tipos = (b: Respuesta) => [...new Set((b.results ?? []).map((r) => r.type))].sort();
const como = (role: string, tenantId = "t-blas") => {
  H.payload = { username: `qa-${role}`, role, tenantId };
};

beforeEach(() => {
  H.payload = null;
  H.llamadas = [];
  H.specs = new Set(["spec:forestal:ctp-libro", "spec:forestal:loth-libro"]);
});

describe("GET /api/search — sesión y roles", () => {
  it("sin sesión: 401 y no toca la base", async () => {
    const r = await buscar("0000071", { sinCookie: true });
    expect(r.status).toBe(401);
    expect(H.llamadas).toEqual([]);
  });

  it("repartidor y proveedor no usan el buscador del panel: 403", async () => {
    for (const role of ["delivery", "proveedor"]) {
      como(role);
      expect((await buscar("0000071")).status).toBe(403);
    }
    expect(H.llamadas).toEqual([]);
  });

  it("admin ve todos los grupos, con documento del trabajador en el filtro y respuesta sin caché", async () => {
    como("admin");
    const r = await buscar("0000071");
    expect(r.status).toBe(200);
    expect(r.cache).toContain("no-store");
    expect(tipos(r.body)).toEqual(["anexo", "cliente", "guia", "lote", "parte", "pedido", "permiso", "producto", "proveedor", "trabajador", "troza"]);
    expect(H.llamadas.find((l) => l.metodo === "trabajadores")?.extra).toBe(true);
    /* El trabajador abre su ficha; la fila de apoyo, la asistencia. */
    const trabajadores = r.body.results?.filter((x) => x.type === "trabajador") ?? [];
    expect(trabajadores[0].href).toContain("persona=w1");
    expect(trabajadores.at(-1)).toMatchObject({ sinContar: true, href: expect.stringContaining("vista=asistencia") });
  });

  it("«0000071» trae también el permiso con que salió la guía (del Anexo 04), marcado «De la guía»", async () => {
    como("admin");
    const r = await buscar("0000071");
    expect(H.llamadas.find((l) => l.metodo === "permisosRelacionados")?.extra).toEqual({ ids: [""], codigos: ["19-SEC/REG-PLT-2025-167"] });
    const permisos = r.body.results?.filter((x) => x.type === "permiso") ?? [];
    expect(permisos.map((p) => p.id)).toEqual(["permiso-c1", "permiso-c167"]);
    expect(permisos[1]).toMatchObject({ entidad: "De la guía", href: expect.stringContaining("contrato=c167") });
  });

  it("manager (gestión) ve todo, pero el documento del trabajador no entra al filtro", async () => {
    como("manager");
    const r = await buscar("0000071");
    expect(tipos(r.body)).toContain("trabajador");
    expect(tipos(r.body)).toContain("guia");
    expect(H.llamadas.find((l) => l.metodo === "trabajadores")?.extra).toBe(false);
  });

  it("almacenero: aserradero y proveedores sí; clientes no; trabajadores sólo a la asistencia y sin documento", async () => {
    como("almacenero");
    const r = await buscar("0000071");
    expect(tipos(r.body)).toEqual(["anexo", "guia", "lote", "parte", "pedido", "permiso", "producto", "proveedor", "trabajador", "troza"]);
    expect(H.llamadas.map((l) => l.metodo)).not.toContain("clientes");
    const t = r.body.results?.filter((x) => x.type === "trabajador") ?? [];
    expect(t.every((x) => x.href?.includes("vista=asistencia"))).toBe(true);
    /* Sin ficha: el `persona=` de la asistencia sólo resalta su fila. */
    expect(t.some((x) => x.href?.includes("vista=personal"))).toBe(false);
    expect(H.llamadas.find((l) => l.metodo === "trabajadores")?.extra).toBe(false);
  });

  it("cajero: ni aserradero, ni clientes, ni proveedores (sus rutas no lo dejan); trabajadores a la asistencia", async () => {
    como("cajero");
    const r = await buscar("0000071");
    expect(tipos(r.body)).toEqual(["pedido", "producto", "trabajador"]);
    expect(H.llamadas.map((l) => l.metodo).sort()).toEqual(["pedidos", "productos", "trabajadores"]);
    expect(H.llamadas.some((l) => l.metodo === "anexos" || l.metodo === "permisosRelacionados")).toBe(false);
  });

  it("analista: bodega sin clientes ni proveedores; ni aserradero ni personal", async () => {
    como("analista");
    const r = await buscar("0000071");
    expect(tipos(r.body)).toEqual(["pedido", "producto"]);
  });

  it("ninguna fila del personal lleva plata (sueldo, tarifa, S/)", async () => {
    como("admin");
    const r = await buscar("0000071");
    for (const t of r.body.results?.filter((x) => x.type === "trabajador") ?? []) expect(t.subtitle).not.toMatch(/S\/|sueldo|tarifa/i);
  });
});

describe("GET /api/search — aislamiento por negocio", () => {
  it("admin con x-tenant-id de OTRO negocio: toda consulta va con el tenant del JWT", async () => {
    como("admin", "t-blas");
    const r = await buscar("0000071", { headers: { "x-tenant-id": "t-ajeno" } });
    expect(r.status).toBe(200);
    expect(H.llamadas.length).toBeGreaterThan(5);
    expect(new Set(H.llamadas.map((l) => l.tenantId))).toEqual(new Set(["t-blas"]));
  });

  it("almacenero con x-tenant-id de OTRO negocio: 403 y no toca la base", async () => {
    como("almacenero", "t-blas");
    const r = await buscar("0000071", { headers: { "x-tenant-id": "t-ajeno" } });
    expect(r.status).toBe(403);
    expect(H.llamadas).toEqual([]);
  });
});

describe("GET /api/search — libros encendidos y consulta", () => {
  it("sin libros forestales: ningún grupo del aserradero, aunque el rol los vea", async () => {
    H.specs = new Set();
    como("admin");
    const r = await buscar("0000071");
    expect(tipos(r.body)).toEqual(["cliente", "pedido", "producto", "proveedor", "trabajador"]);
  });

  it("sólo el LO-TH: guías y Directorio sí; trozas, permisos, lotes y anexos (Libro CTP) no", async () => {
    H.specs = new Set(["spec:forestal:loth-libro"]);
    como("admin");
    const r = await buscar("0000071");
    expect(tipos(r.body)).toEqual(expect.arrayContaining(["guia", "parte"]));
    expect(tipos(r.body)).not.toEqual(expect.arrayContaining(["troza"]));
    expect(H.llamadas.find((l) => l.metodo === "guias")?.extra).toEqual({ conCtp: false, conLoth: true });
  });

  it("menos de 2 letras: vacío sin tocar la base; más de 200: 400", async () => {
    como("admin");
    expect((await buscar("a")).body.results).toEqual([]);
    expect(H.llamadas).toEqual([]);
    expect((await buscar("x".repeat(201))).status).toBe(400);
  });
});

describe("los grupos del aserradero usan los roles de sus rutas", () => {
  const raiz = path.resolve(__dirname, "../../app/api/admin/forestal");
  const rolesDelGet = (ruta: string): string[] => {
    const src = readFileSync(path.join(raiz, ruta, "route.ts"), "utf8");
    const get = src.slice(src.search(/export (async function GET|const GET =)/));
    const directo = get.match(/requireAdmin\(req, \[([^\]]*)\]\)/);
    /* lotes-aserrio: `guard(req)` con los roles por defecto. */
    const lista = directo && !/await guard\(req\)/.test(get.slice(0, directo.index)) ? directo[1] : src.match(/function guard\([^)]*roles: AdminRole\[\] = \[([^\]]*)\]/)?.[1];
    return (lista ?? "").split(",").map((s) => s.trim().replace(/"/g, "")).filter(Boolean).sort();
  };
  it.each(["trozas", "contratos", "directorio", "anexos", "gtf", "wood-entries", "lotes-aserrio"])("%s", (ruta) => {
    expect(rolesDelGet(ruta)).toEqual([...ROLES_FORESTAL_LECTURA].sort());
  });
});
