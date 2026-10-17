/**
 * Conteo físico: abrir, listar y cerrar con ajuste de stock.
 *
 * Fija el comportamiento de las rutas `app/api/inventory/conteo/**` contra una
 * base en memoria (no mocks por llamada): el test mira el ESTADO que queda
 * —stock de cada producto, renglones del kardex, estado del conteo— para que
 * siga valiendo aunque la consulta cambie de forma (de prisma directo en la
 * ruta a `InventoryConteoItemsDB`).
 *
 * `$transaction` corre en fila y deshace todo si el callback tira, como la
 * base real con el candado de fila del conteo.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const h = vi.hoisted(() => {
  type Fila = Record<string, unknown>;
  const db = {
    conteos: [] as Fila[],
    items: [] as Fila[],
    products: [] as Fila[],
    movs: [] as Fila[],
  };
  let seq = 0;

  function cumple(fila: Fila, where: Record<string, unknown> | undefined): boolean {
    if (!where) return true;
    for (const [k, v] of Object.entries(where)) {
      if (v === undefined) continue;
      if (k === "conteo") {
        const padre = db.conteos.find((c) => c.id === fila.conteoId);
        if (!padre || !cumple(padre, v as Record<string, unknown>)) return false;
        continue;
      }
      if (v !== null && typeof v === "object" && !(v instanceof Date)) {
        const op = v as { not?: unknown; in?: unknown[] };
        if ("not" in op && fila[k] === op.not) return false;
        if ("in" in op && !(op.in ?? []).includes(fila[k])) return false;
        continue;
      }
      if (fila[k] !== v) return false;
    }
    return true;
  }

  function noEncontrado(): Error {
    return Object.assign(new Error("Record to update not found."), { code: "P2025" });
  }

  function itemsDe(conteoId: unknown) {
    return db.items.filter((i) => i.conteoId === conteoId).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  }

  const prisma = {
    conteoFisico: {
      findFirst: async ({ where, include }: { where: Record<string, unknown>; include?: { items?: boolean } }) => {
        const c = db.conteos.find((f) => cumple(f, where));
        if (!c) return null;
        return include?.items ? { ...c, items: itemsDe(c.id).map((i) => ({ ...i })) } : { ...c };
      },
      findMany: async ({ where, take }: { where: Record<string, unknown>; take?: number }) =>
        db.conteos
          .filter((f) => cumple(f, where))
          .sort((a, b) => (b.fechaInicio as Date).getTime() - (a.fechaInicio as Date).getTime())
          .slice(0, take ?? 1000)
          .map((c) => ({ ...c, _count: { items: itemsDe(c.id).length } })),
      create: async ({ data }: { data: Fila & { items: { create: Fila[] } } }) => {
        const id = `conteo-${++seq}`;
        const { items, ...resto } = data;
        const c = { id, fechaInicio: new Date(Date.now() + seq), fechaCierre: null, ...resto };
        db.conteos.push(c);
        for (const it of items.create) {
          db.items.push({ id: `item-${++seq}`, conteoId: id, stockContado: null, diferencia: null, ajustado: false, ...it });
        }
        return { ...c, items: itemsDe(id) };
      },
      update: async ({ where, data }: { where: Record<string, unknown>; data: Fila }) => {
        const c = db.conteos.find((f) => cumple(f, where));
        if (!c) throw noEncontrado();
        Object.assign(c, data);
        return { ...c };
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Fila }) => {
        const filas = db.conteos.filter((f) => cumple(f, where));
        filas.forEach((f) => Object.assign(f, data));
        return { count: filas.length };
      },
    },
    conteoFisicoItem: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        db.items.filter((f) => cumple(f, where)).sort((a, b) => String(a.id).localeCompare(String(b.id))).map((i) => ({ ...i })),
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const i = db.items.find((f) => cumple(f, where));
        return i ? { ...i } : null;
      },
      update: async ({ where, data }: { where: Record<string, unknown>; data: Fila }) => {
        const i = db.items.find((f) => cumple(f, where));
        if (!i) throw noEncontrado();
        Object.assign(i, data);
        return { ...i };
      },
    },
    product: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        db.products
          .filter((f) => cumple(f, where))
          .sort((a, b) => String(a.name).localeCompare(String(b.name)))
          .map((p) => ({ id: p.id, stock: p.stock })),
      update: async ({ where, data }: { where: Record<string, unknown>; data: Fila }) => {
        const p = db.products.find((f) => cumple(f, where));
        if (!p) throw noEncontrado();
        Object.assign(p, data);
        return { ...p };
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Fila }) => {
        const filas = db.products.filter((f) => cumple(f, where));
        filas.forEach((f) => Object.assign(f, data));
        return { count: filas.length };
      },
    },
    inventoryMovement: {
      create: async ({ data }: { data: Fila }) => {
        const m = { id: `mov-${++seq}`, ...data };
        db.movs.push(m);
        return m;
      },
      createMany: async ({ data }: { data: Fila[] }) => {
        for (const d of data) db.movs.push({ id: `mov-${++seq}`, ...d });
        return { count: data.length };
      },
    },
    // `SELECT "id","stock" … FOR UPDATE` del cierre: params = [tenantId, ids].
    $queryRaw: async (_sql: TemplateStringsArray, ...params: unknown[]) => {
      const [tenantId, ids] = params as [string, number[]];
      return db.products
        .filter((p) => p.tenantId === tenantId && ids.includes(p.id as number))
        .sort((a, b) => Number(a.id) - Number(b.id))
        .map((p) => ({ id: p.id, stock: p.stock }));
    },
    // En fila (como el candado de fila del conteo) y con rollback si tira.
    $transaction: async <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const turno = cola.then(async () => {
        const foto = structuredClone({ conteos: db.conteos, items: db.items, products: db.products, movs: db.movs });
        try {
          return await fn(prisma);
        } catch (e) {
          db.conteos = foto.conteos;
          db.items = foto.items;
          db.products = foto.products;
          db.movs = foto.movs;
          throw e;
        }
      });
      cola = turno.catch(() => undefined);
      return turno;
    },
  };
  let cola: Promise<unknown> = Promise.resolve();

  return {
    db,
    prisma,
    requireAdmin: vi.fn(),
    revalidateTenantTag: vi.fn(),
    revalidateTag: vi.fn(),
    invalidate: vi.fn(),
    getOrSet: vi.fn(async (_k: string, _ttl: number, fn: () => Promise<unknown>) => fn()),
    logAudit: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: h.prisma }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: h.requireAdmin }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/billing/require-active-subscription", () => ({ requireActiveSubscription: vi.fn(async () => null) }));
vi.mock("@/lib/audit-logger", () => ({ logAudit: h.logAudit }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("next/cache", async (orig) => ({
  ...(await orig<typeof import("next/cache")>()),
  revalidateTag: h.revalidateTag,
}));
vi.mock("@/lib/cache", () => ({
  revalidateTenantTag: h.revalidateTenantTag,
  invalidate: h.invalidate,
  invalidateByPrefix: vi.fn(),
  getOrSet: h.getOrSet,
}));

import { POST as cerrar } from "@/app/api/inventory/conteo/[id]/close/route";
import { POST as abrir, GET as listar } from "@/app/api/inventory/conteo/route";
import { PATCH as contar } from "@/app/api/inventory/conteo/[id]/items/route";

const T1 = "tenant-uno";
const T2 = "tenant-otro";

function sesion(tenantId = T1, username = "qaadmin") {
  h.requireAdmin.mockResolvedValue({ tenantId, username, role: "admin" });
}

function req(url: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method: body === undefined ? (url.endsWith("/close") ? "POST" : "GET") : "POST",
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  });
}

function cerrarConteo(id: string) {
  return cerrar(req(`/api/inventory/conteo/${id}/close`), { params: Promise.resolve({ id }) });
}

function producto(id: number, stock: number, tenantId = T1, extra: Record<string, unknown> = {}) {
  h.db.products.push({ id, tenantId, stock, name: `P${String(id).padStart(3, "0")}`, active: true, deletedAt: null, category: "abarrotes", ...extra });
}

/**
 * Conteo de T1 con los cinco casos de ítem que importan al cerrar. El stock de
 * cada producto es el de la foto (`stockSistema`): nadie vendió desde que se abrió.
 */
