// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/superadmin-auth", () => ({ requirePlatformAPI: vi.fn(async () => ({ username: "root" })) }));

const db = {
  resolverNegocio: vi.fn(),
  conversacionVigente: vi.fn(),
  createConversation: vi.fn(),
  getConversation: vi.fn(),
  sendMessage: vi.fn(),
};
vi.mock("@/lib/db/platform-chat.db", () => ({ PlatformChatDB: db }));

const { POST } = await import("@/app/api/superadmin/chat/conversations/route");

function post(body: unknown) {
  return POST(new NextRequest("http://localhost/api/superadmin/chat/conversations", { method: "POST", body: JSON.stringify(body) }));
}

describe("POST /api/superadmin/chat/conversations — enlaces «Contactar»", () => {
  beforeEach(() => {
    for (const f of Object.values(db)) f.mockReset();
  });

  it("con el slug abre la conversación de siempre del negocio (no crea otra)", async () => {
    db.resolverNegocio.mockResolvedValue({ id: "cmpx-blas", name: "Blas" });
    db.conversacionVigente.mockResolvedValue({ id: "conv-real", tenantId: "cmpx-blas", status: "open" });
    const r = await post({ tenantId: "inversiones-blas", reusar: true });
    expect(r.status).toBe(200);
    expect((await r.json()).conversation.id).toBe("conv-real");
    expect(db.conversacionVigente).toHaveBeenCalledWith("cmpx-blas");
    expect(db.createConversation).not.toHaveBeenCalled();
  });

  it("si no hay conversación la crea con el id real y el nombre del negocio", async () => {
    db.resolverNegocio.mockResolvedValue({ id: "cmpx-blas", name: "Blas" });
    db.conversacionVigente.mockResolvedValue(null);
    db.createConversation.mockResolvedValue({ id: "nueva" });
    db.getConversation.mockResolvedValue({ id: "nueva", tenantId: "cmpx-blas" });
    const r = await post({ tenantId: "inversiones-blas", reusar: true });
    expect(r.status).toBe(201);
    expect(db.createConversation).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "cmpx-blas", tenantName: "Blas" }));
  });

  it("un negocio que no existe no crea una conversación huérfana", async () => {
    db.resolverNegocio.mockResolvedValue(null);
    const r = await post({ tenantId: "no-existe", reusar: true });
    expect(r.status).toBe(404);
    expect(db.createConversation).not.toHaveBeenCalled();
  });

  it("sin «reusar» (Nueva conversación) sigue creando una aparte", async () => {
    db.resolverNegocio.mockResolvedValue({ id: "cmpx-blas", name: "Blas" });
    db.createConversation.mockResolvedValue({ id: "otra" });
    db.getConversation.mockResolvedValue({ id: "otra" });
    const r = await post({ tenantId: "cmpx-blas", tenantName: "Blas SAC", subject: "Factura" });
    expect(r.status).toBe(201);
    expect(db.conversacionVigente).not.toHaveBeenCalled();
    expect(db.createConversation).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "cmpx-blas", tenantName: "Blas SAC" }));
  });
});
