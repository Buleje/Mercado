// @vitest-environment node
/**
 * Revisión de seguridad 23-10: el recibo de un adelanto se comparte por
 * WhatsApp con un enlace `/d/<token>` para VERLO. Ese mismo token servía para
 * firmarlo por `/api/public/documents/<token>/sign`: cualquiera con el mensaje
 * reenviado lo firmaba con cualquier nombre y `addVersion` dejaba esa versión
 * como la vigente. La firma del adelanto va por su registro (ADR-491).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => ({
  findByShareToken: vi.fn(),
  applySignature: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: async () => null,
  rateLimit: () => ({ allowed: true }),
  getClientIp: () => "127.0.0.1",
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/db/documents.db", () => ({
  DocumentsDB: {
    findByShareToken: H.findByShareToken,
    getShareRawPassword: vi.fn(),
    verifySharePassword: vi.fn(() => true),
    update: vi.fn(),
  },
}));
vi.mock("@/lib/documents/sign-document", () => ({ applySignature: H.applySignature }));

import { POST } from "@/app/api/public/documents/[token]/sign/route";

function encontrado(tags: string[]) {
  return {
    doc: { id: "doc1", tenantId: "t1", tags, ocrMetadata: null },
    share: { hasPassword: false },
  };
}

function firmar() {
  const req = new NextRequest("http://localhost/api/public/documents/tok/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signerName: "Alguien Cualquiera" }),
  });
  return POST(req, { params: Promise.resolve({ token: "tok" }) });
}

beforeEach(() => {
  H.findByShareToken.mockReset();
  H.applySignature.mockReset();
  H.applySignature.mockResolvedValue({ ok: true, signedAt: "2026-10-23T19:00:00.000Z" });
});

describe("POST /api/public/documents/[token]/sign: el recibo de un adelanto no se firma por su enlace", () => {
  it.each([
    [["persona:cm1", "recibo-adelanto", "adelanto:cm9"]],
    [["adelanto:cm9"]],
    [["recibo-adelanto"]],
  ])("con las etiquetas %j responde 403 y no toca el PDF", async (tags) => {
    H.findByShareToken.mockResolvedValue(encontrado(tags));
    const res = await firmar();
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "no_firmable" });
    expect(H.applySignature).not.toHaveBeenCalled();
  });

  it("un papel cualquiera del Archivo se sigue firmando como antes", async () => {
    H.findByShareToken.mockResolvedValue(encontrado(["contrato"]));
    const res = await firmar();
    expect(res.status).toBe(200);
    expect(H.applySignature).toHaveBeenCalledWith("t1", "doc1", expect.objectContaining({ signerName: "Alguien Cualquiera" }));
  });
});
