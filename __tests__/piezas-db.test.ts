/**
 * ADR-457 · TenantPiezaDB con la base simulada: el `tenantId` va en el WHERE y
 * en la clave del upsert (no en un `if` después) y cada escritura vence la
 * caché del negocio AL INSTANTE (`expire: 0`, no `"max"`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  findMany: vi.fn(),
  upsert: vi.fn(),
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { tenantPieza: { findMany: H.findMany, upsert: H.upsert } },
}));
vi.mock("next/cache", () => ({
  cacheTag: H.cacheTag,
  cacheLife: H.cacheLife,
  revalidateTag: H.revalidateTag,
}));

import { TenantPiezaDB, tagPiezas } from "@/lib/db/tenant-pieza.db";

const fila = {
  id: "p1",
  tenantId: "t1",
  piezaId: "gtf-hoja-de-control",
  enchufe: "forestal.guia-impresa",
  prendida: true,
  opciones: {},
  version: "1.0.0",
  orden: 0,
  actualizadoPor: "superadmin:root",
  createdAt: new Date("2026-10-01T00:00:00Z"),
  updatedAt: new Date("2026-10-01T00:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  H.findMany.mockResolvedValue([fila]);
  H.upsert.mockResolvedValue(fila);
});

describe("lecturas", () => {
  it("listarPrendidas: sólo del negocio, sólo prendidas, del enchufe pedido, con la etiqueta del negocio", async () => {
    await TenantPiezaDB.listarPrendidas("t1", "forestal.guia-impresa");
    expect(H.findMany.mock.calls[0][0].where).toEqual({ tenantId: "t1", prendida: true, enchufe: "forestal.guia-impresa" });
    expect(H.cacheTag).toHaveBeenCalledWith("tenant:t1:piezas");
    expect(tagPiezas("t1")).toBe("tenant:t1:piezas");
  });

  it("listarPrendidas sin enchufe no filtra por enchufe", async () => {
    await TenantPiezaDB.listarPrendidas("t1");
    expect(H.findMany.mock.calls[0][0].where).toEqual({ tenantId: "t1", prendida: true });
  });

  it("listarPorNegocio: todas las del negocio, prendidas o no", async () => {
    await TenantPiezaDB.listarPorNegocio("t2");
    expect(H.findMany.mock.calls[0][0].where).toEqual({ tenantId: "t2" });
  });

  it("matriz: cruza negocios a propósito y aplana slug y nombre", async () => {
    H.findMany.mockResolvedValueOnce([{ ...fila, tenant: { slug: "main", name: "Bodega" } }]);
    const m = await TenantPiezaDB.matriz();
    expect(H.findMany.mock.calls[0][0].where).toBeUndefined();
    expect(m[0]).toMatchObject({ tenantSlug: "main", tenantNombre: "Bodega", piezaId: "gtf-hoja-de-control" });
    expect(m[0]).not.toHaveProperty("tenant");
  });
});

describe("guardar", () => {
  it("el tenantId va en la clave del upsert y en el create; vence la caché al instante", async () => {
    await TenantPiezaDB.guardar(
      "t1",
      { piezaId: "gtf-hoja-de-control", enchufe: "forestal.guia-impresa", prendida: true, opciones: { nota: "x" }, version: "1.0.0" },
      "superadmin:root",
    );
    const arg = H.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({
      tenantId_piezaId_enchufe: { tenantId: "t1", piezaId: "gtf-hoja-de-control", enchufe: "forestal.guia-impresa" },
    });
    expect(arg.create).toMatchObject({ tenantId: "t1", prendida: true, opciones: { nota: "x" }, version: "1.0.0", orden: 0, actualizadoPor: "superadmin:root" });
    expect(arg.update).toMatchObject({ prendida: true, version: "1.0.0", actualizadoPor: "superadmin:root" });
    // Sin `orden` en el input, el update no lo pisa.
    expect(arg.update).not.toHaveProperty("orden");
    expect(H.revalidateTag).toHaveBeenCalledWith("tenant:t1:piezas", { expire: 0 });
  });

  it("apagar es prendida=false sobre la misma fila (queda quién y cuándo)", async () => {
    await TenantPiezaDB.guardar(
      "t1",
      { piezaId: "gtf-hoja-de-control", enchufe: "forestal.guia-impresa", prendida: false, opciones: {}, version: "1.0.0", orden: 3 },
      "superadmin:otro",
    );
    expect(H.upsert.mock.calls[0][0].update).toMatchObject({ prendida: false, orden: 3, actualizadoPor: "superadmin:otro" });
  });
});
