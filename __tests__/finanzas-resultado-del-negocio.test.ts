/**
 * ADR-451 — Resultado y caja del aserradero: la función pura.
 *
 * El fixture de Blas son los 32 cargos de aserrío VIVOS, congelados de la base
 * real el 29-09-2026 (sólo lectura): lineNo, día guardado (00:00 UTC), monto,
 * PT de la cotización, parte y especie. Resultado mostraba S/ 0 con esto afuera.
 */

import { describe, expect, it } from "vitest";
import {
  armarCaja,
  armarResultado,
  armarSerie,
  claseDeFlete,
  detalleDeCaja,
  detalleDeResultado,
  FUENTES_COSTO,
  FUENTES_ENTRO,
  FUENTES_INGRESO,
  FUENTES_SALIO,
  loQueViene,
  mesDeFecha,
  diaDeFecha,
  esMesDelNegocio,
  ventasDeMadera,
  type DespachoEntrada,
  type EntradaCaja,
  type EntregaEntrada,
  type EntradaResultado,
  type MovCuentaEntrada,
} from "@/lib/finance/resultado-del-negocio";

// [lineNo, día guardado, monto, pt, parte, especie] — Blas, 29-09-2026.
const BLAS: [number, string, number, number | null, string, string][] = [
  [30, "2026-09-07", 271.5, 542.99, "WASACO", "Panguana"], [31, "2026-09-07", 111.69, 223.34, "WASACO", "Mashonaste"],
  [32, "2026-09-07", 465.8, 931.49, "WASACO", "Cachimbo"], [33, "2026-09-07", 125.01, 250, "WASACO", "Tacho"],
  [34, "2026-09-07", 172.89, 345.75, "WASACO", "Copal"], [35, "2026-09-07", 472.71, 945.33, "WASACO", "Cumala"],
  [37, "2026-09-08", 293.4, 586.75, "WASACO", "Copal"], [38, "2026-09-08", 878.24, 1756.35, "WASACO", "Cachimbo"],
  [39, "2026-09-09", 401.59, 803.08, "WASACO", "Cachimbo"], [40, "2026-09-09", 368.96, 737.84, "WASACO", "Copal"],
  [41, "2026-09-09", 323.16, 646.25, "WASACO", "Shimbillo"], [42, "2026-09-09", 153.41, 306.75, "WASACO", "Cumala"],
  [43, "2026-09-09", 143.76, 287.51, "WASACO", "Huayruro Negro"], [44, "2026-09-09", 65.01, 130, "WASACO", "Panguana"],
  [45, "2026-09-10", 958.01, 1915.87, "WASACO", "Panguana"], [46, "2026-09-10", 606.94, 1213.79, "WASACO", "Pashaco"],
  [47, "2026-09-10", 118, 236, "WASACO", "Huayruro Negro"], [48, "2026-09-10", 253.5, 507, "WASACO", "Cachimbo"],
  [49, "2026-09-11", 1152.46, 2304.72, "WASACO", "Pashaco"], [50, "2026-09-11", 308.77, 617.5, "WASACO", "Panguana"],
  [51, "2026-09-11", 218.99, 437.93, "WASACO", "Machimango"], [52, "2026-09-12", 454.74, 909.41, "WASACO", "Panguana"],
  [53, "2026-09-12", 166.95, 333.83, "WASACO", "Machimango"], [54, "2026-09-21", 131.9, 263.76, "WASACO", "Cachimbo"],
  [55, "2026-09-21", 421.53, 842.99, "WASACO", "Mashonaste"], [56, "2026-09-21", 53.84, 107.67, "WASACO", "Copaiba"],
  [57, "2026-09-21", 59.63, 119.25, "WASACO", "Huayruro Negro"], [58, "2026-09-22", 239, 478, "WASACO", "Huayruro Negro"],
  [59, "2026-09-22", 254.7, 509.33, "WASACO", "Mashonaste"], [60, "2026-09-22", 139.26, 278.5, "WASACO", "Copaiba"],
  [64, "2026-09-28", 1268.83, 2537.44, "WASACO", "MADERA DURA"], [63, "2026-10-02", 1268.84, 2537.45, "WASACO", "MADERA DURA"],
];

const r2 = (n: number) => Math.round(n * 100) / 100;
const utc = (dia: string) => new Date(`${dia}T00:00:00.000Z`);

function vacia(hoy = "2026-09-29"): EntradaResultado {
  return {
    hoy, ventas: [], pedidos: [], cuenta: [], corridas: [], despachos: [], fletes: [], gastos: [],
    planillas: {}, compras: [], mesesCerrados: [],
  };
}

function mov(p: Partial<MovCuentaEntrada> & Pick<MovCuentaEntrada, "id" | "concepto" | "tipo" | "monto" | "fecha">): MovCuentaEntrada {
  return { parteId: "p1", parteNombre: "WASACO", moneda: "PEN", referencia: null, ctpEntryId: null, liquidacionId: null, gtfNumber: null, ...p };
}