function sembrarConteoT1(status = "EN_PROGRESO") {
  h.db.conteos.push({ id: "c1abcdefghij", tenantId: T1, tipo: "completo", status, creadoPor: "qaadmin", fechaInicio: new Date(), fechaCierre: null });
  const item = (n: string, productId: number, stockSistema: number, stockContado: number | null, diferencia: number | null, ajustado: boolean) => {
    producto(productId, stockSistema);
    h.db.items.push({ id: `i${n}`, conteoId: "c1abcdefghij", productId, stockSistema, stockContado, diferencia, ajustado });
  };
  item("1", 101, 10, 8, -2, true); // faltan 2 → ajuste_negativo
  item("2", 102, 10, 15, 5, true); // sobran 5 → ajuste_positivo
  item("3", 103, 7, 7, 0, false); // cuadra → nada
  item("4", 104, 5, 3, -2, false); // diferencia destildada → nada
  item("5", 105, 4, null, null, false); // sin contar → nada
}

beforeEach(() => {
  h.db.conteos = [];
  h.db.items = [];
  h.db.products = [];
  h.db.movs = [];
  vi.clearAllMocks();
  sesion();
});

describe("POST /api/inventory/conteo/[id]/close", () => {
  it("ajusta sólo las diferencias tildadas, deja el kardex y cierra", async () => {
    sembrarConteoT1();
    const res = await cerrarConteo("c1abcdefghij");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      message: "Conteo cerrado exitosamente",
      resumen: { totalItems: 5, contados: 4, conDiferencia: 3, ajustados: 2 },
    });
    expect(h.requireAdmin).toHaveBeenCalledWith(expect.anything(), ["admin"]);

    const stock = Object.fromEntries(h.db.products.map((p) => [p.id, p.stock]));
    expect(stock).toEqual({ 101: 8, 102: 15, 103: 7, 104: 5, 105: 4 });

    expect(h.db.movs.map(({ id: _id, ...m }) => m)).toEqual([
      {
        productId: 101, type: "ajuste_negativo", quantity: 2, previousStock: 10, newStock: 8,
        reference: "Conteo-c1abcdef", notes: "Conteo físico: sistema=10, contado=8", createdBy: "qaadmin", tenantId: T1,
      },
      {
        productId: 102, type: "ajuste_positivo", quantity: 5, previousStock: 10, newStock: 15,
        reference: "Conteo-c1abcdef", notes: "Conteo físico: sistema=10, contado=15", createdBy: "qaadmin", tenantId: T1,
      },
    ]);

    const conteo = h.db.conteos[0];
    expect(conteo.status).toBe("CERRADO");
    expect(conteo.fechaCierre).toBeInstanceOf(Date);

    // El Inventario deja de mostrar lo de antes de contar (sin servir lo viejo
    // una vez) y se suelta el candado de ventas.
    expect(h.revalidateTag).toHaveBeenCalledWith(`tenant:${T1}:products`, { expire: 0 });
    expect(h.invalidate).toHaveBeenCalledWith(`tenant:${T1}:conteo-active`);
    expect(h.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "UPDATE", entity: "Inventory", entityId: "c1abcdefghij", user: "qaadmin", tenantId: T1,
    }));
  });

  it("un conteo ya cerrado responde 400 y no toca nada", async () => {
    sembrarConteoT1("CERRADO");
    const res = await cerrarConteo("c1abcdefghij");

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "El conteo ya está cerrado" });
    expect(h.db.movs).toHaveLength(0);
    expect(h.db.products.map((p) => p.stock)).toEqual([10, 10, 7, 5, 4]);
    expect(h.invalidate).not.toHaveBeenCalled();
  });

  it("dos cierres a la vez: uno ajusta, el otro ve CERRADO y el kardex no se duplica", async () => {
    sembrarConteoT1();
    const [a, b] = await Promise.all([cerrarConteo("c1abcdefghij"), cerrarConteo("c1abcdefghij")]);

    expect([a.status, b.status].sort()).toEqual([200, 400]);
    expect(h.db.movs).toHaveLength(2);
  });

  it("un ítem que apunta a un producto de otro negocio no lo toca: se deshace todo", async () => {
    sembrarConteoT1();
    producto(900, 50, T2);
    h.db.items.push({ id: "i6", conteoId: "c1abcdefghij", productId: 900, stockSistema: 50, stockContado: 1, diferencia: -49, ajustado: true });
    const res = await cerrarConteo("c1abcdefghij");

    expect(res.status).toBe(500);
    expect(h.db.products.find((p) => p.id === 900)?.stock).toBe(50);
    expect(h.db.movs).toHaveLength(0);
    expect(h.db.conteos[0].status).toBe("EN_PROGRESO");
  });

  it("el kardex parte del stock de HOY, no de la foto de cuando se abrió el conteo", async () => {
    // Abierto con 10 y 10; desde entonces se vendió: hoy hay 3 y 4.
    h.db.conteos.push({ id: "c3viejoabcde", tenantId: T1, tipo: "completo", status: "EN_PROGRESO", creadoPor: "qaadmin", fechaInicio: new Date(), fechaCierre: null });
    producto(201, 3);
    producto(202, 4);
    h.db.items.push({ id: "j1", conteoId: "c3viejoabcde", productId: 201, stockSistema: 10, stockContado: 5, diferencia: -5, ajustado: true });
    h.db.items.push({ id: "j2", conteoId: "c3viejoabcde", productId: 202, stockSistema: 10, stockContado: 4, diferencia: -6, ajustado: true });
    const res = await cerrarConteo("c3viejoabcde");

    expect(res.status).toBe(200);
    expect(Object.fromEntries(h.db.products.map((p) => [p.id, p.stock]))).toEqual({ 201: 5, 202: 4 });
    // 3 → 5 es entrada de 2 (no salida de 5); 202 ya tenía lo contado: sin renglón.
    expect(h.db.movs.map(({ id: _id, ...m }) => m)).toEqual([
      {
        productId: 201, type: "ajuste_positivo", quantity: 2, previousStock: 3, newStock: 5,
        reference: "Conteo-c3viejoa", notes: "Conteo físico: sistema=3, contado=5, al abrir=10", createdBy: "qaadmin", tenantId: T1,
      },
    ]);
  });

  it("el conteo de otro negocio da 404 y no lo cierra", async () => {
    sembrarConteoT1();
    sesion(T2);
    const res = await cerrarConteo("c1abcdefghij");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Conteo no encontrado" });
    expect(h.db.conteos[0].status).toBe("EN_PROGRESO");
    expect(h.db.movs).toHaveLength(0);
  });

  it("sin sesión responde lo que diga requireAdmin (401) sin leer la base", async () => {
    sembrarConteoT1();
    h.requireAdmin.mockResolvedValue(NextResponse.json({ error: "No autorizado" }, { status: 401 }));
    const res = await cerrarConteo("c1abcdefghij");

    expect(res.status).toBe(401);
    expect(h.db.conteos[0].status).toBe("EN_PROGRESO");
  });

  it("si un ajuste falla se deshace todo: ni stock, ni kardex, ni cierre", async () => {
    sembrarConteoT1();
    h.db.products = h.db.products.filter((p) => p.id !== 102); // borrado a mitad del conteo
    const res = await cerrarConteo("c1abcdefghij");

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Error al cerrar conteo" });
    expect(h.db.products.find((p) => p.id === 101)?.stock).toBe(10);
    expect(h.db.movs).toHaveLength(0);
    expect(h.db.conteos[0].status).toBe("EN_PROGRESO");
    expect(h.invalidate).not.toHaveBeenCalled();
  });
});

