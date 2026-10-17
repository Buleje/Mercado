/**
 * El resumen del turno es una LECTURA del panel: no puede quedarse sin cupo.
 *
 * La pestaña Turnos lo pide cada 60 s («ventas en vivo») y el cierre de un turno
 * SIN caja lo necesita para su esperado. Con MODERATE (20 cada 5 min por IP; en
 * una bodega todas las PC salen por la misma IP) el pedido 21 daba 429 y ese
 * turno no se podía cerrar («No se pudo calcular lo esperado en caja»).
 */
import { describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// Sin sesión: la ruta contesta 401 DESPUÉS del límite, así se cuenta sólo el límite.
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(async () => NextResponse.json({ error: "No autorizado" }, { status: 401 })),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { GET } from "@/app/api/turnos/[id]/summary/route";

describe("GET /api/turnos/[id]/summary · límite de lectura", () => {
  it("30 lecturas en 5 minutos desde la misma IP (3 PC de la bodega + el sondeo) no dan 429", async () => {
    const estados: number[] = [];
    for (let i = 0; i < 30; i++) {
      const req = new NextRequest("http://localhost/api/turnos/turno-1/summary", {
        headers: { "x-forwarded-for": "10.9.8.7" },
      });
      const res = await GET(req, { params: Promise.resolve({ id: "turno-1" }) });
      estados.push(res.status);
    }
    expect(estados.filter((s) => s === 429)).toHaveLength(0);
    expect(new Set(estados)).toEqual(new Set([401]));
  });
});