function blas(): EntradaResultado {
  return {
    ...vacia(),
    cuenta: BLAS.map(([lineNo, dia, monto, , parte]) =>
      mov({ id: `mov-${lineNo}`, fecha: utc(dia), tipo: "cargo", concepto: "aserrio_prestado", monto, parteNombre: parte, ctpEntryId: `c-${lineNo}` }),
    ),
    corridas: BLAS.map(([lineNo, , , pt, , especie]) => ({ id: `c-${lineNo}`, lineNo, especie, pt, m3: null, viva: true })),
  };
}

const renglon = (r: ReturnType<typeof armarResultado>, fuente: string) =>
  [...r.ingresos, ...r.costos].find((x) => x.fuente === fuente)!;

function despacho(p: Partial<DespachoEntrada> & Pick<DespachoEntrada, "id">): DespachoEntrada {
  return {
    lineNo: 1, producto: "Aserrada · Tornillo", gtfSalida: null, valorVenta: null, cogs: null, margen: null, margenPct: null,
    moneda: "PEN", motivo: "ok", fecha: "2026-09-15T00:00:00.000Z", ...p,
  };
}

function cajaVacia(): EntradaCaja {
  return {
    ventas: [], cuotasFiado: [], pedidos: [], cuenta: [], liquidaciones: [], adelantos: [], codigosAdelanto: [], cajaDeLiquidaciones: [],
    gastos: [], fletes: [], movimientosCaja: [], entregas: [],
  };
}

describe("Blas: el aserrío entra al resultado, cada cargo en su mes", () => {
  it("setiembre 11 054,18 + octubre 1 268,84 = 12 323,02 (los 32 cargos vivos)", () => {
    const e = blas();
    const sep = renglon(armarResultado("2026-09", e), "aserrio");
    const oct = renglon(armarResultado("2026-10", e), "aserrio");
    expect(sep.monto).toBe(11054.18);
    expect(sep.cuantos).toBe(31);
    expect(oct.monto).toBe(1268.84);
    expect(oct.cuantos).toBe(1);
    expect(r2(sep.monto! + oct.monto!)).toBe(12323.02);
    expect(r2(BLAS.reduce((a, b) => a + b[2], 0))).toBe(12323.02);
    // El PT sale de la cotización de cada corrida, no se inventa.
    expect(sep.pt).toBe(r2(BLAS.filter((b) => b[1] < "2026-10").reduce((a, b) => a + (b[3] ?? 0), 0)));
    expect(sep.certeza).toBe("medido");
  });

  it("el resultado de setiembre ya no es 0: es el aserrío (sin costos cargados)", () => {
    const r = armarResultado("2026-09", blas());
    expect(r.totalIngresos).toBe(11054.18);
    expect(r.resultado).toBe(11054.18);
    expect(r.estimado).toBe(false);
  });

  it("con hoy = 29-09 la corrida N° 63 del 02/10 avisa en setiembre (mes en curso) y en octubre", () => {
    const e = blas();
    const avisoSep = armarResultado("2026-09", e).avisos.find((a) => a.codigo === "fecha_futura");
    const avisoOct = armarResultado("2026-10", e).avisos.find((a) => a.codigo === "fecha_futura");
    expect(avisoSep?.texto).toContain("Corrida N° 63");
    expect(avisoSep?.texto).toContain("02/10");
    expect(avisoSep?.texto).toContain("octubre");
    expect(avisoOct?.cuantos).toBe(1);
    // Agosto no es el mes en curso ni tiene cargos futuros: no avisa.
    expect(armarResultado("2026-08", e).avisos.some((a) => a.codigo === "fecha_futura")).toBe(false);
  });

  it("la serie de 3 meses da ago 0 · set 11 054,18 · oct 1 268,84", () => {
    const serie = armarSerie(["2026-08", "2026-09", "2026-10"], blas());
    expect(serie.map((p) => p.ingresos)).toEqual([0, 11054.18, 1268.84]);
  });

  it("el cargo de una corrida anulada no suma", () => {
    const e = blas();
    e.corridas = e.corridas.map((c) => (c.lineNo === 64 ? { ...c, viva: false } : c));
    expect(renglon(armarResultado("2026-09", e), "aserrio").monto).toBe(r2(11054.18 - 1268.83));
  });
});

describe("corte de mes (calendario de Lima)", () => {
  it("un cargo del 01/10 a las 00:00 UTC cae en octubre; una venta a las 22:00 de Lima del 30/09 cae en setiembre", () => {
    const e = vacia("2026-10-15");
    e.cuenta = [mov({ id: "m1", fecha: utc("2026-10-01"), tipo: "cargo", concepto: "aserrio_prestado", monto: 100 })];
    e.ventas = [{ id: "s1", createdAt: new Date("2026-10-01T03:00:00.000Z"), total: 40, totalCogs: 20, payment: "efectivo" }];
    const sep = armarResultado("2026-09", e);
    const oct = armarResultado("2026-10", e);
    expect(renglon(sep, "aserrio").monto).toBe(0);
    expect(renglon(oct, "aserrio").monto).toBe(100);
    expect(renglon(sep, "mostrador").monto).toBe(40);
    expect(renglon(oct, "mostrador").monto).toBe(0);
  });

  it("mesDeFecha: medianoche UTC es fecha de calendario; otra hora es un instante de Lima", () => {
    expect(mesDeFecha("2026-10-01T00:00:00.000Z")).toBe("2026-10");
    expect(mesDeFecha("2026-10-01T03:00:00.000Z")).toBe("2026-09");
    expect(mesDeFecha("2026-09-15")).toBe("2026-09");
    expect(diaDeFecha(new Date("2026-09-30T23:30:00.000-05:00"))).toBe("2026-09-30");
    expect(mesDeFecha(null)).toBe("");
    expect(mesDeFecha("no es fecha")).toBe("");
  });
});

