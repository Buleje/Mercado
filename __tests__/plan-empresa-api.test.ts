/**
 * __tests__/plan-empresa-api.test.ts — las rutas del plan de la empresa
 * (ADR-497) corriendo de verdad contra un Prisma en memoria, así que el test
 * cubre juntos la ruta, `PlanEmpresaDB` y la forma de la respuesta que lee
 * `hooks/use-plan-empresa.tsx` y `HistorialSeccion`:
 *
 * - versión 0 crea; versión vieja → 409 `cambio_en_paralelo` con lo de ahora;
 * - socios e inversión: sólo admin/dueño (el manager pasa `requireAdmin` por el
 *   bypass de management-tier, así que se cierran en la ruta);
 * - `ocultas` para el cajero; sección inexistente → 404; datos inválidos → 422;
 * - historial más nuevo primero, máx 30, y volver a una versión = una nueva;
 * - el negocio sale de la sesión: lo de un tenant no aparece en otro.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { AdminRole } from "@/lib/session";

vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: vi.fn(() => null) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

/** Réplica de `requireAdmin`: allowedRoles + el bypass de admin/owner/manager. */
let sesion: { role: AdminRole; username: string; tenantId: string } = { role: "admin", username: "qa", tenantId: "t1" };
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(async (_req: unknown, roles?: readonly AdminRole[]) => {
    const tier = ["admin", "owner", "manager"].includes(sesion.role);
    if (roles && !tier && !roles.includes(sesion.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return sesion;
  }),
}));

vi.mock("@/lib/db/membrete.db", () => ({
  MembreteDB: {
    del: vi.fn(async () => ({
      nombre: "Bodega San Martín",
      ruc: "20123456789",
      logoUrl: null,
      telefono: "999",
      direccion: "Jr. Lima 1",
      pie: "no tiene que viajar",
    })),
  },
}));

// ── Prisma en memoria (sólo lo que usa PlanEmpresaDB) ───────────────────────
type Fila = Record<string, unknown>;
const tablas = { secciones: [] as Fila[], versiones: [] as Fila[] };
let ids = 0;

function coincide(fila: Fila, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === "object" && "in" in v) return (v as { in: unknown[] }).in.includes(fila[k]);
    if (v && typeof v === "object" && "lte" in v) return (fila[k] as number) <= (v as { lte: number }).lte;
    return fila[k] === v;
  });
}

const planEmpresaSeccion = {
  findMany: vi.fn(async ({ where }: { where: Fila }) => tablas.secciones.filter((f) => coincide(f, where))),
  findUnique: vi.fn(async ({ where }: { where: { tenantId_seccion: Fila } }) =>
    tablas.secciones.find((f) => coincide(f, where.tenantId_seccion)) ?? null,
  ),
  createMany: vi.fn(async ({ data }: { data: Fila[] }) => {
    let count = 0;
    for (const d of data) {
      if (tablas.secciones.some((f) => f.tenantId === d.tenantId && f.seccion === d.seccion)) continue; // ON CONFLICT DO NOTHING
      tablas.secciones.push({ id: `s${++ids}`, ...d });
      count++;
    }
    return { count };
  }),
  updateMany: vi.fn(async ({ where, data }: { where: Fila; data: Fila }) => {
    const filas = tablas.secciones.filter((f) => coincide(f, where));
    for (const f of filas) Object.assign(f, data);
    return { count: filas.length };
  }),
};
const planEmpresaVersion = {
  createMany: vi.fn(async ({ data }: { data: Fila[] }) => {
    for (const d of data) {
      if (tablas.versiones.some((f) => f.tenantId === d.tenantId && f.seccion === d.seccion && f.version === d.version)) {
        throw new Error("P2002 PlanEmpresaVersion_tenantId_seccion_version_key");
      }
      tablas.versiones.push({ id: `v${++ids}`, ...d });
    }
    return { count: data.length };
  }),
  findMany: vi.fn(async ({ where, take }: { where: Fila; take: number }) =>
    tablas.versiones
      .filter((f) => coincide(f, where))
      .sort((a, b) => (b.version as number) - (a.version as number))
      .slice(0, take),
  ),
  findUnique: vi.fn(async ({ where }: { where: { tenantId_seccion_version: Fila } }) =>
    tablas.versiones.find((f) => coincide(f, where.tenantId_seccion_version)) ?? null,
  ),
  deleteMany: vi.fn(async ({ where }: { where: Fila }) => {
    const antes = tablas.versiones.length;
    tablas.versiones = tablas.versiones.filter((f) => !coincide(f, where));
    return { count: antes - tablas.versiones.length };
  }),
};
const fakePrisma = {
  planEmpresaSeccion,
  planEmpresaVersion,
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(fakePrisma)),
};
vi.mock("@/lib/prisma", () => ({ prisma: fakePrisma }));

