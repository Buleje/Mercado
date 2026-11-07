// @vitest-environment node
/**
 * Compras › Por pagar — hallazgos de la revisión de security (17-10).
 *
 * 1. PATCH `{status:"pagado"}` daba la cuenta por pagada con 0 abonos, y el
 *    monto se cambiaba aunque ya tuviera pagos.
 * 2. Revisar «¿ya existe esa factura?» y crear eran dos pasos: 5 POST a la vez
 *    con la misma factura dejaban 5 deudas.
 * 3. Un `supplierId` de otro negocio daba 201.
 * 4. Dos cuentas podían vincularse a la misma orden a la vez.
 *
 * La base es un doble en memoria que imita lo que importa: cada lectura y
 * escritura cede el turno (como un viaje a Postgres) y `pg_advisory_xact_lock`
 * pone en fila a quien pide la misma clave hasta que termina la transacción
 * anterior (receta de `sellos-canje-concurrente.test.ts`).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

type Fila = Record<string, unknown>;

const H = vi.hoisted(() => {
  const st = {
    tenant: "t-uno",
    suppliers: [] as Fila[],
    payables: [] as Fila[],
    payments: [] as Fila[],
    orders: [] as Fila[],
    colas: new Map<string, Promise<void>>(),
    candados: [] as string[],
  };
  const ceder = () => new Promise<void>((r) => setTimeout(r, 1));
  const coincide = (row: Fila, where: Fila): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === "object" && !(v instanceof Date)) {
        const o = v as { not?: unknown; in?: unknown[] };
        if ("not" in o) return row[k] !== o.not;
        if ("in" in o) return (o.in ?? []).includes(row[k]);
      }
      return (row[k] ?? null) === (v ?? null);
    });
  const conPagos = (p: Fila): Fila => {
    const pagos = st.payments.filter((x) => x.payableId === p.id);
    return { ...p, payments: pagos, _count: { payments: pagos.length } };
  };
  const cliente = (soltar: (() => void)[]) => ({
    $executeRaw: async (sql: TemplateStringsArray, ...vals: unknown[]) => {
      if (sql.join("?").includes("pg_advisory_xact_lock")) {
        const clave = vals.map(String).join("|");
        st.candados.push(clave);
        const previo = st.colas.get(clave) ?? Promise.resolve();
        let liberar!: () => void;
        const mio = new Promise<void>((r) => (liberar = r));
        st.colas.set(clave, previo.then(() => mio));
        soltar.push(liberar);
        await previo;
      }
      return 0;
    },
    $queryRaw: async (sql: TemplateStringsArray, ...vals: unknown[]) => {
      await ceder();
      if (sql.join("?").includes("FOR UPDATE")) {
        const [id, tenantId] = vals;
        return st.payables.filter((p) => p.id === id && p.tenantId === tenantId).map((p) => ({ id: p.id }));
      }
      return [];
    },
    supplier: {
      findFirst: async ({ where }: { where: Fila }) => {
        await ceder();
        return st.suppliers.find((s) => coincide(s, where)) ?? null;
      },
    },
    purchaseOrder: {
      findFirst: async ({ where }: { where: Fila }) => {
        await ceder();
        return st.orders.find((o) => coincide(o, where)) ?? null;
      },
      findMany: async ({ where }: { where: Fila }) => {
        await ceder();
        return st.orders.filter((o) => coincide(o, where));
      },
    },
    payable: {
      findMany: async ({ where }: { where: Fila }) => {
        await ceder();
        return st.payables.filter((p) => coincide(p, where)).map(conPagos);
      },
      findFirst: async ({ where }: { where: Fila }) => {
        await ceder();
        const p = st.payables.find((x) => coincide(x, where));
        return p ? conPagos(p) : null;
      },
      create: async ({ data }: { data: Fila }) => {
        await ceder();
        const fila = { purchaseOrderId: null, createdAt: new Date(), ...data };
        st.payables.push(fila);
        return conPagos(fila);
      },
      updateMany: async ({ where, data }: { where: Fila; data: Fila }) => {
        await ceder();
        const filas = st.payables.filter((p) => coincide(p, where));
        for (const f of filas) Object.assign(f, data);
        return { count: filas.length };
      },
    },
  });
  const prisma = {
    ...cliente([]),
    $transaction: async <T,>(fn: (tx: unknown) => Promise<T>) => {
      const soltar: (() => void)[] = [];
      try {
        return await fn(cliente(soltar));
      } finally {
        for (const s of soltar) s();
      }
    },
  };
  return { st, prisma };
});

vi.mock("@/lib/prisma", () => ({ prisma: H.prisma }));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/cache", () => ({
  revalidateTenantTag: vi.fn(),
  invalidateByPrefix: vi.fn(),
  invalidate: vi.fn(),
  getOrSet: async (_k: string, _t: number, fn: () => Promise<unknown>) => fn(),
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: async () => ({ tenantId: H.st.tenant, role: "admin" }) }));
vi.mock("@/lib/billing/require-active-subscription", () => ({ requireActiveSubscription: async () => null }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/admin-cache", () => ({ invalidateAdminCache: { afterPayable: vi.fn() } }));
vi.mock("@/lib/jsondb", async () => ({ PayablesDB: (await import("@/lib/db/finance.db")).PayablesDB }));

import { POST } from "@/app/api/payables/route";
import { PATCH } from "@/app/api/payables/[id]/route";

const pedido = (url: string, method: string, body: unknown) =>
  new NextRequest(url, { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const alta = (body: unknown) => POST(pedido("http://localhost/api/payables", "POST", body));
const editar = (id: string, body: unknown) =>
  PATCH(pedido(`http://localhost/api/payables/${id}`, "PATCH", body), { params: Promise.resolve({ id }) });

function cuenta(id: string, extra: Fila = {}): Fila {
  return {
    id, tenantId: "t-uno", supplierId: "sup-1", supplierName: "Distribuidora Ucayali", purchaseOrderId: null,
    description: "Factura F001-500", amount: 100, paidAmount: 0, status: "pendiente",
    dueDate: new Date("2026-11-01T00:00:00Z"), createdAt: new Date("2026-10-01T00:00:00Z"), ...extra,
  };
}

beforeEach(() => {
  H.st.tenant = "t-uno";
  H.st.suppliers = [
    { id: "sup-1", tenantId: "t-uno", name: "Distribuidora Ucayali" },
    { id: "sup-ajeno", tenantId: "t-otro", name: "Proveedor de otro negocio" },
  ];
  H.st.payables = [];
  H.st.payments = [];
  H.st.orders = [];
  H.st.colas.clear();
  H.st.candados = [];
});

describe("PATCH /api/payables/[id] — el estado sale de los pagos", () => {
  it("rechaza {status:'pagado'} y la cuenta sigue pendiente", async () => {
    H.st.payables.push(cuenta("pay-1"));
    const res = await editar("pay-1", { status: "pagado" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/registra el pago/);
    expect(H.st.payables[0].status).toBe("pendiente");
  });

  it("rechaza {amount:0.01,status:'pendiente'} sin tocar el monto", async () => {
    H.st.payables.push(cuenta("pay-1"));
    const res = await editar("pay-1", { amount: 0.01, status: "pendiente" });
    expect(res.status).toBe(400);
    expect(H.st.payables[0].amount).toBe(100);
  });

  it("con pagos, cambiar el monto da 409 y el monto no se mueve", async () => {
    H.st.payables.push(cuenta("pay-1", { paidAmount: 40, status: "parcial" }));
    H.st.payments.push({ id: "pm-1", payableId: "pay-1", amount: 40, method: "efectivo", date: new Date(), reference: null });
    const res = await editar("pay-1", { amount: 0.01 });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/ya tiene pagos/);
    expect(H.st.payables[0]).toMatchObject({ amount: 100, status: "parcial" });
  });

  it("sin pagos, el monto se corrige y queda pendiente", async () => {
    H.st.payables.push(cuenta("pay-1"));
    const res = await editar("pay-1", { amount: 80 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: "pay-1", amount: 80, status: "pendiente", paidAmount: 0 });
  });

  it("una cuenta de otro negocio da 404", async () => {
    H.st.payables.push(cuenta("pay-ajena", { tenantId: "t-otro" }));
    const res = await editar("pay-ajena", { description: "Factura F001-1" });
    expect(res.status).toBe(404);
    expect(H.st.payables[0].description).toBe("Factura F001-500");
  });
});

describe("POST /api/payables — la misma factura no crea otra deuda", () => {
  const factura = { supplierId: "sup-1", amount: 250, description: "Factura F001-777", dueDate: "2026-11-15" };

  it("la segunda con la misma factura da 409 con la que ya existe", async () => {
    const r1 = await alta(factura);
    expect(r1.status).toBe(201);
    const r2 = await alta({ ...factura, description: "F001 - 00000777" });
    expect(r2.status).toBe(409);
    const cuerpo = await r2.json();
    expect(cuerpo.error).toMatch(/comprobante ya está anotado/);
    expect(cuerpo.duplicada).toMatchObject({ monto: 250 });
    expect(H.st.payables).toHaveLength(1);
  });

  it("5 POST a la vez con la misma factura = 1 cuenta y 4 × 409", async () => {
    const res = await Promise.all(Array.from({ length: 5 }, () => alta(factura)));
    const estados = res.map((r) => r.status).sort();
    expect(estados).toEqual([201, 409, 409, 409, 409]);
    expect(H.st.payables).toHaveLength(1);
    expect(new Set(H.st.candados)).toEqual(new Set(["t-uno|por-pagar:sup-1"]));
  });

  it("el nombre del proveedor sale de la base, no del navegador", async () => {
    const r = await alta({ ...factura, supplierName: "Otro nombre" });
    expect(r.status).toBe(201);
    expect(await r.json()).toMatchObject({ supplierName: "Distribuidora Ucayali", status: "pendiente", paidAmount: 0 });
  });

  it("un proveedor de otro negocio da 404 y no crea nada", async () => {
    const r = await alta({ ...factura, supplierId: "sup-ajeno" });
    expect(r.status).toBe(404);
    expect(H.st.payables).toHaveLength(0);
  });
});

describe("PATCH vincular orden — una orden, una cuenta", () => {
  it("dos cuentas a la vez sobre la misma orden: una gana, la otra 409", async () => {
    H.st.orders.push({ id: "oc-1", tenantId: "t-uno", supplierId: "sup-1", status: "recibido", paymentMethod: "credito", invoiceNumber: null });
    H.st.payables.push(cuenta("pay-a", { description: "Saldo inicial" }), cuenta("pay-b", { description: "Otro motivo" }));
    const res = await Promise.all([editar("pay-a", { purchaseOrderId: "oc-1" }), editar("pay-b", { purchaseOrderId: "oc-1" })]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(H.st.payables.filter((p) => p.purchaseOrderId === "oc-1")).toHaveLength(1);
  });
});
