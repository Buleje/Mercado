/**
 * Tests — aviso de caja abierta (2026-09-14).
 * El negocio real tenía una caja abierta desde el jueves 11/06 (95 días): los días
 * se cuentan por calendario de Lima y el banner lo avisa con el botón a «Cuadrar caja».
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { avisoCajaAbierta, diasCalendarioLima, fechaCortaLima } from "@/lib/caja/caja-abierta";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import AdminAlertsBanner from "@/components/admin/AdminAlertsBanner";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("caja abierta en días de Lima", () => {
  it("abierta hoy no avisa", () => {
    expect(avisoCajaAbierta("2026-09-14T13:00:00Z", new Date("2026-09-14T22:00:00Z"))).toBeNull();
  });

  it("cuenta días de calendario de Lima, no bloques de 24 horas", () => {
    // 23:30 del 13 en Lima → 08:00 del 14: pasaron 8,5 h pero ya es otro día.
    expect(diasCalendarioLima("2026-09-14T04:30:00Z", new Date("2026-09-14T13:00:00Z"))).toBe(1);
  });

  it("las 20:00 de Lima siguen siendo el mismo día aunque en UTC ya sea mañana", () => {
    expect(diasCalendarioLima("2026-09-14T15:00:00Z", new Date("2026-09-15T01:00:00Z"))).toBe(0);
  });

  it("el caso medido del negocio real: abierta desde el jueves 11/06, 95 días", () => {
    const aviso = avisoCajaAbierta("2026-06-11T07:41:00Z", new Date("2026-09-14T18:00:00Z"));
    expect(aviso).toMatchObject({ dias: 95, severidad: "urgent", titulo: "La caja está abierta hace 95 días", id: "caja-abierta-2026-06-11" });
    expect(aviso?.detalle).toContain("jueves 11/06");
    expect(aviso?.desde).toBe("desde el jueves 11/06");
  });

  it("desde ayer es aviso, no urgencia", () => {
    expect(avisoCajaAbierta("2026-09-13T14:00:00Z", new Date("2026-09-14T14:00:00Z"))).toMatchObject({ dias: 1, severidad: "warning", titulo: "La caja quedó abierta desde ayer" });
  });

  it("sin fecha o con una fecha que no sirve no avisa", () => {
    expect(avisoCajaAbierta(null)).toBeNull();
    expect(avisoCajaAbierta("no-es-fecha")).toBeNull();
  });

  it("dice la fecha como la lee el dueño", () => {
    expect(fechaCortaLima("2026-09-10T15:00:00Z")).toBe("jueves 10/09");
  });
});

describe("AdminAlertsBanner con una caja abierta", () => {
  it("muestra cuántos días lleva abierta y lleva a Cuadrar caja", async () => {
    const desde = new Date(Date.now() - 10 * 86_400_000).toISOString();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ solicitudesPendientes: 0, pedidosSinPartner: 0, partnersOnline: 0, recentExpiredOffers: 0, trialDaysLeft: null, cajaAbiertaDesde: desde }),
    }));
    render(<AdminAlertsBanner userRole="admin" authReady={true} />);
    expect(await screen.findByText("La caja está abierta hace 10 días")).toBeTruthy();
    // La fecha va en la misma fila compacta, no sólo al expandir.
    expect(screen.getByText(`· desde el ${fechaCortaLima(desde)}`)).toBeTruthy();
    expect(screen.getByText("Cuadrar caja")).toBeTruthy();
  });
});
