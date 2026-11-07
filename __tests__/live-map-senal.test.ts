import { describe, it, expect } from "vitest";
import { markerHtml, senalVieja, textoSenal, SIN_SENAL_MS } from "@/components/admin/delivery/live-map-helpers";
import type { DeliveryPartnerLive } from "@/components/admin/OrdersTab/hooks/useDeliveryPartnersLive";

const ahora = new Date("2026-10-17T15:00:00Z").getTime();
const hace = (ms: number) => new Date(ahora - ms).toISOString();

const rep = (extra: Partial<DeliveryPartnerLive>): DeliveryPartnerLive => ({
  id: "r1",
  name: "Juan",
  phone: "987654321",
  vehicleType: "Moto",
  isOnline: true,
  lat: -8.38,
  lng: -74.55,
  lastPingAt: hace(20_000),
  currentOrderId: null,
  rating: 5,
  acceptanceRate: 1,
  activeAssignment: null,
  pendingOffers: 0,
  ...extra,
});

describe("señal del repartidor (P14)", () => {
  it("en línea con señal de hace 20 s: ubicación reciente", () => {
    const p = rep({});
    expect(senalVieja(p, ahora)).toBe(false);
    expect(textoSenal(p, ahora)).toBe("Ubicación hace 20 s");
  });

  it("en línea pero callado más de 2 min: sin señal, aunque el mapa se acabe de actualizar", () => {
    const p = rep({ lastPingAt: hace(SIN_SENAL_MS + 3 * 60_000) });
    expect(senalVieja(p, ahora)).toBe(true);
    expect(textoSenal(p, ahora)).toBe("Sin señal hace 5 min");
  });

  it("sin conexión: dice la última señal, sin alarmar", () => {
    expect(textoSenal(rep({ isOnline: false, lastPingAt: hace(2 * 3600_000) }), ahora)).toBe("Última señal hace 2 h");
  });

  it("pasado un día dice la fecha con gramática («desde el», «el»), no «del»", () => {
    const dias = 4 * 24 * 3600_000;
    expect(textoSenal(rep({ lastPingAt: hace(dias) }), ahora)).toMatch(/^Sin señal desde el \d/);
    expect(textoSenal(rep({ isOnline: false, lastPingAt: hace(dias) }), ahora)).toMatch(/^Última señal el \d/);
  });

  it("en línea sin ninguna señal: cuenta como vieja", () => {
    const p = rep({ lastPingAt: null });
    expect(senalVieja(p, ahora)).toBe(true);
    expect(textoSenal(p, ahora)).toBe("Sin señal todavía");
    expect(textoSenal(rep({ isOnline: false, lastPingAt: null }), ahora)).toBeNull();
  });

  it("el punto del mapa sin señal va apagado y punteado", () => {
    expect(markerHtml(rep({ lastPingAt: "2000-01-01T00:00:00Z" }), false)).toContain("dashed");
    expect(markerHtml(rep({ lastPingAt: new Date().toISOString() }), false)).toContain("solid");
  });
});
