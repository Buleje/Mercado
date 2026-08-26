import { describe, expect, it } from "vitest";
import {
  avanceDeMeta,
  diasSinGestion,
  promesasVigentes,
  recuperadoDelMes,
  tramoDe,
  ultimaGestionPorPersona,
  type Gestion,
} from "@/lib/adelantos/gestion-cobranza";

const AHORA = new Date("2026-08-14T15:00:00.000Z").getTime();
const enDias = (n: number) => new Date(AHORA + n * 86_400_000).toISOString();

const g = (p: Partial<Gestion> & { id: string }): Gestion => ({
  beneficiarioId: "b1",
  fecha: enDias(0),
  tipo: "RECORDATORIO",
  ...p,
});

describe("tramoDe", () => {
  it("parte la cartera en los cortes que usa un contador", () => {
    expect(tramoDe(0)).toBe("corriente");
    expect(tramoDe(-5)).toBe("corriente");
    expect(tramoDe(1)).toBe("t30");
    expect(tramoDe(30)).toBe("t30");
    expect(tramoDe(31)).toBe("t60");
    expect(tramoDe(60)).toBe("t60");
    expect(tramoDe(61)).toBe("t90");
    expect(tramoDe(90)).toBe("t90");
    expect(tramoDe(91)).toBe("t90mas");
    expect(tramoDe(400)).toBe("t90mas");
  });
});

describe("ultimaGestionPorPersona", () => {
  it("se queda con la más reciente de cada uno", () => {
    const m = ultimaGestionPorPersona([
      g({ id: "vieja", fecha: enDias(-10) }),
      g({ id: "nueva", fecha: enDias(-1) }),
      g({ id: "otra", beneficiarioId: "b2", fecha: enDias(-5) }),
    ]);
    expect(m.get("b1")?.id).toBe("nueva");
    expect(m.get("b2")?.id).toBe("otra");
  });

  it("sin gestiones no inventa nada", () => {
    expect(ultimaGestionPorPersona([]).size).toBe(0);
  });
});

describe("promesasVigentes", () => {
  it("una promesa a futuro dice «prometió» con los días que faltan", () => {
    const m = promesasVigentes([g({ id: "p", tipo: "PROMESA", fechaPrometida: enDias(3) })], AHORA);
    expect(m.get("b1")).toMatchObject({ estado: "prometio", faltan: 3 });
  });

  it("la que vence hoy se distingue: es la llamada del día", () => {
    const m = promesasVigentes([g({ id: "p", tipo: "PROMESA", fechaPrometida: enDias(0) })], AHORA);
    expect(m.get("b1")?.estado).toBe("vence-hoy");
  });

  it("una promesa incumplida NO se descarta: es el reclamo más fácil de sostener", () => {
    // La fecha la puso el propio deudor.
    const m = promesasVigentes([g({ id: "p", tipo: "PROMESA", fechaPrometida: enDias(-4) })], AHORA);
    expect(m.get("b1")).toMatchObject({ estado: "incumplio", faltan: -4 });
  });

  it("si volvió a prometer, manda la promesa MÁS NUEVA", () => {
    // Reclamar la del martes cuando el jueves prometió otra cosa es discutir un
    // compromiso que la propia persona reemplazó.
    const m = promesasVigentes(
      [
        g({ id: "martes", tipo: "PROMESA", fecha: enDias(-5), fechaPrometida: enDias(-2) }),
        g({ id: "jueves", tipo: "PROMESA", fecha: enDias(-1), fechaPrometida: enDias(5) }),
      ],
      AHORA,
    );
    expect(m.get("b1")?.gestion.id).toBe("jueves");
    expect(m.get("b1")?.estado).toBe("prometio");
  });

  it("las gestiones que no son promesa no cuentan", () => {
    const m = promesasVigentes(
      [g({ id: "a", tipo: "NO_CONTESTA" }), g({ id: "b", tipo: "PROMESA", fechaPrometida: null })],
      AHORA,
    );
    expect(m.size).toBe(0);
  });
});

describe("diasSinGestion", () => {
  it("cuenta desde la última", () => {
    expect(diasSinGestion(g({ id: "a", fecha: enDias(-7) }), AHORA)).toBe(7);
  });

  it("nunca gestionado es null, no «hace mucho»", () => {
    // A quien nunca se le escribió no se le puede reprochar que no pagó.
    expect(diasSinGestion(undefined, AHORA)).toBeNull();
  });
});

describe("avanceDeMeta", () => {
  it("mide el avance del mes", () => {
    expect(avanceDeMeta(1000, 250)).toMatchObject({ porcentaje: 25, falta: 750 });
  });

  it("no pasa de 100 aunque se recupere de más", () => {
    expect(avanceDeMeta(1000, 1500)).toMatchObject({ porcentaje: 100, falta: 0 });
  });

  it("sin meta cargada no hay porcentaje: no hay contra qué medir", () => {
    expect(avanceDeMeta(0, 500).porcentaje).toBeNull();
  });
});

describe("recuperadoDelMes", () => {
  it("suma las entregas del mes en curso, no los adelantos liquidados", () => {
    // Una entrega parcial también es plata que volvió.
    const total = recuperadoDelMes(
      [{ entregas: [{ fecha: enDias(-2), valor: 100 }, { fecha: enDias(-5), valor: 50 }] }],
      AHORA,
    );
    expect(total).toEqual({ PEN: 150 });
  });

  it("deja afuera lo del mes pasado", () => {
    const mesPasado = new Date("2026-07-20T12:00:00.000Z").toISOString();
    expect(recuperadoDelMes([{ entregas: [{ fecha: mesPasado, valor: 900 }] }], AHORA)).toEqual({});
  });

  it("deja afuera lo del futuro", () => {
    expect(recuperadoDelMes([{ entregas: [{ fecha: enDias(5), valor: 900 }] }], AHORA)).toEqual({});
  });

  it("sin entregas es cero, no NaN", () => {
    expect(recuperadoDelMes([{ entregas: [] }], AHORA)).toEqual({});
  });

  /**
   * EL BUG que encontró audit-verificado: dos adelantos del mismo mes, uno en
   * soles y otro en dólares, se sumaban en un solo total como si "100 PEN +
   * 30 USD" fueran 130 de la misma plata.
   */
  it("un adelanto en soles y otro en dólares recuperan en cuentas separadas", () => {
    const total = recuperadoDelMes(
      [
        { moneda: "PEN", entregas: [{ fecha: enDias(-2), valor: 100 }] },
        { moneda: "USD", entregas: [{ fecha: enDias(-1), valor: 30 }] },
      ],
      AHORA,
    );
    expect(total).toEqual({ PEN: 100, USD: 30 });
  });

  it("sin moneda cargada, asume soles", () => {
    expect(recuperadoDelMes([{ entregas: [{ fecha: enDias(-1), valor: 50 }] }], AHORA)).toEqual({ PEN: 50 });
  });
});
