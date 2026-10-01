/**
 * POST /api/admin/forestal/ctp/produccion-sin-lote (ADR-429): quién entra, qué
 * se valida antes de tocar la base, y qué estado HTTP lleva cada error del
 * negocio. La DB class va simulada: lo que escribe se prueba en
 * `forestal-produccion-sin-lote-db.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  producir: vi.fn(),
  csrf: vi.fn((): unknown => null),
  spec: vi.fn(async () => true),
}));

vi.mock("@/lib/require-admin", () => ({ requireAdmin: H.requireAdmin }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: H.csrf }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: H.spec }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/db/forest-ctp-sin-lote.db", () => ({ ForestCtpSinLoteDB: { producirSinLote: H.producir } }));

import { POST } from "@/app/api/admin/forestal/ctp/produccion-sin-lote/route";
import { CtpInvariantError } from "@/lib/db/forest-ctp-consumo.db";
import { ProduccionSinLoteError } from "@/lib/forestal/produccion-sin-lote";
import type { ProduccionSinLoteRespuesta } from "@/lib/forestal/declarar-produccion";

/* `requireAdmin` real: admin/owner/manager pasan por el bypass de gestión; el
   resto, sólo si su rol está en la lista que pide la ruta. Así el 403 del
   almacenero lo decide la LISTA que la ruta manda, no el mock. */
const GESTION = new Set(["admin", "owner", "manager"]);
function sesion(role: string, tenantId = "tenant-qa") {
  H.requireAdmin.mockImplementation(async (_req: NextRequest, roles: readonly string[]) =>
    GESTION.has(role) || roles.includes(role)
      ? { tenantId, username: `qa-${role}`, role }
      : NextResponse.json({ error: "forbidden" }, { status: 403 }),
  );
}

const PAQUETE = {
  codigo: "PQ-2609-001",
  productType: "MADERA ASERRADA",
  presentacion: "PIEZAS",
  cantidad: 7,
  volumenM3: 0.6439,
  pieTablar: 273,
  espesorCm: 7.62,
  anchoCm: 30.48,
  largoM: 3.96,
};
const CUERPO = {
  fecha: "2026-09-22",
  servicio: { tipo: "tercero", parteId: "parte-1", preciosManualPt: [{ especie: "Tornillo", precioPt: 0.35 }] },
  corridas: [{ especie: "Tornillo", paquetes: [PAQUETE] }],
};

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new NextRequest("https://host/api/admin/forestal/ctp/produccion-sin-lote", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

const RESPUESTA: ProduccionSinLoteRespuesta = {
  corridas: [
    {
      id: "c1",
      lineNo: 41,
      especie: "Tornillo",
      pt: 273,
      m3: 0.6439,
      valorVenta: null,
      aserrio: { cobrado: true, importe: 95.55, parteNombre: "Maderera", movimientoId: "m1", motivo: null, cotizacion: null },
    },
  ],
  total: { pt: 273, m3: 0.6439, valorVenta: null },
};

beforeEach(() => {
  vi.clearAllMocks();
  H.csrf.mockImplementation(() => null);
  H.spec.mockImplementation(async () => true);
  H.producir.mockResolvedValue(RESPUESTA);
  sesion("admin");
});

describe("quién entra", () => {
  it("la ruta pide admin/owner: el almacenero se queda en 403 y no toca la base", async () => {
    sesion("almacenero");
    const res = await post(CUERPO);
    expect(res.status).toBe(403);
    expect(H.requireAdmin.mock.calls[0][1]).toEqual(["admin", "owner"]);
    expect(H.producir).not.toHaveBeenCalled();
  });

  it("sin CSRF válido → 403 antes de leer el cuerpo", async () => {
    H.csrf.mockImplementation(() => NextResponse.json({ error: "csrf" }, { status: 403 }));
    expect((await post(CUERPO)).status).toBe(403);
    expect(H.producir).not.toHaveBeenCalled();
  });

  it("sin el módulo CTP habilitado → 403", async () => {
    H.spec.mockImplementation(async () => false);
    expect((await post(CUERPO)).status).toBe(403);
    expect(H.producir).not.toHaveBeenCalled();
  });

  it("el tenant sale de la SESIÓN: un tenantId en el cuerpo o en el header no cambia nada", async () => {
    sesion("owner", "tenant-de-la-sesion");
    await post({ ...CUERPO, tenantId: "tenant-ajeno" }, { "x-tenant-id": "tenant-ajeno" });
    expect(H.producir).toHaveBeenCalledWith("tenant-de-la-sesion", expect.objectContaining({ fecha: "2026-09-22" }), "qa-owner");
    expect(H.producir.mock.calls[0][1]).not.toHaveProperty("tenantId");
  });
});

describe("antes de tocar la base", () => {
  it("400 con issues y un message legible si el cuerpo no cumple el esquema", async () => {
    const res = await post({ ...CUERPO, corridas: [] });
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error).toBe("validation_error");
    expect(j.message).toMatch(/corridas/);
    expect(H.producir).not.toHaveBeenCalled();
  });

  it("400 si no es JSON", async () => {
    expect((await post("{no-json")).status).toBe(400);
  });

  it("un precio 0 no se acepta como «sin precio»: es null o positivo", async () => {
    const res = await post({ ...CUERPO, servicio: { ...CUERPO.servicio, preciosManualPt: [{ especie: "Tornillo", precioPt: 0 }] } });
    expect(res.status).toBe(400);
  });
});

describe("respuestas", () => {
  it("201 con la respuesta tal cual la arma el servidor", async () => {
    const res = await post(CUERPO);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(RESPUESTA);
    expect(H.producir).toHaveBeenCalledWith("tenant-qa", expect.objectContaining({ corridas: CUERPO.corridas }), "qa-admin");
  });

  it.each([
    ["POSIBLE_DUPLICADO", 409],
    ["PAQUETE_YA_DECLARADO", 409],
    ["PARTE_NO_EXISTE", 404],
    ["SIN_ESPECIE", 422],
    ["PT_NO_CUADRA", 422],
    ["ESPECIE_REPETIDA", 400],
  ] as const)("%s → %i con { error, message, detail }", async (code, status) => {
    H.producir.mockRejectedValue(new ProduccionSinLoteError(code, `motivo ${code}`, { lineNo: 7 }));
    const res = await post(CUERPO);
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: code, message: `motivo ${code}`, detail: { lineNo: 7 } });
  });

  it("mes cerrado (invariante del libro) → 422 con su motivo", async () => {
    H.producir.mockRejectedValue(new CtpInvariantError("El período setiembre 2026 está cerrado", "PERIODO_CERRADO"));
    const res = await post(CUERPO);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("PERIODO_CERRADO");
  });

  it("una falla de verdad → 500 sin filtrar el detalle de la base", async () => {
    H.producir.mockRejectedValue(new Error('relation "ForestCtpPaquete" does not exist'));
    const res = await post(CUERPO);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/ForestCtpPaquete/);
  });
});
