/**
 * ADR-448 — los 5 lectores que consultan `prisma.adelanto` por fuera de
 * `AdelantosDB`: por cobrar, finanzas, balance del permiso, liquidación de
 * cuenta (su clasificación va en adelantos-direccion.test.ts) y el cron de
 * recordatorios (que ahora pasa por la clase).
 *
 * Sin base: un prisma falso que anota cada llamada y responde vacío, así se
 * afirma sobre el `where` que de verdad se mandó.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

type Llamada = { modelo: string; metodo: string; args: Record<string, unknown> };

const H = vi.hoisted(() => {
  const llamadas: Llamada[] = [];
  const respuestas: Record<string, (args: Record<string, unknown>) => unknown> = {};
  const vacio = (metodo: string) =>
    metodo === "aggregate" ? { _sum: {}, _count: 0 } : metodo === "count" ? 0 : metodo.startsWith("find") && !metodo.endsWith("Many") ? null : [];
  const prisma: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_t, modelo: string) => {
        if (modelo === "$queryRaw" || modelo === "$executeRaw") return async () => [];
        if (modelo === "$transaction")
          return async (fn: unknown) => (typeof fn === "function" ? (fn as (p: unknown) => unknown)(prisma) : Promise.all(fn as unknown[]));
        if (typeof modelo !== "string" || modelo === "then") return undefined;
        return new Proxy(
          {},
          {
            get: (_t2, metodo: string) => async (args: Record<string, unknown> = {}) => {
              llamadas.push({ modelo, metodo, args });
              const r = respuestas[`${modelo}.${metodo}`];
              return r ? r(args) : vacio(metodo);
            },
          },
        );
      },
    },
  );
  return { prisma, llamadas, respuestas };
});

vi.mock("@/lib/prisma", () => ({ prisma: H.prisma }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/cron-auth", () => ({ withCronAuth: (_n: string, fn: () => unknown) => fn }));
vi.mock("@/lib/db/notification-center.db", () => ({ NotificationCenterDB: { createOrReuse: vi.fn(async () => ({})) } }));

import { PorCobrarDB } from "@/lib/db/por-cobrar.db";
import { ExpensesDB } from "@/lib/db/finance.db";
import { ForestContratoDB } from "@/lib/db/forest-contrato.db";
import { GET as cronRecordatorios } from "@/app/api/cron/adelantos-recordatorios/route";

const deAdelanto = (metodo?: string) =>
  H.llamadas.filter((l) => l.modelo === "adelanto" && (!metodo || l.metodo === metodo));
const whereDe = (l: Llamada) => l.args.where as Record<string, unknown>;

beforeEach(() => {
  H.llamadas.length = 0;
  for (const k of Object.keys(H.respuestas)) delete H.respuestas[k];
});

describe("por cobrar: lo recibido es «por pagar»", () => {
  it("el resumen y el detalle sólo leen adelantos DADOS", async () => {
    await PorCobrarDB.getSummary("t1");
    await PorCobrarDB.getDetalle("t1");
    const llamadas = deAdelanto();
    expect(llamadas.map((l) => l.metodo).sort()).toEqual(["aggregate", "findMany"]);
    for (const l of llamadas) expect(whereDe(l)).toMatchObject({ tenantId: "t1", status: "ABIERTO", direccion: "DADO" });
  });
});

describe("finanzas: lo recibido no es gasto ni duplicado", () => {
  it("«Adelantos al personal» sólo lista lo dado", async () => {
    await ExpensesDB.getHistorialUnificado("t1", { source: "adelanto" });
    const [l] = deAdelanto("findMany");
    expect(whereDe(l)).toMatchObject({ tenantId: "t1", direccion: "DADO" });
  });

  it("el egreso que devuelve un RECIBIDO no desaparece como duplicado", async () => {
    const tabla = [
      { codigoOperacion: "ADL-2026-0002", direccion: "DADO" },
      { codigoOperacion: "ADL-2026-0003", direccion: "RECIBIDO" },
    ];
    H.respuestas["adelanto.findMany"] = (args) => {
      const w = args.where as { direccion?: string };
      return tabla.filter((a) => !w.direccion || a.direccion === w.direccion).map(({ codigoOperacion }) => ({ codigoOperacion }));
    };
    H.respuestas["cashMovement.findMany"] = () => [
      { id: "m1", amount: 3217, method: "efectivo", description: "Adelanto ADL-2026-0002 · Wasaco", createdAt: new Date("2026-09-27T15:00:00Z") },
      { id: "m2", amount: 500, method: "efectivo", description: "Devolución de adelanto recibido ADL-2026-0003 · Wasaco", createdAt: new Date("2026-09-28T15:00:00Z") },
    ];
    const items = await ExpensesDB.getHistorialUnificado("t1", { source: "caja" });
    const porId = new Map(items.map((i) => [i.refId, i]));
    expect(porId.get("m1")).toMatchObject({ duplicaDe: "ADL-2026-0002" });
    expect(porId.get("m2")).not.toHaveProperty("duplicaDe");
  });
});

describe("balance del permiso: lo recibido entra, no sale", () => {
  const grupos = [
    { direccion: "DADO", status: "ABIERTO", _count: { _all: 1 }, _sum: { montoAdelantado: 3217, saldoPendiente: 3217 } },
    { direccion: "RECIBIDO", status: "ABIERTO", _count: { _all: 2 }, _sum: { montoAdelantado: 3031, saldoPendiente: 3031 } },
    /* Lo que la revisión encontró: un recibido ANULADO sumaba al permiso, y uno
       EXCEDIDO (le diste de más) le restaba a lo que se debe devolver. */
    { direccion: "RECIBIDO", status: "CANCELADO", _count: { _all: 1 }, _sum: { montoAdelantado: 999, saldoPendiente: 999 } },
    { direccion: "RECIBIDO", status: "EXCEDIDO", _count: { _all: 1 }, _sum: { montoAdelantado: 100, saldoPendiente: -40 } },
  ];

  it("balance(): por dirección y estado; lo anulado no suma y lo excedido no resta", async () => {
    H.respuestas["adelanto.groupBy"] = () => grupos;
    const b = await ForestContratoDB.balance("t1", "c1");
    expect(deAdelanto("groupBy")[0].args.by).toEqual(["direccion", "status"]);
    expect(b.adelantos).toEqual({ documentos: 1, monto: 3217 });
    expect(b.adelantosSaldo).toBe(3217);
    expect(b.adelantosRecibidos).toEqual({ documentos: 3, monto: 3131 });
    expect(b.adelantosRecibidosSaldo).toBe(3031);
  });

  it("balances(): por contrato y dirección", async () => {
    H.respuestas["adelanto.groupBy"] = () => grupos.map((g) => ({ ...g, contratoId: "c1" }));
    const m = await ForestContratoDB.balances("t1");
    expect(deAdelanto("groupBy")[0].args.by).toEqual(["contratoId", "direccion", "status"]);
    expect(m.get("c1")).toMatchObject({ adelantos: { monto: 3217 }, adelantosRecibidos: { documentos: 3, monto: 3131 }, adelantosRecibidosSaldo: 3031 });
  });
});

describe("cron de recordatorios", () => {
  it("pasa por AdelantosDB y sólo mira lo DADO", async () => {
    H.respuestas["adelanto.findMany"] = () => [{ tenantId: "t1", beneficiarioId: "b1", saldoPendiente: 250, moneda: "PEN" }];
    const r = await (cronRecordatorios as unknown as () => Promise<Response>)();
    const [l] = deAdelanto("findMany");
    expect(whereDe(l)).toMatchObject({ status: "ABIERTO", direccion: "DADO" });
    expect(await r.json()).toMatchObject({ ok: true, tenantsConVencidos: 1, adelantosVencidos: 1 });
    const sello = H.llamadas.find((x) => x.modelo === "adelantoBeneficiario" && x.metodo === "updateMany");
    expect(whereDe(sello!)).toMatchObject({ tenantId: "t1", id: { in: ["b1"] } });
  });
});