describe("madera vendida", () => {
  it("la misma guía en la cuenta y en el despacho se cuenta UNA vez (manda la cuenta)", () => {
    const e = vacia();
    e.despachos = [despacho({ id: "d1", lineNo: 7, gtfSalida: "19-001/7 000065", valorVenta: 5000, cogs: 3000 })];
    e.cuenta = [mov({ id: "v1", fecha: utc("2026-09-16"), tipo: "cargo", concepto: "venta", monto: 5200, referencia: "19-001/7  000065", parteNombre: "MADERERA SAC" })];
    const r = armarResultado("2026-09", e);
    const venta = renglon(r, "madera_vendida");
    expect(venta.monto).toBe(5200);
    expect(venta.cuantos).toBe(1);
    expect(renglon(r, "costo_madera").monto).toBe(3000);
    expect(r.resultado).toBe(2200);
  });

  it("la madera de servicio no es venta ni «sin precio»; un despacho propio sin precio sí falta", () => {
    const e = vacia();
    e.despachos = [
      despacho({ id: "d1", gtfSalida: "G-1", motivo: "madera_de_servicio" }),
      despacho({ id: "d2", gtfSalida: "G-2", motivo: "sin_venta", cogs: 800 }),
    ];
    const r = armarResultado("2026-09", e);
    const venta = renglon(r, "madera_vendida");
    expect(venta.monto).toBe(0);
    expect(venta.faltan).toEqual({ cuantos: 1, motivo: "1 despacho sin precio de venta" });
    // Sin venta reconocida tampoco se resta su costo.
    expect(renglon(r, "costo_madera").monto).toBe(0);
  });

  it("venta con costo desconocido: se cuenta la venta y el costo queda como faltante", () => {
    const e = vacia();
    e.despachos = [despacho({ id: "d1", gtfSalida: "G-9", valorVenta: 900, cogs: null, motivo: "sin_costo" })];
    const r = armarResultado("2026-09", e);
    expect(renglon(r, "madera_vendida").monto).toBe(900);
    expect(renglon(r, "costo_madera").faltan?.cuantos).toBe(1);
    expect(renglon(r, "costo_madera").certeza).toBe("incompleto");
    expect(r.estimado).toBe(true);
    expect(r.avisos.some((a) => a.codigo === "madera_sin_costo")).toBe(true);
  });

  it("ventasDeMadera agrupa por guía normalizada", () => {
    const g = ventasDeMadera(
      [despacho({ id: "a", gtfSalida: " g-1 ", valorVenta: 100, cogs: 60 }), despacho({ id: "b", gtfSalida: "G-1", valorVenta: 50, cogs: 30 })],
      [],
    );
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ gtf: "G-1", venta: 150, costo: 90, origenVenta: "despacho" });
  });
});

