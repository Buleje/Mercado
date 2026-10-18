/**
 * Agenda (ADR-501 §6) — los schemas de entrada: defaults, chequeos cruzados y mensajes.
 */
import { describe, expect, it } from "vitest";
import {
  ActividadCrearSchema,
  ActividadEditarSchema,
  MarcarOcurrenciaSchema,
  RangoSchema,
  RecurrenciaSchema,
  validarActividadCompleta,
} from "@/lib/agenda/schemas";

const recurrencia = { frecuencia: "semanal", desde: "2026-10-19", diasSemana: [1] };
const msg = (r: { success: boolean; error?: { issues: Array<{ message: string }> } }) => r.error?.issues[0]?.message;

describe("ActividadCrearSchema", () => {
  it("con lo mínimo aplica los defaults", () => {
    const r = ActividadCrearSchema.safeParse({ nombre: "  Pagar luz ", recurrencia });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toMatchObject({
      nombre: "Pagar luz",
      regla: "manual",
      objetivo: null,
      hora: null,
      canales: ["campana"],
      color: "info",
      nota: null,
      activo: true,
    });
    expect(r.data.recurrencia).toMatchObject({ hasta: null, diaMes: null, cadaN: null });
  });

  it("normaliza los parámetros de la regla (defaults)", () => {
    const r = ActividadCrearSchema.safeParse({ nombre: "Asistencia", regla: "asistencia", recurrencia });
    expect(r.success && r.data.parametros).toEqual({ minimo: "todos" });
  });

  it("cuenta de tercero exige la parte", () => {
    const r = ActividadCrearSchema.safeParse({ nombre: "Cuenta", regla: "cuenta_tercero", recurrencia });
    expect(msg(r)).toBe("Elige la cuenta que se revisa");
  });

  it("un beneficiario no sirve para la cuenta de tercero", () => {
    const r = ActividadCrearSchema.safeParse({
      nombre: "Cuenta",
      regla: "cuenta_tercero",
      objetivo: { tipo: "beneficiario", id: "b1", nombre: "Juan" },
      recurrencia,
    });
    expect(msg(r)).toBe("Elige una cuenta corriente, no un beneficiario");
  });

  it("parámetros desconocidos = error", () => {
    const r = ActividadCrearSchema.safeParse({ nombre: "X", regla: "asistencia", parametros: { otro: 1 }, recurrencia });
    expect(r.success).toBe(false);
  });

  it("canales sin repetidos y al menos uno", () => {
    const r = ActividadCrearSchema.safeParse({ nombre: "X", canales: ["campana", "campana", "telegram"], recurrencia });
    expect(r.success && r.data.canales).toEqual(["campana", "telegram"]);
    expect(msg(ActividadCrearSchema.safeParse({ nombre: "X", canales: [], recurrencia }))).toBe(
      "Elige al menos un canal de aviso",
    );
  });

  it("hora HH:MM", () => {
    expect(ActividadCrearSchema.safeParse({ nombre: "X", hora: "9:00", recurrencia }).success).toBe(false);
    expect(ActividadCrearSchema.safeParse({ nombre: "X", hora: "24:00", recurrencia }).success).toBe(false);
    expect(ActividadCrearSchema.safeParse({ nombre: "X", hora: "23:59", recurrencia }).success).toBe(true);
  });
});

describe("RecurrenciaSchema", () => {
  it("semanal sin días, mensual sin día y cada N sin N fallan con su mensaje", () => {
    expect(msg(RecurrenciaSchema.safeParse({ frecuencia: "semanal", desde: "2026-10-19" }))).toBe(
      "Elige al menos un día de la semana",
    );
    expect(msg(RecurrenciaSchema.safeParse({ frecuencia: "mensual", desde: "2026-10-19" }))).toBe("Elige el día del mes");
    expect(msg(RecurrenciaSchema.safeParse({ frecuencia: "cada_n_dias", desde: "2026-10-19" }))).toBe(
      "Indica cada cuántos días",
    );
  });

  it("fechas imposibles y «hasta» antes de «desde»", () => {
    expect(RecurrenciaSchema.safeParse({ frecuencia: "una_vez", desde: "2026-02-30" }).success).toBe(false);
    expect(msg(RecurrenciaSchema.safeParse({ frecuencia: "una_vez", desde: "2026-10-19", hasta: "2026-10-18" }))).toBe(
      "«Hasta» no puede ser antes de «desde»",
    );
  });

  it("días de la semana ordenados y sin repetidos", () => {
    const r = RecurrenciaSchema.safeParse({ frecuencia: "semanal", desde: "2026-10-19", diasSemana: [5, 1, 5] });
    expect(r.success && r.data.diasSemana).toEqual([1, 5]);
  });
});

describe("ActividadEditarSchema", () => {
  const version = "2026-10-18T15:00:00.000Z";

  it("pide la versión y algo que cambiar", () => {
    expect(msg(ActividadEditarSchema.safeParse({ nombre: "X" }))).toBe("Falta la versión de la actividad");
    expect(msg(ActividadEditarSchema.safeParse({ version }))).toBe("No hay nada que cambiar");
  });

  it("lo que no viene queda undefined (no se toca)", () => {
    const r = ActividadEditarSchema.safeParse({ version, activo: false });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.activo).toBe(false);
    expect(r.data.nombre).toBeUndefined();
    expect(r.data.canales).toBeUndefined();
  });

  it("validarActividadCompleta revisa la fila ya mezclada", () => {
    expect(validarActividadCompleta({ regla: "cuenta_tercero", objetivo: null, parametros: {} })).toEqual({
      ok: false,
      error: "Elige la cuenta que se revisa",
    });
    expect(validarActividadCompleta({ regla: "facturas", objetivo: null, parametros: {} })).toEqual({
      ok: true,
      parametros: { modo: "emitir" },
    });
  });
});

describe("MarcarOcurrenciaSchema y RangoSchema", () => {
  it("pospuesta pide un día posterior; las demás sueltan posponerA", () => {
    const base = { actividadId: "a1", fecha: "2026-10-19" };
    expect(msg(MarcarOcurrenciaSchema.safeParse({ ...base, estado: "pospuesta" }))).toBe("Elige para qué día se pospone");
    expect(msg(MarcarOcurrenciaSchema.safeParse({ ...base, estado: "pospuesta", posponerA: "2026-10-19" }))).toBe(
      "Se pospone a un día después",
    );
    const hecha = MarcarOcurrenciaSchema.safeParse({ ...base, estado: "hecha", posponerA: "2026-10-25", nota: "  " });
    expect(hecha.success && hecha.data).toMatchObject({ posponerA: null, nota: null });
  });

  it("rango de hasta 62 días", () => {
    expect(RangoSchema.safeParse({ desde: "2026-10-01", hasta: "2026-12-01" }).success).toBe(true);
    expect(msg(RangoSchema.safeParse({ desde: "2026-10-01", hasta: "2026-12-02" }))).toBe("Como mucho 62 días por consulta");
    expect(msg(RangoSchema.safeParse({ desde: "2026-10-02", hasta: "2026-10-01" }))).toBe(
      "«Hasta» no puede ser antes de «desde»",
    );
  });
});
