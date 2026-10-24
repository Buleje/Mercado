/**
 * Choque de locks → 409 «vuelve a intentar» (ADR-441, auditoría de seguridad).
 *
 * Repartir un mixto (mixto → trozas → lotes) y vincular una corrida (corrida →
 * lotes → trozas) toman los locks en orden inverso: si caen a la vez sobre las
 * mismas trozas, Postgres aborta a uno (40P01). Antes el operador veía un 500.
 *
 *  · unitario: las formas del error que llegan a `ctpErrorResponse`.
 *  · base real: se PROVOCA un deadlock de verdad —dos transacciones que toman
 *    dos locks en orden inverso— y el error que devuelve Prisma, tal cual,
 *    tiene que salir 409. Así el detector se prueba contra la forma real y no
 *    contra la que uno se imagina. Con locks consultivos (no dejan filas) y con
 *    filas `TEST-CHOQUE-` en `main` (se borran al final).
 *
 * Para correr la parte de base real:
 *   node --env-file=.env.local node_modules/.bin/vitest run __tests__/forestal-choque-de-locks.test.ts
 */

import { afterAll, describe, expect, it } from "vitest";

process.env.AUDIT_CHAIN_ENABLED ??= "false";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { CtpInvariantError } from "@/lib/db/forest-ctp-consumo.db";
import { ctpErrorResponse, esChoqueDeLocks, MENSAJE_CHOQUE_DE_LOCKS } from "@/lib/forestal/ctp-api-errors";

const TENANT = "main";
const P = `TEST-CHOQUE-${Math.random().toString(36).slice(2, 8)}`;

async function cuerpo(r: Response) {
  return (await r.json()) as { error: string; message?: string };
}

describe("ctpErrorResponse — el choque de locks es un turno perdido, no un 500", () => {
  it("P2034 de Prisma (write conflict o deadlock) → 409 con el mensaje de reintentar", async () => {
    const r = ctpErrorResponse(Object.assign(new Error("Transaction failed due to a write conflict or a deadlock"), { code: "P2034" }), "t", "x");
    expect(r.status).toBe(409);
    expect(await cuerpo(r)).toEqual({ error: "CHOQUE_DE_LOCKS", message: MENSAJE_CHOQUE_DE_LOCKS });
  });

  it("40P01 por `$queryRaw` (P2010 con el original en meta.driverAdapterError) → 409", () => {
    const e = Object.assign(new Error("Raw query failed. Code: `40P01`. Message: `deadlock detected`"), {
      code: "P2010",
      meta: { driverAdapterError: { name: "DriverAdapterError", cause: { kind: "postgres", code: "40P01", originalCode: "40P01" } } },
    });
    expect(esChoqueDeLocks(e)).toBe(true);
    expect(ctpErrorResponse(e, "t", "x").status).toBe(409);
  });

  it("40P01 por una consulta del modelo (DriverAdapterError con cause.originalCode) → 409", () => {
    const e = Object.assign(new Error("deadlock"), { name: "DriverAdapterError", cause: { kind: "postgres", originalCode: "40P01" } });
    expect(ctpErrorResponse(e, "t", "x").status).toBe(409);
  });

  it("el resto no cambia: invariante → 422, foto → 400, otro P2010 → 500, error suelto → 500", () => {
    expect(ctpErrorResponse(new CtpInvariantError("I2", "I2_SOBRE_CONSUMO"), "t", "x").status).toBe(422);
    expect(ctpErrorResponse(new CtpInvariantError("foto", "FOTO_NO_VALIDA"), "t", "x").status).toBe(400);
    const otro = Object.assign(new Error("Raw query failed. Code: `23505`. Message: `duplicate key`"), {
      code: "P2010",
      meta: { driverAdapterError: { cause: { kind: "postgres", code: "23505", originalCode: "23505" } } },
    });
    expect(esChoqueDeLocks(otro)).toBe(false);
    expect(ctpErrorResponse(otro, "t", "x").status).toBe(500);
    expect(ctpErrorResponse(new Error("boom"), "t", "x").status).toBe(500);
    expect(esChoqueDeLocks(null)).toBe(false);
    expect(esChoqueDeLocks("40P01")).toBe(false);
  });

  it("una cadena de `cause` circular no cuelga el detector", () => {
    const a: { code: string; cause?: unknown } = { code: "X" };
    a.cause = a;
    expect(esChoqueDeLocks(a)).toBe(false);
  });
});