describe("costos", () => {
  it("la compra de madera NO resta: va al memo", () => {
    const e = vacia();
    e.compras = [
      { id: "w1", gtfNumber: "GTF-1", entryDate: utc("2026-09-03"), costoTotal: 5000, moneda: "PEN", proveedor: "CC.NN. Santa Rosa", m3: 10 },
      { id: "w2", gtfNumber: "GTF-1", entryDate: utc("2026-09-03"), costoTotal: 3000, moneda: "PEN", proveedor: "CC.NN. Santa Rosa", m3: 5 },
      { id: "w3", gtfNumber: "GTF-2", entryDate: utc("2026-09-04"), costoTotal: null, moneda: "PEN", proveedor: null, m3: 4 },
    ];
    const r = armarResultado("2026-09", e);
    expect(r.memo).toEqual({ compras: 8000, cuantas: 1, sinCosto: 1 });
    expect(r.totalCostos).toBe(0);
    expect(r.resultado).toBe(0);
  });

  it("compras sin ningún costo: el memo es «—» (null), no 0", () => {
    const e = vacia();
    e.compras = [{ id: "w3", gtfNumber: "GTF-2", entryDate: utc("2026-09-04"), costoTotal: null, moneda: "PEN", proveedor: null, m3: 4 }];
    expect(armarResultado("2026-09", e).memo).toEqual({ compras: null, cuantas: 0, sinCosto: 1 });
    expect(detalleDeResultado("2026-09", "compras_madera", e).total).toBeNull();
  });

  it("una venta sin costo guardado se estima al 55 % y se rotula", () => {
    const e = vacia();
    e.ventas = [
      { id: "s1", createdAt: new Date("2026-09-10T15:00:00Z"), total: 100, totalCogs: null, payment: "efectivo" },
      { id: "s2", createdAt: new Date("2026-09-10T16:00:00Z"), total: 85, totalCogs: 59.5, payment: "efectivo" },
    ];
    const r = armarResultado("2026-09", e);
    const merc = renglon(r, "mercaderia");
    expect(merc.monto).toBe(r2(55 + 59.5));
    expect(merc.certeza).toBe("estimado");
    expect(r.estimado).toBe(true);
    expect(r.avisos.find((a) => a.codigo === "costo_estimado")?.cuantos).toBe(1);
  });

  it("el gasto «personal» no se resta dos veces cuando hay planilla de RRHH", () => {
    const e = vacia();
    e.gastos = [
      { id: "g1", date: utc("2026-09-05"), paidAt: null, amount: 900, category: "personal", description: "Sueldo Juan", supplierName: null },
      { id: "g2", date: utc("2026-09-05"), paidAt: null, amount: 50, category: "servicios", description: "Luz", supplierName: null },
    ];
    e.planillas = { "2026-09": { total: 900, personas: [{ id: "c1", nombre: "Juan", total: 900, diasSinMarcar: 0 }] } };
    const r = armarResultado("2026-09", e);
    expect(renglon(r, "gastos").monto).toBe(50);
    expect(renglon(r, "planilla").monto).toBe(900);
    expect(renglon(r, "planilla").certeza).toBe("estimado");
    expect(r.totalCostos).toBe(950);
    expect(r.avisos.find((a) => a.codigo === "personal_con_planilla")?.cuantos).toBe(1);

    // Sin personal en RRHH, el gasto de personal sí resta.
    e.planillas = { "2026-09": { total: 0, personas: [] } };
    expect(renglon(armarResultado("2026-09", e), "gastos").monto).toBe(950);
  });

  it("quien no ve RRHH: la planilla va sin monto y el detalle sin filas", () => {
    const e = vacia();
    e.planillas = { "2026-09": { total: 900, personas: [{ id: "c1", nombre: "Juan", total: 900, diasSinMarcar: 0 }] } };
    e.planillaOculta = true;
    const r = armarResultado("2026-09", e);
    expect(renglon(r, "planilla")).toMatchObject({ monto: null, certeza: "incompleto", cuantos: 0, nota: "No tienes acceso a la planilla." });
    expect(detalleDeResultado("2026-09", "planilla", e)).toMatchObject({ filas: [], total: null });
    expect(r.estimado).toBe(true);
    const v = loQueViene({ saldosCuenta: [], adelantos: [], fiados: [], payables: [], planillaPorPagar: "sin_permiso" });
    expect(v.items.find((i) => i.tipo === "planilla_por_pagar")).toMatchObject({ monto: null, certeza: "incompleto", nota: "No tienes acceso a la planilla." });
    expect(v.porPagar).toBe(0);
  });

  it("planilla que no se pudo calcular: «—» (null), nunca 0", () => {
    const e = vacia();
    e.planillas = { "2026-09": null };
    const p = renglon(armarResultado("2026-09", e), "planilla");
    expect(p.monto).toBeNull();
    expect(p.certeza).toBe("incompleto");
  });

  it("los dólares no se suman: van a otras monedas", () => {
    const e = vacia();
    e.cuenta = [mov({ id: "u1", fecha: utc("2026-09-10"), tipo: "cargo", concepto: "aserrio_prestado", monto: 300, moneda: "USD" })];
    e.fletes = [{ id: "f1", fecha: utc("2026-09-10"), tipoTransporte: "publico", pagaQuien: "ctp", monto: 80, moneda: "USD", estadoPago: "pagado", fechaPago: null, gtfNumber: null, quien: null, m3: null, pt: null }];
    const r = armarResultado("2026-09", e);
    expect(renglon(r, "aserrio").monto).toBe(0);
    expect(renglon(r, "fletes_pagados").monto).toBe(0);
    expect(r.otrasMonedas).toEqual([{ moneda: "USD", cuantos: 2, total: 380 }]);
    expect(r.avisos.some((a) => a.codigo === "otras_monedas")).toBe(true);
  });

  it("claseDeFlete: el CTP paga resta; vehículo propio que paga otro suma; tercero ni una ni otra", () => {
    expect(claseDeFlete({ pagaQuien: "ctp", tipoTransporte: "publico", monto: 100 })).toBe("pagado");
    expect(claseDeFlete({ pagaQuien: "proveedor", tipoTransporte: "privado", monto: 100 })).toBe("cobrado");
    expect(claseDeFlete({ pagaQuien: "destinatario", tipoTransporte: "publico", monto: 100 })).toBe("de_otro");
    expect(claseDeFlete({ pagaQuien: "ctp", tipoTransporte: "privado", monto: null })).toBe("sin_monto");
  });

  it("mes cerrado en el libro: chip y aviso de que todavía puede moverse", () => {
    const e = blas();
    e.mesesCerrados = ["2026-09"];
    const r = armarResultado("2026-09", e);
    expect(r.cerradoCtp).toBe(true);
    expect(r.avisos.some((a) => a.codigo === "mes_cerrado_puede_moverse")).toBe(true);
  });
});

