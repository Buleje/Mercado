/** Feriados nacionales del Perú: lista oficial 2026 de gob.pe (https://www.gob.pe/feriados/historicos). */
import { describe, expect, it } from "vitest";
import { feriadoDe, feriadosEntre } from "@/lib/feriados-peru";

describe("feriados del Perú", () => {
  it("2026 = la lista oficial de gob.pe, sin días no laborables", () => {
    expect(feriadosEntre("2026-01-01", "2026-12-31")).toEqual([
      { fecha: "2026-01-01", nombre: "Año Nuevo" },
      { fecha: "2026-04-02", nombre: "Jueves Santo" },
      { fecha: "2026-04-03", nombre: "Viernes Santo" },
      { fecha: "2026-05-01", nombre: "Día del Trabajo" },
      { fecha: "2026-06-07", nombre: "Batalla de Arica y Día de la Bandera" },
      { fecha: "2026-06-29", nombre: "San Pedro y San Pablo" },
      { fecha: "2026-07-23", nombre: "Día de la Fuerza Aérea del Perú" },
      { fecha: "2026-07-28", nombre: "Fiestas Patrias" },
      { fecha: "2026-07-29", nombre: "Fiestas Patrias" },
      { fecha: "2026-08-06", nombre: "Batalla de Junín" },
      { fecha: "2026-08-30", nombre: "Santa Rosa de Lima" },
      { fecha: "2026-10-08", nombre: "Combate de Angamos" },
      { fecha: "2026-11-01", nombre: "Día de Todos los Santos" },
      { fecha: "2026-12-08", nombre: "Inmaculada Concepción" },
      { fecha: "2026-12-09", nombre: "Batalla de Ayacucho" },
      { fecha: "2026-12-25", nombre: "Navidad" },
    ]);
    // Día no laborable del sector público (no feriado)
    expect(feriadoDe("2026-01-02")).toBeNull();
    expect(feriadoDe("2026-07-27")).toBeNull();
  });

  it("Semana Santa de otros años (Pascua 2024 = 31-mar, 2025 = 20-abr, 2027 = 28-mar)", () => {
    expect(feriadoDe("2024-03-28")?.nombre).toBe("Jueves Santo");
    expect(feriadoDe("2024-03-29")?.nombre).toBe("Viernes Santo");
    expect(feriadoDe("2025-04-17")?.nombre).toBe("Jueves Santo");
    expect(feriadoDe("2025-04-18")?.nombre).toBe("Viernes Santo");
    expect(feriadoDe("2027-03-25")?.nombre).toBe("Jueves Santo");
    expect(feriadoDe("2027-03-26")?.nombre).toBe("Viernes Santo");
  });

  it("los feriados nuevos rigen desde su año", () => {
    expect(feriadoDe("2021-12-09")).toBeNull();
    expect(feriadoDe("2022-12-09")?.nombre).toBe("Batalla de Ayacucho");
    expect(feriadoDe("2021-08-06")).toBeNull();
    expect(feriadoDe("2022-08-06")?.nombre).toBe("Batalla de Junín");
    expect(feriadoDe("2023-06-07")).toBeNull();
    expect(feriadoDe("2024-06-07")?.nombre).toBe("Batalla de Arica y Día de la Bandera");
  });

  it("un día común, una fecha rara o un rango al revés dan null / vacío", () => {
    expect(feriadoDe("2026-10-19")).toBeNull();
    expect(feriadoDe("basura")).toBeNull();
    expect(feriadosEntre("2026-12-31", "2026-01-01")).toEqual([]);
  });

  it("feriadosEntre cruza de año y respeta los bordes", () => {
    expect(feriadosEntre("2026-12-25", "2027-01-01")).toEqual([
      { fecha: "2026-12-25", nombre: "Navidad" },
      { fecha: "2027-01-01", nombre: "Año Nuevo" },
    ]);
  });
});
