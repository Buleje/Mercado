/**
 * /api/admin/forestal/contactos-envio (08-10): «Enviar por WhatsApp» los
 * papeles del permiso. Corre el `requireAdmin` REAL. Lo que se fija:
 *   · cada fuente de teléfonos sólo si el rol la ve en su módulo (Ley 29733);
 *   · el número se valida ANTES de crear enlaces (ninguno huérfano);
 *   · un papel que el rol no ve → 404 sin crear ninguno;
 *   · los enlaces (7 días) salen en UN pedido y cada documento deja en su
 *     auditoría a qué número se mandó, ANTES de responder;
 *   · todo o nada: si un enlace o la auditoría fallan, se revocan los creados;
 *   · los números ya usados vuelven sólo a quien lee su fuente.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => ({
  payload: null as null | { username: string; role: string; tenantId: string },
  prefs: {} as Record<string, unknown>,
  write: vi.fn(),
  puedeVer: vi.fn(),
  createShare: vi.fn(),
  revokeShare: vi.fn(),
  logMany: vi.fn(),
  beneficiarios: vi.fn(),
  partes: vi.fn(),
  proveedores: vi.fn(),
}));

vi.mock("@/lib/session", async (real) => ({
  ...(await real<typeof import("@/lib/session")>()),
  getSessionPayload: async () => H.payload,
}));
vi.mock("@/lib/auth/session-revocation", () => ({ isSessionRevoked: () => false }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: async () => null,
  applyRateLimitWithTenant: () => null,
  rateLimit: () => ({ allowed: true, remaining: 1, resetAt: Date.now() + 1000 }),
}));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: async () => true }));
vi.mock("@/lib/db/admin-preferences.db", () => ({
  AdminPreferencesDB: { read: async () => H.prefs, write: (...a: unknown[]) => H.write(...a) },
}));
vi.mock("@/lib/db/documents.db", () => ({
  DocumentsDB: {
    puedeVer: (...a: unknown[]) => H.puedeVer(...a),
    createShare: (...a: unknown[]) => H.createShare(...a),
    revokeShare: (...a: unknown[]) => H.revokeShare(...a),
    logMany: (...a: unknown[]) => H.logMany(...a),
  },
}));
vi.mock("@/lib/db/adelantos.db", () => ({ AdelantosDB: { listBeneficiarios: (...a: unknown[]) => H.beneficiarios(...a) } }));
vi.mock("@/lib/db/forest-directorio.db", () => ({ ForestDirectorioDB: { listarPartes: (...a: unknown[]) => H.partes(...a) } }));
vi.mock("@/lib/db/purchases.db", () => ({ SuppliersDB: { getAll: (...a: unknown[]) => H.proveedores(...a) } }));

import { GET, POST } from "@/app/api/admin/forestal/contactos-envio/route";

const URL_RUTA = "http://localhost/api/admin/forestal/contactos-envio";
const COOKIE = { cookie: "buleje-admin-sess=token-falso" };
const como = (role: string) => {
  H.payload = { username: "qa-admin", role, tenantId: "t-main" };
};
const leer = () => GET(new NextRequest(URL_RUTA, { headers: COOKIE }));
const enviar = (cuerpo: unknown) =>
  POST(new NextRequest(URL_RUTA, { method: "POST", headers: { ...COOKIE, "content-type": "application/json" }, body: JSON.stringify(cuerpo) }));

beforeEach(() => {
  H.payload = null;
  H.prefs = { contactosEnvio: [{ telefono: "51987654321", nombre: "Ya usado", usos: 1, ultimoUso: "2026-10-08T10:00:00.000Z" }] };
  H.write.mockReset().mockResolvedValue(undefined);
  H.puedeVer.mockReset().mockResolvedValue(true);
  H.createShare.mockReset().mockImplementation(async (_t: string, id: string) => ({ id: `sh-${id}`, token: `tok-${id}-0123456789`, expiresAt: "2026-10-15T15:00:00.000Z" }));
  H.revokeShare.mockReset().mockResolvedValue(true);
  H.logMany.mockReset().mockResolvedValue(undefined);
  H.beneficiarios.mockReset().mockResolvedValue([{ nombre: "Cuenta", telefono: "911111111" }]);
  H.partes.mockReset().mockResolvedValue([{ nombre: "Transportista", telefono: "922222222" }]);
  H.proveedores.mockReset().mockResolvedValue([{ name: "Proveedor", phone: "933333333" }]);
});

describe("GET — los contactos", () => {
  it("sin sesión → 401 y no lee ninguna fuente", async () => {
    const r = await leer();
    expect(r.status).toBe(401);
    expect(H.partes).not.toHaveBeenCalled();
  });

  it("un cajero no entra (no ve las carpetas del plan)", async () => {
    como("cajero");
    const r = await leer();
    expect(r.status).toBe(403);
    expect(H.proveedores).not.toHaveBeenCalled();
  });

  it("admin: lo ya usado primero y las tres fuentes", async () => {
    como("admin");
    const j = (await (await leer()).json()) as { contactos: { telefono: string; fuente: string }[] };
    expect(j.contactos.map((c) => c.fuente)).toEqual(["envio", "adelantos", "proveedor", "directorio"]);
    expect(j.contactos[0].telefono).toBe("51987654321");
  });

  it("almacenero: no recibe los números usados que salieron de Adelantos ni los de antes sin fuente", async () => {
    como("almacenero");
    H.prefs = {
      contactosEnvio: [
        { telefono: "51987654321", nombre: "Ya usado (antes)", usos: 1, ultimoUso: "2026-10-08T10:00:00.000Z" },
        { telefono: "51944444444", nombre: "Cuenta de Adelantos", usos: 1, ultimoUso: "2026-10-08T11:00:00.000Z", fuentes: ["adelantos"] },
        { telefono: "51955555555", nombre: "Escrito a mano", usos: 1, ultimoUso: "2026-10-08T12:00:00.000Z", fuentes: ["manual"] },
      ],
    };
    const j = (await (await leer()).json()) as { contactos: { nombre: string; fuente: string }[] };
    const nombres = j.contactos.map((c) => c.nombre);
    expect(nombres).toContain("Escrito a mano");
    expect(nombres).not.toContain("Cuenta de Adelantos");
    expect(nombres).not.toContain("Ya usado (antes)");
    expect(H.beneficiarios).not.toHaveBeenCalled();
  });
});

describe("POST — crear los enlaces y registrar el envío", () => {
  it("un número que no es celular → 400 sin crear enlaces ni recordar nada", async () => {
    como("admin");
    const r = await enviar({ telefono: "4012345", documentos: ["d1"] });
    expect(r.status).toBe(400);
    expect(H.createShare).not.toHaveBeenCalled();
    expect(H.write).not.toHaveBeenCalled();
  });

  it("un papel que el rol no ve → 404 sin crear ningún enlace", async () => {
    como("almacenero");
    H.puedeVer.mockImplementation(async (_t: string, id: string) => id !== "d2");
    const r = await enviar({ telefono: "987654321", documentos: ["d1", "d2"] });
    expect(r.status).toBe(404);
    expect(H.createShare).not.toHaveBeenCalled();
  });

  it("varios papeles en UN pedido: un enlace de 7 días por cada uno, con el rol, y la auditoría dice a qué número", async () => {
    como("admin");
    const r = await enviar({ telefono: "987 654 321", nombre: "Representante", documentos: ["d1", "d2", "d1"], referencia: "GTF 019-001-0000001" });
    expect(r.status).toBe(200);
    const j = (await r.json()) as { telefono: string; enlaces: { documentId: string; token: string }[] };
    expect(j.telefono).toBe("51987654321");
    expect(j.enlaces.map((e) => e.documentId)).toEqual(["d1", "d2"]);
    expect(H.createShare).toHaveBeenCalledTimes(2);
    expect(H.createShare).toHaveBeenCalledWith("t-main", "d1", expect.objectContaining({ viewerRole: "admin", expiresInDays: 7 }));
    /* UNA auditoría por documento, esperada y estricta (si falla, no sale ningún enlace). */
    expect(H.logMany).toHaveBeenCalledTimes(1);
    const [tenant, docs, entrada, opts] = H.logMany.mock.calls[0] as [string, string[], { action: string; metadata: Record<string, unknown> }, { estricto: boolean }];
    expect([tenant, docs, opts]).toEqual(["t-main", ["d1", "d2"], { estricto: true }]);
    expect(entrada).toMatchObject({
      action: "share",
      metadata: { canal: "whatsapp", telefono: "51987654321", referencia: "GTF 019-001-0000001", tokens: { d1: "tok-d1-0…", d2: "tok-d2-0…" } },
    });
    expect(H.revokeShare).not.toHaveBeenCalled();
    /* El número queda recordado arriba con su nombre. */
    const guardado = H.write.mock.calls[0][1] as { contactosEnvio: { telefono: string; nombre: string }[] };
    expect(guardado.contactosEnvio[0]).toMatchObject({ telefono: "51987654321", nombre: "Representante" });
  });

  it("el número se recuerda con su fuente", async () => {
    como("admin");
    H.prefs = {};
    await enviar({ telefono: "911111111", nombre: "Cuenta", fuente: "adelantos", documentos: ["d1"] });
    const guardado = H.write.mock.calls[0][1] as { contactosEnvio: { telefono: string; fuentes?: string[] }[] };
    expect(guardado.contactosEnvio[0]).toMatchObject({ telefono: "51911111111", fuentes: ["adelantos"] });
  });

  it("si la auditoría falla → 500, se revocan los enlaces creados y no se recuerda nada", async () => {
    como("admin");
    H.logMany.mockRejectedValue(new Error("db caída"));
    const r = await enviar({ telefono: "987654321", documentos: ["d1", "d2"] });
    expect(r.status).toBe(500);
    expect(H.revokeShare.mock.calls.map((c) => c[1]).sort()).toEqual(["sh-d1", "sh-d2"]);
    expect(H.write).not.toHaveBeenCalled();
  });

  it("si un enlace no se crea a mitad → se revocan los ya creados", async () => {
    como("admin");
    H.createShare.mockImplementation(async (_t: string, id: string) => (id === "d2" ? null : { id: `sh-${id}`, token: `tok-${id}-0123456789`, expiresAt: "2026-10-15T15:00:00.000Z" }));
    const r = await enviar({ telefono: "987654321", documentos: ["d1", "d2", "d3"] });
    expect(r.status).toBe(404);
    expect(H.revokeShare).toHaveBeenCalledWith("t-main", "sh-d1", "admin");
    expect(H.revokeShare).toHaveBeenCalledTimes(1);
    expect(H.logMany).not.toHaveBeenCalled();
  });

  it("si recordar el número falla, los enlaces igual vuelven", async () => {
    como("admin");
    H.write.mockRejectedValue(new Error("db caída"));
    const r = await enviar({ telefono: "987654321", documentos: ["d1"] });
    expect(r.status).toBe(200);
    expect(((await r.json()) as { enlaces: unknown[] }).enlaces).toHaveLength(1);
  });
});
