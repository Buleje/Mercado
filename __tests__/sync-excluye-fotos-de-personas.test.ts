import { describe, expect, it, vi, beforeEach } from "vitest";

const { list, listFolders, getById } = vi.hoisted(() => ({
  list: vi.fn(),
  listFolders: vi.fn(),
  getById: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/documents.db", () => ({ DocumentsDB: { list, listFolders, getById } }));
vi.mock("@/lib/documents/storage", () => ({
  buildStoragePath: vi.fn(),
  uploadToStorage: vi.fn(),
  isMimeAllowed: vi.fn(),
  downloadFromStorage: vi.fn(async () => Buffer.from("x")),
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/sync/auth-agente", () => ({
  AUTOR_AGENTE: "agente",
  requireAgente: vi.fn(async () => ({ tenantId: "t1" })),
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { NextRequest } from "next/server";
import { TAGS_FUERA_DEL_SYNC, rutasLogicas } from "@/lib/sync/drive-sync";
import { GET as manifest } from "@/app/api/sync/manifest/route";
import { GET as pull } from "@/app/api/sync/pull/[id]/route";

const req = (url: string) => new NextRequest(`http://localhost${url}`);

beforeEach(() => {
  vi.clearAllMocks();
  listFolders.mockResolvedValue([]);
});

describe("el sync no baja las fotos de personas", () => {
  it("la etiqueta que se excluye es la que pone el detector", () => {
    expect(TAGS_FUERA_DEL_SYNC).toContain("personas");
  });

  it("el manifiesto pide los documentos SIN la etiqueta «personas»", async () => {
    list.mockResolvedValue([]);
    const r = await manifest(req("/api/sync/manifest"));
    expect(r.status).toBe(200);
    expect(list).toHaveBeenCalledWith("t1", { sinTags: ["personas"] });
  });

  it("las rutas lógicas también (no arma rutas de fotos que no se listan)", async () => {
    list.mockResolvedValue([]);
    await rutasLogicas("t1");
    expect(list).toHaveBeenCalledWith("t1", { sinTags: ["personas"] });
  });

  it("bajar por id una foto de personas = 404, aunque el agente tenga el id", async () => {
    getById.mockResolvedValue({ id: "d1", tags: ["personas"], storagePath: "p", mimeType: "image/webp", updatedAt: new Date() });
    const r = await pull(req("/api/sync/pull/d1"), { params: Promise.resolve({ id: "d1" }) });
    expect(r.status).toBe(404);
  });

  it("un documento normal sigue bajando", async () => {
    getById.mockResolvedValue({ id: "d2", tags: ["contrato"], storagePath: "p", mimeType: "application/pdf", updatedAt: new Date() });
    const r = await pull(req("/api/sync/pull/d2"), { params: Promise.resolve({ id: "d2" }) });
    expect(r.status).toBe(200);
  });
});
