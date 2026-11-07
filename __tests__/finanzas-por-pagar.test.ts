/**
 * F10 «Lo que debo» — el armado puro (`lib/finance/por-pagar.ts`).
 *
 * Las fixtures de la cuenta forestal son las filas REALES del tenant `main` al
 * 29-09-2026 (SELECT de sólo lectura): tres partes a su favor que ninguna
 * pantalla de Mi Plata mostraba, S/ 6 279,60 en total.
 */

import { describe, expect, it } from "vitest";
import {
  armarPorPagar, pendienteDeLaCuenta, ordenarPorPagar, ENLACE_LIQUIDAR,
  type AdelantoParaPagar, type CuentaPorPagarEntrada, type EntradaPorPagar, type GrupoAdelanto,
} from "@/lib/finance/por-pagar";
import { unificarCuentas, type BeneficiarioParaUnificar } from "@/lib/adelantos/cuenta-unificada";
import type { MovimientoCuenta } from "@/lib/forestal/cuenta-corriente";

const HOY = "2026-09-29";

let n = 0;
const mov = (m: Partial<MovimientoCuenta> & Pick<MovimientoCuenta, "parteId" | "fecha" | "tipo" | "concepto" | "monto">): MovimientoCuenta => ({
  id: m.id ?? `m${++n}`,
  parteNombre: m.parteNombre ?? m.parteId,
  moneda: "PEN",
  referencia: null,
  fleteId: null,
  notas: null,
  gtfNumber: null,
  ...m,
});

/* Las filas de `main` (fecha como la devuelve Prisma: UTC). */
const SAN_LUIS = "cmsbyql6000004kvz24tmfpb0";
const QA_PLATA = "cmuio6fbq0036ivvzt6csslwj";
const QA_B2 = "cmuimft6o0004ivvzp25mauiu";
const MOVS_MAIN: MovimientoCuenta[] = [
  mov({ parteId: SAN_LUIS, parteNombre: "COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI", fecha: "2026-07-30T20:15:53.176Z", tipo: "abono", concepto: "madera", monto: 7466, gtfNumber: "019-0000003" }),
  mov({ parteId: SAN_LUIS, parteNombre: "COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI", fecha: "2026-09-26T00:00:00.000Z", tipo: "cargo", concepto: "pago_hecho", monto: 2986.4, gtfNumber: "019-0000003" }),
  mov({ parteId: QA_B2, parteNombre: "qa.b2.adr437 Proveedor guias", fecha: "2026-08-01T00:00:00.000Z", tipo: "abono", concepto: "madera", monto: 500, gtfNumber: "QA-B2-GTF-A" }),
  mov({ parteId: QA_B2, parteNombre: "qa.b2.adr437 Proveedor guias", fecha: "2026-08-10T00:00:00.000Z", tipo: "abono", concepto: "madera", monto: 300, gtfNumber: "QA-B2-GTF-B" }),
  mov({ id: "qa-aserrio", parteId: QA_PLATA, parteNombre: "QA plata backend 0926 o6eq7", fecha: "2026-09-26T00:00:00.000Z", tipo: "abono", concepto: "aserrio_recibido", monto: 1000 }),
  mov({ parteId: QA_PLATA, parteNombre: "QA plata backend 0926 o6eq7", fecha: "2026-09-26T00:00:00.000Z", tipo: "cargo", concepto: "pago_hecho", monto: 1000 }),
  mov({ parteId: QA_PLATA, parteNombre: "QA plata backend 0926 o6eq7", fecha: "2026-09-26T00:00:00.000Z", tipo: "cargo", concepto: "pago_hecho", monto: 500, gtfNumber: "QA-BK-o6eq7-G1" }),
  mov({ parteId: QA_PLATA, parteNombre: "QA plata backend 0926 o6eq7", fecha: "2026-09-26T17:34:43.229Z", tipo: "abono", concepto: "madera", monto: 1500, gtfNumber: "QA-BK-o6eq7-G1" }),
];