const planRoute = await import("@/app/api/admin/planificacion/route");
const seccionRoute = await import("@/app/api/admin/planificacion/[seccion]/route");
const historialRoute = await import("@/app/api/admin/planificacion/[seccion]/historial/route");
const { MAX_VERSIONES_PLAN } = await import("@/lib/db/plan-empresa.db");

function req(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`https://host${url}`, {
    method,
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
}
const ctx = (seccion: string) => ({ params: Promise.resolve({ seccion }) });
const como = (role: AdminRole, tenantId = "t1") => {
  sesion = { role, username: `u-${role}`, tenantId };
};
const leerPlan = async () => planRoute.GET(req("/api/admin/planificacion", "GET"));
const guardar = (seccion: string, version: number, datos: unknown) =>
  seccionRoute.PUT(req(`/api/admin/planificacion/${seccion}`, "PUT", { version, datos }), ctx(seccion));
const historial = (seccion: string) => historialRoute.GET(req(`/api/admin/planificacion/${seccion}/historial`, "GET"), ctx(seccion));
const volver = (seccion: string, version: unknown) =>
  historialRoute.POST(req(`/api/admin/planificacion/${seccion}/historial`, "POST", { version }), ctx(seccion));

beforeEach(() => {
  tablas.secciones = [];
  tablas.versiones = [];
  como("admin");
});

describe("GET /api/admin/planificacion", () => {
  it("admin: las 12 secciones (nunca guardadas = versión 0 y vacías), puede editar, membrete de 5 campos", async () => {
    const res = await leerPlan();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body.secciones)).toHaveLength(12);
    expect(body.secciones.ficha).toEqual(expect.objectContaining({ version: 0, actualizado: null, autor: null }));
    expect(body.secciones.ficha.datos.razonSocial).toBe("");
    expect(body.ocultas).toEqual([]);
    expect(body.puedeEditar).toBe(true);
    expect(body.membrete).toEqual({ nombre: "Bodega San Martín", ruc: "20123456789", logoUrl: null, telefono: "999", direccion: "Jr. Lima 1" });
  });

  it("cajero: socios e inversión van en `ocultas` y fuera de `secciones`; no edita", async () => {
    como("cajero");
    const body = await (await leerPlan()).json();
    expect(body.ocultas).toEqual(["socios", "inversion"]);
    expect(body.secciones).not.toHaveProperty("socios");
    expect(body.secciones).not.toHaveProperty("inversion");
    expect(Object.keys(body.secciones)).toHaveLength(10);
    expect(body.puedeEditar).toBe(false);
  });

  it("manager: edita, pero tampoco ve socios ni inversión", async () => {
    como("manager");
    const body = await (await leerPlan()).json();
    expect(body.ocultas).toEqual(["socios", "inversion"]);
    expect(body.puedeEditar).toBe(true);
  });

  it("un rol fuera de la lista (proveedor) → 403", async () => {
    como("proveedor");
    expect((await leerPlan()).status).toBe(403);
  });

  it("un documento roto en la base se lee vacío; un campo nuevo toma su default", async () => {
    tablas.secciones.push(
      { tenantId: "t1", seccion: "foda", datos: "basura", version: 3, updatedBy: "x", updatedAt: new Date() },
      { tenantId: "t1", seccion: "ficha", datos: { razonSocial: "Musa SAC" }, version: 1, updatedBy: "x", updatedAt: new Date() },
    );
    const body = await (await leerPlan()).json();
    expect(body.secciones.foda).toMatchObject({ version: 3, datos: { fortalezas: [], amenazas: [] } });
    expect(body.secciones.ficha.datos).toMatchObject({ razonSocial: "Musa SAC", horario: "" });
  });
});

