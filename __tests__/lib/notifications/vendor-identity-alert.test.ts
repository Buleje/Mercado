/**
 * Tests — lib/notifications/vendor-identity-alert.ts
 *
 * Cubre el envío de WhatsApp al vendor cuando RENIEC/SUNAT degrada.
 * Mockea sendWhatsAppQueued para no tocar Twilio.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { mockSendWaQueued } = vi.hoisted(() => ({
  mockSendWaQueued: vi.fn(),
}));

vi.mock("@/lib/whatsapp", () => ({
  sendWhatsAppQueued: mockSendWaQueued,
}));

import { sendVendorIdentityWhatsApp } from "@/lib/notifications/vendor-identity-alert";

describe("sendVendorIdentityWhatsApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendWaQueued.mockResolvedValue({ queued: true, jobId: "j1" });
  });

  it("dispatch WA con titular y CTA del kind ruc-changed", async () => {
    const res = await sendVendorIdentityWhatsApp({
      tenantId: "t-1",
      vendorId: "v-1",
      businessName: "Bodega Test",
      contactPhone: "987654321",
      kind: "ruc-changed",
      rucLast4: "6789",
    });
    expect(res.sent).toBe(true);
    expect(res.queued).toBe(true);
    expect(mockSendWaQueued).toHaveBeenCalledTimes(1);
    const [phone, msg, meta] = mockSendWaQueued.mock.calls[0] as [
      string,
      string,
      { tenantId: string; context: string },
    ];
    // Normaliza con prefijo 51 si falta
    expect(phone).toBe("51987654321");
    expect(msg).toContain("no apto para facturar");
    expect(msg).toContain("Bodega Test");
    expect(msg).toContain("***6789");
    expect(msg).toContain("/admin/settings/business");
    expect(meta.tenantId).toBe("t-1");
    expect(meta.context).toBe("vendor-identity-alert:v-1:ruc-changed");
  });

  it("kind ruc-not-found usa copy específico", async () => {
    await sendVendorIdentityWhatsApp({
      tenantId: "t-1",
      vendorId: "v-2",
      businessName: "Fantasma",
      contactPhone: "51987654321",
      kind: "ruc-not-found",
      rucLast4: "0000",
    });
    const msg = mockSendWaQueued.mock.calls[0]?.[1] as string;
    expect(msg).toContain("no figura en SUNAT");
  });

  it("kind dni-not-found usa copy específico", async () => {
    await sendVendorIdentityWhatsApp({
      tenantId: "t-1",
      vendorId: "v-3",
      businessName: "Sin DNI",
      contactPhone: "51987654321",
      kind: "dni-not-found",
    });
    const msg = mockSendWaQueued.mock.calls[0]?.[1] as string;
    expect(msg).toContain("no figura en RENIEC");
  });

  it("phone con prefijo 51 no se duplica", async () => {
    await sendVendorIdentityWhatsApp({
      tenantId: "t-1",
      vendorId: "v-4",
      businessName: "Con prefijo",
      contactPhone: "+51987654321",
      kind: "ruc-changed",
    });
    const phone = mockSendWaQueued.mock.calls[0]?.[0] as string;
    expect(phone).toBe("51987654321"); // sin doble 51
  });

  it("phone con caracteres no-numéricos se limpia", async () => {
    await sendVendorIdentityWhatsApp({
      tenantId: "t-1",
      vendorId: "v-5",
      businessName: "Con espacios",
      contactPhone: "987-654-321",
      kind: "ruc-changed",
    });
    const phone = mockSendWaQueued.mock.calls[0]?.[0] as string;
    expect(phone).toBe("51987654321");
  });

  it("phone inválido (<9 dígitos) → skip sin enviar", async () => {
    const res = await sendVendorIdentityWhatsApp({
      tenantId: "t-1",
      vendorId: "v-6",
      businessName: "Mala",
      contactPhone: "1234",
      kind: "ruc-changed",
    });
    expect(res.sent).toBe(false);
    expect(mockSendWaQueued).not.toHaveBeenCalled();
  });

  it("error de sendWhatsAppQueued → sent=false (no throw)", async () => {
    mockSendWaQueued.mockRejectedValueOnce(new Error("twilio 500"));
    const res = await sendVendorIdentityWhatsApp({
      tenantId: "t-1",
      vendorId: "v-7",
      businessName: "Falla",
      contactPhone: "51987654321",
      kind: "ruc-changed",
    });
    expect(res.sent).toBe(false);
    expect(res.queued).toBe(false);
  });
});
