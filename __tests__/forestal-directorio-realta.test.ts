import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Re-alta de una ficha dada de baja.
 *
 * La baja del directorio es LÓGICA (las guías ya emitidas nombran al camión y
 * al titular), pero el índice único `(tenantId, placa)` no excluye las
 * borradas: volver a cargar una placa que se dio de baja se iba por `create` y
 * moría contra el índice — el operador veía "internal_error" sin una pista.
 * Ahora el re-alta REVIVE la ficha, que además conserva su historial.
 *
 * La base se sustituye: lo que se prueba es la decisión (revivir vs. crear),
 * que es donde estaba el bug.
 */

type Fila = {
  id: string;
  placa?: string;
  docTipo?: string | null;
  docNumero?: string | null;
  nombre?: string;
  roles?: string[];
  deletedAt: Date | null;
};

const vehiculos: Fila[] = [];
const partes: Fila[] = [];
const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
const creates: Array<Record<string, unknown>> = [];

/** Filtra por lo que la DB class pregunta: placa/documento + estado de borrado. */
function buscar(filas: Fila[], where: Record<string, unknown>): Fila | null {
  return (
    filas.find((f) => {
      if (where.id != null && f.id !== where.id) return false;
      if (where.placa != null && f.placa !== where.placa) return false;
      if (where.docNumero != null && f.docNumero !== where.docNumero) return false;
      if (where.docTipo != null && f.docTipo !== where.docTipo) return false;
      const d = where.deletedAt as null | { not: null } | undefined;
      if (d === null && f.deletedAt !== null) return false;
      if (d && typeof d === "object" && "not" in d && f.deletedAt === null) return false;
      return true;
    }) ?? null
  );
}

const tabla = (filas: Fila[]) => ({
  findFirst: async ({ where }: { where: Record<string, unknown> }) => buscar(filas, where),
  update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    updates.push({ id: where.id, data });
    const fila = filas.find((f) => f.id === where.id)!;
    return { ...fila, ...data, roles: (data.roles as string[]) ?? fila.roles ?? [] };
  },
  create: async ({ data }: { data: Record<string, unknown> }) => {
    creates.push(data);
    return { id: "nuevo", roles: [], ...data };
  },
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    get forestVehiculo() {
      return tabla(vehiculos);
    },
    get forestParty() {
      return tabla(partes);
    },
  },
}));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: () => {} }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: () => {} }));
vi.mock("@/lib/db/forest-ctp-consumo.db", () => ({ CONSUMO_VIGENTE: {} }));
vi.mock("server-only", () => ({}));

const { ForestDirectorioDB } = await import("@/lib/db/forest-directorio.db");

beforeEach(() => {
  vehiculos.length = 0;
  partes.length = 0;
  updates.length = 0;
  creates.length = 0;
});

describe("guardarVehiculo — re-alta de una placa dada de baja", () => {
  it("revive la ficha borrada en vez de crear otra (el índice único la rechazaba)", async () => {
    vehiculos.push({ id: "v1", placa: "QAT901", deletedAt: new Date("2026-01-01") });

    await ForestDirectorioDB.guardarVehiculo("t1", { placa: "QAT-901", capacidadM3: 30 }, "qa");

    expect(creates).toHaveLength(0);
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe("v1");
    expect(updates[0].data.deletedAt).toBeNull();
    expect(updates[0].data.activo).toBe(true);
  });

  it("una placa nueva sigue creando ficha", async () => {
    await ForestDirectorioDB.guardarVehiculo("t1", { placa: "XYZ-123", capacidadM3: null }, "qa");
    expect(updates).toHaveLength(0);
    expect(creates).toHaveLength(1);
  });

  it("editar OTRO vehículo hacia una placa de baja avisa en vez de reventar", async () => {
    vehiculos.push({ id: "v1", placa: "QAT901", deletedAt: new Date("2026-01-01") });
    vehiculos.push({ id: "v2", placa: "ABC123", deletedAt: null });

    await expect(
      ForestDirectorioDB.guardarVehiculo("t1", { id: "v2", placa: "QAT-901", capacidadM3: null }, "qa"),
    ).rejects.toThrow(/QAT/i);
  });

  it("la ficha viva gana sobre la borrada: no revive una vieja teniendo la actual", async () => {
    vehiculos.push({ id: "viejo", placa: "QAT901", deletedAt: new Date("2026-01-01") });
    vehiculos.push({ id: "vivo", placa: "QAT901", deletedAt: null });

    await ForestDirectorioDB.guardarVehiculo("t1", { placa: "QAT-901", capacidadM3: 12 }, "qa");

    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe("vivo");
    expect(updates[0].data.deletedAt).toBeUndefined();
  });
});

describe("guardarParte — re-alta de un titular dado de baja", () => {
  it("revive la ficha en vez de dejar el directorio con dos entradas del mismo RUC", async () => {
    partes.push({
      id: "p1",
      docTipo: "RUC",
      docNumero: "20512345678",
      nombre: "ASERRADERO X",
      roles: ["proveedor"],
      deletedAt: new Date("2026-01-01"),
    });

    await ForestDirectorioDB.guardarParte(
      "t1",
      { roles: ["destinatario"], nombre: "ASERRADERO X", docTipo: "RUC", docNumero: "20512345678" },
      "qa",
    );

    expect(creates).toHaveLength(0);
    expect(updates).toHaveLength(1);
    expect(updates[0].data.deletedAt).toBeNull();
    // El rol nuevo se suma al que ya cumplía: nadie pierde un papel al revivir.
    expect((updates[0].data.roles as string[]).sort()).toEqual(["destinatario", "proveedor"]);
  });

  it("sin documento no hay a quién revivir: se crea", async () => {
    partes.push({ id: "p1", docTipo: "RUC", docNumero: "20512345678", deletedAt: new Date("2026-01-01") });
    await ForestDirectorioDB.guardarParte("t1", { roles: ["conductor"], nombre: "JULIO PAREDES" }, "qa");
    expect(creates).toHaveLength(1);
  });
});
