/**
 * Duplicados del catálogo de gastos fijos. Puro, sin DB.
 *
 * El caso real: el tenant tiene 6 gastos que son 3, y la pantalla mostraba las
 * 6 tarjetas con su botón «Pagar». El riesgo es pagar dos veces el alquiler.
 */
import { describe, it, expect } from "vitest";
import { agruparDuplicados, claveDeGasto, encodeExpenseDescription, proximoVencimiento, yaPagadoEnPeriodo } from "@/lib/expense-meta";

const conMeta = (nombre: string, freq: "mensual" | "semanal") =>
  encodeExpenseDescription(nombre, { frequency: freq, paymentDay: 5, supplierName: "X" });

describe("claveDeGasto", () => {
  it("ignora la metadata serializada y las tildes", () => {
    const a = claveDeGasto(conMeta("Alquiler local San Martín", "mensual"), 850);
    const b = claveDeGasto(conMeta("alquiler local san martin", "mensual"), 850);
    expect(a).toBe(b);
  });

  it("distinto monto o frecuencia = distinto gasto", () => {
    expect(claveDeGasto(conMeta("Internet", "mensual"), 129.9)).not.toBe(claveDeGasto(conMeta("Internet", "mensual"), 99));
    expect(claveDeGasto(conMeta("Internet", "mensual"), 129.9)).not.toBe(claveDeGasto(conMeta("Internet", "semanal"), 129.9));
  });
});

describe("agruparDuplicados", () => {
  const leer = (g: { description: string; amount: number }) => g;

  it("el catálogo real: 6 filas son 3 gastos", () => {
    const catalogo = [
      { id: 1, description: conMeta("Combustible camioneta delivery", "semanal"), amount: 80 },
      { id: 2, description: conMeta("Internet + cable Movistar", "mensual"), amount: 129.9 },
      { id: 3, description: conMeta("Alquiler local San Martín", "mensual"), amount: 850 },
      { id: 4, description: conMeta("Combustible camioneta delivery", "semanal"), amount: 80 },
      { id: 5, description: conMeta("Internet + cable Movistar", "mensual"), amount: 129.9 },
      { id: 6, description: conMeta("Alquiler local San Martín", "mensual"), amount: 850 },
    ];
    const { unicos, duplicados } = agruparDuplicados(catalogo, leer);
    expect(unicos).toHaveLength(3);
    expect(duplicados).toHaveLength(3);
    expect(duplicados[0].items).toHaveLength(2);
    // Se conserva el primero de cada grupo, no uno al azar.
    expect(unicos.map((u) => u.id)).toEqual([1, 2, 3]);
  });

  it("un catálogo sano no reporta nada", () => {
    const { unicos, duplicados } = agruparDuplicados(
      [
        { id: 1, description: conMeta("Luz", "mensual"), amount: 200 },
        { id: 2, description: conMeta("Agua", "mensual"), amount: 60 },
      ],
      leer,
    );
    expect(unicos).toHaveLength(2);
    expect(duplicados).toHaveLength(0);
  });
});

describe("proximoVencimiento", () => {
  const hoy = new Date("2026-08-10T12:00:00Z"); // lunes 10 de agosto

  it("mensual con el día ya pasado salta al mes siguiente", () => {
    const v = proximoVencimiento({ frequency: "mensual", paymentDay: 5 }, hoy);
    expect(v.estado).toBe("lejos");
    expect(v.dias).toBe(26); // 5 de septiembre
  });

  it("mensual con el día por venir cuenta los días que faltan", () => {
    expect(proximoVencimiento({ frequency: "mensual", paymentDay: 12 }, hoy)).toMatchObject({ estado: "pronto", dias: 2 });
    expect(proximoVencimiento({ frequency: "mensual", paymentDay: 10 }, hoy)).toMatchObject({ estado: "hoy", dias: 0 });
  });

  it("«día 31» en un mes de 30 cae el último día, no se pierde", () => {
    const enSeptiembre = new Date("2026-09-20T12:00:00Z");
    const v = proximoVencimiento({ frequency: "mensual", paymentDay: 31 }, enSeptiembre);
    expect(v.dias).toBe(10); // 30 de septiembre
  });

  it("semanal usa el día de la semana", () => {
    // paymentDay 1 = lunes, y hoy ES lunes.
    expect(proximoVencimiento({ frequency: "semanal", paymentDay: 1 }, hoy)).toMatchObject({ estado: "hoy" });
    // miércoles
    expect(proximoVencimiento({ frequency: "semanal", paymentDay: 3 }, hoy)).toMatchObject({ dias: 2 });
  });

  it("sin frecuencia o sin día no inventa una fecha", () => {
    expect(proximoVencimiento({}, hoy).estado).toBe("sin_fecha");
    expect(proximoVencimiento({ frequency: "mensual" }, hoy).estado).toBe("sin_fecha");
    expect(proximoVencimiento({ frequency: "unico", paymentDay: 5 }, hoy).estado).toBe("sin_fecha");
  });
});

