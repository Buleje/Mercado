/**
 * Conciliación de retiros (17-10, P34/P35/P36): la nota del retiro separada en
 * medio / N.° de operación / motivo, las alertas (que avisan y nunca deciden),
 * los N.° ya usados, el rango de días de Lima y el CSV.
 */
import { describe, it, expect } from "vitest";
import {
  alertasDeRetiros,
  csvDeRetiros,
  filtrosRetirosSchema,
  leerNotaRetiro,
  normalizarReferencia,
  rangoLima,
  referenciasUsadas,
  type RetiroParaAlertas,
} from "@/lib/delivery/retiros-conciliacion";

const ahora = new Date("2026-10-17T15:00:00.000Z");
const hace = (horas: number) => new Date(ahora.getTime() - horas * 3_600_000);

function fila(id: string, extra: Partial<RetiroParaAlertas> = {}): RetiroParaAlertas {
  return { id, partnerId: "p1", partnerName: "Juan", amount: 50, status: "paid", note: "Efectivo", createdAt: hace(30), resolvedAt: hace(2), ...extra };
}

describe("leerNotaRetiro", () => {
  it("separa medio, caja y N.° de operación de un pago", () => {
    expect(leerNotaRetiro("paid", "Yape (de la caja) · OP 123")).toEqual({ metodo: "Yape", deCaja: true, referencia: "OP 123", motivo: null, libre: null });
    expect(leerNotaRetiro("paid", "Efectivo")).toMatchObject({ metodo: "Efectivo", deCaja: false, referencia: null });
  });
  it("rechazo = motivo; pago deshecho = su motivo; nota vieja = libre", () => {
    expect(leerNotaRetiro("rejected", "No trabajó esa semana").motivo).toBe("No trabajó esa semana");
    expect(leerNotaRetiro("approved", "Pago deshecho: se pagó al otro Juan").motivo).toBe("se pagó al otro Juan");
    expect(leerNotaRetiro("paid", "pagado a mano").libre).toBe("pagado a mano");
    expect(leerNotaRetiro("paid", null)).toMatchObject({ metodo: null, libre: null });
  });
});

describe("alertasDeRetiros: avisan, no deciden", () => {
  it("el mismo N.° de operación en dos pagos (escrito distinto) es una alerta con las dos filas", () => {
    const a = alertasDeRetiros([fila("a", { note: "Yape · OP-123" }), fila("b", { note: "Yape · op 123", partnerId: "p2", partnerName: "Rosa", amount: 30 })], ahora);
    const ref = a.find((x) => x.tipo === "referencia-repetida");
    expect(ref?.ids).toEqual(["a", "b"]);
    expect(ref?.partnerId).toBeNull();
    expect(ref?.clave).toBe("ref:op123");
  });

  it("mismo repartidor y monto en menos de 24 h = alerta; con 30 h de distancia no", () => {
    const juntos = alertasDeRetiros([fila("a", { resolvedAt: hace(2) }), fila("b", { resolvedAt: hace(10) })], ahora);
    expect(juntos.filter((x) => x.tipo === "mismo-monto")).toHaveLength(1);
    const lejos = alertasDeRetiros([fila("a", { resolvedAt: hace(2) }), fila("b", { resolvedAt: hace(32) })], ahora);
    expect(lejos.filter((x) => x.tipo === "mismo-monto")).toHaveLength(0);
  });

  it("espera de más de 3 días y pagos por Yape sin N.° de operación", () => {
    const a = alertasDeRetiros(
      [
        fila("viejo", { status: "pending", note: null, createdAt: hace(24 * 4), resolvedAt: null }),
        fila("nuevo", { status: "pending", note: null, createdAt: hace(5), resolvedAt: null }),
        fila("sinref", { note: "Yape", amount: 20 }),
        fila("efectivo", { note: "Efectivo", amount: 15 }),
      ],
      ahora,
    );
    expect(a.find((x) => x.tipo === "espera-larga")?.ids).toEqual(["viejo"]);
    expect(a.find((x) => x.tipo === "sin-referencia")?.ids).toEqual(["sinref"]);
  });

  it("no toca las filas que recibe", () => {
    const filas = [fila("a", { note: "Yape · 123456" }), fila("b", { note: "Yape · 123456" })];
    const copia = JSON.parse(JSON.stringify(filas));
    alertasDeRetiros(filas, ahora);
    expect(JSON.parse(JSON.stringify(filas))).toEqual(copia);
  });
});

describe("referenciasUsadas (aviso al pagar con un N.° ya usado)", () => {
  it("sólo pagados con N.° de 3 caracteres o más, normalizados", () => {
    const r = referenciasUsadas([
      fila("a", { note: "Yape · OP 99-1" }),
      fila("b", { note: "Yape · 12" }),
      fila("c", { status: "rejected", note: "Yape · 777" }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ referencia: "op991", partnerName: "Juan", amount: 50 });
    expect(normalizarReferencia("OP 99-1")).toBe(r[0].referencia);
  });
});

describe("filtros y rango de días de Lima", () => {
  it("«desde» después de «hasta» no pasa; un filtro inventado tampoco", () => {
    expect(filtrosRetirosSchema.safeParse({ desde: "2026-10-15", hasta: "2026-10-01" }).success).toBe(false);
    expect(filtrosRetirosSchema.safeParse({ historial: "todo" }).success).toBe(false);
    expect(filtrosRetirosSchema.safeParse({ desde: "2026-10-01", hasta: "2026-10-01" }).success).toBe(true);
  });
  it("el día de Lima va de las 05:00 UTC a las 05:00 UTC del día siguiente", () => {
    expect(rangoLima("2026-10-01", "2026-10-15")).toEqual({
      gte: new Date("2026-10-01T05:00:00.000Z"),
      lt: new Date("2026-10-16T05:00:00.000Z"),
    });
    expect(rangoLima(null, null)).toEqual({});
  });
});

describe("csvDeRetiros", () => {
  it("cabecera fija, punto y coma, hora de Lima y comillas cuando hacen falta", () => {
    const csv = csvDeRetiros([
      { ...fila("a", { note: "Yape (de la caja) · OP 1", resolvedAt: new Date("2026-10-17T19:05:00.000Z"), createdAt: new Date("2026-10-17T13:00:00.000Z") }), partnerPhone: "999", yapeNumber: "999" },
      { ...fila("b", { status: "rejected", note: 'Dijo "no"; otra vez' }), partnerPhone: "988", yapeNumber: "" },
    ]);
    const [cabecera, uno, dos] = csv.split("\r\n");
    expect(cabecera.startsWith("Pidió;Resuelto;Repartidor")).toBe(true);
    expect(uno).toBe("2026-10-17 08:00;2026-10-17 14:05;Juan;999;999;Pagado;50.00;Yape;Sí;OP 1;;");
    expect(dos).toContain('Rechazado;50.00;;;;"Dijo ""no""; otra vez";');
  });
});
