/**
 * Pendiente vencido (10 min, reinicio u otra instancia): la tarjeta sale del
 * historial también en el 404 — si no, reaparece en cada recarga con un «Sí»
 * que ya no sirve — y queda el aviso en la conversación (ADR-528).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  resolver: vi.fn(),
  quitarPendiente: vi.fn(),
  agregarMensajes: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: async () => ({ tenantId: "T1", username: "ana", role: "admin" }) }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/asistente/confirmar-app", () => ({ resolverAprobacion: h.resolver }));
vi.mock("@/lib/db/ia-conversaciones.db", () => ({
  IaConversacionesDB: { existe: async () => true, quitarPendiente: h.quitarPendiente, agregarMensajes: h.agregarMensajes },
}));

const { POST } = await import("@/app/api/admin/ia/confirmar/route");

const pedir = () =>
  POST(
    new NextRequest("http://localhost/api/admin/ia/confirmar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversacionId: "c1", aprobacionId: "a1", decision: "aprobar" }),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  h.agregarMensajes.mockImplementation(async (_t, _u, _c, ms) => ms.map((m: { content: string }) => ({ id: "m1", rol: "assistant", texto: m.content })));
});

describe("POST /api/admin/ia/confirmar con el pendiente vencido", () => {
  it("404 + saca la tarjeta del historial + deja el aviso", async () => {
    h.resolver.mockResolvedValue({ ok: false, status: 404, message: "ya no está" });
    const r = await pedir();
    expect(r.status).toBe(404);
    expect(h.quitarPendiente).toHaveBeenCalledWith("T1", "ana", "c1", "a1");
    expect(h.agregarMensajes.mock.calls[0][3][0].content).toBe("⌛ Esa operación ya no está pendiente: ya se anotó, se canceló o venció. Si falta, mándamela de nuevo.");
    expect((await r.json()).message).toContain("venció");
  });

  it("403 (otro negocio / otra persona): no toca el historial", async () => {
    h.resolver.mockResolvedValue({ ok: false, status: 403, message: "Forbidden" });
    expect((await pedir()).status).toBe(403);
    expect(h.quitarPendiente).not.toHaveBeenCalled();
    expect(h.agregarMensajes).not.toHaveBeenCalled();
  });
});
