/**
 * __tests__/rrhh-ganado.test.ts
 *
 * ADR-414 §5 — lo ganado de referencia. Lo que más importa acá: el mes
 * completo da el monto EXACTO (÷ días del mes, redondeado una sola vez por
 * tramo, nunca ÷ 30 ni redondeado día por día), y "sin tarifa" nunca se lee
 * como S/ 0.
 */
import { describe, expect, it } from "vitest";
import { calcularGanado, explicarGanado, factorDe, tarifaVigente, type CalcularGanadoInput, type MarcaParaGanado, type TarifaParaGanado } from "@/lib/rrhh/ganado";
import { rangoDeDias } from "@/lib/rrhh/fechas";

const colaborador = (p: Partial<CalcularGanadoInput["colaborador"]> = {}): CalcularGanadoInput["colaborador"] => ({
  id: "c1",
  fechaIngreso: null,
  fechaCese: null,
  ...p,
});

const tarifa = (p: Partial<TarifaParaGanado> = {}): TarifaParaGanado => ({
  modalidad: "DIA",
  monto: 60,
  horasJornada: 8,
  vigenteDesde: "2026-08-01",
  ...p,
});

function marcasDelMes(desde: string, hasta: string, estado: MarcaParaGanado["estado"] = "PRESENTE"): MarcaParaGanado[] {
  return rangoDeDias(desde, hasta).map((fecha) => ({ fecha, estado, horas: null }));
}

describe("calcularGanado — MES da el monto exacto (÷ días del mes real)", () => {
  it("agosto (31 días) sin faltas: total EXACTO, no 1500.09", () => {
    const resultado = calcularGanado({
      colaborador: colaborador(),
      tarifas: [tarifa({ modalidad: "MES", monto: 1500, vigenteDesde: "2026-08-01" })],
      marcas: marcasDelMes("2026-08-01", "2026-08-31"),
      desde: "2026-08-01",
      hasta: "2026-08-31",
      hoy: "2026-08-31",
    });
    expect(resultado.total).toBe(1500);
    expect(resultado.tramos).toHaveLength(1);
    expect(resultado.tramos[0].importe).toBe(1500);
  });

  it("setiembre (30 días) sin faltas: también exacto", () => {
    const resultado = calcularGanado({
      colaborador: colaborador(),
      tarifas: [tarifa({ modalidad: "MES", monto: 1500, vigenteDesde: "2026-09-01" })],
      marcas: marcasDelMes("2026-09-01", "2026-09-30"),
      desde: "2026-09-01",
      hasta: "2026-09-30",
      hoy: "2026-09-30",
    });
    expect(resultado.total).toBe(1500);
  });

  it("febrero (28 días, 2026 no es bisiesto) sin faltas: también exacto", () => {
    const resultado = calcularGanado({
      colaborador: colaborador(),
      tarifas: [tarifa({ modalidad: "MES", monto: 1400, vigenteDesde: "2026-02-01" })],
      marcas: marcasDelMes("2026-02-01", "2026-02-28"),
      desde: "2026-02-01",
      hasta: "2026-02-28",
      hoy: "2026-02-28",
    });
    expect(resultado.total).toBe(1400);
  });

  it("CONTROL NEGATIVO: una falta en febrero vale monto/28, no monto/30", () => {
    const marcas = marcasDelMes("2026-02-01", "2026-02-28");
    marcas[0] = { ...marcas[0], estado: "FALTA" };
    const resultado = calcularGanado({
      colaborador: colaborador(),
      tarifas: [tarifa({ modalidad: "MES", monto: 1400, vigenteDesde: "2026-02-01" })],
      marcas,
      desde: "2026-02-01",
      hasta: "2026-02-28",
      hoy: "2026-02-28",
    });
    const conDivisor28 = Math.round(((1400 / 28) * 27) * 100) / 100;
    const conDivisorMalo30 = Math.round(((1400 / 30) * 27) * 100) / 100;
    expect(resultado.total).toBe(conDivisor28);
    expect(resultado.total).not.toBe(conDivisorMalo30);
  });
});

