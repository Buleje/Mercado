// @vitest-environment node
/**
 * Canje de la tarjeta de sellos con dos pedidos a la vez (revisión 11-10).
 *
 * Antes `SellosDB.canjear` leía el Json de recompensas, contaba y escribía el
 * Json entero, sin candado: dos canjes simultáneos leían lo mismo, los dos
 * pasaban y el segundo pisaba al primero (dos premios entregados, uno
 * anotado). Con dos clientes a la vez, se perdía el canje de uno.
 *
 * La base es un doble en memoria que imita lo que importa: cada lectura y
 * escritura cede el turno (como un viaje a Postgres) y `pg_advisory_xact_lock`
 * pone en fila a quien pide la misma clave hasta que la transacción anterior
 * termina.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type GrupoTel = { customerPhone: string; _count: { _all: number } };

const H = vi.hoisted(() => ({
  fila: { loyaltyRulesJson: null as string | null, loyaltyRewardsJson: null as string | null },
  ventas: [] as GrupoTel[],
  colas: new Map<string, Promise<void>>(),
  candados: [] as string[],
}));

vi.mock("@/lib/prisma", () => {
  const ceder = () => new Promise<void>((r) => setTimeout(r, 1));
  const cliente = (soltar: (() => void)[]) => ({
    $executeRawUnsafe: async (sql: string, ...params: unknown[]) => {
      if (sql.includes("pg_advisory_xact_lock")) {
        const clave = String(params[0]);
        H.candados.push(clave);
        const previo = H.colas.get(clave) ?? Promise.resolve();
        let liberar!: () => void;
        const mio = new Promise<void>((r) => (liberar = r));
        H.colas.set(clave, previo.then(() => mio));
        soltar.push(liberar);
        await previo;
      }
      return 0;
    },
    settings: {
      findUnique: async () => {
        await ceder();
        return { ...H.fila };
      },
      update: async ({ data }: { data: Partial<typeof H.fila> }) => {
        await ceder();
        Object.assign(H.fila, data);
        return H.fila;
      },
      upsert: async ({ update }: { update: Partial<typeof H.fila> }) => {
        await ceder();
        Object.assign(H.fila, update);
        return H.fila;
      },
    },
    order: { groupBy: async () => [] as GrupoTel[] },
    sale: { groupBy: async () => H.ventas },
  });
  return {
    prisma: {
      ...cliente([]),
      $transaction: async <T,>(fn: (tx: unknown) => Promise<T>) => {
        const soltar: (() => void)[] = [];
        try {
          return await fn(cliente(soltar));
        } finally {
          for (const s of soltar) s();
        }
      },
    },
  };
});
vi.mock("@/lib/cache", () => ({
  invalidateByPrefix: vi.fn(),
  invalidate: vi.fn(),
  getOrSet: async (_k: string, _t: number, fn: () => Promise<unknown>) => fn(),
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { SellosDB } from "@/lib/db/sellos.db";
import { leerArchivoSellos, leerCanjes } from "@/lib/loyalty/sellos";

const CONFIG = { activo: true, compras: 10, premio: "Un pan", desde: "2026-10-01", minimo: 0 };
const AHORA = new Date("2026-10-11T15:00:00.000Z");

beforeEach(() => {
  H.fila.loyaltyRulesJson = JSON.stringify({ sellos: CONFIG });
  H.fila.loyaltyRewardsJson = null;
  H.colas.clear();
  H.candados.length = 0;
});

describe("canje de la tarjeta de sellos con dos pedidos a la vez", () => {
  it("el mismo cliente con UN premio: dos canjes a la vez → gana exactamente uno", async () => {
    H.ventas = [{ customerPhone: "51987654321", _count: { _all: 10 } }];
    const [a, b] = await Promise.all([
      SellosDB.canjear("t1", "987654321", "caja1", AHORA),
      SellosDB.canjear("t1", "987 654 321", "caja2", AHORA),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(leerCanjes(JSON.parse(H.fila.loyaltyRewardsJson ?? "null"))["987654321"]).toHaveLength(1);
    expect(H.candados).toEqual(["loyalty-rewards:t1", "loyalty-rewards:t1"]);
  });

  it("dos clientes a la vez: los dos canjes quedan anotados (ninguno pisa al otro)", async () => {
    H.ventas = [
      { customerPhone: "987654321", _count: { _all: 10 } },
      { customerPhone: "912345678", _count: { _all: 10 } },
    ];
    const [a, b] = await Promise.all([
      SellosDB.canjear("t1", "987654321", "caja1", AHORA),
      SellosDB.canjear("t1", "912345678", "caja2", AHORA),
    ]);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    const canjes = leerCanjes(JSON.parse(H.fila.loyaltyRewardsJson ?? "null"));
    expect(Object.keys(canjes).sort()).toEqual(["912345678", "987654321"]);
  });

  it("con dos premios, dos canjes a la vez → los dos ganan y quedan 2 anotados", async () => {
    H.ventas = [{ customerPhone: "987654321", _count: { _all: 20 } }];
    const r = await Promise.all([
      SellosDB.canjear("t1", "987654321", "caja1", AHORA),
      SellosDB.canjear("t1", "987654321", "caja2", AHORA),
    ]);
    expect(r.filter(Boolean)).toHaveLength(2);
    expect(r[1]?.estado.premios).toBe(0);
    expect(leerCanjes(JSON.parse(H.fila.loyaltyRewardsJson ?? "null"))["987654321"]).toHaveLength(2);
  });

  it("canje 51: el más viejo pasa al archivo y el premio NO reaparece", async () => {
    const viejos = Array.from({ length: 50 }, (_, i) => ({
      sellos: 10,
      at: new Date(Date.UTC(2026, 9, 2, 0, i)).toISOString(),
      por: "qa",
      premio: "Un pan",
    }));
    H.fila.loyaltyRewardsJson = JSON.stringify({ sellosCanjes: { "987654321": viejos } });
    H.ventas = [{ customerPhone: "987654321", _count: { _all: 510 } }];
    const hecho = await SellosDB.canjear("t1", "987654321", "caja1", AHORA);
    expect(hecho?.estado).toMatchObject({ premios: 0, canjeados: 51, siguiente: 0 });
    const guardado = JSON.parse(H.fila.loyaltyRewardsJson ?? "null");
    expect(leerCanjes(guardado)["987654321"]).toHaveLength(50);
    expect(leerArchivoSellos(guardado)["987654321"]).toEqual({ canjes: 1, sellos: 10, hasta: viejos[0].at });
    // Un canje más con las mismas 510 compras: ya no le toca.
    expect(await SellosDB.canjear("t1", "987654321", "caja1", AHORA)).toBeNull();
  });
});
