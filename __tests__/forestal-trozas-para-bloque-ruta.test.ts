/**
 * ADR-519, fase 1 — POST /distribuciones/trozas-para-bloque (revisión):
 *  · una troza ya elegida por OTRO bloque guardado sale descartada con su motivo;
 *  · las trozas que consumieron los días ya escritos (`corridaIds`) vuelven
 *    como `yaEnElLibro`: no se proponen otra vez ni se descartan;
 *  · el tenant sale de la sesión (otro negocio no lee nada: 401 sin sesión).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({ requireAdmin: vi.fn(), elegiblesDe: vi.fn(), list: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: H.requireAdmin }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: vi.fn(async () => true) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/db/forest-lote-aserrio.db", () => ({ ForestLoteAserrioDB: { elegiblesDe: H.elegiblesDe } }));
vi.mock("@/lib/db/forest-distribuciones.db", () => ({ ForestDistribucionesDB: { list: H.list } }));

import { POST } from "@/app/api/admin/forestal/distribuciones/trozas-para-bloque/route";

const ctx = { params: Promise.resolve({}) };
const req = (body: unknown) =>
  new NextRequest("https://host/api/admin/forestal/distribuciones/trozas-para-bloque", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const troza = (id: string, volumenM3: number, dia: string, extra: Record<string, unknown> = {}) => ({
  id,
  codigo: id.toUpperCase(),
  volumenM3,
  llegaISO: `2026-09-${dia}T12:00:00.000Z`,
  especie: "Tornillo",
  permiso: null,
  medidas: null,
  porRecepcionar: false,
  consumidaEnId: null,
  motivo: null,
  ...extra,
});
const cuerpo = {
  bloqueId: "b1",
  distribucionId: "d1",
  especie: "Tornillo",
  trozaIds: ["t1", "t2", "t3", "t4"],
  usadoM3: 1.1,
  aprovechablePct: 55,
  porDia: [{ dia: 2, m3: 1.1 }],
  fecha: "2026-10-01",
  corridaIds: ["corr-dia1"],
};

beforeEach(() => {
  vi.clearAllMocks();
  H.requireAdmin.mockResolvedValue({ tenantId: "t-qa", username: "qaadmin", role: "admin" });
  H.elegiblesDe.mockResolvedValue({
    trozas: [
      troza("t1", 1.5, "01", { consumidaEnId: "corr-dia1", motivo: "ya entró a la sierra" }),
      troza("t2", 2.5, "02"),
      troza("t3", 1, "03"),
      troza("t4", 3, "04"),
    ],
    noEncontradas: [],
    cerradoDe: {},
  });
  H.list.mockResolvedValue([
    { id: "d1", nombre: "Octubre", bloques: [{ id: "b1", etiqueta: "Guía 11", trozasElegidas: ["t2"] }] },
    { id: "d2", nombre: "Setiembre", bloques: [{ id: "b9", etiqueta: "Guía 07", trozasElegidas: ["t2"] }] },
  ]);
});

describe("POST /distribuciones/trozas-para-bloque", () => {
  it("descarta la elegida por otro bloque y devuelve las del Libro como suyas", async () => {
    const r = await POST(req(cuerpo), ctx);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(H.elegiblesDe).toHaveBeenCalledWith("t-qa", cuerpo.trozaIds, expect.objectContaining({ fechas: ["2026-10-02"] }));
    expect(j.yaEnElLibro).toEqual(["t1"]);
    expect(j.trozas.find((t: { id: string }) => t.id === "t1").motivo).toBeNull();
    /* Su propio bloque en la misma distribución no cuenta; el de «Setiembre» sí. */
    expect(j.seleccion.descartadas).toEqual([{ id: "t2", motivo: "elegida en la distribución «Setiembre», bloque Guía 07" }]);
    /* 1,1 m³ al 55 % = 2 m³: t3 (1) + t4 (3) por llegada; t1 no se vuelve a proponer. */
    expect(j.seleccion.elegidas).toEqual(["t3", "t4"]);
    expect(j.seleccion.faltaM3).toBe(0);
  });

  it("sin sesión responde 401 y no lee trozas", async () => {
    H.requireAdmin.mockResolvedValue(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
    const r = await POST(req(cuerpo), ctx);
    expect(r.status).toBe(401);
    expect(H.elegiblesDe).not.toHaveBeenCalled();
  });
});
