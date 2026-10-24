import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(async () => ({ tenantId: "t1", username: "qa" })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { documentFolder: { updateMany: vi.fn(async () => ({ count: 2 })) } },
}));

import { POST } from "@/app/api/admin/documents/folders/bulk/route";
import { prisma } from "@/lib/prisma";
import { FOLDER_ICON_KEYS } from "@/lib/documentos/folder-icon-keys";
import { FOLDER_ICON_OPTIONS } from "@/components/admin/documentos/folder-visuals";

const um = prisma.documentFolder.updateMany as unknown as ReturnType<typeof vi.fn>;
const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/admin/documents/folders/bulk", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => vi.clearAllMocks());

describe("folders/bulk · action icon", () => {
  it("las claves aceptadas son las del selector", () => {
    expect([...FOLDER_ICON_KEYS]).toEqual(FOLDER_ICON_OPTIONS.map((o) => o.key));
  });

  it("un solo updateMany filtrado por tenant, con el ícono y el emoji limpio", async () => {
    const r = await post({ action: "icon", ids: ["a", "b"], icon: "bank" });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, count: 2 });
    expect(um).toHaveBeenCalledTimes(1);
    expect(um).toHaveBeenCalledWith({ where: { id: { in: ["a", "b"] }, tenantId: "t1" }, data: { icon: "bank", emoji: null } });
  });

  it("null vuelve al ícono por defecto", async () => {
    await post({ action: "icon", ids: ["a"], icon: null });
    expect(um.mock.calls[0][0].data).toEqual({ icon: null, emoji: null });
  });

  it("rechaza una clave que no está en el set (no acepta texto libre)", async () => {
    const r = await post({ action: "icon", ids: ["a"], icon: "doc:123" });
    expect(r.status).toBe(400);
    expect(um).not.toHaveBeenCalled();
  });
});