describe("yaPagadoEnPeriodo", () => {
  const hoy = new Date("2026-08-10T12:00:00Z");
  const alquiler = { description: conMeta("Alquiler local San Martín", "mensual"), amount: 850 };

  it("un pago de este mes marca el gasto como pagado", () => {
    const r = yaPagadoEnPeriodo(alquiler, [{ description: "Alquiler local San Martín", amount: 850, date: "2026-08-05T10:00:00Z" }], hoy);
    expect(r.pagado).toBe(true);
    expect(r.fecha).toBe("2026-08-05T10:00:00Z");
  });

  it("el pago del mes pasado no cuenta para éste", () => {
    const r = yaPagadoEnPeriodo(alquiler, [{ description: "Alquiler local San Martín", amount: 850, date: "2026-07-05T10:00:00Z" }], hoy);
    expect(r.pagado).toBe(false);
  });

  it("si el importe cambió, no se da por pagado", () => {
    // El alquiler subió a 900: falta pagar el nuevo, no alcanza el viejo.
    const r = yaPagadoEnPeriodo({ ...alquiler, amount: 900 }, [{ description: "Alquiler local San Martín", amount: 850, date: "2026-08-05T10:00:00Z" }], hoy);
    expect(r.pagado).toBe(false);
  });

  // ADR-374: el pago guarda de qué plantilla salió. Ese vínculo es lo único
  // que sobrevive a que el importe del mes venga distinto — y desde que el
  // Historial de Gastos deja corregir un monto, hace falta de verdad: sin él,
  // corregir S/80 → S/85.50 hacía revivir la tarjeta como «pendiente» y el
  // panel pasaba de «2 de 3 pagados» a «1 de 3» sin que nadie dejara de pagar.
  it("con templateId, un importe distinto sigue contando como el pago del mes", () => {
    const r = yaPagadoEnPeriodo(
      { id: "tpl-1", ...alquiler },
      [{ description: "Alquiler local San Martín", amount: 905.5, date: "2026-08-05T10:00:00Z", templateId: "tpl-1" }],
      hoy,
    );
    expect(r.pagado).toBe(true);
    expect(r.fecha).toBe("2026-08-05T10:00:00Z");
  });

  it("el templateId de OTRA plantilla no cuenta", () => {
    const r = yaPagadoEnPeriodo(
      { id: "tpl-1", ...alquiler },
      [{ description: "Otra cosa", amount: 905.5, date: "2026-08-05T10:00:00Z", templateId: "tpl-2" }],
      hoy,
    );
    expect(r.pagado).toBe(false);
  });

  it("el vínculo tampoco salta de período: el del mes pasado sigue sin contar", () => {
    const r = yaPagadoEnPeriodo(
      { id: "tpl-1", ...alquiler },
      [{ description: "Alquiler local San Martín", amount: 850, date: "2026-07-05T10:00:00Z", templateId: "tpl-1" }],
      hoy,
    );
    expect(r.pagado).toBe(false);
  });

  it("sin pagos registrados devuelve pendiente, no error", () => {
    expect(yaPagadoEnPeriodo(alquiler, [], hoy)).toEqual({ pagado: false, fecha: null });
  });

  it("los períodos semanales se agrupan por semana", () => {
    const combustible = { description: conMeta("Combustible", "semanal"), amount: 80 };
    const estaSemana = yaPagadoEnPeriodo(combustible, [{ description: "Combustible", amount: 80, date: "2026-08-10T08:00:00Z" }], hoy);
    const laPasada = yaPagadoEnPeriodo(combustible, [{ description: "Combustible", amount: 80, date: "2026-08-03T08:00:00Z" }], hoy);
    expect(estaSemana.pagado).toBe(true);
    expect(laPasada.pagado).toBe(false);
  });
});
