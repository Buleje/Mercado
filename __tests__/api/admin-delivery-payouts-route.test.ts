/**
 * POST /api/admin/delivery/payouts/:id — la puerta del pago al repartidor.
 * Sin sesión = 401 (nunca 404); encargado = 403 (el bypass de gestión de
 * requireAdmin lo dejaría pasar); salida de caja con Yape = 400; el tenant de
 * la sesión es el que llega a la DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  pagar: vi.fn(),
  aprobar: vi.fn(),
  rechazar: vi.fn(),
  deshacerPago: vi.fn(),
  listForTenant: vi.fn(),
}));

vi.mock("@/lib/require-admin", () => ({ requireAdmin: (...a: unknown[]) => H.requireAdmin(...a) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/db/partner-payouts.db", () => ({
  PartnerPayoutsDB: { pagar: H.pagar, aprobar: H.aprobar, rechazar: H.rechazar, deshacerPago: H.deshacerPago, listForTenant: H.listForTenant },
}));

import { POST } from "@/app/api/admin/delivery/payouts/[id]/route";
import { GET } from "@/app/api/admin/delivery/payouts/route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/admin/delivery/payouts/po1", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
const params = { params: Promise.resolve({ id: "po1" }) };

beforeEach(() => vi.clearAllMocks());

describe("POST /api/admin/delivery/payouts/:id", () => {
  it("sin sesión responde 401", async () => {
    H.requireAdmin.mockResolvedValueOnce(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
    const res = await POST(req({ accion: "aprobar" }), params);
    expect(res.status).toBe(401);
    expect(H.aprobar).not.toHaveBeenCalled();
  });

  it("un encargado no paga (403)", async () => {
    H.requireAdmin.mockResolvedValueOnce({ role: "manager", username: "m", tenantId: "t1" });
    const res = await POST(req({ accion: "pagar", metodo: "yape" }), params);
    expect(res.status).toBe(403);
    expect(H.pagar).not.toHaveBeenCalled();
  });

  it("salida de caja con Yape = 400 sin tocar la DB", async () => {
    H.requireAdmin.mockResolvedValueOnce({ role: "admin", username: "a", tenantId: "t1" });
    const res = await POST(req({ accion: "pagar", metodo: "yape", salidaDeCaja: true }), params);
    expect(res.status).toBe(400);
    expect(H.pagar).not.toHaveBeenCalled();
  });

  it("paga con el tenant de la sesión y propaga el 404 de un retiro ajeno", async () => {
    H.requireAdmin.mockResolvedValueOnce({ role: "admin", username: "a", name: "Ana", tenantId: "t1" });
    H.pagar.mockResolvedValueOnce({ ok: false, status: 404, error: "No encontramos ese retiro en tu negocio." });
    const res = await POST(req({ accion: "pagar", metodo: "efectivo", salidaDeCaja: true, referencia: "op 9" }), params);
    expect(res.status).toBe(404);
    expect(H.pagar).toHaveBeenCalledWith("t1", "po1", { metodo: "efectivo", salidaDeCaja: true, referencia: "op 9", usuario: "Ana" });
  });

  it("rechazar sin motivo = 400", async () => {
    H.requireAdmin.mockResolvedValueOnce({ role: "admin", username: "a", tenantId: "t1" });
    const res = await POST(req({ accion: "rechazar", motivo: " " }), params);
    expect(res.status).toBe(400);
    expect(H.rechazar).not.toHaveBeenCalled();
  });
});

describe("deshacer un pago y el historial filtrado", () => {
  it("deshacer va con el tenant de la sesión y exige motivo", async () => {
    H.requireAdmin.mockResolvedValueOnce({ role: "admin", username: "a", name: "Ana", tenantId: "t1" });
    H.deshacerPago.mockResolvedValueOnce({ ok: true, yaEstaba: false, gastoBorrado: true, devolucion: null, retiro: { id: "po1" } });
    const res = await POST(req({ accion: "deshacer", motivo: "Pagué al que no era" }), params);
    expect(res.status).toBe(200);
    expect(H.deshacerPago).toHaveBeenCalledWith("t1", "po1", "Pagué al que no era", "Ana");

    H.requireAdmin.mockResolvedValueOnce({ role: "admin", username: "a", tenantId: "t1" });
    expect((await POST(req({ accion: "deshacer", motivo: "" }), params)).status).toBe(400);
    expect(H.deshacerPago).toHaveBeenCalledTimes(1);
  });

  it("un encargado no deshace pagos (403)", async () => {
    H.requireAdmin.mockResolvedValueOnce({ role: "manager", username: "m", tenantId: "t1" });
    const res = await POST(req({ accion: "deshacer", motivo: "Me equivoqué" }), params);
    expect(res.status).toBe(403);
    expect(H.deshacerPago).not.toHaveBeenCalled();
  });

  it("GET ?historial=paid filtra en la base; un filtro inventado = 400; sin sesión = 401", async () => {
    H.requireAdmin.mockResolvedValueOnce({ role: "admin", username: "a", tenantId: "t1" });
    H.listForTenant.mockResolvedValueOnce({ porPagar: [], historial: [], resumen: {} });
    const ok = await GET(new NextRequest("http://localhost/api/admin/delivery/payouts?historial=paid"));
    expect(ok.status).toBe(200);
    expect(H.listForTenant).toHaveBeenCalledWith("t1", { historial: "paid" });

    H.requireAdmin.mockResolvedValueOnce({ role: "admin", username: "a", tenantId: "t1" });
    expect((await GET(new NextRequest("http://localhost/api/admin/delivery/payouts?historial=todo"))).status).toBe(400);

    H.requireAdmin.mockResolvedValueOnce(NextResponse.json({ error: "No autorizado" }, { status: 401 }));
    expect((await GET(new NextRequest("http://localhost/api/admin/delivery/payouts"))).status).toBe(401);
    expect(H.listForTenant).toHaveBeenCalledTimes(1);
  });
});
