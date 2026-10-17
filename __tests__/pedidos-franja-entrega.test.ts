import { describe, expect, it } from "vitest";
import { diaRelativo, entregaElegida, franjaDeHora } from "@/lib/pedidos/franja-entrega";

// 17-10 a las 10:00 de Lima (15:00 UTC) y a las 21:00 de Lima (02:00 UTC del 18).
const MANANA_LIMA = new Date("2026-10-17T15:00:00Z");
const NOCHE_LIMA = new Date("2026-10-18T02:00:00Z");

describe("entregaElegida", () => {
  it("sin franja ni fecha = lo antes posible (no se inventa un día)", () => {
    expect(entregaElegida({}, MANANA_LIMA)).toBeNull();
    expect(entregaElegida({ franja: "madrugada" }, MANANA_LIMA)).toBeNull();
  });

  it("una franja que todavía llega es para hoy; una que ya pasó, para mañana", () => {
    expect(entregaElegida({ franja: "tarde" }, MANANA_LIMA)).toEqual({ fecha: "2026-10-17", franja: "tarde", nota: null });
    // A las 21:00 de Lima el UTC ya es 18: la noche (17-20) pasó → el 18.
    expect(entregaElegida({ franja: "noche" }, NOCHE_LIMA)).toEqual({ fecha: "2026-10-18", franja: "noche", nota: null });
    expect(entregaElegida({ franja: "manana" }, new Date("2026-10-17T18:00:00Z"))).toMatchObject({ fecha: "2026-10-18" });
  });

  it("con día y hora elegidos, la franja sale de la hora y la hora queda anotada", () => {
    expect(entregaElegida({ fecha: "2026-10-20", hora: "15:30", franja: "manana" }, MANANA_LIMA)).toEqual({
      fecha: "2026-10-20",
      franja: "tarde",
      nota: "a las 15:30",
    });
    expect(entregaElegida({ fecha: "2026-10-20" }, MANANA_LIMA)).toEqual({ fecha: "2026-10-20", franja: "", nota: null });
    // Algunos navegadores mandan segundos en <input type="time">.
    expect(entregaElegida({ fecha: "2026-10-20", hora: "9:05:00" }, MANANA_LIMA)).toEqual({ fecha: "2026-10-20", franja: "manana", nota: "a las 9:05" });
  });

  it("el turno del checkout («hoy-14-16», «manana-8-10») da el día, la franja y el horario", () => {
    expect(entregaElegida({ franja: "hoy-14-16" }, MANANA_LIMA)).toEqual({ fecha: "2026-10-17", franja: "tarde", nota: "de 14:00 a 16:00" });
    expect(entregaElegida({ franja: "manana-8-10" }, MANANA_LIMA)).toEqual({ fecha: "2026-10-18", franja: "manana", nota: "de 8:00 a 10:00" });
    // A las 21:00 de Lima el UTC ya es 18: «hoy» sigue siendo el 17 en Lima.
    expect(entregaElegida({ franja: "hoy-18-20" }, NOCHE_LIMA)).toMatchObject({ fecha: "2026-10-17", franja: "noche" });
    expect(entregaElegida({ franja: "hoy-16-14" }, MANANA_LIMA)).toBeNull();
  });

  it("una fecha mal escrita no se guarda como día", () => {
    expect(entregaElegida({ fecha: "20/10/2026" }, MANANA_LIMA)).toBeNull();
  });
});

describe("franjaDeHora", () => {
  it("corta en 12 y 17", () => {
    expect(franjaDeHora("11:59")).toBe("manana");
    expect(franjaDeHora("12:00")).toBe("tarde");
    expect(franjaDeHora("17:00")).toBe("noche");
    expect(franjaDeHora("25:00")).toBeNull();
  });
});

describe("diaRelativo", () => {
  it("hoy y mañana en Lima; otro día con su nombre", () => {
    expect(diaRelativo("2026-10-18", NOCHE_LIMA)).toBe("Mañana");
    expect(diaRelativo("2026-10-17", NOCHE_LIMA)).toBe("Hoy");
    expect(diaRelativo("2026-10-20", NOCHE_LIMA)).toBe("martes 20/10");
  });
});
