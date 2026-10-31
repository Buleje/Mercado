import { describe, expect, it } from "vitest";
import { proximaFecha } from "@/components/admin/promociones/ProximaFechaComercial";

const ev = (nombre: string, fecha: string, diasHasta: number, tipo = "local") => ({
  nombre,
  fecha,
  tipo,
  diasHasta,
  impactoNegocio: "",
});

describe("proximaFecha", () => {
  it("recuenta los días contra el día de Lima, no con la hora del servidor", () => {
    // Sábado 10/10 a las 20:00 de Lima = domingo 01:00 UTC: el servidor dice 2, faltan 3.
    expect(proximaFecha([ev("Aniversario de Pucallpa", "2026-10-13", 2)], "2026-10-10")?.diasHasta).toBe(3);
  });

  it("deja fuera las quincenas, lo de hoy y lo que pasa de 30 días", () => {
    const eventos = [
      ev("Quincena", "2026-10-15", 5, "quincena"),
      ev("Hoy", "2026-10-10", 0),
      ev("Lejos", "2026-11-20", 41),
    ];
    expect(proximaFecha(eventos, "2026-10-10")).toBeNull();
  });

  it("elige la más cercana y suma San Juan calculado por año", () => {
    expect(proximaFecha([ev("Navidad", "2026-12-25", 76, "feriado")], "2026-12-01")?.nombre).toBe("Navidad");
    expect(proximaFecha([ev("Día del Padre", "2027-06-20", 25, "comercial")], "2027-06-10")?.nombre).toBe("Día del Padre");
    expect(proximaFecha([], "2027-06-10")).toMatchObject({ nombre: "San Juan", fecha: "2027-06-24", diasHasta: 14 });
  });
});
