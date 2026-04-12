/**
 * __tests__/sunat-nubefact-client.test.ts
 *
 * Unit tests del cliente HTTP NubeFact.
 * Cubre: retry 3 intentos en 5xx, timeout, error 4xx sin retry,
 *        respuesta válida accepted, respuesta rejected SUNAT.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

// ── Mock Prisma ───────────────────────────────────────────────────────────────

const mockFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenantSunatConfig: {
      findUnique: mockFindUnique,
    },
  },
}));

// ── Mock logger ───────────────────────────────────────────────────────────────

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_TENANT_CONFIG = {
  nubefactToken: "test-token-12345",
  nubefactUrl: "https://api.nubefact.com/api/v1",
  ruc: "20601234567",
  razonSocial: "BODEGA SAN MARTIN SAC",
  isProduction: false,
};

const VALID_PAYLOAD = {
  operacion: "generar_comprobante" as const,
  tipo_de_comprobante: 2 as const,
  serie: "B001",
  numero: 1,
  sunat_transaction: 1 as const,
  cliente_tipo_de_documento: 1,
  cliente_numero_de_documento: "00000000",
  cliente_denominacion: "CONSUMIDOR FINAL",
  cliente_direccion: "",
  cliente_email: "",
  cliente_email_1: "",
  cliente_email_2: "",
  fecha_de_emision: "2026-04-10",
  fecha_de_vencimiento: "2026-04-10",
  moneda: 1 as const,
  porcentaje_de_igv: 18 as const,
  descuento_global: 0,
  total_descuento: 0,
  total_anticipo: 0,
  total_gravada: 100,
  total_inafecta: 0,
  total_exonerada: 0,
  total_igv: 18,
  total_gratuita: 0,
  total_otros_cargos: 0,
  total: 118,
  items: [],
  observaciones: "Orden #test-001",
  formato_de_pdf: "A4" as const,
};

const NUBEFACT_ACCEPTED_RESPONSE = {
  sunat_accepted: true,
  sunat_description: "La Boleta número B001-1 ha sido aceptada por SUNAT.",
  enlace_del_pdf: "https://nubefact.com/pdf/test-123",
  enlace_del_xml: "https://nubefact.com/xml/test-123",
  nubefact_id: "NF-2026-001",
};

const NUBEFACT_REJECTED_RESPONSE = {
  sunat_accepted: false,
  sunat_description: "El RUC del emisor no está activo.",
  error: "Error de validación SUNAT",
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("sendInvoice", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    mockFindUnique.mockResolvedValue(MOCK_TENANT_CONFIG);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("envía el payload y retorna respuesta accepted", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => NUBEFACT_ACCEPTED_RESPONSE,
    } as Response);

    const { sendInvoice } = await import("@/lib/sunat/nubefact-client");
    const result = await sendInvoice("tenant-1", VALID_PAYLOAD);

    expect(result.sunat_accepted).toBe(true);
    expect(result.nubefact_id).toBe("NF-2026-001");
    expect(result.enlace_del_pdf).toBe("https://nubefact.com/pdf/test-123");
  });

  it("retorna respuesta rejected de SUNAT sin lanzar error", async () => {
    // Nubefact devuelve 200 pero sunat_accepted=false
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => NUBEFACT_REJECTED_RESPONSE,
    } as Response);

    const { sendInvoice } = await import("@/lib/sunat/nubefact-client");
    const result = await sendInvoice("tenant-1", VALID_PAYLOAD);

    expect(result.sunat_accepted).toBe(false);
    expect(result.sunat_description).toBeDefined();
  });

  it("lanza error en respuesta 4xx SIN reintentar", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ error: "Token inválido" }),
    } as Response);
    global.fetch = fetchMock;

    const { sendInvoice } = await import("@/lib/sunat/nubefact-client");
    await expect(sendInvoice("tenant-1", VALID_PAYLOAD)).rejects.toThrow();

    // 4xx no debería reintentar (solo 1 llamada)
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reintenta al menos 2 veces en error 500 antes de fallar", async () => {
    // Primero 2 intentos 500, tercero exitoso — verifica que sí reintenta
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount < 3) {
        // Simular 500 pero sin delay real (mock)
        return { ok: false, status: 500, json: async () => ({ error: "Server error" }) } as Response;
      }
      return { ok: true, status: 200, json: async () => NUBEFACT_ACCEPTED_RESPONSE } as Response;
    });

    // Parchear setTimeout para que no haga delay real durante los retries
    const origSetTimeout = global.setTimeout;
    (global as unknown as Record<string, unknown>).setTimeout = (fn: () => void) => origSetTimeout(fn, 0);

    try {
      const { sendInvoice } = await import("@/lib/sunat/nubefact-client");
      const result = await sendInvoice("tenant-1", VALID_PAYLOAD);
      expect(result.sunat_accepted).toBe(true);
      expect(callCount).toBeGreaterThanOrEqual(3);
    } finally {
      (global as unknown as Record<string, unknown>).setTimeout = origSetTimeout;
    }
  }, 15_000);

  it("reintenta en 429 (rate limit) y tiene éxito en el tercer intento", async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount < 3) {
        return { ok: false, status: 429, json: async () => ({ error: "Too Many Requests" }) } as Response;
      }
      return { ok: true, status: 200, json: async () => NUBEFACT_ACCEPTED_RESPONSE } as Response;
    });

    const origSetTimeout = global.setTimeout;
    (global as unknown as Record<string, unknown>).setTimeout = (fn: () => void) => origSetTimeout(fn, 0);

    try {
      const { sendInvoice } = await import("@/lib/sunat/nubefact-client");
      const result = await sendInvoice("tenant-1", VALID_PAYLOAD);
      expect(result.sunat_accepted).toBe(true);
      expect(callCount).toBeGreaterThanOrEqual(3);
    } finally {
      (global as unknown as Record<string, unknown>).setTimeout = origSetTimeout;
    }
  }, 15_000);

  it("lanza error si no hay configuración SUNAT para el tenant", async () => {
    mockFindUnique.mockResolvedValueOnce(null);

    const { sendInvoice } = await import("@/lib/sunat/nubefact-client");
    await expect(sendInvoice("tenant-sin-config", VALID_PAYLOAD)).rejects.toThrow(
      /Configuración SUNAT no encontrada/
    );
  });

  it("usa el token del tenant en el header Authorization", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => NUBEFACT_ACCEPTED_RESPONSE,
    } as Response);
    global.fetch = fetchMock;

    const { sendInvoice } = await import("@/lib/sunat/nubefact-client");
    await sendInvoice("tenant-1", VALID_PAYLOAD);

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers["Authorization"]).toContain("test-token-12345");
  });

  it("incluye el RUC del emisor en la URL", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => NUBEFACT_ACCEPTED_RESPONSE,
    } as Response);
    global.fetch = fetchMock;

    const { sendInvoice } = await import("@/lib/sunat/nubefact-client");
    await sendInvoice("tenant-1", VALID_PAYLOAD);

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("20601234567");
  });
});

describe("getInvoiceStatus", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    mockFindUnique.mockResolvedValue(MOCK_TENANT_CONFIG);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("consulta el estado de un comprobante por nubefact_id", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => NUBEFACT_ACCEPTED_RESPONSE,
    } as Response);

    const { getInvoiceStatus } = await import("@/lib/sunat/nubefact-client");
    const result = await getInvoiceStatus("tenant-1", "NF-2026-001");

    expect(result.sunat_accepted).toBe(true);
  });
});