describe("calcularGanado — tramos: cambio de tarifa a mitad de mes", () => {
  it("dos tramos, cada uno con SU monto y redondeado aparte", () => {
    const resultado = calcularGanado({
      colaborador: colaborador(),
      tarifas: [
        tarifa({ modalidad: "DIA", monto: 60, vigenteDesde: "2026-08-01" }),
        tarifa({ modalidad: "DIA", monto: 65, vigenteDesde: "2026-08-16" }),
      ],
      marcas: marcasDelMes("2026-08-01", "2026-08-31"),
      desde: "2026-08-01",
      hasta: "2026-08-31",
      hoy: "2026-08-31",
    });
    expect(resultado.tramos).toHaveLength(2);
    expect(resultado.tramos[0]).toMatchObject({ monto: 60, dias: 15, importe: 900 });
    expect(resultado.tramos[1]).toMatchObject({ monto: 65, dias: 16, importe: 1040 });
    expect(resultado.total).toBe(1940);
  });
});

describe("calcularGanado — HORA sin horas cargadas se estima y se rotula", () => {
  it("sin horas: estima horasJornada × factor y marca horasEstimadas", () => {
    const resultado = calcularGanado({
      colaborador: colaborador(),
      tarifas: [tarifa({ modalidad: "HORA", monto: 10, horasJornada: 8, vigenteDesde: "2026-08-01" })],
      marcas: [{ fecha: "2026-08-01", estado: "PRESENTE", horas: null }],
      desde: "2026-08-01",
      hasta: "2026-08-01",
      hoy: "2026-08-01",
    });
    expect(resultado.tramos[0].horasEstimadas).toBe(true);
    expect(resultado.tramos[0].horas).toBe(8);
    expect(resultado.tramos[0].importe).toBe(80);
  });

  it("CONTROL NEGATIVO: con horas reales cargadas, NO se estima", () => {
    const resultado = calcularGanado({
      colaborador: colaborador(),
      tarifas: [tarifa({ modalidad: "HORA", monto: 10, horasJornada: 8, vigenteDesde: "2026-08-01" })],
      marcas: [{ fecha: "2026-08-01", estado: "PRESENTE", horas: 6 }],
      desde: "2026-08-01",
      hasta: "2026-08-01",
      hoy: "2026-08-01",
    });
    expect(resultado.tramos[0].horasEstimadas).toBe(false);
    expect(resultado.tramos[0].horas).toBe(6);
    expect(resultado.tramos[0].importe).toBe(60);
  });
});

describe("calcularGanado — sin tarifa NUNCA suma S/ 0 silencioso", () => {
  it("día sin tarifa vigente: no forma tramo, sale en sinTarifa y el total no lo cuenta", () => {
    const resultado = calcularGanado({
      colaborador: colaborador(),
      tarifas: [],
      marcas: [{ fecha: "2026-08-01", estado: "PRESENTE", horas: null }],
      desde: "2026-08-01",
      hasta: "2026-08-01",
      hoy: "2026-08-01",
    });
    expect(resultado.tramos).toHaveLength(0);
    expect(resultado.sinTarifa).toEqual(["2026-08-01"]);
    expect(resultado.total).toBe(0);
  });
});

describe("calcularGanado — marcas fuera del período de la persona", () => {
  it("una marca antes del ingreso no suma y sale en fueraDePeriodo", () => {
    const resultado = calcularGanado({
      colaborador: colaborador({ fechaIngreso: "2026-08-10" }),
      tarifas: [tarifa({ modalidad: "DIA", monto: 50, vigenteDesde: "2026-08-01" })],
      marcas: [{ fecha: "2026-08-05", estado: "PRESENTE", horas: null }],
      desde: "2026-08-01",
      hasta: "2026-08-31",
      hoy: "2026-08-31",
    });
    expect(resultado.fueraDePeriodo).toContain("2026-08-05");
    expect(resultado.total).toBe(0);
    expect(resultado.avisos.length).toBeGreaterThan(0);
  });
});

describe("factorDe", () => {
  it("MEDIO_DIA siempre pesa 0.5, jornal o sueldo", () => {
    expect(factorDe("MEDIO_DIA", "DIA")).toBe(0.5);
    expect(factorDe("MEDIO_DIA", "MES")).toBe(0.5);
  });
  it("DESCANSO no paga jornal pero sí sueldo", () => {
    expect(factorDe("DESCANSO", "DIA")).toBe(0);
    expect(factorDe("DESCANSO", "MES")).toBe(1);
  });
  it("sin marcar (null): 0 en jornal, 1 en sueldo", () => {
    expect(factorDe(null, "HORA")).toBe(0);
    expect(factorDe(null, "SEMANA")).toBe(1);
  });
  it("TARDANZA paga completo (no se descuenta en F1)", () => {
    expect(factorDe("TARDANZA", "DIA")).toBe(1);
  });
});

