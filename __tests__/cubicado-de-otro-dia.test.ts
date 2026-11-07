import { describe, expect, it } from "vitest";
import {
  avisoDeCubicadoViejo,
  diaYMes,
  diasEntre,
  textoDelAviso,
} from "@/lib/forestal/cubicado-de-otro-dia";

/* 01-11-2026 fue domingo; 03-11 es martes. Las horas van en UTC; Lima = UTC-5. */
const HOY = "2026-11-04";
const SABADO = "2026-10-31";
// Sábado 31-10 a las 10:00 de Lima.
const SAB_MANANA = "2026-10-31T15:00:00.000Z";

const aviso = (o: Partial<Parameters<typeof avisoDeCubicadoViejo>[0]>) =>
  avisoDeCubicadoViejo({ cuando: null, cantidad: 12, fecha: HOY, hoy: HOY, ...o });

describe("avisoDeCubicadoViejo", () => {
  it("lo cubicado hoy y declarado hoy: no hay nada que decir", () => {
    expect(aviso({ cuando: { desde: "2026-11-04T15:00:00.000Z" } })).toBeNull();
  });

  it("lo cubicado hace 3 días y la fecha de hoy: avisa y ofrece la fecha del día en que se cubicó", () => {
    const a = aviso({ cuando: { desde: SAB_MANANA, ultima: SAB_MANANA }, hoy: "2026-11-03" });
    expect(a).toMatchObject({
      tipo: "otro-dia",
      desdeDia: SABADO,
      hastaDia: SABADO,
      hace: 3,
      usarFecha: SABADO,
      paraJornada: null,
    });
  });

  it("la fecha elegida ya es la del día en que se cubicó: nada", () => {
    expect(aviso({ cuando: { desde: SAB_MANANA }, fecha: SABADO })).toBeNull();
  });

  it("la jornada que se eligió con las piezas a la vista manda sobre el día de cubicado", () => {
    // Se cubicó el sábado, pero se había declarado como jornada del viernes.
    const cuando = { desde: SAB_MANANA, jornada: "2026-10-30" };
    expect(aviso({ cuando, fecha: "2026-10-30" })).toBeNull();
    expect(aviso({ cuando, fecha: HOY })).toMatchObject({
      tipo: "otro-dia",
      usarFecha: "2026-10-30",
      paraJornada: "2026-10-30",
    });
  });

  it("sin marca (lo guardado antes de que existiera): «sin fecha», hasta que se confirme", () => {
    expect(aviso({ cuando: null })).toEqual({ tipo: "sin-fecha" });
    expect(aviso({ cuando: { ultima: SAB_MANANA } })).toEqual({ tipo: "sin-fecha" });
    expect(aviso({ cuando: { desde: "no es fecha" } })).toEqual({ tipo: "sin-fecha" });
    expect(aviso({ cuando: { jornada: SABADO, sinFechaOk: true } })).toBeNull();
  });

  it("sin piezas no se avisa de nada", () => {
    expect(aviso({ cuando: { desde: SAB_MANANA }, cantidad: 0 })).toBeNull();
    expect(aviso({ cuando: null, cantidad: 0 })).toBeNull();
  });

  it("cuenta el día en Lima: a las 20:00 locales el UTC ya está en el día siguiente", () => {
    // Sábado 31-10 20:00 en Pucallpa = domingo 01-11 01:00 UTC. Sigue siendo sábado.
    const a = aviso({ cuando: { desde: "2026-11-01T01:00:00.000Z" }, fecha: HOY });
    expect(a).toMatchObject({ tipo: "otro-dia", desdeDia: SABADO });
    expect(aviso({ cuando: { desde: "2026-11-01T01:00:00.000Z" }, fecha: SABADO })).toBeNull();
  });

  it("cubicado en varios días: dice desde cuándo y hasta cuándo", () => {
    const a = aviso({ cuando: { desde: SAB_MANANA, ultima: "2026-11-02T15:00:00.000Z" } });
    expect(a).toMatchObject({ tipo: "otro-dia", desdeDia: SABADO, hastaDia: "2026-11-02" });
  });

  it("un cubicado «del futuro» (reloj corrido) no da días negativos", () => {
    const a = aviso({ cuando: { desde: "2026-11-09T15:00:00.000Z" } });
    expect(a).toMatchObject({ tipo: "otro-dia", hace: 0 });
  });
});

describe("textos", () => {
  it("diasEntre y diaYMes", () => {
    expect(diasEntre("2026-10-31", "2026-11-03")).toBe(3);
    expect(diasEntre("2026-11-03", "2026-10-31")).toBe(-3);
    expect(diaYMes("2026-10-31")).toBe("sáb 31-10");
  });

  it("«Lo cubicado es del sáb 31-10 (hace 3 días) — 12 piezas»", () => {
    const a = aviso({ cuando: { desde: SAB_MANANA }, hoy: "2026-11-03" });
    expect(a && textoDelAviso(a, "12 piezas")).toBe(
      "Lo cubicado es del sáb 31-10 (hace 3 días) — 12 piezas",
    );
  });

  it("singular, plural, varios días, jornada distinta y sin fecha", () => {
    const uno = aviso({ cuando: { desde: SAB_MANANA }, hoy: "2026-11-01" });
    expect(uno && textoDelAviso(uno, "1 pieza")).toBe(
      "Lo cubicado es del sáb 31-10 (hace 1 día) — 1 pieza",
    );
    const varios = aviso({ cuando: { desde: SAB_MANANA, ultima: "2026-11-02T15:00:00.000Z" } });
    expect(varios && textoDelAviso(varios, "5 piezas")).toBe(
      "Lo cubicado va del sáb 31-10 al lun 02-11 (desde hace 4 días) — 5 piezas",
    );
    const jornada = aviso({ cuando: { desde: SAB_MANANA, jornada: "2026-10-30" } });
    expect(jornada && textoDelAviso(jornada, "2 piezas")).toBe(
      "Lo cubicado es del sáb 31-10 (hace 4 días), para la jornada del vie 30-10 — 2 piezas",
    );
    expect(textoDelAviso({ tipo: "sin-fecha" }, "3 piezas")).toBe(
      "Lo cubicado no dice de qué día es — 3 piezas",
    );
  });
});