describe("invariante: el monto del renglón es la suma de SUS filas (las del detalle)", () => {
  it("en un mes con de todo", () => {
    const e = blas();
    e.ventas = [
      { id: "s1", createdAt: new Date("2026-09-10T15:00:00Z"), total: 100, totalCogs: null, payment: "efectivo" },
      { id: "s2", createdAt: new Date("2026-09-11T15:00:00Z"), total: 85.3, totalCogs: 59.51, payment: "fiado" },
    ];
    e.pedidos = [{ id: "o-abc123", createdAt: new Date("2026-09-12T15:00:00Z"), deliveredAt: null, total: 47.7, totalCogs: null, status: "confirmado", deuda: null, cliente: "Ana" }];
    e.cuenta.push(mov({ id: "r1", fecha: utc("2026-09-13"), tipo: "abono", concepto: "aserrio_recibido", monto: 120.33 }));
    e.despachos = [despacho({ id: "d1", gtfSalida: "G-1", valorVenta: 1000.1, cogs: 700.07 })];
    e.fletes = [
      { id: "f1", fecha: utc("2026-09-10"), tipoTransporte: "publico", pagaQuien: "ctp", monto: 80.5, moneda: "PEN", estadoPago: "pendiente", fechaPago: null, gtfNumber: "G-1", quien: "Transportes Ríos", m3: 12, pt: null },
      { id: "f2", fecha: utc("2026-09-11"), tipoTransporte: "privado", pagaQuien: "proveedor", monto: 60.25, moneda: "PEN", estadoPago: "pendiente", fechaPago: null, gtfNumber: null, quien: null, m3: null, pt: null },
    ];
    e.gastos = [{ id: "g1", date: utc("2026-09-05"), paidAt: null, amount: 20.01, category: "campo", description: "Poda", supplierName: null }];
    e.planillas = { "2026-09": { total: 612.4, personas: [{ id: "c1", nombre: "Juan", total: 612.4, diasSinMarcar: 2 }] } };
    const r = armarResultado("2026-09", e);
    for (const f of [...FUENTES_INGRESO, ...FUENTES_COSTO]) {
      const d = detalleDeResultado("2026-09", f, e);
      const rr = renglon(r, f);
      expect(rr.monto, f).toBe(d.total);
      expect(rr.cuantos, f).toBe(d.filas.length);
      expect(d.total, f).toBe(r2(d.filas.reduce((a, x) => a + x.monto, 0)));
    }
    expect(r.resultado).toBe(r2(r.totalIngresos - r.totalCostos));
    expect(renglon(r, "planilla").faltan?.cuantos).toBe(2);
    expect(renglon(r, "fletes_cobrados").monto).toBe(60.25);
  });
});

