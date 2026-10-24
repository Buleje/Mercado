// @vitest-environment node
/**
 * /api/admin/whatsapp/asistente (+ /probar): el negocio sale SOLO de la sesión.
 * Sin sesión 401; un `tenantId` ajeno en el cuerpo no cambia dónde se escribe
 * ni qué catálogo se usa.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  flags: {} as Record<string, unknown>,
  pisar: vi.fn(),
  responder: vi.fn(),
  log: vi.fn(async () => undefined),
}));

vi.mock("@/lib/require-admin", () => ({ requireAdmin: H.requireAdmin }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: vi.fn(() => null) }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: H.log }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/db/settings.db", () => ({
  SettingsDB: { getFeatureFlags: vi.fn(async () => H.flags), pisarClavesFlags: H.pisar },
}));
vi.mock("@/lib/whatsapp/concierge/handlers/asesora.handler", () => ({ responderComoAsesora: H.responder }));

import { GET, PUT } from "@/app/api/admin/whatsapp/asistente/route";
import { POST as PROBAR } from "@/app/api/admin/whatsapp/asistente/probar/route";

const AJUSTE = {
  activo: true,
  cruzarTiendas: false,
  nombreNegocio: "Musa",
  nombreAsistente: "la asistente virtual de Musa",
  presentacion: "Tuteo.",
  horario: "",
  preguntasFrecuentes: [],
  consejos: [],
  cuidados: [],
  traspaso: { nombre: "Drucila", telefono: "51921585006", cuando: "" },
  pausarAlTraspasar: true,
};

const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/admin/whatsapp/asistente", {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}),
  });

beforeEach(() => {
  vi.clearAllMocks();
  H.flags = {};
  H.requireAdmin.mockResolvedValue({ tenantId: "tenant-musa", role: "admin" });
});

describe("asistente de WhatsApp — rutas del panel", () => {
  it("sin sesión: 401 en las tres", async () => {
    H.requireAdmin.mockResolvedValue(NextResponse.json({ error: "No autorizado" }, { status: 401 }));
    expect((await GET(req("GET"))).status).toBe(401);
    expect((await PUT(req("PUT", AJUSTE))).status).toBe(401);
    expect((await PROBAR(req("POST", { mensaje: "hola" }))).status).toBe(401);
    expect(H.pisar).not.toHaveBeenCalled();
  });

  it("PUT guarda en el negocio de la sesión aunque el cuerpo traiga otro tenantId", async () => {
    const r = await PUT(req("PUT", { ...AJUSTE, tenantId: "tenant-ajeno" }));
    expect(r.status).toBe(200);
    expect(H.pisar).toHaveBeenCalledWith("tenant-musa", { whatsappAsistente: AJUSTE });
  });

  it("PUT deja registro de qué cambió (tono, cruzarTiendas) en el negocio de la sesión", async () => {
    H.flags = { whatsappAsistente: AJUSTE };
    await PUT(req("PUT", { ...AJUSTE, presentacion: "Más formal.", cruzarTiendas: true }));
    expect(H.log).toHaveBeenCalledTimes(1);
    const [accion, , detalle, , , , tenant] = H.log.mock.calls[0] as unknown as string[];
    expect(accion).toBe("whatsapp.asistente.update");
    expect(tenant).toBe("tenant-musa");
    expect(JSON.parse(detalle)).toMatchObject({
      cambios: ["cruzarTiendas", "presentacion"],
      cruzarTiendas: true,
      cruzarTiendasAntes: false,
    });
  });

  it("PUT sin traspaso: 400 y no escribe", async () => {
    const r = await PUT(req("PUT", { ...AJUSTE, traspaso: undefined }));
    expect(r.status).toBe(400);
    expect(H.pisar).not.toHaveBeenCalled();
  });

  it("probar sin asistente guardada: 409; con ella, contesta con el negocio de la sesión", async () => {
    expect((await PROBAR(req("POST", { mensaje: "hola" }))).status).toBe(409);
    H.flags = { whatsappAsistente: AJUSTE };
    H.responder.mockResolvedValue({ respuesta: "¡Hola, linda!", traspasar: false, resumen: "", via: "ia" });
    const r = await PROBAR(req("POST", { mensaje: "hola", tenantId: "tenant-ajeno" }));
    expect(r.status).toBe(200);
    expect(H.responder).toHaveBeenCalledWith("tenant-musa", AJUSTE, "hola", [], "prueba");
  });
});