const benef = (id: string, extra: Partial<BeneficiarioParaUnificar> = {}): BeneficiarioParaUnificar => ({
  id, nombre: `Persona ${id}`, documento: null, telefono: null, forestPartyId: null, ...extra,
});

const adelanto = (a: Partial<AdelantoParaPagar> & Pick<AdelantoParaPagar, "id" | "beneficiarioId" | "direccion" | "status" | "saldoPendiente">): AdelantoParaPagar => ({
  beneficiarioNombre: null, codigoOperacion: null, reciboManual: null, conceptoRecibido: null,
  moneda: "PEN", fechaAdelanto: "2026-09-01", fechaVencimiento: null, ...a,
});

/** Arma la entrada como lo hace la DB class: la unión sale de `unificarCuentas`. */
function entrada(e: {
  beneficiarios?: BeneficiarioParaUnificar[];
  grupos?: GrupoAdelanto[];
  adelantos?: AdelantoParaPagar[];
  movimientos?: MovimientoCuenta[];
  cuentasPorPagar?: CuentaPorPagarEntrada[];
  prestamos?: EntradaPorPagar["prestamos"];
}): EntradaPorPagar {
  const grupos = e.grupos ?? [];
  return {
    hoy: HOY,
    personas: unificarCuentas({
      beneficiarios: e.beneficiarios ?? [],
      adelantos: grupos.map((g) => ({ ...g, cantidad: 1 })),
      partes: [],
      movimientos: e.movimientos ?? [],
    }),
    grupos,
    adelantos: e.adelantos ?? [],
    cuentasPorPagar: e.cuentasPorPagar ?? [],
    prestamos: e.prestamos ?? [],
  };
}

describe("pendienteDeLaCuenta: lo que la cuenta de una parte todavía no pagó", () => {
  it("un pago imputado a una guía cubre ESA guía; el suelto, lo más viejo (QA plata de main)", () => {
    const tramos = pendienteDeLaCuenta(MOVS_MAIN.filter((m) => m.parteId === QA_PLATA));
    // aserrío 1 000 (lo cubre el pago suelto) · guía G1 1 500 − 500 imputados = 1 000 pendientes
    expect(tramos).toEqual([{ concepto: "madera", monto: 1000, fecha: "2026-09-26", gtfNumber: "QA-BK-o6eq7-G1" }]);
  });

  it("sin imputación, el pago cubre primero lo más viejo", () => {
    const tramos = pendienteDeLaCuenta([
      mov({ parteId: "p", fecha: "2026-09-01", tipo: "abono", concepto: "aserrio_recibido", monto: 1000 }),
      mov({ parteId: "p", fecha: "2026-09-10", tipo: "abono", concepto: "madera", monto: 1500 }),
      mov({ parteId: "p", fecha: "2026-09-20", tipo: "cargo", concepto: "pago_hecho", monto: 500 }),
    ]);
    expect(tramos.map((t) => [t.concepto, t.monto])).toEqual([["aserrio_recibido", 500], ["madera", 1500]]);
  });

  it("un pago de una guía más nueva no se come el aserrío viejo", () => {
    const tramos = pendienteDeLaCuenta([
      mov({ parteId: "p", fecha: "2026-09-01", tipo: "abono", concepto: "aserrio_recibido", monto: 1000 }),
      mov({ parteId: "p", fecha: "2026-09-10", tipo: "abono", concepto: "madera", monto: 1500, gtfNumber: "G2" }),
      mov({ parteId: "p", fecha: "2026-09-20", tipo: "cargo", concepto: "pago_hecho", monto: 1500, gtfNumber: "G2" }),
    ]);
    expect(tramos.map((t) => [t.concepto, t.monto])).toEqual([["aserrio_recibido", 1000]]);
  });

  it("si los cargos cubren todo no queda nada, y la suma es siempre abonos − cargos", () => {
    expect(pendienteDeLaCuenta([
      mov({ parteId: "p", fecha: "2026-09-01", tipo: "abono", concepto: "madera", monto: 300 }),
      mov({ parteId: "p", fecha: "2026-09-02", tipo: "cargo", concepto: "venta", monto: 450 }),
    ])).toEqual([]);
    const movs = [
      mov({ parteId: "p", fecha: "2026-09-01", tipo: "abono", concepto: "madera", monto: 0.1 }),
      mov({ parteId: "p", fecha: "2026-09-02", tipo: "abono", concepto: "aserrio_recibido", monto: 0.2 }),
      mov({ parteId: "p", fecha: "2026-09-03", tipo: "cargo", concepto: "pago_hecho", monto: 0.05 }),
    ];
    const suma = pendienteDeLaCuenta(movs).reduce((s, t) => s + t.monto, 0);
    expect(Math.round(suma * 100) / 100).toBe(0.25);
  });
});

