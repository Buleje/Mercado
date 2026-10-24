/**
 * Ficha del repartidor (17-10, P24/P41): lo ganado (tarifas + propinas de lo
 * entregado) y las incidencias salen sólo de las asignaciones; lo pagado en
 * retiros va aparte y no mueve ninguna de esas cifras.
 */
import { describe, it, expect } from "vitest";
import { minutosDeEntrega, tramosDeEntrega, resumenDeFicha } from "@/lib/delivery/ficha-repartidor";

describe("resumenDeFicha", () => {
  it("suma tarifas y propinas sólo de lo entregado; cancelado y fallido son incidencias; el resto, en curso", () => {
    const r = resumenDeFicha([
      { status: "delivered", cantidad: 12, tarifas: 60.1, propinas: 8.2 },
      { status: "cancelled", cantidad: 1, tarifas: 5, propinas: 0 },
      { status: "failed", cantidad: 2, tarifas: 10, propinas: 1 },
      { status: "in_transit", cantidad: 3, tarifas: 15, propinas: 0 },
    ]);
    expect(r).toEqual({ asignadas: 18, entregadas: 12, noEntregadas: 3, enCurso: 3, ganadoTarifas: 60.1, propinas: 8.2, ganado: 68.3 });
  });

  it("sin asignaciones todo en cero", () => {
    expect(resumenDeFicha([])).toEqual({ asignadas: 0, entregadas: 0, noEntregadas: 0, enCurso: 0, ganadoTarifas: 0, propinas: 0, ganado: 0 });
  });
});

describe("minutosDeEntrega", () => {
  it("minutos redondeados entre recoger y entregar; null si falta uno o el orden está al revés", () => {
    expect(minutosDeEntrega("2026-10-17T10:00:00Z", "2026-10-17T10:47:20Z")).toBe(47);
    expect(minutosDeEntrega(null, "2026-10-17T10:47:00Z")).toBeNull();
    expect(minutosDeEntrega("2026-10-17T11:00:00Z", "2026-10-17T10:00:00Z")).toBeNull();
  });
});

describe("tramos de la entrega (P39)", () => {
  it("separa lo del negocio del recorrido: sólo el recorrido es suyo", () => {
    expect(
      tramosDeEntrega({
        pedidoCreado: "2026-10-17T10:00:00Z",
        asignado: "2026-10-17T10:08:00Z",
        recogido: "2026-10-17T10:40:00Z",
        entregado: "2026-10-17T10:58:00Z",
      }),
    ).toEqual({ antesDeAsignar: 8, esperaRecojo: 32, recorrido: 18 });
  });
  it("sin recoger todavía no inventa tramos", () => {
    expect(tramosDeEntrega({ pedidoCreado: null, asignado: "2026-10-17T10:08:00Z", recogido: null, entregado: null })).toEqual({
      antesDeAsignar: null,
      esperaRecojo: null,
      recorrido: null,
    });
  });
});
