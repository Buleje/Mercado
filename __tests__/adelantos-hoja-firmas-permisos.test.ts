import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  rol: "manager",
  carpetas: [] as Array<{ id: string; name: string; parentId: string | null; allowedRoles: string[] }>,
  updateFolder: vi.fn(async () => null),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: async () => ({ role: hoisted.rol, tenantId: "t1", username: "u" }) }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: async () => null }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: async () => undefined }));
vi.mock("@/lib/adelantos/permisos", () => ({ permisoAdelantos: () => null }));
vi.mock("@/lib/prisma", () => ({ prisma: { adelanto: { findMany: async () => [{ id: "a1" }] } } }));
vi.mock("@/lib/documents/storage", () => ({ buildStoragePath: () => "p", uploadToStorage: async () => ({ ok: true }) }));
vi.mock("@/lib/db/documents.db", () => ({
  DocumentsDB: {
    listFolders: async () => hoisted.carpetas,
    createFolderTree: async () => {
      if (!hoisted.carpetas.some((c) => c.name === "Adelantos")) hoisted.carpetas.push({ id: "raiz", name: "Adelantos", parentId: null, allowedRoles: [] });
      hoisted.carpetas.push({ id: "hojas", name: "Hojas de firmas", parentId: "raiz", allowedRoles: [] });
      return { idPorRuta: { "Adelantos/Hojas de firmas": "hojas" }, creadas: 1 };
    },
    updateFolder: hoisted.updateFolder,
    create: async () => ({ id: "d1" }),
    setStoragePath: async () => undefined,
    hardDelete: async () => true,
  },
}));

import { AdelantosHojaFirmasDB } from "@/lib/db/adelantos-hoja-firmas.db";
import { POST } from "@/app/api/adelantos/hoja-firmas/route";

beforeEach(() => {
  hoisted.carpetas = [];
  hoisted.updateFolder.mockClear();
});

describe("hoja de firmas: quién sube", () => {
  it("el encargado recibe 403 claro al subir (antes: 503 y carpeta cerrada)", async () => {
    hoisted.rol = "manager";
    const fd = new FormData();
    fd.append("datos", JSON.stringify({ codigo: "HF-261025-AAAA", adelantoIds: ["a1"] }));
    const res = await POST(new Request("http://x/api/adelantos/hoja-firmas", { method: "POST", body: fd }) as never);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { message: string }).message).toMatch(/subir la hoja firmada/);
    expect(hoisted.updateFolder).not.toHaveBeenCalled();
  });
});

describe("hoja de firmas: qué carpetas se cierran", () => {
  const llamar = () =>
    AdelantosHojaFirmasDB.adjuntarFoto("t1", { adelantoIds: ["a1"], codigo: "HF-261025-AAAA", cuerpo: Buffer.from("x"), ext: "webp", usuario: "u", rol: "admin" });

  it("raíz «Adelantos» hecha a mano: sólo se cierra «Hojas de firmas»", async () => {
    hoisted.carpetas = [{ id: "raiz", name: "Adelantos", parentId: null, allowedRoles: ["manager"] }];
    await llamar();
    const cerradas = hoisted.updateFolder.mock.calls.map((c) => (c as unknown as [string, string])[1]);
    expect(cerradas).toEqual(["hojas"]);
  });

  it("si la crea esa misma llamada, se cierran las dos", async () => {
    await llamar();
    const cerradas = hoisted.updateFolder.mock.calls.map((c) => (c as unknown as [string, string])[1]);
    expect(cerradas).toEqual(["raiz", "hojas"]);
  });
});