describe("caja: cada peso una vez", () => {
  it("la liquidación entra UNA vez (ni sus movimientos de cuenta ni su ingreso de caja se suman aparte)", () => {
    const e = cajaVacia();
    e.liquidaciones = [{ id: "L1", codigo: "LIQ-2026-0001", fecha: utc("2026-09-20"), pagoDireccion: "recibido", pagoMonto: 500, montoCompensado: 0, personaNombre: "WASACO", cajaMovimientoId: "cm1" }];
    e.cuenta = [mov({ id: "lm1", fecha: utc("2026-09-20"), tipo: "abono", concepto: "pago", monto: 500, liquidacionId: "L1" })];
    e.movimientosCaja = [{ id: "cm1", type: "ingreso", amount: 500, description: "Liquidación LIQ-2026-0001 · WASACO", createdAt: new Date("2026-09-20T15:00:00Z") }];
    e.cajaDeLiquidaciones = [
      { codigo: "LIQ-2026-0001", cajaMovimientoId: "cm1", cajaReversionId: null },
      { codigo: "LIQ-2026-0009", cajaMovimientoId: null, cajaReversionId: null },
    ];
    const c = armarCaja("2026-09", e);
    expect(c.totalEntro).toBe(500);
    expect(c.entro.find((x) => x.fuente === "liquidacion_recibida")?.monto).toBe(500);
    expect(c.entro.find((x) => x.fuente === "cobros_forestales")?.monto).toBe(0);
    expect(c.sinSumar).toMatchObject({ cuantos: 1, ingresos: 500, egresos: 0 });
    // Refutador C, al revés: la pata «pago» de la liquidación no es «nunca caja».
    expect(c.nuncaCaja).toMatchObject({ cuantos: 0, monto: 0 });
    expect(detalleDeCaja("2026-09", "caja_sin_sumar", e).filas[0].que).toContain("es el pago de una liquidación (LIQ-2026-0001)");
    // Una anulada (sin movimiento guardado) se reconoce igual por su código en la descripción.
    e.movimientosCaja = [{ id: "cm9", type: "egreso", amount: 70, description: "Reversión Liquidación LIQ-2026-0009", createdAt: new Date("2026-09-21T15:00:00Z") }];
    expect(detalleDeCaja("2026-09", "caja_sin_sumar", e).filas[0].que).toContain("(LIQ-2026-0009)");
  });

  it("el cruce contra lo recibido (ADR-449) nunca es caja: 0", () => {
    const e = cajaVacia();
    e.liquidaciones = [{ id: "L2", codigo: "LIQ-2026-0002", fecha: utc("2026-09-25"), pagoDireccion: null, pagoMonto: null, montoCompensado: 3031, personaNombre: "WASACO", cajaMovimientoId: null }];
    e.cuenta = [mov({ id: "x1", fecha: utc("2026-09-25"), tipo: "abono", concepto: "compensacion", monto: 3031, liquidacionId: "L2" })];
    e.entregas = [
      { id: "en1", fecha: utc("2026-09-25"), valor: 1731, liquidacionId: "L2", adelantoCodigo: "ADL-2026-0003", direccion: "RECIBIDO", beneficiario: "WASACO" },
      { id: "en2", fecha: utc("2026-09-25"), valor: 1300, liquidacionId: "L2", adelantoCodigo: "ADL-2026-0004", direccion: "RECIBIDO", beneficiario: "WASACO" },
    ];
    const c = armarCaja("2026-09", e);
    expect(c.totalEntro).toBe(0);
    expect(c.totalSalio).toBe(0);
    expect(c.neto).toBe(0);
    // Refutador B, al revés: una vez (el `montoCompensado`), no 6 062 con la pata de cuenta.
    expect(c.nuncaCaja).toMatchObject({ cuantos: 1, monto: 3031 });
  });

  it("un adelanto dado y su retiro de caja se cuentan una vez", () => {
    const e = cajaVacia();
    e.adelantos = [{ id: "a1", codigo: "ADL-2026-0007", fechaAdelanto: new Date("2026-09-19T17:00:00Z"), montoAdelantado: 1000, moneda: "PEN", direccion: "DADO", beneficiario: "Juan" }];
    e.codigosAdelanto = ["ADL-2026-0007", "ADL-2026-00070"];
    e.movimientosCaja = [{ id: "cm2", type: "egreso", amount: 1000, description: "Adelanto ADL-2026-0007 · Juan", createdAt: new Date("2026-09-19T17:00:05Z") }];
    const c = armarCaja("2026-09", e);
    expect(c.totalSalio).toBe(1000);
    expect(c.sinSumar.egresos).toBe(1000);
    const fila = detalleDeCaja("2026-09", "caja_sin_sumar", e).filas[0];
    expect(fila.que).toContain("del adelanto ADL-2026-0007");
    expect(fila.que).not.toContain("ADL-2026-00070");
  });

  it("lo fiado no entra hasta que se cobra la cuota; un pago suelto de la cuenta sí entra", () => {
    const e = cajaVacia();
    e.ventas = [
      { id: "s1", createdAt: new Date("2026-09-10T15:00:00Z"), total: 30, totalCogs: null, payment: "fiado" },
      { id: "s2", createdAt: new Date("2026-09-10T16:00:00Z"), total: 85, totalCogs: 59.5, payment: "efectivo" },
    ];
    e.cuotasFiado = [{ id: "q1", pagadoEn: new Date("2026-09-12T15:00:00Z"), monto: 10, cliente: "Ana" }];
    e.cuenta = [mov({ id: "p1", fecha: utc("2026-09-14"), tipo: "abono", concepto: "pago", monto: 2000, referencia: "Recibo 12" })];
    const c = armarCaja("2026-09", e);
    expect(c.entro.find((x) => x.fuente === "mostrador_cobrado")?.monto).toBe(95);
    expect(c.entro.find((x) => x.fuente === "cobros_forestales")?.monto).toBe(2000);
    for (const f of [...FUENTES_ENTRO, ...FUENTES_SALIO]) {
      const d = detalleDeCaja("2026-09", f, e);
      expect([...c.entro, ...c.salio].find((x) => x.fuente === f)?.monto, f).toBe(d.total);
    }
  });
});

describe("lo que viene", () => {
  it("lo recibido se cruza (no es plata por entrar); lo dado y lo de la cuenta se cobran", () => {
    const v = loQueViene({
      saldosCuenta: [{ parteId: "p1", nombre: "WASACO", saldo: 12323.02 }, { parteId: "p2", nombre: "CC.NN.", saldo: -500 }],
      adelantos: [
        { id: "a1", codigo: "ADL-3", direccion: "RECIBIDO", saldoPendiente: 3031, moneda: "PEN", fechaVencimiento: null, beneficiario: "WASACO", beneficiarioId: "b-wasaco" },
        { id: "a2", codigo: "ADL-4", direccion: "DADO", saldoPendiente: 26690, moneda: "PEN", fechaVencimiento: utc("2026-10-15"), beneficiario: "Juan", beneficiarioId: "b-juan" },
        { id: "a3", codigo: "ADL-5", direccion: "DADO", saldoPendiente: 100, moneda: "USD", fechaVencimiento: null, beneficiario: "Pedro", beneficiarioId: "b-pedro" },
      ],
      fiados: [{ id: "f1", saldo: 30, fechaVence: null, cliente: "Ana" }],
      payables: [],
      planillaPorPagar: null,
      otrasMonedasCuenta: [{ moneda: "USD", cuantos: 1, total: 200 }],
    });
    expect(v.porCobrar).toBe(r2(12323.02 + 26690 + 30));
    // Lo que no está en soles se dice aparte, por moneda, y no se suma.
    expect(v.otrasMonedas).toEqual([{ moneda: "USD", cuantos: 2, total: 300 }]);
    expect(v.paraCruzar).toBe(3031);
    expect(v.porPagar).toBe(500);
    expect(v.items.find((i) => i.tipo === "adelantos_por_cobrar")?.quienes[0]).toEqual({ nombre: "Juan", monto: 26690, vence: "2026-10-15" });
  });
});