describe("tarifaVigente", () => {
  it("la de mayor vigenteDesde ≤ fecha", () => {
    const tarifas = [tarifa({ vigenteDesde: "2026-01-01", monto: 50 }), tarifa({ vigenteDesde: "2026-06-01", monto: 60 })];
    expect(tarifaVigente(tarifas, "2026-05-31")?.monto).toBe(50);
    expect(tarifaVigente(tarifas, "2026-06-01")?.monto).toBe(60);
  });
  it("null si la fecha es anterior a toda tarifa", () => {
    expect(tarifaVigente([tarifa({ vigenteDesde: "2026-06-01" })], "2026-01-01")).toBeNull();
  });
});

/**
 * BAJO 8 (revisión 2026-09-14): suspender con `sinPagoDesde` y después volver
 * a ACTIVO revive la última tarifa PAGADA desde hoy (fix en
 * `ColaboradoresDB.cambiarEstado`). Esto prueba que, dada esa línea de tiempo
 * de tarifas (pagada → SIN_PAGO → pagada de nuevo), `calcularGanado` vuelve a
 * sumar después de la reactivación — no se queda pagando S/ 0 para siempre.
 */
describe("calcularGanado — suspendido con sin pago y reactivado (BAJO 8)", () => {
  it("el tramo SIN_PAGO no suma, y el tramo de después de reactivar sí", () => {
    const resultado = calcularGanado({
      colaborador: colaborador(),
      tarifas: [
        tarifa({ modalidad: "DIA", monto: 60, vigenteDesde: "2026-08-01" }), // pagada
        tarifa({ modalidad: "SIN_PAGO", monto: 0, vigenteDesde: "2026-08-15" }), // suspendido sin goce
        tarifa({ modalidad: "DIA", monto: 60, vigenteDesde: "2026-08-20" }), // reactivado (cambiarEstado a ACTIVO)
      ],
      marcas: marcasDelMes("2026-08-01", "2026-08-31"),
      desde: "2026-08-01",
      hasta: "2026-08-31",
      hoy: "2026-08-31",
    });

    const sinPago = resultado.tramos.find((t) => t.modalidad === "SIN_PAGO");
    expect(sinPago?.importe).toBe(0);

    const despuesDeReactivar = resultado.tramos.find((t) => t.desde === "2026-08-20");
    expect(despuesDeReactivar?.modalidad).toBe("DIA");
    expect(despuesDeReactivar?.importe).toBeGreaterThan(0);

    // 14 días pagados (01-14) + 0 (15-19, sin pago) + 12 días pagados (20-31).
    expect(resultado.total).toBe(14 * 60 + 12 * 60);
  });
});

describe("explicarGanado — la cuenta que se muestra tiene que dar", () => {
  it("DIA: multiplica los días que suman, no los días de calendario del tramo", () => {
    // 14 días de período, 6 con marca PRESENTE: se pagan 6 (medido 2026-09-14,
    // la línea decía «14 días × S/ 45.00 = S/ 270.00»).
    const trabajados = ["2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-14"];
    const resultado = calcularGanado({
      colaborador: colaborador(),
      tarifas: [tarifa({ modalidad: "DIA", monto: 45 })],
      marcas: trabajados.map((fecha) => ({ fecha, estado: "PRESENTE", horas: null })),
      desde: "2026-09-01",
      hasta: "2026-09-30",
      hoy: "2026-09-14",
    });
    expect(resultado.tramos[0]).toMatchObject({ dias: 14, factor: 6, importe: 270 });
    expect(explicarGanado(resultado)).toEqual(["6 días × S/ 45.00 = S/ 270.00"]);
  });

  it("CONTROL: con medio día el factor es decimal y la cuenta sigue cerrando", () => {
    const resultado = calcularGanado({
      colaborador: colaborador(),
      tarifas: [tarifa({ modalidad: "DIA", monto: 60 })],
      marcas: [
        { fecha: "2026-09-01", estado: "PRESENTE", horas: null },
        { fecha: "2026-09-02", estado: "MEDIO_DIA", horas: null },
      ],
      desde: "2026-09-01",
      hasta: "2026-09-02",
      hoy: "2026-09-02",
    });
    expect(explicarGanado(resultado)).toEqual(["1.5 días × S/ 60.00 = S/ 90.00"]);
  });
});
