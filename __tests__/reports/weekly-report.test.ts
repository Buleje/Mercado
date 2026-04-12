/**
 * Tests para el módulo de reporte semanal WhatsApp (#33 del PDF)
 *
 * Cubre:
 *  1. renderWhatsAppMessage — renderer con data mock → strings esperados
 *  2. generateWeeklyReport — lógica de agregación con prisma mockeado
 *  3. GET /api/cron/weekly-report — endpoint responde 401 sin CRON_SECRET
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

// ── Mock Prisma ───────────────────────────────────────────────────────────────

const {
  mockTenantFindUnique,
  mockTenantFindMany,
  mockSaleFindMany,
  mockProductCount,
  mockQueryRaw,
  mockFiadoFindMany,
} = vi.hoisted(() => ({
  mockTenantFindUnique: vi.fn(),
  mockTenantFindMany: vi.fn(),
  mockSaleFindMany: vi.fn(),
  mockProductCount: vi.fn(),
  mockQueryRaw: vi.fn(),
  mockFiadoFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: {
      findUnique: mockTenantFindUnique,
      findMany: mockTenantFindMany,
    },
    sale: {
      findMany: mockSaleFindMany,
    },
    product: {
      count: mockProductCount,
    },
    fiado: {
      findMany: mockFiadoFindMany,
    },
    $queryRaw: mockQueryRaw,
  },
}));

// ── Mock whatsapp sender ──────────────────────────────────────────────────────

const { mockSendWeeklyReportTo } = vi.hoisted(() => ({
  mockSendWeeklyReportTo: vi.fn(),
}));

vi.mock("@/lib/reports/whatsapp-sender", () => ({
  sendWeeklyReportTo: mockSendWeeklyReportTo,
}));

// ── Mock generateWeeklyReport + renderWhatsAppMessage for endpoint tests ──────
// Sections 1 & 2 call through to real implementations; section 3 overrides with mocked return values.

const { mockGenerateWeeklyReport, mockRenderWhatsAppMessage } = vi.hoisted(() => ({
  mockGenerateWeeklyReport: vi.fn(),
  mockRenderWhatsAppMessage: vi.fn(),
}));

vi.mock("@/lib/reports/weekly-report", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reports/weekly-report")>();
  // By default, call through to real implementations
  mockRenderWhatsAppMessage.mockImplementation(actual.renderWhatsAppMessage);
  mockGenerateWeeklyReport.mockImplementation(actual.generateWeeklyReport);
  return {
    ...actual,
    generateWeeklyReport: mockGenerateWeeklyReport,
    renderWhatsAppMessage: mockRenderWhatsAppMessage,
  };
});

// ── Import after mocks ────────────────────────────────────────────────────────

import {
  renderWhatsAppMessage,
  generateWeeklyReport,
  type WeeklyReportData,
} from "@/lib/reports/weekly-report";
import { GET } from "@/app/api/cron/weekly-report/route";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CRON_SECRET = "test-weekly-report-secret-42";

const NOW = new Date("2026-04-14T13:00:00.000Z"); // Monday 8AM Lima

const REPORT_DATA_MOCK: WeeklyReportData = {
  tenantId: "tenant-main",
  storeName: "Buleje",
  weekStart: new Date("2026-04-07T05:00:00.000Z"),
  weekEnd: new Date("2026-04-14T05:00:00.000Z"),
  totalVentasSemana: 1500.5,
  totalVentasAnterior: 1200.0,
  deltaPct: 25.0,
  top3Productos: [
    { productId: 1, name: "Arroz Extra 1kg", quantity: 50, revenue: 300.0 },
    { productId: 2, name: "Aceite Primor 1L", quantity: 30, revenue: 240.0 },
    { productId: 3, name: "Azúcar Rubia 1kg", quantity: 40, revenue: 200.0 },
  ],
  stockCriticoCount: 3,
  fiadosVencidosCount: 2,
  fiadosVencidosMonto: 85.5,
};

function makeRequest(authHeader?: string, isVercelCron = false): NextRequest {
  const headers: Record<string, string> = {};
  if (authHeader) headers["authorization"] = authHeader;
  if (isVercelCron) headers["x-vercel-cron"] = "1";
  return new NextRequest("https://localhost/api/cron/weekly-report", {
    method: "GET",
    headers,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. renderWhatsAppMessage
// ─────────────────────────────────────────────────────────────────────────────

describe("renderWhatsAppMessage", () => {
  it("incluye nombre de la tienda en la cabecera", () => {
    const msg = renderWhatsAppMessage(REPORT_DATA_MOCK, "Buleje");
    expect(msg).toContain("*Buleje*");
  });

  it("muestra total de ventas de la semana", () => {
    const msg = renderWhatsAppMessage(REPORT_DATA_MOCK, "Buleje");
    expect(msg).toContain("S/1500.50");
  });

  it("muestra ventas semana anterior", () => {
    const msg = renderWhatsAppMessage(REPORT_DATA_MOCK, "Buleje");
    expect(msg).toContain("S/1200.00");
  });

  it("muestra delta positivo con emoji de crecimiento", () => {
    const msg = renderWhatsAppMessage(REPORT_DATA_MOCK, "Buleje");
    expect(msg).toContain("📈 +25%");
  });

  it("muestra delta negativo con emoji de caída", () => {
    const data: WeeklyReportData = {
      ...REPORT_DATA_MOCK,
      deltaPct: -10.5,
    };
    const msg = renderWhatsAppMessage(data, "Bodega");
    expect(msg).toContain("📉 -10.5%");
  });

  it("muestra top 3 productos con sus nombres", () => {
    const msg = renderWhatsAppMessage(REPORT_DATA_MOCK, "Buleje");
    expect(msg).toContain("Arroz Extra 1kg");
    expect(msg).toContain("Aceite Primor 1L");
    expect(msg).toContain("Azúcar Rubia 1kg");
  });

  it("muestra medallas de posición para top 3", () => {
    const msg = renderWhatsAppMessage(REPORT_DATA_MOCK, "Buleje");
    expect(msg).toContain("🥇");
    expect(msg).toContain("🥈");
    expect(msg).toContain("🥉");
  });

  it("alerta de stock crítico cuando count > 0", () => {
    const msg = renderWhatsAppMessage(REPORT_DATA_MOCK, "Buleje");
    expect(msg).toContain("3");
    expect(msg).toContain("stock crítico");
  });

  it("muestra OK de stock cuando count === 0", () => {
    const data: WeeklyReportData = { ...REPORT_DATA_MOCK, stockCriticoCount: 0 };
    const msg = renderWhatsAppMessage(data, "Bodega");
    expect(msg).toContain("✅ Stock: sin alertas");
  });

  it("alerta de fiados vencidos con monto", () => {
    const msg = renderWhatsAppMessage(REPORT_DATA_MOCK, "Buleje");
    expect(msg).toContain("2");
    expect(msg).toContain("S/85.50");
  });

  it("muestra OK de fiados cuando count === 0", () => {
    const data: WeeklyReportData = {
      ...REPORT_DATA_MOCK,
      fiadosVencidosCount: 0,
      fiadosVencidosMonto: 0,
    };
    const msg = renderWhatsAppMessage(data, "Bodega");
    expect(msg).toContain("✅ Fiados: sin vencidos");
  });

  it("maneja lista vacía de productos sin lanzar error", () => {
    const data: WeeklyReportData = { ...REPORT_DATA_MOCK, top3Productos: [] };
    const msg = renderWhatsAppMessage(data, "Bodega");
    expect(msg).toContain("Sin ventas registradas");
  });

  it("usa formato WhatsApp con *asteriscos* para negrita", () => {
    const msg = renderWhatsAppMessage(REPORT_DATA_MOCK, "Buleje");
    // WhatsApp bold: *texto*
    expect(msg).toMatch(/\*[^*]+\*/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. generateWeeklyReport (con prisma mockeado)