describe("PUT /api/admin/planificacion/[seccion]", () => {
  it("versión 0 crea la 1; con la vieja → 409 cambio_en_paralelo con lo de ahora", async () => {
    const r1 = await guardar("identidad", 0, { mision: "Abastecer al barrio" });
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual(
      expect.objectContaining({ version: 1, autor: "u-admin", datos: expect.objectContaining({ mision: "Abastecer al barrio", vision: "" }) }),
    );

    const r2 = await guardar("identidad", 1, { mision: "Abastecer a Constitución" });
    expect((await r2.json()).version).toBe(2);

    // Otro escritorio todavía tenía la 1.
    const choque = await guardar("identidad", 1, { mision: "pisaría lo de arriba" });
    expect(choque.status).toBe(409);
    const c = await choque.json();
    expect(c.code).toBe("cambio_en_paralelo");
    expect(c.error).toEqual(expect.any(String));
    expect(c.actual).toMatchObject({ version: 2, autor: "u-admin", datos: { mision: "Abastecer a Constitución" } });
    // No se escribió nada.
    expect(tablas.secciones.find((f) => f.seccion === "identidad")?.version).toBe(2);
    expect(tablas.versiones.filter((v) => v.seccion === "identidad")).toHaveLength(2);
  });

  it("versión 0 cuando otro ya la creó → 409 (no la pisa)", async () => {
    await guardar("foda", 0, { fortalezas: [{ id: "f1", texto: "Ubicación" }] });
    const r = await guardar("foda", 0, {});
    expect(r.status).toBe(409);
    expect((await r.json()).actual.datos.fortalezas).toHaveLength(1);
  });

  it("cajero no escribe; manager escribe ficha pero no socios (403)", async () => {
    como("cajero");
    expect((await guardar("ficha", 0, {})).status).toBe(403);
    como("manager");
    expect((await guardar("ficha", 0, { rubro: "bodega" })).status).toBe(200);
    expect((await guardar("socios", 0, { items: [] })).status).toBe(403);
    como("owner");
    expect((await guardar("socios", 0, { items: [{ id: "a", nombre: "Ana", aporte: 2500 }] })).status).toBe(200);
  });

  it("una sección de más de 512 KB → 413 y no se guarda", async () => {
    const acciones = Array.from({ length: 60 }, (_, i) => ({ id: `a${i}`, texto: "x".repeat(600) }));
    const items = Array.from({ length: 20 }, (_, i) => ({ id: `o${i}`, titulo: `Objetivo ${i}`, acciones }));
    const r = await guardar("objetivos", 0, { items });
    expect(r.status).toBe(413);
    expect((await r.json()).code).toBe("too_large");
    expect((await guardar("objetivos", 0, { items: [] })).status).toBe(200);
  });

  it("sección inexistente → 404", async () => {
    const r = await guardar("planetas", 0, {});
    expect(r.status).toBe(404);
  });

  it("datos inválidos o sin versión → 422 con issues", async () => {
    const r = await guardar("ficha", 0, { tipoSociedad: "Sociedad lunar" });
    expect(r.status).toBe(422);
    const b = await r.json();
    expect(b.code).toBe("validation_error");
    expect(b.issues.length).toBeGreaterThan(0);

    const sinVersion = await seccionRoute.PUT(req("/api/admin/planificacion/ficha", "PUT", { datos: {} }), ctx("ficha"));
    expect(sinVersion.status).toBe(422);
    expect(tablas.secciones).toHaveLength(0);
  });

  it("el negocio sale de la sesión: lo de t1 no aparece en t2", async () => {
    await guardar("ficha", 0, { razonSocial: "Bodega de t1" });
    como("admin", "t2");
    const body = await (await leerPlan()).json();
    expect(body.secciones.ficha).toMatchObject({ version: 0, datos: { razonSocial: "" } });
    // Y t2 crea su propia versión 1 sin chocar con la de t1.
    expect((await guardar("ficha", 0, { razonSocial: "Bodega de t2" })).status).toBe(200);
  });
});

describe("historial", () => {
  it("más nueva primero; volver a la 1 crea la 4 con sus datos; una que no está → 404", async () => {
    await guardar("politicas", 0, { items: [{ id: "p", titulo: "Sin fiado" }] });
    await guardar("politicas", 1, { items: [{ id: "p", titulo: "Fiado hasta S/ 50" }] });
    await guardar("politicas", 2, { items: [{ id: "p", titulo: "Fiado hasta S/ 100" }] });

    const h = await (await historial("politicas")).json();
    expect(h.versiones.map((v: { version: number }) => v.version)).toEqual([3, 2, 1]);
    expect(h.versiones[0]).toEqual({ version: 3, autor: "u-admin", creado: expect.any(String) });

    const r = await volver("politicas", 1);
    expect(r.status).toBe(200);
    const g = await r.json();
    expect(g.version).toBe(4);
    expect(g.datos.items[0].titulo).toBe("Sin fiado");
    expect(tablas.secciones.find((f) => f.seccion === "politicas")?.version).toBe(4);

    expect((await volver("politicas", 99)).status).toBe(404);
    expect((await volver("politicas", "uno")).status).toBe(422);
  });

  it(`guarda las ${MAX_VERSIONES_PLAN} más nuevas por sección`, async () => {
    for (let v = 0; v < MAX_VERSIONES_PLAN + 2; v++) {
      expect((await guardar("objetivos", v, { items: [] })).status).toBe(200);
    }
    const { versiones } = await (await historial("objetivos")).json();
    expect(versiones).toHaveLength(MAX_VERSIONES_PLAN);
    expect(versiones[0].version).toBe(MAX_VERSIONES_PLAN + 2);
    expect(versiones.at(-1).version).toBe(3);
    expect(tablas.versiones.filter((v) => v.seccion === "objetivos")).toHaveLength(MAX_VERSIONES_PLAN);
  });

  it("cajero: ve el historial de la ficha pero no el de socios (403) ni vuelve atrás", async () => {
    await guardar("socios", 0, { items: [] });
    como("cajero");
    expect((await historial("ficha")).status).toBe(200);
    expect((await historial("socios")).status).toBe(403);
    expect((await volver("ficha", 1)).status).toBe(403);
  });

  it("sección inexistente → 404", async () => {
    expect((await historial("planetas")).status).toBe(404);
    expect((await volver("planetas", 1)).status).toBe(404);
  });
});
