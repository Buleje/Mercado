/**
 * El canon de formato del panel (lib/format). Cada número de acá salió de correr ICU
 * (Node 24, es-PE) el 2026-09-22; si un test rompe tras subir Node, es ICU cambiando
 * la abreviatura y hay que mirarlo, no silenciarlo.
 */
import { describe, it, expect } from "vitest";
import {
  formatDateShort, formatDate, formatDateNumeric, formatDateLong, formatMonthYear, formatMonth,
  formatWeekday, formatTime, formatDateTime, formatDateTimeShort, formatNumber, formatCurrency, SIN_DATO,
} from "@/lib/format";

// 22 set 2026 a las 19:30 en Lima = 23 set 00:30 UTC. Cualquier formato en UTC diría «23».
const instante = new Date("2026-09-22T19:30:00-05:00");
// Columna DATE de Postgres: llega como medianoche UTC.
const soloFecha = "2026-09-22";

describe("fechas: zona Lima, dos dígitos, sin guion", () => {
  it("corta y larga separan igual (ICU pone guion en la corta)", () => {
    expect(formatDateShort(instante)).toBe("22 set.");
    expect(formatDate(instante)).toBe("22 set. 2026");
  });
  it("numérica, larga, mes y día de semana", () => {
    expect(formatDateNumeric(instante)).toBe("22/09/2026");
    expect(formatDateLong(instante)).toBe("22 de setiembre de 2026");
    expect(formatMonthYear(instante)).toBe("set. 2026");
    expect(formatMonthYear(instante, { largo: true })).toBe("setiembre de 2026");
    expect(formatMonth(instante)).toBe("set."); // ICU a solas da «Set.»; se normaliza
    expect(formatMonth(instante, { largo: true })).toBe("setiembre");
    expect(formatWeekday(instante)).toBe("mar"); // ICU: sin punto en días, con punto en meses
    expect(formatWeekday(instante, { largo: true })).toBe("martes");
  });
  it("el día siempre a dos dígitos: alinea columnas", () => {
    expect(formatDateShort("2026-09-02T12:00:00-05:00")).toBe("02 set.");
  });
});

describe("la trampa de la zona", () => {
  it("un instante de noche en Lima NO se va al día siguiente (el servidor puede estar en UTC)", () => {
    expect(formatDateShort(instante)).toBe("22 set.");
    expect(formatDateTime(instante)).toBe("22 set. 2026, 19:30");
  });
  it("una fecha DATE-only en Lima retrocede un día; con soloFecha no", () => {
    expect(formatDateShort(soloFecha)).toBe("21 set."); // el bug, documentado
    expect(formatDateShort(soloFecha, { soloFecha: true })).toBe("22 set.");
    expect(formatDate(soloFecha, { soloFecha: true })).toBe("22 set. 2026");
    expect(formatDateNumeric(soloFecha, { soloFecha: true })).toBe("22/09/2026");
  });
});

describe("horas: 24 h siempre", () => {
  it("sin hourCycle es-PE daría «07:30 p. m.»", () => {
    expect(formatTime(instante)).toBe("19:30");
    expect(formatTime("2026-09-22T09:05:07-05:00", { segundos: true })).toBe("09:05:07");
    expect(formatDateTimeShort(instante)).toBe("22 set., 19:30");
  });
});

describe("sin dato", () => {
  it.each([null, undefined, "", "no-es-fecha", NaN])("%s → «—»", (v) => {
    expect(formatDate(v as never)).toBe(SIN_DATO);
    expect(formatTime(v as never)).toBe(SIN_DATO);
  });
});

describe("números y moneda", () => {
  it("miles siempre; decimales exactos o tope", () => {
    expect(formatNumber(12345.5)).toBe("12,345.5");
    expect(formatNumber(12345.5, 2)).toBe("12,345.50");
    expect(formatNumber(12345.5, 0)).toBe("12,346");
    expect(formatNumber(12345.567, { max: 2 })).toBe("12,345.57");
    expect(formatNumber(5, { min: 1 })).toBe("5.0");
    expect(formatNumber("42")).toBe("42");
    expect(formatNumber(null)).toBe(SIN_DATO);
    expect(formatNumber(Number.NaN)).toBe(SIN_DATO);
  });
  it("moneda: el canon es lib/currency («S/ 12,345.50»), no toFixed", () => {
    expect(formatCurrency(12345.5)).toBe("S/ 12,345.50");
    expect(formatCurrency(1500, { decimals: 0 })).toBe("S/ 1,500");
  });
});
