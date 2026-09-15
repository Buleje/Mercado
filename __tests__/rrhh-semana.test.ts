/**
 * __tests__/rrhh-semana.test.ts
 *
 * Cómo se nombra la semana de la hoja de asistencia (ADR-416): lunes a
 * domingo, meses escritos a mano, y la etiqueta dice cuándo cruza de mes o de
 * año (una semana de fin de año sin el año de cada punta se lee mal).
 */
import { describe, expect, it } from "vitest";
import { encabezadoDia, etiquetaSemana, formatearDias } from "@/components/admin/rrhh/asistencia/semana";
import { diasTrabajados } from "@/components/admin/rrhh/asistencia/conteo-mes";

describe("semana.ts — la etiqueta de la semana", () => {
  it("semana dentro de un mes", () => {
    expect(etiquetaSemana("2026-09-14")).toBe("14 al 20 de setiembre de 2026");
  });

  it("semana que cruza de mes", () => {
    expect(etiquetaSemana("2026-09-28")).toBe("28 de setiembre al 4 de octubre de 2026");
  });

  it("semana que cruza de año", () => {
    expect(etiquetaSemana("2026-12-28")).toBe("28 de diciembre de 2026 al 3 de enero de 2027");
  });

  it("encabezados con el lunes primero", () => {
    expect(encabezadoDia("2026-09-14")).toBe("Lun 14");
    expect(encabezadoDia("2026-09-20")).toBe("Dom 20");
  });
});

describe("días trabajados", () => {
  it("presente y tardanza cuentan uno, medio día cuenta medio; descanso y vacaciones no son días trabajados", () => {
    const n = diasTrabajados({ PRESENTE: 3, TARDANZA: 1, MEDIO_DIA: 1, FALTA: 1, PERMISO: 0, DESCANSO: 1, VACACIONES: 0 });
    expect(n).toBe(4.5);
    expect(formatearDias(n)).toBe("4.5");
    expect(formatearDias(5)).toBe("5");
  });
});
