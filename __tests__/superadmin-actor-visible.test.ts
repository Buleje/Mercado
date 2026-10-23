// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/superadmin-auth", () => ({ requirePlatformAPI: vi.fn(async () => ({ username: "root" })) }));
vi.mock("@/lib/csrf", () => ({ validateSuperadminCsrf: () => true, csrfForbiddenResponse: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: async () => null }));

const H = vi.hoisted(() => ({
  platform: vi.fn(async (..._a: unknown[]) => undefined),
  audit: vi.fn(),
  approve: vi.fn(async (..._a: unknown[]) => ({ found: true, transitioned: true, ordersUpdated: 0, ordersTotal: 0, customerNotified: false })),
  chat: { resolverNegocio: vi.fn(), conversacionVigente: vi.fn(), createConversation: vi.fn(), getConversation: vi.fn(), sendMessage: vi.fn() },
}));
vi.mock("@/lib/audit/superadmin-audit", () => ({ logSuperadminAction: H.platform }));
vi.mock("@/lib/audit/audit-context", () => ({
  runWithAuditContext: (_req: unknown, actor: string, fn: () => unknown) => (H.audit(actor), fn()),
}));
vi.mock("@/lib/whatsapp/finalize-yape-approval", () => ({ finalizeYapeApproval: H.approve }));
vi.mock("@/lib/db/platform-chat.db", () => ({ PlatformChatDB: H.chat }));

const { actorVisibleParaNegocio, EQUIPO_BULEJE } = await import("@/lib/superadmin/actor-visible");
const { POST: approve } = await import("@/app/api/superadmin/payment-approvals/[id]/approve/route");
const { POST: conv } = await import("@/app/api/superadmin/chat/conversations/route");

describe("el negocio ve «Equipo Buleje», la plataforma el usuario real", () => {
  beforeEach(() => vi.clearAllMocks());

  it("helper y reexportación de correccion-guia", async () => {
    expect(actorVisibleParaNegocio()).toBe("Equipo Buleje");
    expect((await import("@/lib/soporte/correccion-guia")).EQUIPO_BULEJE).toBe(EQUIPO_BULEJE);
  });

  it("aprobar un pago: audit y reviewer del negocio = Equipo Buleje; plataforma = root", async () => {
    await approve(new NextRequest("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ id: "p1" }) });
    expect(H.audit).toHaveBeenCalledWith("Equipo Buleje");
    expect(H.approve).toHaveBeenCalledWith("p1", "Equipo Buleje");
    expect(H.platform.mock.calls[0]?.[3]).toBe("root");
  });

  it("chat: el mensaje y la conversación salen como Equipo Buleje; plataforma = root", async () => {
    H.chat.resolverNegocio.mockResolvedValue({ id: "t1", name: "Blas" });
    H.chat.createConversation.mockResolvedValue({ id: "c1" });
    H.chat.getConversation.mockResolvedValue({ id: "c1" });
    await conv(new NextRequest("http://localhost/x", { method: "POST", body: JSON.stringify({ tenantId: "t1", firstMessage: "hola" }) }));
    expect(H.chat.createConversation).toHaveBeenCalledWith(expect.objectContaining({ createdBy: "Equipo Buleje" }));
    expect(H.chat.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ senderName: "Equipo Buleje" }));
    expect(H.platform.mock.calls[0]?.[3]).toBe("root");
  });
});
