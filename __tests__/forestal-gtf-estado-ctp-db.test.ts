/**
 * La columna «Estado» del Libro TH (07-10): cada guía de trozas viva dice si ya
 * entró al Libro CTP. Ingresada = ingreso vivo con su N° (tramo a tramo) Y del
 * mismo dueño — no basta el N°. Base simulada.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  ingresos: [] as { gtfNumber: string; providerName: string; originCode: string | null }[],
  ruc: "20123456789",
}));
vi.mock("@/lib/prisma", () => ({ prisma: { woodEntry: { findMany: vi.fn(async () => H.ingresos) } } }));
vi.mock("@/lib/cache", () => ({ invalidate: vi.fn(), invalidateByPrefix: vi.fn() }));
vi.mock("@/lib/db/forest-ctp-ficha.db", () => ({ ForestCtpFichaDB: { get: vi.fn(async () => ({ ruc: H.ruc })) } }));

import { ForestGtfDB } from "@/lib/db/forest-gtf.db";

const g = (id: string, extra: Record<string, unknown> = {}) => ({
  id, gtfNumber: `019-001-000000${id}`, tipo: "trozas", status: "emitida",
  titularName: "BLAS SA", tituloHabilitante: "PO-1", gtfDatos: null, ...extra,
});

beforeEach(() => {
  H.ingresos = [
    { gtfNumber: "19-001-0000001", providerName: "BLAS SA", originCode: null },
    /* Mismo N° que la 2, pero de otro dueño: no la marca como ingresada. */
    { gtfNumber: "019-001-0000002", providerName: "OTRO TITULAR", originCode: "XX-9" },
  ];
});

describe("ForestGtfDB.estadoCtpDeLista", () => {
  it("ingresada / por ingresar / otra empresa; producto y anulada sin estado", async () => {
    const m = await ForestGtfDB.estadoCtpDeLista("t", [
      g("1"),
      g("2"),
      g("3", { gtfDatos: { destinatario: { docNumero: "20999999999" } } }),
      g("4", { gtfDatos: { destinatario: { docNumero: "20123456789" } } }),
      g("5", { tipo: "producto" }),
      g("6", { status: "anulada" }),
    ]);
    expect(Object.fromEntries(m)).toEqual({ "1": "ingresada", "2": "por_ingresar", "3": "otra_empresa", "4": "por_ingresar" });
  });
});
