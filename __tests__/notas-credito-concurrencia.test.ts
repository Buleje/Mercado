// @vitest-environment node
/**
 * Notas de crédito — revisión de Comprobantes 17-10 (hallazgo medio, commit d61d45d8f).
 *
 * Leer lo acreditado, decidir el tope y crear eran pasos sueltos: dos envíos a la vez de una 06
 * (dos pestañas, o el POS y el módulo) leían el mismo «queda» y creaban dos notas por todo →
 * se acreditaba el doble. Además el número salía de «la última nota» sin candado y se repetía.
 *
 * La ruta y `NotasCreditoDB` son los REALES; la base es un doble en memoria: cada lectura y
 * escritura cede el turno (como un viaje a Postgres) y `pg_advisory_xact_lock` pone en fila a quien
 * pide la misma clave hasta que termina la transacción anterior (receta de `payables-seguridad`).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

type Fila = Record<string, unknown>;

const H = vi.hoisted(() => {
  const st = {
    tenant: "t-uno",
    ventas: [] as Fila[],
    notas: [] as Fila[],
    colas: new Map<string, Promise<void>>(),
    candados: [] as string[],
    seq: 0,
  };
  const ceder = () => new Promise<void>((r) => setTimeout(r, 1));
  const activa = (n: Fila, where: Fila): boolean =>
    n.tenantId === where.tenantId &&
    n.status !== "ANULADA" &&
    (where.saleId === undefined || n.saleId === where.saleId) &&
    (where.orderId === undefined || n.orderId === where.orderId);
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
      if (!sql.join("?").includes("MAX(substring(numero")) return [];
      const nums = st.notas
        .filter((n) => n.tenantId === vals[0])
        .map((n) => Number(/(\d{1,9})$/.exec(String(n.numero))?.[1] ?? NaN))
        .filter(Number.isFinite);
      return [{ ultimo: nums.length ? Math.max(...nums) : null }];
    },
    settings: {
      findFirst: async () => {
        await ceder();
        return { businessName: "Bodega San Martín" };
      },
    },
    notaCredito: {
      aggregate: async ({ where }: { where: Fila }) => {
        await ceder();
        const total = st.notas.filter((n) => activa(n, where)).reduce((s, n) => s + Number(n.total), 0);
        return { _sum: { total } };
      },
      create: async ({ data }: { data: Fila }) => {
        await ceder();
        const fila = { id: `nc-${++st.seq}`, status: "BORRADOR", createdAt: new Date(), updatedAt: new Date(), ...data };
        st.notas.push(fila);
        return fila;
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

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: H.prisma }));
vi.mock("@/lib/db", async () => ({ NotasCreditoDB: (await import("@/lib/db/notas-credito.db")).NotasCreditoDB }));
vi.mock("@/lib/db/sales.db", () => ({
  SalesDB: {
    getById: async (tenantId: string, id: string) => H.st.ventas.find((v) => v.id === id && v.tenantId === tenantId) ?? null,
  },
}));
vi.mock("@/lib/db/orders.db", () => ({ OrdersDB: { getById: async () => null } }));
vi.mock("@/lib/db/settings.db", () => ({ SettingsDB: { get: async () => ({ taxRate: 18 }) } }));
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: async () => ({ tenantId: H.st.tenant, role: "admin", username: "qa" }),
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/audit-logger", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/admin-cache", () => ({ invalidateAdminCache: { afterDocument: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const post = (body: unknown) =>
  new NextRequest("http://localhost/api/notas-credito", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const devolucionTotal = (saleId: string, totalConIgv: number) => ({
  saleId, motivoCodigo: "06", motivoDesc: "Devolución total", totalConIgv,
});

beforeEach(() => {
  H.st.tenant = "t-uno";
  H.st.ventas = [
    { id: "v1", tenantId: "t-uno", total: 23.6 },
    { id: "v2", tenantId: "t-uno", total: 10 },
    { id: "v-ajena", tenantId: "t-dos", total: 50 },
  ];
  H.st.notas = [];
  H.st.colas.clear();
  H.st.candados = [];
  H.st.seq = 0;
});

describe("POST /api/notas-credito a la vez", () => {
  it("dos 06 por todo sobre la misma venta: una 201 y la otra 400; se acredita una sola vez", async () => {
    const { POST } = await import("@/app/api/notas-credito/route");
    const res = await Promise.all([POST(post(devolucionTotal("v1", 23.6))), POST(post(devolucionTotal("v1", 23.6)))]);
    expect(res.map((r) => r.status).sort()).toEqual([201, 400]);
    const rechazo = await res.find((r) => r.status === 400)!.json();
    expect(rechazo).toMatchObject({ disponibleConIgv: 0, yaEmitidoConIgv: 23.6 });
    expect(H.st.notas).toHaveLength(1);
    expect(H.st.notas.reduce((s, n) => s + Number(n.total), 0)).toBe(23.6);
    expect(H.st.candados).toContain("t-uno|nc-venta:v1");
  });

  it("dos 07 que juntas pasan lo que queda: la segunda ve la primera y da 400", async () => {
    const { POST } = await import("@/app/api/notas-credito/route");
    const parcial = { saleId: "v1", motivoCodigo: "07", motivoDesc: "Devolución por ítem", totalConIgv: 15 };
    const res = await Promise.all([POST(post(parcial)), POST(post(parcial))]);
    expect(res.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(H.st.notas).toHaveLength(1);
  });

  it("dos notas a la vez sobre ventas distintas: las dos pasan y con números distintos", async () => {
    const { POST } = await import("@/app/api/notas-credito/route");
    const res = await Promise.all([POST(post(devolucionTotal("v1", 23.6))), POST(post(devolucionTotal("v2", 10)))]);
    expect(res.map((r) => r.status)).toEqual([201, 201]);
    const numeros = (await Promise.all(res.map((r) => r.json()))).map((n) => n.numero).sort();
    expect(numeros).toEqual(["BOD-NC-0001", "BOD-NC-0002"]);
    expect(H.st.candados.filter((c) => c === "t-uno|nc-numero")).toHaveLength(2);
  });

  it("el número sigue al MAYOR ya usado, no a la nota más reciente", async () => {
    H.st.notas = [
      { id: "a", tenantId: "t-uno", numero: "BOD-NC-0007", saleId: "otra", total: 1, status: "EMITIDA", createdAt: new Date("2026-10-01") },
      { id: "b", tenantId: "t-uno", numero: "BOD-NC-0003", saleId: "otra", total: 1, status: "EMITIDA", createdAt: new Date("2026-10-15") },
      { id: "c", tenantId: "t-dos", numero: "OTR-NC-0099", saleId: "x", total: 1, status: "EMITIDA", createdAt: new Date("2026-10-16") },
    ];
    const { POST } = await import("@/app/api/notas-credito/route");
    const res = await POST(post(devolucionTotal("v2", 10)));
    expect(res.status).toBe(201);
    expect((await res.json()).numero).toBe("BOD-NC-0008");
  });

  it("venta de otro negocio: 404 y sin nota ni candado", async () => {
    const { POST } = await import("@/app/api/notas-credito/route");
    const res = await POST(post(devolucionTotal("v-ajena", 50)));
    expect(res.status).toBe(404);
    expect(H.st.notas).toHaveLength(0);
    expect(H.st.candados).toHaveLength(0);
  });
});