describe("POST/GET /api/inventory/conteo", () => {
  it("abre el conteo con los productos activos del negocio y activa el candado", async () => {
    producto(1, 4);
    producto(2, 0, T1, { category: "bebidas" });
    producto(3, 9, T1, { active: false });
    producto(4, 9, T1, { deletedAt: new Date() });
    producto(5, 9, T2);

    const res = await abrir(req("/api/inventory/conteo", { tipo: "completo" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ tipo: "completo", status: "INICIADO", totalItems: 2, message: "Se generaron 2 productos para contar" });

    const conteo = h.db.conteos.find((c) => c.id === body.id);
    expect(conteo).toMatchObject({ tenantId: T1, creadoPor: "qaadmin" });
    expect(h.db.items.map((i) => [i.productId, i.stockSistema])).toEqual([[1, 4], [2, 0]]);
    expect(h.getOrSet).toHaveBeenCalledWith(`tenant:${T1}:conteo-active`, 3600, expect.any(Function));
  });

  it("por categoría cuenta sólo esa; sin productos responde 400", async () => {
    producto(1, 4);
    producto(2, 6, T1, { category: "bebidas" });
    const res = await abrir(req("/api/inventory/conteo", { tipo: "categoria", categoria: "bebidas" }));
    expect((await res.json()).totalItems).toBe(1);

    const vacio = await abrir(req("/api/inventory/conteo", { tipo: "categoria", categoria: "no-existe" }));
    expect(vacio.status).toBe(400);
    expect(await vacio.json()).toEqual({ error: "No hay productos activos para contar" });
  });

  it("lista sólo los conteos del negocio, con filtro de estado y cantidad de ítems", async () => {
    sembrarConteoT1();
    h.db.conteos.push({ id: "c2", tenantId: T1, tipo: "completo", status: "CERRADO", creadoPor: "x", fechaInicio: new Date(Date.now() - 1000), fechaCierre: new Date() });
    h.db.conteos.push({ id: "ajeno", tenantId: T2, tipo: "completo", status: "CERRADO", creadoPor: "x", fechaInicio: new Date(), fechaCierre: new Date() });

    const todos = await (await listar(req("/api/inventory/conteo"))).json();
    expect(todos.map((c: { id: string }) => c.id)).toEqual(["c1abcdefghij", "c2"]);
    expect(todos[0]._count).toEqual({ items: 5 });

    const cerrados = await (await listar(req("/api/inventory/conteo?status=CERRADO"))).json();
    expect(cerrados.map((c: { id: string }) => c.id)).toEqual(["c2"]);
  });
});

describe("PATCH /api/inventory/conteo/[id]/items", () => {
  function patch(id: string, body: unknown) {
    return contar(req(`/api/inventory/conteo/${id}/items`, body), { params: Promise.resolve({ id }) });
  }

  it("cuenta un ítem y pasa el conteo de INICIADO a EN_PROGRESO", async () => {
    sembrarConteoT1("INICIADO");
    const res = await patch("c1abcdefghij", { itemId: "i5", stockContado: 6 });

    expect(res.status).toBe(200);
    expect(h.db.items.find((i) => i.id === "i5")).toMatchObject({ stockContado: 6, diferencia: 2, ajustado: true });
    expect(h.db.conteos[0].status).toBe("EN_PROGRESO");
  });

  it("un conteo ya cerrado responde 400 y el ítem queda como estaba", async () => {
    sembrarConteoT1("CERRADO");
    const res = await patch("c1abcdefghij", { itemId: "i5", stockContado: 6 });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "El conteo ya está cerrado" });
    expect(h.db.items.find((i) => i.id === "i5")).toMatchObject({ stockContado: null, diferencia: null, ajustado: false });
  });

  it("un PATCH que leyó el conteo abierto justo antes del cierre: 400, no pisa el ítem ni lo reabre", async () => {
    sembrarConteoT1("CERRADO");
    // La lectura fuera de la transacción todavía vio el conteo abierto.
    const lecturaVieja = vi.spyOn(h.prisma.conteoFisico, "findFirst").mockResolvedValueOnce({ status: "INICIADO" });
    const res = await patch("c1abcdefghij", { itemId: "i5", stockContado: 6 });
    lecturaVieja.mockRestore();

    expect(res.status).toBe(400);
    expect(h.db.items.find((i) => i.id === "i5")?.stockContado).toBeNull();
    expect(h.db.conteos[0].status).toBe("CERRADO");
  });

  it("un ítem que no es de este conteo da 404 y el conteo sigue INICIADO", async () => {
    sembrarConteoT1("INICIADO");
    const res = await patch("c1abcdefghij", { itemId: "no-existe", stockContado: 6 });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Item no encontrado" });
    expect(h.db.conteos[0].status).toBe("INICIADO");
  });

  it("destildar «ajustar» conserva lo contado", async () => {
    sembrarConteoT1();
    const res = await patch("c1abcdefghij", { itemId: "i1", ajustado: false });

    expect(res.status).toBe(200);
    expect(h.db.items.find((i) => i.id === "i1")).toMatchObject({ stockContado: 8, diferencia: -2, ajustado: false });
  });

  it("otro negocio no puede contar en mi conteo (404) ni tocar el ítem", async () => {
    sembrarConteoT1();
    sesion(T2);
    const res = await patch("c1abcdefghij", { itemId: "i5", stockContado: 6 });

    expect(res.status).toBe(404);
    expect(h.db.items.find((i) => i.id === "i5")?.stockContado).toBeNull();
  });
});