describe("revisión ADR-451: los refutadores, al revés", () => {
  const entrega = (p: Partial<EntregaEntrada> & Pick<EntregaEntrada, "id" | "valor">): EntregaEntrada => ({
    fecha: new Date("2026-09-29T01:37:49Z"), liquidacionId: null, adelantoCodigo: "ADL-2026-0001", direccion: "DADO", beneficiario: "MAMA DE ALEX", ...p,
  });

  it("A. Blas set: la devolución en efectivo de ADL-2026-0001 ENTRA (S/ 1 200) y no es «nunca fue caja»", () => {
    const e = cajaVacia();
    e.entregas = [entrega({ id: "en3", valor: 1200 })];
    e.codigosAdelanto = ["ADL-2026-0001"];
    e.movimientosCaja = [{ id: "cm7", type: "ingreso", amount: 1200, description: "Liquidación de adelanto ADL-2026-0001 · MAMA DE ALEX", createdAt: new Date("2026-09-29T01:37:00Z") }];
    const c = armarCaja("2026-09", e);
    expect(c.totalEntro).toBe(1200);
    expect(c.entro.find((x) => x.fuente === "adelanto_devuelto")?.monto).toBe(1200);
    expect(c.nuncaCaja).toMatchObject({ cuantos: 0, monto: 0 });
    // Sigue en «sin sumar» (se muestra), rotulado como ya contado: no se suma dos veces.
    expect(c.sinSumar.ingresos).toBe(1200);
    expect(detalleDeCaja("2026-09", "caja_sin_sumar", e).filas[0].que).toContain("ya contado: devolución del adelanto ADL-2026-0001");
    expect(detalleDeCaja("2026-09", "adelanto_devuelto", e).total).toBe(1200);
  });

  it("A'. sin su movimiento (trabajo, producto) es «nunca fue caja»; un movimiento se empareja UNA vez", () => {
    const e = cajaVacia();
    e.entregas = [entrega({ id: "e1", valor: 500 }), entrega({ id: "e2", valor: 500 })];
    e.movimientosCaja = [{ id: "cm1", type: "ingreso", amount: 500, description: "Liquidación de adelanto ADL-2026-0001 · X", createdAt: new Date("2026-09-20T15:00:00Z") }];
    const c = armarCaja("2026-09", e);
    expect(c.totalEntro).toBe(500);
    expect(c.nuncaCaja).toMatchObject({ cuantos: 1, monto: 500 });
  });

  it("A''. lo RECIBIDO devuelto en plata sale; el alta del mismo monto no se confunde con la devolución", () => {
    const e = cajaVacia();
    e.entregas = [entrega({ id: "e1", valor: 100, adelantoCodigo: "ADL-2026-0025", direccion: "RECIBIDO", beneficiario: "Wasaco" })];
    e.movimientosCaja = [
      { id: "m1", type: "egreso", amount: 100, description: "Adelanto ADL-2026-0025 · Wasaco", createdAt: new Date("2026-09-20T15:00:00Z") },
      { id: "m2", type: "egreso", amount: 100, description: "Devolución de adelanto recibido ADL-2026-0025 · Wasaco", createdAt: new Date("2026-09-20T15:01:00Z") },
    ];
    const c = armarCaja("2026-09", e);
    expect(c.salio.find((x) => x.fuente === "recibido_devuelto")?.monto).toBe(100);
    expect(c.totalSalio).toBe(100);
    const filas = detalleDeCaja("2026-09", "caja_sin_sumar", e).filas;
    expect(filas.find((f) => f.id === "m2")?.que).toContain("ya contado");
    expect(filas.find((f) => f.id === "m1")?.que).not.toContain("ya contado");
  });

  it("D. «Pago entregado» (pago_hecho) suelto SALE de la caja: 800", () => {
    const e = cajaVacia();
    e.cuenta = [mov({ id: "ph", fecha: utc("2026-09-10"), tipo: "cargo", concepto: "pago_hecho", monto: 800 })];
    const c = armarCaja("2026-09", e);
    expect(c.totalSalio).toBe(800);
    expect(c.salio.find((x) => x.fuente === "pagos_forestales")?.monto).toBe(800);
  });

  it("E. un gasto de guía sin pagar no salió; pagado sí, el día de su pago; uno sin guía cuenta como siempre", () => {
    const e = cajaVacia();
    e.gastos = [
      { id: "g1", date: new Date("2026-09-10T12:00:00Z"), paidAt: null, amount: 90, category: "Estiba", description: "Estiba · guía X", supplierName: null, gtfNumber: "019-0000003" },
      { id: "g2", date: new Date("2026-08-30T12:00:00Z"), paidAt: new Date("2026-09-12T15:00:00Z"), amount: 40, category: "Descarga", description: "Descarga · guía X", supplierName: null, gtfNumber: "019-0000003" },
      { id: "g3", date: new Date("2026-09-05T12:00:00Z"), paidAt: null, amount: 20, category: "campo", description: "Poda", supplierName: null, gtfNumber: null },
    ];
    const c = armarCaja("2026-09", e);
    expect(c.totalSalio).toBe(60);
    expect(detalleDeCaja("2026-09", "gastos_pagados", e).filas.map((f) => f.id).sort()).toEqual(["g2", "g3"]);
  });

  it("F. con la guía ENTERA, la compra que empezó en agosto no se cuenta en setiembre: renglón y detalle dicen 0", () => {
    const c = (id: string, d: string, costo: number) => ({ id, gtfNumber: "19-001/7 000065", entryDate: utc(d), costoTotal: costo, moneda: "PEN", proveedor: "X", m3: 1 });
    const e = { ...vacia(), compras: [c("w1", "2026-08-10", 100), c("w2", "2026-09-05", 200)] };
    expect(armarResultado("2026-09", e).memo.compras).toBe(0);
    expect(detalleDeResultado("2026-09", "compras_madera", e).total).toBe(0);
    expect(armarResultado("2026-08", e).memo.compras).toBe(300);
  });

  it("G. cuenta 15/09 + despacho 20/07 de la misma guía: renglón y detalle dan el mismo costo", () => {
    const d = despacho({ id: "d1", lineNo: 9, gtfSalida: "G1", valorVenta: 1000, cogs: 400, fecha: "2026-07-20T00:00:00.000Z" });
    const cv = mov({ id: "v1", fecha: utc("2026-09-15"), tipo: "cargo", concepto: "venta", monto: 1000, referencia: "G1" });
    const e = { ...vacia(), cuenta: [cv], despachos: [d] };
    const costo = armarResultado("2026-09", e).costos.find((x) => x.fuente === "costo_madera")!.monto;
    expect(costo).toBe(400);
    expect(detalleDeResultado("2026-09", "costo_madera", e).total).toBe(400);
  });

  it("H. «0050-01» (ni 1999-12) no es un mes del negocio; 2026-09 sí", () => {
    expect(esMesDelNegocio("0050-01")).toBe(false);
    expect(esMesDelNegocio("1999-12")).toBe(false);
    expect(esMesDelNegocio("2101-01")).toBe(false);
    expect(esMesDelNegocio("2026-13")).toBe(false);
    expect(esMesDelNegocio("2026-09")).toBe(true);
  });

  it("7. la venta en dólares de un despacho no se suma a soles aunque el costo haya caído en soles", () => {
    const e = { ...vacia(), despachos: [despacho({ id: "d1", gtfSalida: "G-USD", valorVenta: 500, cogs: 300, moneda: "PEN", monedaVenta: "USD" })] };
    const r = armarResultado("2026-09", e);
    expect(r.ingresos.find((x) => x.fuente === "madera_vendida")?.monto).toBe(0);
    expect(r.otrasMonedas).toEqual([{ moneda: "USD", cuantos: 1, total: 500 }]);
  });
});

