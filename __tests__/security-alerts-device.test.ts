import { describe, it, expect, vi } from "vitest";

// El módulo importa prisma/whatsapp/push (solo I/O dentro de funciones). Mockeamos
// para aislar parseDevice — lógica pura de parsing de User-Agent.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/whatsapp", () => ({ sendWhatsAppText: vi.fn() }));
vi.mock("@/lib/push-sender", () => ({ sendPushToPhone: vi.fn() }));

import { parseDevice } from "@/lib/auth/security-alerts";

describe("parseDevice (ADR-133 avisos al dueño)", () => {
  it("Chrome en Windows", () => {
    expect(parseDevice("Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537")).toBe("Chrome · Windows");
  });
  it("Safari en iOS (iPhone)", () => {
    expect(parseDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17) Safari/604")).toBe("Safari · iOS");
  });
  it("Edge gana sobre Chrome (UA de Edge contiene Chrome)", () => {
    expect(parseDevice("Mozilla/5.0 (Windows NT 10.0) Chrome/120 Edg/120")).toBe("Edge · Windows");
  });
  it("Firefox en Android", () => {
    expect(parseDevice("Mozilla/5.0 (Android 14; Mobile) Firefox/121")).toBe("Firefox · Android");
  });
  it("UA vacío o ausente", () => {
    expect(parseDevice(null)).toBe("Dispositivo desconocido");
    expect(parseDevice("")).toBe("Dispositivo desconocido");
  });
});