// ── Base real ────────────────────────────────────────────────────────────────

/* Top-level await, no `beforeAll`: `skipIf` se evalúa al coleccionar. */
const HAS_DB: boolean = await prisma.$queryRaw`SELECT 1`
  .then(() => prisma.forestLoteMixto.count({ where: { tenantId: TENANT } }))
  .then(() => true)
  .catch(() => false);

const TX = { timeout: 20_000, maxWait: 10_000 } as const;

function barrera() {
  let abrir!: () => void;
  const lista = new Promise<void>((r) => (abrir = r));
  return { lista, abrir };
}

/**
 * Dos transacciones que toman A y B en orden inverso, sincronizadas para que
 * cada una tenga su primer lock antes de pedir el segundo: Postgres tiene que
 * abortar a una. Devuelve el error de la víctima tal como lo tira Prisma.
 */
async function provocarDeadlock(
  tomar: (tx: Prisma.TransactionClient, cual: "a" | "b") => Promise<unknown>,
): Promise<unknown> {
  const tieneA = barrera();
  const tieneB = barrera();
  const t1 = prisma.$transaction(async (tx) => {
    await tomar(tx, "a");
    tieneA.abrir();
    await tieneB.lista;
    await tomar(tx, "b");
  }, TX);
  const t2 = prisma.$transaction(async (tx) => {
    await tomar(tx, "b");
    tieneB.abrir();
    await tieneA.lista;
    await tomar(tx, "a");
  }, TX);
  const r = await Promise.allSettled([t1, t2]);
  const caidas = r.filter((x): x is PromiseRejectedResult => x.status === "rejected");
  expect(caidas).toHaveLength(1); // una víctima; la otra termina
  return caidas[0]!.reason;
}

afterAll(async () => {
  if (!HAS_DB) return;
  await prisma.forestLoteMixto.deleteMany({ where: { tenantId: TENANT, createdBy: { startsWith: "TEST-CHOQUE-" } } });
  expect(await prisma.forestLoteMixto.count({ where: { tenantId: TENANT, createdBy: { startsWith: "TEST-CHOQUE-" } } })).toBe(0);
}, 60_000);

describe.skipIf(!HAS_DB)("deadlock de verdad contra Postgres → 409", () => {
  it("locks por `$queryRaw` (como `FOR UPDATE` en repartir y vincular)", async () => {
    /* Locks consultivos de la transacción: se sueltan solos, no dejan filas. */
    const base = 7_000_000_000 + Math.floor(Math.random() * 1_000_000_000);
    const clave = { a: base, b: base + 1 };
    const err = await provocarDeadlock((tx, cual) =>
      tx.$executeRaw`SELECT pg_advisory_xact_lock(${clave[cual]}::bigint)`,
    );
    /* La forma medida (26-09): P2010 con el 40P01 en meta.driverAdapterError. */
    expect(err).toMatchObject({
      code: "P2010",
      meta: { driverAdapterError: { cause: { originalCode: "40P01", kind: "postgres" } } },
    });
    expect(esChoqueDeLocks(err)).toBe(true);
    const r = ctpErrorResponse(err, "test.choque", TENANT);
    expect(r.status).toBe(409);
    expect((await cuerpo(r)).message).toBe(MENSAJE_CHOQUE_DE_LOCKS);
  }, 60_000);

  it("locks por una consulta del modelo (`update` sobre filas tomadas)", async () => {
    const [a, b] = await Promise.all(
      [1, 2].map((k) =>
        prisma.forestLoteMixto.create({
          data: { tenantId: TENANT, code: `${P}-${k}`, createdBy: P },
          select: { id: true },
        }),
      ),
    );
    const id = { a: a!.id, b: b!.id };
    const err = await provocarDeadlock((tx, cual) =>
      tx.forestLoteMixto.update({ where: { id: id[cual] }, data: { notes: `${P} ${cual}` }, select: { id: true } }),
    );
    /* La forma medida (26-09): el DriverAdapterError sin envolver, sin `code` propio. */
    expect(err).toMatchObject({ name: "DriverAdapterError", cause: { originalCode: "40P01" } });
    expect(esChoqueDeLocks(err)).toBe(true);
    expect(ctpErrorResponse(err, "test.choque", TENANT).status).toBe(409);
  }, 60_000);
});
