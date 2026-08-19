import { describe, expect, it } from "vitest";
import { cuandoVence, proximosVencimientos, totalProximo } from "@/lib/adelantos/proximos-vencimientos";
import type { DbAdelanto } from "@/lib/db/adelantos.db";

const AHORA = new Date("2026-08-04T15:00:00.000Z").getTime();
const enDias = (n: number) => new Date(AHORA + n * 86_400_000).toISOString();

const adel = (p: Partial<DbAdelanto> & { id: string }): DbAdelanto =>
  ({
    tenantId: "t1",
    beneficiarioId: "b1",
    beneficiario: { id: "b1", nombre: "Juan", telefono: "988888888", createdAt: "", activo: true } as never,
    modalidad: "CUENTA_CORRIENTE",
    montoAdelantado: 500,
    moneda: "PEN",
    fechaAdelanto: enDias(-20),
    status: "ABIERTO",
    saldoPendiente: 500,
    totalEntregado: 0,
    entregas: [],
    entregasPactadas: [],
    createdAt: enDias(-20),
    updatedAt: enDias(-20),
    ...p,
  }) as DbAdelanto;

const pactada = (p: { numero: number; fecha: string | null; valor: number; cumplida?: boolean; desc?: string }) =>
  ({
    id: `p${p.numero}`,
    numero: p.numero,
    descripcionEsperada: p.desc ?? `Cuota ${p.numero}`,
    valorEsperado: p.valor,
    fechaEsperada: p.fecha,
    cumplidaEn: p.cumplida ? enDias(-1) : null,
  }) as never;

describe("proximosVencimientos", () => {
  it("agarra la devolución acordada que cae dentro de la ventana", () => {
    const r = proximosVencimientos([adel({ id: "a", fechaVencimiento: enDias(3) })], 7, AHORA);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ concepto: "Devolución acordada", faltan: 3, monto: 500, origen: "adelanto" });
  });

  it("lo que YA venció queda afuera: de eso se ocupa la cobranza", () => {
    // Mezclarlo convertiría el aviso preventivo en otra lista de reclamos.
    expect(proximosVencimientos([adel({ id: "a", fechaVencimiento: enDias(-2) })], 7, AHORA)).toHaveLength(0);
  });

  it("lo que vence después de la ventana tampoco entra", () => {
    expect(proximosVencimientos([adel({ id: "a", fechaVencimiento: enDias(30) })], 7, AHORA)).toHaveLength(0);
  });

  it("lo que vence HOY entra: es el aviso más urgente", () => {
    const r = proximosVencimientos([adel({ id: "a", fechaVencimiento: enDias(0) })], 7, AHORA);
    expect(r[0].faltan).toBe(0);
  });

  it("con cuotas pactadas avisa las CUOTAS, no el adelanto entero", () => {
    // Avisar las dos cosas sería avisar dos veces lo mismo.
    const r = proximosVencimientos(
      [
        adel({
          id: "a",
          fechaVencimiento: enDias(5),
          entregasPactadas: [pactada({ numero: 1, fecha: enDias(2), valor: 200 })],
        }),
      ],
      7,
      AHORA,
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ origen: "cuota", monto: 200, faltan: 2 });
  });

  it("una cuota ya cumplida no vence", () => {
    const r = proximosVencimientos(
      [adel({ id: "a", entregasPactadas: [pactada({ numero: 1, fecha: enDias(2), valor: 200, cumplida: true })] })],
      7,
      AHORA,
    );
    expect(r).toHaveLength(0);
  });

  it("una cuota sin fecha no puede vencer", () => {
    const r = proximosVencimientos(
      [adel({ id: "a", entregasPactadas: [pactada({ numero: 1, fecha: null, valor: 200 })] })],
      7,
      AHORA,
    );
    expect(r).toHaveLength(0);
  });

  it("los liquidados y cancelados no tienen nada por vencer", () => {
    const r = proximosVencimientos(
      [
        adel({ id: "liq", status: "LIQUIDADO", saldoPendiente: 0, fechaVencimiento: enDias(2) }),
        adel({ id: "can", status: "CANCELADO", fechaVencimiento: enDias(2) }),
      ],
      7,
      AHORA,
    );
    expect(r).toHaveLength(0);
  });

  it("ordena por cercanía y, a igual día, por monto", () => {
    const r = proximosVencimientos(
      [
        adel({ id: "lejos", fechaVencimiento: enDias(6) }),
        adel({ id: "chico", fechaVencimiento: enDias(1), saldoPendiente: 100 }),
        adel({ id: "grande", fechaVencimiento: enDias(1), saldoPendiente: 900 }),
      ],
      7,
      AHORA,
    );
    expect(r.map((c) => c.adelantoId)).toEqual(["grande", "chico", "lejos"]);
  });

  it("compara por DÍA, no por hora: algo que vence hoy más temprano sigue venciendo hoy", () => {
    const hoyTemprano = new Date(AHORA);
    hoyTemprano.setHours(6, 0, 0, 0);
    const r = proximosVencimientos([adel({ id: "a", fechaVencimiento: hoyTemprano.toISOString() })], 7, AHORA);
    expect(r).toHaveLength(1);
    expect(r[0].faltan).toBe(0);
  });
});

describe("cuandoVence / totalProximo", () => {
  it("lo dice como se habla", () => {
    expect(cuandoVence(0)).toBe("hoy");
    expect(cuandoVence(1)).toBe("mañana");
    expect(cuandoVence(5)).toBe("en 5 días");
  });

  it("suma lo que se espera cobrar, en céntimos exactos", () => {
    const r = proximosVencimientos(
      [
        adel({ id: "a", fechaVencimiento: enDias(1), saldoPendiente: 33.33 }),
        adel({ id: "b", fechaVencimiento: enDias(2), saldoPendiente: 66.67 }),
      ],
      7,
      AHORA,
    );
    expect(totalProximo(r)).toBe(100);
    expect(totalProximo([])).toBe(0);
  });
});
