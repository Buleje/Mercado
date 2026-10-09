/**
 * Descuento automático con una sola fuente (bug 2026-10-08: todo teléfono
 * nuevo recibía 422 «El total no coincide» porque el 5 % de primera compra
 * solo existía en el servidor).
 *
 * Cubre:
 *  - la fórmula única del total (`lib/pricing/total-pedido.ts`);
 *  - `calcularDescuentoAutomatico`, que comparten POST /api/orders y la cotización;
 *  - GET /api/orders/cotizar: sin sesión del teléfono no revela el tramo de
 *    compras (Ley 29733), negocio público activo, rate limit por IP+negocio.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockContar, mockPayload, mockRate } = vi.hoisted(() => ({
  mockContar: vi.fn(),
  mockPayload: vi.fn(),
  mockRate: vi.fn((..._a: unknown[]): Response | null => null),
}));

vi.mock("@/lib/jsondb", () => ({
  OrdersDB: { contarComprasPorTelefono: mockContar },
}));
vi.mock("@/lib/db/misc.db", () => ({
  normalizePhone: (phone: string) => {
    const d = phone.replace(/\D/g, "");
    return d.length >= 9 ? d.slice(-9) : d;
  },
}));
vi.mock("@/lib/auth/customer-session", () => ({
  CUSTOMER_SESSION: { COOKIE_NAME: "customer-session" },
  getCustomerPayload: mockPayload,
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimitWithTenant: mockRate }));
vi.mock("@/lib/resolve-tenant", () => ({
  // Negocio inexistente o dado de baja → null (lo decide tenantIdPublico).
  tenantIdPublico: vi.fn(async (raw: string | null) =>
    raw && raw !== "de-baja" ? `id-${raw}` : null,
  ),
}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import {
  calcularTotalPedido,
  porcentajeDe,
} from "@/lib/pricing/total-pedido";
import { calcularDescuentoAutomatico } from "@/lib/pricing/descuento-automatico";
import { GET } from "@/app/api/orders/cotizar/route";

function req(qs: string, tenant: string | null = "main", sesion?: string) {
  const headers = new Headers();
  if (tenant) headers.set("x-tenant-id", tenant);
  if (sesion) headers.set("cookie", `customer-session=${sesion}`);
  return new NextRequest(`http://localhost/api/orders/cotizar?${qs}`, { headers });
}

beforeEach(() => {
  mockContar.mockReset();
  mockPayload.mockReset();
  mockRate.mockReset();
  mockRate.mockReturnValue(null);
});

describe("fórmula única del total", () => {
  it("5 % de S/ 11,90 es S/ 0,60 (al céntimo, no S/ 1,00 redondeado al sol)", () => {
    expect(porcentajeDe(11.9, 5)).toBe(0.6);
  });

  it("resta cupón, promo y automático; nunca negativo", () => {
    expect(
      calcularTotalPedido({ subtotal: 11.9, descuentoAutomatico: 0.6 }),
    ).toBe(11.3);
    expect(
      calcularTotalPedido({ subtotal: 10, descuentoCupon: 8, descuentoPromo: 5 }),
    ).toBe(0);
  });
});

describe("calcularDescuentoAutomatico", () => {
  it("teléfono sin pedidos → primera compra −5 % con su rótulo", async () => {
    mockContar.mockResolvedValue(0);
    const d = await calcularDescuentoAutomatico("tenant-a", {
      subtotal: 11.9,
      unidades: 1,
      telefono: "981506890",
      conHistorial: true,
    });
    expect(d).toEqual({
      monto: 0.6,
      porcentaje: 5,
      etiqueta: "Descuento de primera compra",
      motivo: "¡Bienvenido! 5% de descuento en tu primera compra",
      personal: true,
    });
    // Cuenta las compras en SU negocio (tenantId primero).
    expect(mockContar).toHaveBeenCalledWith("tenant-a", "981506890");
  });

  it("cliente con 1 compra y 1 producto → sin descuento", async () => {
    mockContar.mockResolvedValue(1);
    const d = await calcularDescuentoAutomatico("tenant-a", {
      subtotal: 11.9,
      unidades: 1,
      telefono: "987000001",
      conHistorial: true,
    });
    expect(d).toBeNull();
  });

  it("sin teléfono no regala la primera compra", async () => {
    const d = await calcularDescuentoAutomatico("tenant-a", {
      subtotal: 50,
      unidades: 1,
      conHistorial: true,
    });
    expect(d).toBeNull();
    expect(mockContar).not.toHaveBeenCalled();
  });

  it("«51…», «+51 …» cuentan como el mismo celular; «abcdef» no da primera compra", async () => {
    mockContar.mockResolvedValue(3);
    for (const tel of ["51981506890", "+51 981 506 890", "981-506-890"]) {
      const d = await calcularDescuentoAutomatico("tenant-a", {
        subtotal: 50, unidades: 1, telefono: tel, conHistorial: true,
      });
      expect(d).toBeNull();
    }
    expect(mockContar).toHaveBeenCalledWith("tenant-a", "981506890");
    expect(mockContar).toHaveBeenCalledTimes(3);
    mockContar.mockReset();
    for (const tel of ["abcdef", "12345", "081506890"]) {
      const d = await calcularDescuentoAutomatico("tenant-a", {
        subtotal: 50, unidades: 1, telefono: tel, conHistorial: true,
      });
      expect(d).toBeNull();
    }
    expect(mockContar).not.toHaveBeenCalled();
  });

  it("si el conteo falla, cobra sin descuento (no lo regala a ciegas)", async () => {
    mockContar.mockRejectedValue(new Error("db caída"));
    const d = await calcularDescuentoAutomatico("tenant-a", {
      subtotal: 50,
      unidades: 1,
      telefono: "981506890",
      conHistorial: true,
    });
    expect(d).toBeNull();
  });
});

describe("GET /api/orders/cotizar", () => {
  it("sin sesión NO revela el tramo: un cliente de 50+ compras cotiza igual que uno nuevo", async () => {
    mockContar.mockResolvedValue(60);
    const res = await GET(req("telefono=981506890&subtotal=100&unidades=1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.descuentoAutomatico).toBeNull();
    expect(mockContar).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toMatch(/motivo|compras/);
  });

  it("sin sesión solo cuenta volumen (no depende de la persona), sin motivo", async () => {
    const res = await GET(req("telefono=981506890&subtotal=100&unidades=10"));
    const body = await res.json();
    expect(body.descuentoAutomatico).toEqual({
      monto: 5, porcentaje: 5, etiqueta: "Descuento por volumen",
    });
  });

  it("con la sesión de ESE teléfono usa su historial (primera compra)", async () => {
    mockContar.mockResolvedValue(0);
    mockPayload.mockResolvedValue({ customerId: "51981506890" });
    const res = await GET(req("telefono=981506890&subtotal=11.9&unidades=1", "main", "tok"));
    const body = await res.json();
    expect(body.descuentoAutomatico).toEqual({
      monto: 0.6, porcentaje: 5, etiqueta: "Descuento de primera compra",
    });
    expect(mockContar).toHaveBeenCalledWith("id-main", "981506890");
  });

  it("sesión de OTRO teléfono → como invitado (no lee el historial ajeno)", async () => {
    mockContar.mockResolvedValue(0);
    mockPayload.mockResolvedValue({ customerId: "999999999" });
    const res = await GET(req("telefono=981506890&subtotal=11.9&unidades=1", "main", "tok"));
    expect((await res.json()).descuentoAutomatico).toBeNull();
    expect(mockContar).not.toHaveBeenCalled();
  });

  it("rate limit por IP + negocio con tope por negocio; 429 pasa tal cual", async () => {
    mockRate.mockReturnValueOnce(new Response("{}", { status: 429 }));
    const res = await GET(req("subtotal=20&unidades=1", "otra-tienda"));
    expect(res.status).toBe(429);
    expect(mockRate).toHaveBeenCalledWith(
      expect.anything(), "STRICT", "id-otra-tienda", "orders-cotizar:id-otra-tienda",
      expect.objectContaining({ maxReqs: expect.any(Number) }),
    );
  });

  it("negocio inexistente, dado de baja o sin cabecera → 404 (no cae a «main»)", async () => {
    for (const t of [null, "de-baja"]) {
      const res = await GET(req("telefono=981506890&subtotal=20&unidades=1", t));
      expect(res.status).toBe(404);
    }
    expect(mockContar).not.toHaveBeenCalled();
  });

  it("subtotal inválido → 400", async () => {
    const res = await GET(req("subtotal=abc&unidades=1"));
    expect(res.status).toBe(400);
  });
});
