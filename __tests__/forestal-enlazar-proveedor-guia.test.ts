/**
 * ADR-437 §2 · `ForestDirectorioDB.enlazarProveedorDeGuia` — atar una guía de
 * COMPRA a la ficha de su proveedor sin tocar la plata.
 *
 * Lo que importa está en la ESCRITURA (qué WHERE lleva el `updateMany`), así
 * que se prueba la DB class con la base simulada, no una función pura.
 * Fixtures del caso real (Blas, 26-09): la guía 019-001-0000013 de NELLY
 * QUINCHUNLLA, las de SANTOS MUÑOZ (servicio de WASACO).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => {
  const estado = {
    partes: [] as { id: string; tenantId: string; nombre: string }[],
    asientos: [] as { id: string; tenantId: string; gtfNumber: string; maderaDeTercero: boolean; proveedorParteId: string | null }[],
    updates: [] as { where: Record<string, unknown>; data: Record<string, unknown> }[],
    audits: [] as { action: string; user: string; detail: string }[],
  };
  const prisma = {
    forestParty: {
      findFirst: async ({ where }: { where: { id: string; tenantId: string } }) =>
        estado.partes.find((p) => p.id === where.id && p.tenantId === where.tenantId) ?? null,
    },
    woodEntry: {
      findMany: async ({ where }: { where: { tenantId: string; gtfNumber: string } }) =>
        estado.asientos.filter((a) => a.tenantId === where.tenantId && a.gtfNumber === where.gtfNumber),
      updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        estado.updates.push(args);
        const w = args.where as { tenantId: string; gtfNumber: string };
        const n = estado.asientos.filter(
          (a) => a.tenantId === w.tenantId && a.gtfNumber === w.gtfNumber && !a.maderaDeTercero && a.proveedorParteId == null,
        ).length;
        return { count: n };
      },
    },
  };
  return { estado, prisma };
});

vi.mock("@/lib/prisma", () => ({ prisma: H.prisma }));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: () => {} }));
vi.mock("@/lib/db/forest-ctp-consumo.db", () => ({ CONSUMO_VIGENTE: {} }));
vi.mock("@/lib/forestal/ctp-audit", () => ({
  auditCtp: () => {},
  auditCtpEsperando: async (p: { action: string; user: string; detail: string }) => {
    H.estado.audits.push(p);
  },
}));

import { ForestDirectorioDB } from "@/lib/db/forest-directorio.db";

const BLAS = "cmpxiv6p4000bohvzwl6bnfpv";
const OTRO = "tenant-ajeno";
const NELLY = "parte-nelly";

beforeEach(() => {
  H.estado.partes = [
    { id: NELLY, tenantId: BLAS, nombre: "QUINCHUNLLA PEREZ, NELLY" },
    { id: "parte-ajena", tenantId: OTRO, nombre: "AJENA" },
    { id: "parte-otra", tenantId: BLAS, nombre: "OTRA" },
  ];
  H.estado.asientos = [
    { id: "we-1", tenantId: BLAS, gtfNumber: "019-001-0000013", maderaDeTercero: false, proveedorParteId: null },
    { id: "we-2", tenantId: BLAS, gtfNumber: "010-001-0000005", maderaDeTercero: true, proveedorParteId: null },
  ];
  H.estado.updates = [];
  H.estado.audits = [];
});

describe("enlazarProveedorDeGuia", () => {
  it("ata la guía de compra y audita con el actor que se le pasa", async () => {
    const r = await ForestDirectorioDB.enlazarProveedorDeGuia(BLAS, { gtfNumber: "019-001-0000013", parteId: NELLY }, "script:adr437");
    expect(r).toEqual({ enlazados: 1, yaEstaban: 0 });
    // La condición va en el WHERE: no pisa otra ficha ni una guía de servicio.
    expect(H.estado.updates[0].where).toMatchObject({
      tenantId: BLAS,
      gtfNumber: "019-001-0000013",
      deletedAt: null,
      maderaDeTercero: false,
      proveedorParteId: null,
    });
    expect(H.estado.updates[0].data).toEqual({ proveedorParteId: NELLY });
    expect(H.estado.audits[0]).toMatchObject({ action: "ctp_ingreso_update", user: "script:adr437" });
  });

  it("una ficha de OTRO tenant no existe para este (y no escribe nada)", async () => {
    await expect(
      ForestDirectorioDB.enlazarProveedorDeGuia(BLAS, { gtfNumber: "019-001-0000013", parteId: "parte-ajena" }, "x"),
    ).rejects.toThrow(/directorio de este negocio/);
    expect(H.estado.updates).toHaveLength(0);
  });

  it("una guía de servicio no lleva proveedor", async () => {
    await expect(
      ForestDirectorioDB.enlazarProveedorDeGuia(BLAS, { gtfNumber: "010-001-0000005", parteId: NELLY }, "x"),
    ).rejects.toThrow(/madera de servicio/);
    expect(H.estado.updates).toHaveLength(0);
  });

  it("no pisa una guía ya atada a otra ficha", async () => {
    H.estado.asientos[0].proveedorParteId = "parte-otra";
    await expect(
      ForestDirectorioDB.enlazarProveedorDeGuia(BLAS, { gtfNumber: "019-001-0000013", parteId: NELLY }, "x"),
    ).rejects.toThrow(/otra ficha/);
    expect(H.estado.updates).toHaveLength(0);
  });

  it("idempotente: la segunda vez no ata nada ni deja otro renglón de auditoría", async () => {
    H.estado.asientos[0].proveedorParteId = NELLY;
    const r = await ForestDirectorioDB.enlazarProveedorDeGuia(BLAS, { gtfNumber: "019-001-0000013", parteId: NELLY }, "x");
    expect(r).toEqual({ enlazados: 0, yaEstaban: 1 });
    expect(H.estado.audits).toHaveLength(0);
  });

  it("sin tenantId no corre", async () => {
    await expect(ForestDirectorioDB.enlazarProveedorDeGuia("", { gtfNumber: "g", parteId: NELLY }, "x")).rejects.toThrow(
      /tenantId/,
    );
  });
});