describe("lo que viene: cruzar abre Liquidar de ESA persona", () => {
  it("un ítem por persona, con `persona=<id>` y las mismas claves que lee la pantalla", async () => {
    const url = await import("@/components/admin/adelantos/cuentas/liquidar-por-url");
    const recibido = (id: string, benef: string, nombre: string, saldo: number) => ({
      id, codigo: `ADL-${id}`, direccion: "RECIBIDO" as const, saldoPendiente: saldo, moneda: "PEN", fechaVencimiento: null, beneficiario: nombre, beneficiarioId: benef,
    });
    const v = loQueViene({
      saldosCuenta: [],
      adelantos: [recibido("1", "b-wasaco", "WASACO", 1731), recibido("2", "b-wasaco", "WASACO", 1300), recibido("3", "b-otro", "OTRO SAC", 500)],
      fiados: [], payables: [], planillaPorPagar: null,
    });
    const cruzar = v.items.filter((i) => i.tipo === "recibido_para_cruzar");
    expect(cruzar).toHaveLength(2);
    const wasaco = cruzar.find((i) => i.quienes[0]?.nombre === "WASACO")!;
    expect(wasaco.monto).toBe(3031);
    expect(wasaco.enlace.params).toEqual({ vista: "adelantos", [url.PARAM_ACCION]: url.ACCION_LIQUIDAR, [url.PARAM_PERSONA]: "b-wasaco" });
    expect(cruzar.find((i) => i.quienes[0]?.nombre === "OTRO SAC")?.enlace.params[url.PARAM_PERSONA]).toBe("b-otro");
    expect(v.paraCruzar).toBe(3531);
    // Sin nadie para cruzar: un solo ítem vacío que abre la lista, sin persona.
    const vacio = loQueViene({ saldosCuenta: [], adelantos: [], fiados: [], payables: [], planillaPorPagar: null }).items.filter((i) => i.tipo === "recibido_para_cruzar");
    expect(vacio).toHaveLength(1);
    expect(vacio[0].enlace.params).not.toHaveProperty(url.PARAM_PERSONA);
  });
});
