/**
 * Tests unitarios para lib/whatsapp-order-notify.ts
 *
 * Cubre:
 *  - Retorna false si el feature flag está deshabilitado
 *  - Retorna false si el tenant no tiene ownerPhone
 *  - Llama a sendWhatsAppText con el mensaje correcto cuando todo está OK
 *  - Retorna false (sin lanzar) si sendWhatsAppText falla
 *  - El mensaje incluye nombre del cliente, productos y total
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ── Mocks ─────────────────────────────────────────────────────────────────────

const { mockSendWhatsAppText } = vi.hoisted(() => ({
  mockSendWhatsAppText: vi.fn(),
}));

vi.mock("@/lib/whatsapp", () => ({
  sendWhatsAppText: mockSendWhatsAppText,
}));

const { mockIsFeatureEnabled } = vi.hoisted(() => ({
  mockIsFeatureEnabled: vi.fn(),
}));

vi.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: mockIsFeatureEnabled,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import { notifyOwnerNewOrder } from "@/lib/whatsapp-order-notify";
import type { DbOrder } from "@/lib/db/misc.db";
import type { TenantInfo } from "@/lib/whatsapp-order-notify";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const baseOrder: DbOrder = {
  id: "order-abc-123",
  customer: {
    name: "Juan Pérez",
    phone: "951234567",
    location: "Jr. Los Pinos 123",
    reference: "Cerca al mercado",
  },
  items: [
    { id: 1, name: "Arroz Extra",  price: 3.5,  quantity: 2, unit: "kg",  image: "" },
    { id: 2, name: "Aceite Ideal", price: 8.0,  quantity: 1, unit: "bot", image: "" },
  ],
  total: 15.0,
  status: "pendiente",
  createdAt: "2026-04-07T10:00:00.000Z",
  updatedAt: "2026-04-07T10:00:00.000Z",
};

const baseTenant: TenantInfo = {
  id:         "tenant-main",
  slug:       "bodega-san-martin",
  name:       "Buleje",
  ownerPhone: "916409675",
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("notifyOwnerNewOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendWhatsAppText.mockResolvedValue(true);
    mockIsFeatureEnabled.mockReturnValue(true);
  });

  it("retorna false cuando el feature flag está deshabilitado", async () => {
    mockIsFeatureEnabled.mockReturnValue(false);

    const result = await notifyOwnerNewOrder(baseOrder, baseTenant);

    expect(result).toBe(false);
    expect(mockSendWhatsAppText).not.toHaveBeenCalled();
  });

  it("retorna false cuando el tenant no tiene ownerPhone", async () => {
    const tenantSinPhone: TenantInfo = { ...baseTenant, ownerPhone: null };

    const result = await notifyOwnerNewOrder(baseOrder, tenantSinPhone);

    expect(result).toBe(false);
    expect(mockSendWhatsAppText).not.toHaveBeenCalled();
  });

  it("llama a sendWhatsAppText con el teléfono del dueño", async () => {
    await notifyOwnerNewOrder(baseOrder, baseTenant);

    expect(mockSendWhatsAppText).toHaveBeenCalledWith(
      baseTenant.ownerPhone,
      expect.any(String)
    );
  });

  it("el mensaje incluye el nombre del cliente", async () => {
    await notifyOwnerNewOrder(baseOrder, baseTenant);

    const [, message] = mockSendWhatsAppText.mock.calls[0] as [string, string];
    expect(message).toContain("Juan Pérez");
  });

  it("el mensaje incluye los productos y el total", async () => {
    await notifyOwnerNewOrder(baseOrder, baseTenant);

    const [, message] = mockSendWhatsAppText.mock.calls[0] as [string, string];
    expect(message).toContain("Arroz Extra");
    expect(message).toContain("15.00");
  });

  it("el mensaje incluye la dirección de entrega cuando existe", async () => {
    await notifyOwnerNewOrder(baseOrder, baseTenant);

    const [, message] = mockSendWhatsAppText.mock.calls[0] as [string, string];
    expect(message).toContain("Jr. Los Pinos 123");
  });

  it("retorna false (sin lanzar) cuando sendWhatsAppText lanza un error", async () => {
    mockSendWhatsAppText.mockRejectedValue(new Error("API timeout"));

    const result = await notifyOwnerNewOrder(baseOrder, baseTenant);

    expect(result).toBe(false);
    // No debe propagar el error
  });

  it("retorna true cuando el envío es exitoso", async () => {
    const result = await notifyOwnerNewOrder(baseOrder, baseTenant);
    expect(result).toBe(true);
  });

  it("pasa el tenantId correcto al feature flag check", async () => {
    await notifyOwnerNewOrder(baseOrder, baseTenant);

    expect(mockIsFeatureEnabled).toHaveBeenCalledWith(
      "whatsapp-order-notifications",
      baseTenant.id
    );
  });
});
