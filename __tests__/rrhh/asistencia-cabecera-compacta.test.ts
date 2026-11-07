/**
 * La cabecera de Asistencia en UNA fila (Brandon 23-10): las frases cortas que
 * reemplazan a los bloques de abajo tienen que decir lo mismo que decían.
 */
import { describe, expect, it } from "vitest";
import { fraseDelResumen } from "@/components/admin/rrhh/asistencia/ResumenDelDia";
import { nombresQueNoVienen } from "@/components/admin/rrhh/asistencia/ListaDelDia";
import { etiquetaSemanaCorta } from "@/components/admin/rrhh/asistencia/semana";
import { ESTADOS_ASISTENCIA, type EstadoAsistencia } from "@/lib/rrhh/tipos";

const conteo = (parcial: Partial<Record<EstadoAsistencia, number>>) =>
  Object.fromEntries(ESTADOS_ASISTENCIA.map((e) => [e, parcial[e] ?? 0])) as Record<EstadoAsistencia, number>;

describe("fraseDelResumen", () => {
  it("dice marcados, cada estado con marca y cuántos faltan marcar", () => {
    expect(fraseDelResumen(2, 6, conteo({ PRESENTE: 1, FALTA: 1 }))).toBe("2 de 6 marcados · 1 presente · 1 falta · 4 sin marcar");
  });
  it("con todos marcados no habla de «sin marcar» y omite los estados en 0", () => {
    expect(fraseDelResumen(3, 3, conteo({ PRESENTE: 3 }))).toBe("3 de 3 marcados · 3 presentes");
  });
});

describe("nombresQueNoVienen", () => {
  it("usa el primer nombre y corta a partir del cuarto", () => {
    expect(nombresQueNoVienen(["Rosa Pérez"])).toBe("Rosa");
    expect(nombresQueNoVienen(["Rosa Pérez", "Elena Ríos"])).toBe("Rosa y Elena");
    expect(nombresQueNoVienen(["Rosa", "Miguel", "Elena"])).toBe("Rosa, Miguel y Elena");
    expect(nombresQueNoVienen(["Rosa", "Miguel", "Elena", "Juan", "Ana"])).toBe("Rosa, Miguel y 3 más");
    expect(nombresQueNoVienen([])).toBe("");
  });
});

describe("etiquetaSemanaCorta", () => {
  it("misma semana del mes: el mes una sola vez", () => {
    expect(etiquetaSemanaCorta("2026-10-19")).toBe("19–25/10");
  });
  it("semana que cruza de mes: los dos meses", () => {
    expect(etiquetaSemanaCorta("2026-09-28")).toBe("28/09–04/10");
  });
});
