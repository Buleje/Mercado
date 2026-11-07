/**
 * La tira de días del registro (`lib/forestal/semana-de-registro.ts`).
 *
 * Lo que se prueba no es "que sume días": es que la tira **no se corra**. Un
 * día de más y el operador tilda el martes creyendo que tilda el lunes, y el
 * Libro CTP —que se registra día por día— queda diciendo otra cosa que el parte
 * de la sierra. Por eso las fechas van con hora fija y zona forzada: el bug que
 * acecha acá es el off-by-one de zona horaria, no la aritmética.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import {
  correrSemanas,
  diasDeLaSemana,
  esIsoValido,
  etiquetaCorta,
  etiquetaLarga,
  hoyEnLima,
  indiceDelDia,
  lunesDe,
  nombreDelDia,
  rangoDeLaSemana,
  sumarDias,
  tituloDeLaSemana,
} from "@/lib/forestal/semana-de-registro";

afterEach(() => {
  vi.useRealTimers();
});

describe("la semana empieza en lunes", () => {
  it("un miércoles cae en la semana de su lunes", () => {
    // 2026-09-16 es miércoles.
    expect(lunesDe("2026-09-16")).toBe("2026-09-14");
  });

  it("el domingo pertenece a la semana que TERMINA, no a la que empieza", () => {
    // El sábado es día de sierra: si la semana arrancara en domingo, el sábado
    // quedaría al final de la tira anterior.
    expect(lunesDe("2026-09-20")).toBe("2026-09-14"); // domingo 20
    expect(indiceDelDia("2026-09-20")).toBe(6);
    expect(indiceDelDia("2026-09-14")).toBe(0);
  });

  it("devuelve siete días consecutivos, de lunes a domingo", () => {
    const dias = diasDeLaSemana("2026-09-16");
    expect(dias).toEqual([
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
    ]);
    expect(nombreDelDia(dias[0]!)).toBe("Lun");
    expect(nombreDelDia(dias[6]!)).toBe("Dom");
  });
});

describe("moverse de semana", () => {
  it("adelanta y retrocede sobre el lunes, no sobre el día suelto", () => {
    expect(correrSemanas("2026-09-16", 1)).toBe("2026-09-21");
    expect(correrSemanas("2026-09-16", -1)).toBe("2026-09-07");
  });

  it("cruza el fin de mes y el fin de año sin perder un día", () => {
    expect(diasDeLaSemana("2026-12-31")).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
    expect(sumarDias("2028-02-28", 1)).toBe("2028-02-29"); // bisiesto
  });

  it("el rango de la semana es lunes → domingo", () => {
    expect(rangoDeLaSemana("2026-09-16")).toEqual({
      desde: "2026-09-14",
      hasta: "2026-09-20",
    });
  });
});

describe("no se corre por la zona horaria", () => {
  /* El bug real: `new Date("2026-09-14")` es medianoche UTC; leerlo con los
     getters LOCALES en Lima (UTC-5) devuelve el 13. Toda la aritmética de este
     módulo es UTC justamente para que eso no pase. */
  it("un día date-only conserva su fecha aunque el proceso esté en Lima", () => {
    expect(sumarDias("2026-09-14", 0)).toBe("2026-09-14");
    expect(etiquetaCorta("2026-09-14")).toBe("14/09");
    expect(nombreDelDia("2026-09-14", true)).toBe("lunes");
  });

  it("«hoy» es el día de Pucallpa, no el de UTC", () => {
    // 2026-09-15 01:00 UTC = 2026-09-14 20:00 en Lima: la hora en que se carga
    // el parte de la jornada. El día de trabajo sigue siendo el 14.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T01:00:00.000Z"));
    expect(hoyEnLima()).toBe("2026-09-14");
  });

  it("a media mañana los dos calendarios coinciden", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T15:00:00.000Z")); // 10:00 Lima
    expect(hoyEnLima()).toBe("2026-09-14");
  });
});

describe("etiquetas", () => {
  it("el título dice el rango y sólo repite el mes cuando cambia", () => {
    expect(tituloDeLaSemana("2026-09-16")).toBe("14 – 20 de setiembre 2026");
    expect(tituloDeLaSemana("2026-09-30")).toBe("28 setiembre – 4 octubre 2026");
  });

  it("la etiqueta larga agrega el año sólo si se fue del año de referencia", () => {
    expect(etiquetaLarga("2026-09-14", "2026-09-11")).toBe("lunes 14/09");
    expect(etiquetaLarga("2025-09-15", "2026-09-11")).toBe("lunes 15/09/2025");
  });
});

describe("esIsoValido", () => {
  it("acepta una fecha real y rechaza lo que no lo es", () => {
    expect(esIsoValido("2026-09-14")).toBe(true);
    expect(esIsoValido("2026-02-30")).toBe(false); // no existe
    expect(esIsoValido("14/09/2026")).toBe(false);
    expect(esIsoValido("")).toBe(false);
    expect(esIsoValido(null)).toBe(false);
    expect(esIsoValido(undefined)).toBe(false);
  });
});
