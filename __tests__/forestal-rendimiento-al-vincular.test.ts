/**
 * Lo que `sumarACorrida` ESCRIBE cuando una corrida recibe su materia prima.
 *
 * El hueco medido el 2026-09-15 en `inversiones-agroforestales-blas-sociedad-anonima`:
 * 9 de 14 corridas de producción declaran producto y tienen la columna «Rend.»
 * vacía. No era un olvido del operador — `setConsumos` sólo deriva el
 * rendimiento cuando encuentra la corrida SIN `volumeInputM3`, y esta función
 * escribe el volumen antes de llamarla (I1 se evalúa contra la fila bloqueada).
 * Así que el número no lo calculaba nadie.
 *
 * Acá se prueba contra la base simulada y no contra la función pura: lo que
 * importa es el `update` que queda escrito.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/* Todo el estado compartido con las factorías va en `vi.hoisted`: `vi.mock` se
   iza al tope del archivo y no ve las constantes de abajo. */
const H = vi.hoisted(() => {
  const trozaViva = (id: string, volumenM3: number) => ({
    id,
    woodEntryId: "we-13",
    volumenM3,
    consumidaEnId: null,
    noRecepcionada: false,
    descarte: false,
    _count: { retrozos: 0 },
    despachadaEn: null,
    entry: { status: "registrado", deletedAt: null },
  });
  const estado = {
    updates: [] as { where: unknown; data: Record<string, unknown> }[],
    corrida: {
      id: "corrida-20",
      lineNo: 20,
      section: "produccion",
      status: "registrado",
      quantity: null as number | null,
      volumeInputM3: null as number | null,
      speciesCommon: "Tornillo",
      unit: "m3" as string | null,
    },
    /* Las dos trozas de la propuesta: 2,808 + 2,153 = 4,961 m³. */
    trozas: [trozaViva("t1", 2.808), trozaViva("t2", 2.153)],
    setConsumos: vi.fn(async () => []),
    trozaViva,
  };
  const anotar = async (args: { where: unknown; data: Record<string, unknown> }) => {
    estado.updates.push(args);
    return {};
  };
  const tx = {
    $queryRaw: async () => [estado.corrida],
    forestCtpConsumo: { count: async () => 0, findMany: async () => [] },
    forestLoteAserrio: {
      count: async () => 0,
      findFirst: async () => ({
        id: "L-nuevo",
        code: "LA-2026-001",
        status: "abierto",
        speciesCommon: "Tornillo",
        trozas: estado.trozas,
      }),
      update: async () => ({}),
    },
    forestCtpEntry: { update: anotar },
    woodEntryTroza: { updateMany: async () => ({ count: 2 }) },
  };
  return { estado, tx, anotar };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (fn: (t: unknown) => Promise<unknown>) => fn(H.tx),
    forestCtpConsumo: { findMany: async () => [] },
    forestCtpEntry: { update: H.anotar },
  },
}));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: () => {} }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: () => {} }));
vi.mock("@/lib/db/forest-ctp-consumo.db", async (real) => {
  const mod = (await real()) as Record<string, unknown>;
  return { ...mod, ForestCtpConsumoDB: { setConsumos: H.estado.setConsumos } };
});

import { ForestLoteAserrioDB } from "@/lib/db/forest-lote-aserrio.db";
import { CtpInvariantError } from "@/lib/db/forest-ctp-consumo.db";

const vincular = () =>
  ForestLoteAserrioDB.sumarACorrida("tenant-blas", {
    loteId: "L-nuevo",
    corridaId: "corrida-20",
    trozaIds: ["t1", "t2"],
    fecha: new Date("2026-08-01T12:00:00.000Z"),
    user: "qaadmin",
  });

/** La corrida tal como la deja «Producir sin lote»: declarada y sin origen. */
const declarando = (quantity: number | null, unit: string | null = "m3") => {
  H.estado.corrida = { ...H.estado.corrida, quantity, volumeInputM3: null, unit };
};

beforeEach(() => {
  H.estado.updates.length = 0;
  H.estado.setConsumos.mockClear();
  H.estado.trozas = [H.estado.trozaViva("t1", 2.808), H.estado.trozaViva("t2", 2.153)];
});

describe("sumarACorrida escribe el rendimiento", () => {
  it("corrida declarada sin origen: guarda el volumen Y el rendimiento (52-55 %)", async () => {
    declarando(2.6);
    const r = await vincular();

    expect(r.volumenTotalM3).toBe(4.961);
    /* 2,6 / 4,961 = 52,41 %: el mismo rango que las corridas 15-19 del libro. */
    expect(r.rendimientoPct).toBe(52.41);
    expect(r.sobreElTope).toBe(false);
    expect(H.estado.updates[0].data).toMatchObject({ volumeInputM3: 4.961, rendimientoPct: 52.41 });
    expect(H.estado.setConsumos).toHaveBeenCalledTimes(1);
  });

  it("por encima del tope: guarda el número REAL y lo señala (se avisa, no se corrige)", async () => {
    /* La corrida 20 de Blas declara 3,814 m³. Con estas dos trozas rinde 76,88 %. */
    declarando(3.814);
    const r = await vincular();

    expect(r.rendimientoPct).toBe(76.88);
    expect(r.sobreElTope).toBe(true);
    /* Nada de recortarlo al 56: el libro declara lo que pasó. */
    expect(H.estado.updates[0].data.rendimientoPct).toBe(76.88);
  });

  it("de la sierra no sale más madera de la que entró: el servidor lo rechaza", async () => {
    /* 6 m³ declarados contra 4,961 de troza. La pantalla ya lo frena; el
       endpoint también, porque `sumar-corrida` admite UNA pasada por corrida:
       una vinculación corta no se puede completar después. */
    declarando(6);
    await expect(vincular()).rejects.toThrow(CtpInvariantError);
    await expect(vincular()).rejects.toThrow(/nunca sale más madera de la que entró/i);
    expect(H.estado.updates).toHaveLength(0);
    expect(H.estado.setConsumos).not.toHaveBeenCalled();
  });

  it("corrida todavía sin declarar: escribe el volumen y NO inventa un rendimiento", async () => {
    declarando(null);
    const r = await vincular();
    expect(r.rendimientoPct).toBeNull();
    expect(r.sobreElTope).toBe(false);
    expect(H.estado.updates[0].data).toMatchObject({ volumeInputM3: 4.961 });
    expect(H.estado.updates[0].data).not.toHaveProperty("rendimientoPct");
  });

  it("declarada en pie tablar: PT ÷ m³ no es un rendimiento, así que no se escribe", async () => {
    declarando(2100, "pt");
    const r = await vincular();
    expect(r.rendimientoPct).toBeNull();
    expect(H.estado.updates[0].data).not.toHaveProperty("rendimientoPct");
  });
});
