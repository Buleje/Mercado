/**
 * Seguridad 17-10, punto 4: anular una devolución al proveedor (y reingresar su
 * mercadería) mueve stock por fuera de una venta. El comentario decía «sólo
 * dueño o administrador», pero `requireAdmin` deja pasar al encargado.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { requireAdmin, anular, reingresar } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  anular: vi.fn(),
  reingresar: vi.fn(),
}));

vi.mock("@/lib/require-admin", () => ({ requireAdmin }));
vi.mock("@/lib/billing/require-active-subscription", () => ({ requireActiveSubscription: vi.fn(async () => null) }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/cache", () => ({ revalidateTenantTag: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/db/supplier-returns-anular.db", () => ({
  anularSupplierReturn: anular,
  reingresarSupplierReturn: reingresar,
  DevolucionAnuladaError: class extends Error {},
  NadaQueReingresarError: class extends Error {},
}));

import { POST as anularPOST } from "@/app/api/supplier-returns/[id]/anular/route";
import { POST as reingresarPOST } from "@/app/api/supplier-returns/[id]/reingresar/route";

const ctx = { params: Promise.resolve({ id: "dev-1" }) };
const req = (body?: unknown) =>
  new NextRequest("https://host/api/supplier-returns/dev-1/anular", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const sesion = (role: string) => ({ tenantId: "t1", role, username: "u" });
const devolucion = { devolucion: { id: "dev-1", estado: "ANULADA" }, avisos: [] };

beforeEach(() => {
  vi.clearAllMocks();
  anular.mockResolvedValue(devolucion);
  reingresar.mockResolvedValue(devolucion);
});

describe("anular / reingresar una devolución: sólo dueño o administrador", () => {
  it.each(["manager", "almacenero", "cajero"])("%s recibe 403 y no se toca nada", async (role) => {
    requireAdmin.mockResolvedValue(sesion(role));
    const a = await anularPOST(req({ motivo: "se equivocó", volvioAlAlmacen: true }), ctx);
    const r = await reingresarPOST(req(), ctx);
    expect(a.status).toBe(403);
    expect(r.status).toBe(403);
    expect((await a.json()).message).toMatch(/administrador o el dueño/);
    expect(anular).not.toHaveBeenCalled();
    expect(reingresar).not.toHaveBeenCalled();
  });

  it.each(["admin", "owner"])("%s sí puede", async (role) => {
    requireAdmin.mockResolvedValue(sesion(role));
    const a = await anularPOST(req({ motivo: "se equivocó", volvioAlAlmacen: false }), ctx);
    const r = await reingresarPOST(req(), ctx);
    expect(a.status).toBe(200);
    expect(r.status).toBe(200);
    expect(anular).toHaveBeenCalledWith("t1", "dev-1", expect.objectContaining({ motivo: "se equivocó" }));
    expect(reingresar).toHaveBeenCalledWith("t1", "dev-1", "u");
  });
});
