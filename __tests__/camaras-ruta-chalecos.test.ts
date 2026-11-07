/**
 * /api/admin/camaras — lo nuevo de ADR-456: chalecos, vigilar la pila y
 * confirmar un cruce. Corre el `requireAdmin` REAL (sólo se simula el JWT): el
 * 401/403 sale de la misma regla que en producción, y el negocio es SIEMPRE el
 * de la sesión aunque el header diga otro.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => ({
  payload: null as null | { username: string; role: string; tenantId: string },
  personal: [] as { id: string; nombre: string; apodo: string | null; estado: string; puesto: { nombre: string } | null }[],
  personalPedido: [] as string[],
  asignar: vi.fn(),
  confirmar: vi.fn(),
  vigila: vi.fn(),
  chalecos: {} as Record<string, string>,
}));

vi.mock("@/lib/session", async (real) => ({
  ...(await real<typeof import("@/lib/session")>()),
  getSessionPayload: async () => H.payload,
}));
vi.mock("@/lib/auth/session-revocation", () => ({ isSessionRevoked: () => false }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: vi.fn(() => null) }));
vi.mock("@/lib/camaras/isapi", () => ({ moverPtz: vi.fn(), probarCamara: vi.fn() }));
vi.mock("@/lib/db/rrhh-colaboradores.db", () => ({
  ColaboradoresDB: {
    listar: async (tenantId: string) => {
      H.personalPedido.push(tenantId);
      return H.personal;
    },
  },
}));
vi.mock("@/lib/db/camaras.db", () => ({
  destinoResuelto: vi.fn(),
  CamarasDB: {
    listaParaPantalla: async () => [],
    capturas: async () => [],
    chalecos: async () => H.chalecos,
    asignarChaleco: (...a: unknown[]) => H.asignar(...a),
    confirmarCruce: (...a: unknown[]) => H.confirmar(...a),
    configurarVigilaPila: (...a: unknown[]) => H.vigila(...a),
  },
}));

import { GET, PATCH } from "@/app/api/admin/camaras/route";

const como = (role: string, tenantId = "t-blas") => {
  H.payload = { username: `qa-${role}`, role, tenantId };
};
const patch = (body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest("http://localhost/api/admin/camaras", {
    method: "PATCH",
    headers: { cookie: "buleje-admin-sess=token-falso", "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  como("admin");
  H.personalPedido = [];
  H.chalecos = { "3": "c-juan", "9": "c-ido" };
  H.personal = [
    { id: "c-juan", nombre: "Juan Pérez", apodo: null, estado: "ACTIVO", puesto: { nombre: "Estibador" } },
    { id: "c-ido", nombre: "Pedro Cesado", apodo: null, estado: "CESADO", puesto: null },
  ];
  H.asignar.mockImplementation(async (_t: string, numero: string, id: string | null, nombreDe: (id: string) => string | null) => ({
    ok: true,
    chalecos: { [numero]: id },
    mensaje: `El chaleco N° ${numero} es de ${id ? nombreDe(id) : "nadie"}.`,
  }));
  H.confirmar.mockResolvedValue({ ok: false, motivo: "Esa foto ya no está en el historial." });
  H.vigila.mockResolvedValue({ ok: true, camaras: [], mensaje: "ok" });
});

describe("GET", () => {
  it("sin sesión → 401", async () => {
    H.payload = null;
    const r = await GET(new NextRequest("http://localhost/api/admin/camaras"));
    expect(r.status).toBe(401);
  });

  it("trae chalecos con nombre y el personal SIN cesados ni datos de la ficha; tenant del JWT", async () => {
    const r = await GET(
      new NextRequest("http://localhost/api/admin/camaras", {
        headers: { cookie: "buleje-admin-sess=token-falso", "x-tenant-id": "otro-negocio" },
      }),
    );
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.chalecos).toEqual({
      "3": { colaboradorId: "c-juan", nombre: "Juan Pérez" },
      "9": { colaboradorId: "c-ido", nombre: "Pedro Cesado" },
    });
    expect(d.colaboradores).toEqual([{ id: "c-juan", nombre: "Juan Pérez", apodo: null, puesto: "Estibador", chaleco: "3" }]);
    expect(H.personalPedido).toEqual(["t-blas"]);
  });
});

describe("PATCH chalecos", () => {
  it("asigna a una persona del negocio, con el tenant de la sesión", async () => {
    const r = await PATCH(patch({ accion: "chalecos", numero: 3, colaboradorId: "c-juan" }, { "x-tenant-id": "otro-negocio" }));
    expect(r.status).toBe(200);
    expect(H.asignar).toHaveBeenCalledWith("t-blas", "3", "c-juan", expect.any(Function), "qa-admin");
    expect((await r.json()).chalecos["3"]).toEqual({ colaboradorId: "c-juan", nombre: "Juan Pérez" });
  });

  it("colaborador de OTRO negocio → 404 y no se guarda nada", async () => {
    const r = await PATCH(patch({ accion: "chalecos", numero: "3", colaboradorId: "c-de-otro-tenant" }));
    expect(r.status).toBe(404);
    expect(H.asignar).not.toHaveBeenCalled();
  });

  it("cesado → rechazado sin guardar", async () => {
    const r = await PATCH(patch({ accion: "chalecos", numero: "5", colaboradorId: "c-ido" }));
    expect((await r.json()).error).toBe("rechazado");
    expect(H.asignar).not.toHaveBeenCalled();
  });

  it("liberar con colaboradorId null", async () => {
    await PATCH(patch({ accion: "chalecos", numero: "3", colaboradorId: null }));
    expect(H.asignar).toHaveBeenCalledWith("t-blas", "3", null, expect.any(Function), "qa-admin");
  });

  it("el almacenero puede mirar pero no asignar → 403", async () => {
    como("almacenero");
    const r = await PATCH(patch({ accion: "chalecos", numero: "3", colaboradorId: "c-juan" }));
    expect(r.status).toBe(403);
    expect(H.asignar).not.toHaveBeenCalled();
  });
});

describe("PATCH confirmar-cruce y vigila-pila", () => {
  it("una foto que no está en el historial de ESTE negocio → 404", async () => {
    const r = await PATCH(patch({ accion: "confirmar-cruce", capturaId: "cap-de-otro", refId: "g1" }));
    expect(r.status).toBe(404);
    expect(H.confirmar).toHaveBeenCalledWith("t-blas", "cap-de-otro", "g1", "qa-admin");
  });

  it("confirmada → devuelve la captura marcada", async () => {
    const captura = { id: "cap-1", cruces: { placas: [{ refId: "g1", confirmadoPor: "qa-admin" }] } };
    H.confirmar.mockResolvedValue({ ok: true, cambio: true, captura, capturas: [captura], mensaje: "Confirmado" });
    const d = await (await PATCH(patch({ accion: "confirmar-cruce", capturaId: "cap-1", refId: "g1" }))).json();
    expect(d).toEqual({ captura, mensaje: "Confirmado" });
  });

  it("vigila-pila exige booleano y el id de la cámara", async () => {
    expect((await (await PATCH(patch({ id: "cam-1", accion: "vigila-pila", activa: "si" }))).json()).error).toBe("validation_error");
    expect((await (await PATCH(patch({ accion: "vigila-pila", activa: true }))).json()).error).toBe("validation_error");
    await PATCH(patch({ id: "cam-1", accion: "vigila-pila", activa: true }));
    expect(H.vigila).toHaveBeenCalledWith("t-blas", "cam-1", true, "qa-admin");
  });
});