// ─────────────────────────────────────────────────────────────────────────────

describe("generateWeeklyReport", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    mockTenantFindUnique.mockResolvedValue({ name: "Buleje" });

    // Sales esta semana: dos ventas con items
    mockSaleFindMany.mockImplementation((args: { where?: { createdAt?: unknown } }) => {
      const gte = (args?.where?.createdAt as { gte?: Date } | undefined)?.gte;
      // Primera llamada = semana actual (gte = weekStart hace 7 días)
      // Segunda llamada = semana anterior (gte = hace 14 días, no incluye items)
      if (gte && gte >= new Date(NOW.getTime() - 8 * 86400000)) {
        return Promise.resolve([
          {
            total: { toNumber: () => 500, toString: () => "500" },
            items: [
              { productId: 1, name: "Arroz Extra 1kg", price: { toNumber: () => 5 }, quantity: 20 },
              { productId: 2, name: "Aceite Primor 1L", price: { toNumber: () => 8 }, quantity: 15 },
            ],
          },
          {
            total: { toNumber: () => 300, toString: () => "300" },
            items: [
              { productId: 1, name: "Arroz Extra 1kg", price: { toNumber: () => 5 }, quantity: 10 },
            ],
          },
        ]);
      }
      // Semana anterior: solo totales
      return Promise.resolve([
        { total: { toNumber: () => 600, toString: () => "600" } },
      ]);
    });

    // Stock crítico count (raw query)
    mockQueryRaw.mockResolvedValue([{ count: BigInt(2) }]);
    mockProductCount.mockResolvedValue(5);

    // Fiados vencidos
    mockFiadoFindMany.mockResolvedValue([
      { saldo: { toNumber: () => 50 } },
      { saldo: { toNumber: () => 35.5 } },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("retorna storeName desde prisma.tenant.findUnique", async () => {
    const result = await generateWeeklyReport("tenant-main");
    expect(result.storeName).toBe("Buleje");
    expect(mockTenantFindUnique).toHaveBeenCalledWith({
      where: { id: "tenant-main" },
      select: { name: true },
    });
  });

  it("usa tenantId como storeName de fallback si tenant no existe", async () => {
    mockTenantFindUnique.mockResolvedValue(null);
    const result = await generateWeeklyReport("tenant-fallback");
    expect(result.storeName).toBe("tenant-fallback");
  });

  it("devuelve objeto con todas las propiedades requeridas", async () => {
    const result = await generateWeeklyReport("tenant-main");
    expect(result).toHaveProperty("tenantId");
    expect(result).toHaveProperty("totalVentasSemana");
    expect(result).toHaveProperty("totalVentasAnterior");
    expect(result).toHaveProperty("deltaPct");
    expect(result).toHaveProperty("top3Productos");
    expect(result).toHaveProperty("stockCriticoCount");
    expect(result).toHaveProperty("fiadosVencidosCount");
    expect(result).toHaveProperty("fiadosVencidosMonto");
  });

  it("calcula deltaPct = 0 cuando semana anterior es 0", async () => {
    mockSaleFindMany.mockResolvedValue([]); // sin ventas en ambas semanas
    const result = await generateWeeklyReport("tenant-main");
    expect(result.deltaPct).toBe(0);
  });

  it("calcula deltaPct = 100 cuando anterior=0 y actual>0", async () => {
    // Primera llamada: semana actual con ventas
    // Segunda llamada: semana anterior vacía
    let callCount = 0;
    mockSaleFindMany.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve([
          {
            total: { toNumber: () => 200 },
            items: [{ productId: 1, name: "Prod", price: { toNumber: () => 10 }, quantity: 5 }],
          },
        ]);
      }
      return Promise.resolve([]);
    });
    const result = await generateWeeklyReport("tenant-main");
    expect(result.deltaPct).toBe(100);
  });

  it("devuelve máximo 3 productos en top3Productos", async () => {
    // Many different products
    mockSaleFindMany.mockImplementationOnce(() =>
      Promise.resolve([
        {
          total: { toNumber: () => 1000 },
          items: [
            { productId: 1, name: "P1", price: { toNumber: () => 10 }, quantity: 5 },
            { productId: 2, name: "P2", price: { toNumber: () => 8 }, quantity: 10 },
            { productId: 3, name: "P3", price: { toNumber: () => 6 }, quantity: 15 },
            { productId: 4, name: "P4", price: { toNumber: () => 4 }, quantity: 20 },
            { productId: 5, name: "P5", price: { toNumber: () => 2 }, quantity: 25 },
          ],
        },
      ])
    ).mockImplementationOnce(() => Promise.resolve([]));

    const result = await generateWeeklyReport("tenant-main");
    expect(result.top3Productos.length).toBeLessThanOrEqual(3);
  });

  it("usa $queryRaw para contar stock crítico con comparación columna-a-columna", async () => {
    await generateWeeklyReport("tenant-main");
    expect(mockQueryRaw).toHaveBeenCalled();
  });

  it("cuenta fiados con status VENCIDO", async () => {
    const result = await generateWeeklyReport("tenant-main");
    expect(mockFiadoFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "VENCIDO" }),
      })
    );
    expect(result.fiadosVencidosCount).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. GET /api/cron/weekly-report — Auth
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/cron/weekly-report — autenticación", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    mockTenantFindMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("responde 401 cuando no hay header Authorization", async () => {
    const req = makeRequest();
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("responde 401 cuando el token es incorrecto", async () => {
    const req = makeRequest("Bearer token-incorrecto");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("responde 401 cuando CRON_SECRET no está configurado", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("CRON_SECRET", "");
    const req = makeRequest(`Bearer ${CRON_SECRET}`);
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("responde 200 con Bearer correcto", async () => {
    const req = makeRequest(`Bearer ${CRON_SECRET}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("responde 200 con header x-vercel-cron sin Authorization", async () => {
    const req = makeRequest(undefined, true);
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("retorna JSON con sent, failed, total cuando hay 0 tenants", async () => {
    const req = makeRequest(`Bearer ${CRON_SECRET}`);
    const res = await GET(req);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, sent: 0, failed: 0, total: 0 });
  });

  it("itera sobre tenants con ownerPhone y llama a generateWeeklyReport", async () => {
    mockTenantFindMany.mockResolvedValue([
      { id: "t1", name: "Tienda A", ownerPhone: "51987654321" },
    ]);
    mockGenerateWeeklyReport.mockResolvedValue(REPORT_DATA_MOCK);
    mockRenderWhatsAppMessage.mockReturnValue("mensaje de prueba");
    mockSendWeeklyReportTo.mockResolvedValue(undefined);

    const req = makeRequest(`Bearer ${CRON_SECRET}`);
    const res = await GET(req);
    const body = await res.json();

    expect(body.total).toBe(1);
    expect(body.sent).toBe(1);
  });
});