describe("armarPorPagar", () => {
  it("las tres partes de main a su favor: S/ 6 279,60, cada una con su guía", () => {
    const d = armarPorPagar(entrada({ movimientos: MOVS_MAIN }));
    expect(d.totales).toEqual([{ moneda: "PEN", total: 6279.6, cuentas: 3, partidas: 3, vencido: 0, cruzable: 0 }]);
    expect(d.personas.map((p) => [p.nombre, p.debes[0].monto])).toEqual([
      ["COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI", 4479.6],
      ["QA plata backend 0926 o6eq7", 1000],
      ["qa.b2.adr437 Proveedor guias", 800],
    ]);
    expect(d.personas[0].partidas[0]).toMatchObject({ fuente: "cuenta_forestal", nota: "Madera recibida · guía 019-0000003", desde: "2026-07-30" });
    expect(d.personas[2].partidas[0].nota).toBe("Madera recibida · guías QA-B2-GTF-A, QA-B2-GTF-B");
  });

  it("el aserrío recibido se DESGLOSA del saldo de la parte, nunca se suma aparte", () => {
    const d = armarPorPagar(entrada({
      movimientos: [
        mov({ parteId: "p", parteNombre: "Aserradero vecino", fecha: "2026-09-01", tipo: "abono", concepto: "aserrio_recibido", monto: 400 }),
        mov({ parteId: "p", parteNombre: "Aserradero vecino", fecha: "2026-09-05", tipo: "abono", concepto: "madera", monto: 600 }),
      ],
    }));
    expect(d.totales[0].total).toBe(1000); // = −saldo de la parte, no 1 400
    expect(d.porFuente).toEqual([
      { fuente: "aserrio_recibido", moneda: "PEN", total: 400, count: 1 },
      { fuente: "cuenta_forestal", moneda: "PEN", total: 600, count: 1 },
    ]);
    expect(d.personas).toHaveLength(1);
    // Dentro de la fila, sin plazo: de mayor a menor.
    expect(d.personas[0].partidas.map((x) => x.fuente)).toEqual(["cuenta_forestal", "aserrio_recibido"]);
  });

  it("una parte que TE debe no entra (eso es «Por cobrar»)", () => {
    const d = armarPorPagar(entrada({
      movimientos: [mov({ parteId: "w", parteNombre: "WASACO", fecha: "2026-09-01", tipo: "cargo", concepto: "aserrio_prestado", monto: 12323.02 })],
    }));
    expect(d.personas).toEqual([]);
    expect(d.totales).toEqual([]);
  });

  it("adelantos: el recibido abierto y el dado excedido son deuda tuya; cancelado y liquidado no", () => {
    const d = armarPorPagar(entrada({
      beneficiarios: [benef("b1", { nombre: "Wasaco" })],
      adelantos: [
        adelanto({ id: "a1", beneficiarioId: "b1", direccion: "RECIBIDO", conceptoRecibido: "SERVICIO", status: "ABIERTO", saldoPendiente: 1731, codigoOperacion: "ADL-2026-0003", fechaVencimiento: "2026-09-20" }),
        adelanto({ id: "a2", beneficiarioId: "b1", direccion: "DADO", status: "EXCEDIDO", saldoPendiente: -120 }),
        adelanto({ id: "a3", beneficiarioId: "b1", direccion: "RECIBIDO", conceptoRecibido: "PRESTAMO", status: "CANCELADO", saldoPendiente: 900 }),
        adelanto({ id: "a4", beneficiarioId: "b1", direccion: "RECIBIDO", conceptoRecibido: "PRESTAMO", status: "LIQUIDADO", saldoPendiente: 0 }),
      ],
      grupos: [
        { beneficiarioId: "b1", status: "ABIERTO", moneda: "PEN", direccion: "RECIBIDO", saldoPendiente: 1731 },
        { beneficiarioId: "b1", status: "EXCEDIDO", moneda: "PEN", direccion: "DADO", saldoPendiente: -120 },
      ],
    }));
    const [p] = d.personas;
    expect(p.nombre).toBe("Wasaco");
    expect(p.partidas.map((x) => [x.id, x.fuente, x.monto])).toEqual([
      ["a1", "adelanto_recibido", 1731],
      ["a2", "adelanto_excedido", 120],
    ]);
    expect(p.partidas[0].nota).toBe("ADL-2026-0003 · Adelanto por un servicio que darás");
    expect(p.vencido).toBe(true);
    expect(d.totales[0]).toMatchObject({ total: 1851, vencido: 1731 });
    expect(p.teDebe).toEqual([]);
    expect(p.liquidar).toBeNull();
  });

  it("deuda en las dos direcciones: lista lo que le debes, con su neto y Liquidar — el MISMO neto que «Cuenta por persona»", () => {
    const e = entrada({
      beneficiarios: [benef("b1", { nombre: "Don Julio" })],
      adelantos: [adelanto({ id: "r1", beneficiarioId: "b1", direccion: "RECIBIDO", conceptoRecibido: "PRESTAMO", status: "ABIERTO", saldoPendiente: 3000 })],
      grupos: [
        { beneficiarioId: "b1", status: "ABIERTO", moneda: "PEN", direccion: "RECIBIDO", saldoPendiente: 3000 },
        { beneficiarioId: "b1", status: "ABIERTO", moneda: "PEN", direccion: "DADO", saldoPendiente: 500 },
      ],
    });
    const d = armarPorPagar(e);
    const [p] = d.personas;
    expect(p.debes).toEqual([{ moneda: "PEN", monto: 3000 }]);
    expect(p.teDebe).toEqual([{ moneda: "PEN", monto: 500 }]);
    expect(p.neto).toEqual([{ moneda: "PEN", monto: -2500 }]);
    expect(p.liquidar).toEqual(ENLACE_LIQUIDAR);
    // Lo que te debe NO resta del total: cada lista suma su lado; lo cruzable lo dice aparte.
    expect(d.totales[0].total).toBe(3000);
    expect(d.totales[0].cruzable).toBe(500);
    expect(p.neto[0].monto).toBe(e.personas.find((x) => x.beneficiarioId === "b1")?.neto);
  });

  it("la cuenta forestal de su parte vinculada entra en la misma fila y en el neto", () => {
    const e = entrada({
      beneficiarios: [benef("b1", { nombre: "Wasaco", forestPartyId: "w" })],
      adelantos: [adelanto({ id: "r1", beneficiarioId: "b1", direccion: "RECIBIDO", conceptoRecibido: "SERVICIO", status: "ABIERTO", saldoPendiente: 3031 })],
      grupos: [{ beneficiarioId: "b1", status: "ABIERTO", moneda: "PEN", direccion: "RECIBIDO", saldoPendiente: 3031 }],
      movimientos: [mov({ parteId: "w", parteNombre: "WASACO", fecha: "2026-09-01", tipo: "cargo", concepto: "aserrio_prestado", monto: 12323.02 })],
    });
    const d = armarPorPagar(e);
    expect(d.personas).toHaveLength(1);
    expect(d.personas[0]).toMatchObject({
      debes: [{ moneda: "PEN", monto: 3031 }],
      teDebe: [{ moneda: "PEN", monto: 12323.02 }],
      neto: [{ moneda: "PEN", monto: 9292.02 }],
    });
    expect(d.personas[0].neto[0].monto).toBe(e.personas[0].neto);
  });

  it("monedas: nunca se mezclan", () => {
    const d = armarPorPagar(entrada({
      beneficiarios: [benef("b1")],
      adelantos: [adelanto({ id: "u1", beneficiarioId: "b1", direccion: "RECIBIDO", conceptoRecibido: "PRESTAMO", status: "ABIERTO", saldoPendiente: 100, moneda: "USD" })],
      grupos: [{ beneficiarioId: "b1", status: "ABIERTO", moneda: "USD", direccion: "RECIBIDO", saldoPendiente: 100 }],
      cuentasPorPagar: [{ id: "c1", supplierId: "s1", supplierName: "Ferretería", description: null, amount: 250, paidAmount: 0, status: "pendiente", vence: null, desde: null }],
    }));
    expect(d.totales.map((t) => [t.moneda, t.total])).toEqual([["PEN", 250], ["USD", 100]]);
    expect(d.personas.find((p) => p.clave === "benef:b1")?.debes).toEqual([{ moneda: "USD", monto: 100 }]);
  });

  it("cuentas por pagar: el saldo neto por proveedor; lo pagado no entra", () => {
    const d = armarPorPagar(entrada({
      cuentasPorPagar: [
        { id: "c1", supplierId: "s1", supplierName: "", description: "Clavos", amount: 1000, paidAmount: 700, status: "parcial", vence: "2026-10-05", desde: "2026-09-01" },
        { id: "c2", supplierId: "s1", supplierName: "Ferretería Lucho", description: null, amount: 200, paidAmount: 0, status: "pendiente", vence: "2026-10-01", desde: "2026-09-02" },
        { id: "c3", supplierId: "s1", supplierName: "Ferretería Lucho", description: null, amount: 500, paidAmount: 500, status: "pagado", vence: "2026-09-01", desde: "2026-08-01" },
      ],
    }));
    expect(d.personas).toHaveLength(1);
    expect(d.personas[0]).toMatchObject({ clave: "proveedor:s1", nombre: "Ferretería Lucho", tipo: "proveedor", vence: "2026-10-01", vencido: false, liquidar: null });
    expect(d.personas[0].partidas.map((x) => [x.id, x.monto])).toEqual([["c2", 200], ["c1", 300]]);
    expect(d.totales[0].total).toBe(500);
  });

  it("préstamos que te hicieron: las cuotas sin pagar y la próxima que vence", () => {
    const d = armarPorPagar(entrada({
      prestamos: [{ id: "pr1", nombre: "Caja Maynas", moneda: "PEN", desde: "2026-06-01", cuotas: [{ monto: 450.5, vence: "2026-10-15" }, { monto: 450.5, vence: "2026-09-15" }] }],
    }));
    expect(d.personas[0]).toMatchObject({ nombre: "Caja Maynas", tipo: "entidad", vence: "2026-09-15", vencido: true });
    expect(d.personas[0].partidas[0]).toMatchObject({ fuente: "prestamo_recibido", monto: 901, nota: "2 cuotas sin pagar" });
  });

  it("orden: lo vencido primero, después lo que vence pronto, al final lo sin plazo de mayor a menor", () => {
    const d = armarPorPagar(entrada({
      movimientos: [mov({ parteId: "grande", parteNombre: "Sin plazo grande", fecha: "2026-09-01", tipo: "abono", concepto: "madera", monto: 9000 })],
      cuentasPorPagar: [
        { id: "c1", supplierId: "pronto", supplierName: "Vence pronto", description: null, amount: 10, paidAmount: 0, status: "pendiente", vence: "2026-10-02", desde: null },
        { id: "c2", supplierId: "viejo", supplierName: "Vencido", description: null, amount: 5, paidAmount: 0, status: "pendiente", vence: "2026-09-01", desde: null },
      ],
    }));
    expect(d.personas.map((p) => p.nombre)).toEqual(["Vencido", "Vence pronto", "Sin plazo grande"]);
    expect(ordenarPorPagar([...d.personas].reverse(), HOY).map((p) => p.nombre)).toEqual(["Vencido", "Vence pronto", "Sin plazo grande"]);
  });
});
