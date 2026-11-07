/**
 * Motor de la contabilidad (ADR-529), puro: reglas, asientos del mes y reportes.
 * Fuzz con filas como las de `ResultadoNegocioDB.filasDelMes` (montos con signo,
 * gastos con y sin IGV, ventas con y sin IGV): todo asiento cuadra, la caja 10
 * es la «Caja del mes», y la utilidad contable cruza con «Resultado» a 0.
 */
import { describe, expect, it } from "vitest";
import { armarAsientos, sumasDe, type DatosExtra, type FilasDelMes } from "@/lib/contabilidad/armar-asientos";
import { REGLAS, lineasDeRegla, separarIgv, r2, type ContextoReglas } from "@/lib/contabilidad/reglas";
import { PLAN_PCGE, esImputable, fusionarConPropias, nombreDeCuenta } from "@/lib/contabilidad/plan-pcge";
import { comprobacion, cruceConResultado, efectoEnResultado, estadoSituacion, saldosPorCuenta } from "@/lib/contabilidad/reportes";
import { FUENTES_COSTO, FUENTES_ENTRO, FUENTES_INGRESO, FUENTES_SALIO, type FilaFuente } from "@/lib/finance/resultado-del-negocio";

const SIN_IGV: ContextoReglas = { ventasConIgv: false, tasaIgv: 0.18, mapeo: {} };
const CON_IGV: ContextoReglas = { ...SIN_IGV, ventasConIgv: true };
const nombre = (c: string) => nombreDeCuenta(c, PLAN_PCGE);

/** PRNG con semilla (mulberry32): el fuzz es repetible. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fila(id: string, monto: number, dia = 10): FilaFuente {
  return { id, fecha: `2026-10-${String(dia).padStart(2, "0")}`, quien: "Persona", que: `Hecho ${id}`, monto, pt: null, m3: null, certeza: "medido", enlace: null };
}

function mesAlAzar(seed: number): { f: FilasDelMes; extra: DatosExtra; ctx: ContextoReglas } {
  const rnd = prng(seed);
  const monto = () => r2((rnd() < 0.1 ? -1 : 1) * (0.01 + rnd() * 5000));
  let n = 0;
  const filas = (k: number) => Array.from({ length: Math.floor(rnd() * k) }, () => fila(`f${seed}-${n++}`, monto(), 1 + Math.floor(rnd() * 28)));
  const resultado: FilasDelMes["resultado"] = {};
  const caja: FilasDelMes["caja"] = {};
  const gastos: Record<string, DatosExtra["gastos"][string]> = {};
  for (const fu of FUENTES_INGRESO) resultado[fu] = filas(5);
  for (const fu of FUENTES_COSTO) resultado[fu] = filas(5);
  for (const g of resultado.gastos ?? []) {
    const cat = ["alquiler", "servicios", "transporte", "personal", "otros", null][Math.floor(rnd() * 6)];
    const conIgv = rnd() < 0.4;
    gastos[g.id] = { category: cat, documentNumber: null, igvAmount: conIgv && rnd() < 0.5 ? r2(Math.abs(g.monto) * 0.18 / 1.18) : null, afectoIgv: conIgv };
  }
  for (const fu of [...FUENTES_ENTRO, ...FUENTES_SALIO]) caja[fu] = filas(4).map((x) => ({ ...x, monto: Math.abs(x.monto) }));
  caja.caja_sin_sumar = [...filas(3), fila(`ya-${seed}`, 99, 3)].map((x) => (x.id.startsWith("ya-") ? { ...x, que: "Ingreso de caja · ya contado: devolución del adelanto" } : x));
  const suma = (xs: readonly FilaFuente[] | undefined) => (xs ?? []).reduce((a, x) => a + x.monto, 0);
  const ingresos = FUENTES_INGRESO.reduce((a, fu) => a + suma(resultado[fu]), 0);
  const costos = FUENTES_COSTO.reduce((a, fu) => a + suma(resultado[fu]), 0);
  const entro = FUENTES_ENTRO.reduce((a, fu) => a + suma(caja[fu]), 0);
  const salio = FUENTES_SALIO.reduce((a, fu) => a + suma(caja[fu]), 0);
  const cruces = filas(3).map((x, i) => ({ id: x.id, fecha: x.fecha, quien: x.quien, codigo: `ADL-${i}`, monto: Math.abs(x.monto), direccion: rnd() < 0.7 ? ("DADO" as const) : ("RECIBIDO" as const) }));
  const relaciones = ["trabajador", "proveedor", "chofer", "familia", null];
  const rel = () => relaciones[Math.floor(rnd() * relaciones.length)];
  const extra: DatosExtra = {
    gastos,
    relacionAdelanto: Object.fromEntries((caja.adelanto_dado ?? []).map((x) => [x.id, rel()])),
    relacionEntrega: Object.fromEntries([...(caja.adelanto_devuelto ?? []), ...cruces].map((x) => [x.id, rel()])),
    relacionLiquidacion: Object.fromEntries((caja.liquidacion_pagada ?? []).map((x) => [x.id, rel()])),
  };
  const f: FilasDelMes = { mes: "2026-10", resultado, caja, resultadoDelPanel: r2(ingresos - costos), cajaNeto: r2(entro - salio), cruces, otrasMonedas: 0 };
  return { f, extra, ctx: rnd() < 0.5 ? CON_IGV : { ...SIN_IGV, mapeo: rnd() < 0.3 ? { venta_mostrador: "70121" } : {} } };
}

describe("reglas", () => {
  it("IGV incluido: 100 → 84,75 de venta + 15,25 de IGV, y cuadra", () => {
    expect(separarIgv(100, 0.18)).toEqual({ base: 84.75, igv: 15.25 });
    const r = lineasDeRegla("venta_mostrador", 100, CON_IGV);
    expect(r.lineas).toEqual([
      { cuenta: "1212", debe: 100, haber: 0 },
      { cuenta: "70111", debe: 0, haber: 84.75 },
      { cuenta: "40111", debe: 0, haber: 15.25 },
    ]);
    expect(r.igvVenta).toBe(15.25);
  });

  it("sin IGV (NRUS) la venta va entera a 70", () => {
    expect(lineasDeRegla("venta_mostrador", 100, SIN_IGV).lineas).toEqual([
      { cuenta: "1212", debe: 100, haber: 0 },
      { cuenta: "70111", debe: 0, haber: 100 },
    ]);
  });

  it("el mapeo del negocio cambia solo el lado cambiable", () => {
    const ctx = { ...SIN_IGV, mapeo: { venta_mostrador: "70121", gasto_otros: "65911", cobro_mostrador: "1041" } };
    expect(lineasDeRegla("venta_mostrador", 50, ctx).lineas.map((l) => l.cuenta)).toEqual(["1212", "70121"]);
    expect(lineasDeRegla("gasto_otros", 50, ctx).lineas.map((l) => l.cuenta)).toEqual(["65911", "4212"]);
    // cobro_mostrador no tiene cuenta cambiable: el mapeo se ignora.
    expect(lineasDeRegla("cobro_mostrador", 50, ctx).lineas.map((l) => l.cuenta)).toEqual(["1011", "1212"]);
  });

  it("una corrección (monto negativo) invierte debe y haber", () => {
    expect(lineasDeRegla("venta_pedido", -30, SIN_IGV).lineas).toEqual([
      { cuenta: "1212", debe: 0, haber: 30 },
      { cuenta: "70111", debe: 30, haber: 0 },
    ]);
  });

  it("gasto con IGV del comprobante: la base al gasto y el IGV al debe de 40111", () => {
    const r = lineasDeRegla("gasto_servicios", 118, SIN_IGV, { igvCompra: 18, afectoIgv: true });
    expect(r.lineas).toEqual([
      { cuenta: "63691", debe: 100, haber: 0 },
      { cuenta: "40111", debe: 18, haber: 0 },
      { cuenta: "4212", debe: 0, haber: 118 },
    ]);
  });

  it("las cuentas de todas las reglas existen y aceptan asientos", () => {
    for (const d of Object.values(REGLAS)) for (const c of [d.debe, d.haber, "40111", "4221", "1629", "4111"]) expect(esImputable(c, PLAN_PCGE), c).toBe(true);
  });

  it("una cuenta propia cuelga del PCGE y es imputable", () => {
    const plan = fusionarConPropias([{ codigo: "104101", nombre: "BCP soles", naturaleza: "activo", activa: true }]);
    expect(esImputable("104101", plan)).toBe(true);
    expect(esImputable("10", plan)).toBe(false);
  });
});

describe("asientos del mes (fuzz 300 meses)", () => {
  for (let seed = 1; seed <= 300; seed++) {
    it(`mes ${seed}: cuadra, caja 10 = Caja del mes, cruce = 0`, () => {
      const { f, extra, ctx } = mesAlAzar(seed);
      const a = armarAsientos(f, extra, ctx, nombre);
      for (const x of a.asientos) {
        const s = sumasDe([x]);
        expect(Math.abs(s.debe - s.haber), x.glosa).toBeLessThan(0.005);
        for (const l of x.lineas) {
          expect(l.debe >= 0 && l.haber >= 0, x.glosa).toBe(true);
          expect(r2(l.debe)).toBe(l.debe);
          expect(r2(l.haber)).toBe(l.haber);
        }
      }
      // Números correlativos 1..n sin huecos.
      expect(a.asientos.map((x) => x.numero)).toEqual(a.asientos.map((_, i) => i + 1));
      // Origen único (el @@unique de la base).
      expect(new Set(a.asientos.map((x) => x.origen)).size).toBe(a.asientos.length);

      const saldos = saldosPorCuenta(a.asientos);
      const caja = saldos.get("1011") ?? { debe: 0, haber: 0 };
      expect(r2(caja.debe - caja.haber)).toBeCloseTo(r2(f.cajaNeto + a.cajaFueraDelPanel), 2);

      const utilidad = efectoEnResultado(a.asientos);
      const cruce = cruceConResultado({ resultadoDelPanel: f.resultadoDelPanel, igvVentas: a.igvVentas, igvCompras: a.igvCompras, otrasFuentes: a.otrasFuentes, ajustesManuales: 0, utilidadContable: utilidad });
      expect(Math.abs(cruce.diferencia)).toBeLessThan(0.005);

      const k = comprobacion(PLAN_PCGE, saldos);
      expect(k.cuadra).toBe(true);
      expect(k.totales.sumasDebe).toBeCloseTo(k.totales.sumasHaber, 2);
      expect(k.resultadoDelEjercicio).toBeCloseTo(utilidad, 2);

      const sit = estadoSituacion(saldos, utilidad, 0);
      expect(Math.abs(sit.diferencia)).toBeLessThan(0.005);
      expect(sit.cuadra).toBe(true);
    });
  }

  it("lo «ya contado» de la caja manual no se duplica; el resto va a 4699 con aviso", () => {
    const f: FilasDelMes = {
      mes: "2026-10",
      resultado: {},
      caja: { caja_sin_sumar: [fila("a", 1200), { ...fila("b", 1200), que: "Ingreso · ya contado: devolución del adelanto" }, fila("c", -10)] },
      resultadoDelPanel: 0, cajaNeto: 0, cruces: [], otrasMonedas: 0,
    };
    const a = armarAsientos(f, { gastos: {}, relacionAdelanto: {}, relacionEntrega: {}, relacionLiquidacion: {} }, SIN_IGV, nombre);
    expect(a.asientos).toHaveLength(2);
    expect(a.cajaFueraDelPanel).toBe(1190);
    expect(a.avisos.find((v) => v.codigo === "cuenta_por_aclarar")?.cuantos).toBe(2);
  });

  it("adelanto descontado (sin caja) de un trabajador: 4111 contra 1412", () => {
    const f: FilasDelMes = { mes: "2026-10", resultado: {}, caja: {}, resultadoDelPanel: 0, cajaNeto: 0, otrasMonedas: 0, cruces: [{ id: "e1", fecha: "2026-10-04", quien: "Juan", codigo: "ADL-1", monto: 300, direccion: "DADO" }] };
    const a = armarAsientos(f, { gastos: {}, relacionAdelanto: {}, relacionEntrega: { e1: "trabajador" }, relacionLiquidacion: {} }, SIN_IGV, nombre);
    expect(a.asientos[0].lineas.map((l) => [l.cuenta, l.debe, l.haber])).toEqual([["4111", 300, 0], ["1412", 0, 300]]);
    expect(efectoEnResultado(a.asientos)).toBe(0);
  });
});

describe("revisión del motor: doble conteo, alquileres y compensaciones", () => {
  const sinExtra: DatosExtra = { gastos: {}, relacionAdelanto: {}, relacionEntrega: {}, relacionLiquidacion: {} };
  const saldoDe = (a: ReturnType<typeof armarAsientos>, cuenta: string) =>
    r2(a.asientos.flatMap((x) => x.lineas).filter((l) => l.cuenta === cuenta).reduce((t, l) => t + l.debe - l.haber, 0));
  const usa = (a: ReturnType<typeof armarAsientos>, cuenta: string) => a.asientos.some((x) => x.lineas.some((l) => l.cuenta === cuenta));

  it("el retiro `gasto-caja-<id>` de un gasto pagado no se cuenta dos veces", () => {
    const f: FilasDelMes = {
      mes: "2026-10",
      resultado: { gastos: [fila("g1", 50)] },
      caja: { gastos_pagados: [fila("g1", 50)], caja_sin_sumar: [{ ...fila("gasto-caja-g1", -50), que: "Retiro de caja: Gasto · luz" }] },
      resultadoDelPanel: -50, cajaNeto: -50, cruces: [], otrasMonedas: 0,
    };
    const a = armarAsientos(f, sinExtra, SIN_IGV, nombre);
    expect(saldoDe(a, "1011")).toBe(-50);
    expect(usa(a, "4699")).toBe(false);
    expect(a.cajaFueraDelPanel).toBe(0);
  });

  it("el retiro de un gasto borrado sigue por aclarar; cobro de fiado no se repite; pago a proveedor baja la deuda", () => {
    const f: FilasDelMes = {
      mes: "2026-10", resultado: {}, resultadoDelPanel: 0, cajaNeto: 0, cruces: [], otrasMonedas: 0,
      caja: {
        caja_sin_sumar: [
          { ...fila("gasto-caja-borrado", -25), que: "Retiro de caja: Gasto · gas" },
          { ...fila("m2", 80), que: "Ingreso de caja: Cobro de fiado · Ana" },
          { ...fila("m3", -300), que: "Retiro de caja: Pago a proveedor · Gloria" },
        ],
      },
    };
    const a = armarAsientos(f, sinExtra, SIN_IGV, nombre);
    expect(saldoDe(a, "4699")).toBe(25);
    expect(saldoDe(a, "4212")).toBe(300);
    expect(saldoDe(a, "1011")).toBe(-325);
    expect(a.cajaFueraDelPanel).toBe(-325);
    expect(a.avisos.find((v) => v.codigo === "cuenta_por_aclarar")?.cuantos).toBe(1);
  });

  it("los alquileres no entran al motor: 1011 sin movimientos (ADR-524)", () => {
    const extra = { ...sinExtra, alquileres: [{ id: "alq1", fecha: "2026-10-05", quien: "Drucila", que: "Alquiler", monto: 900, moneda: "PEN", pagamos: false }] } as DatosExtra;
    const f: FilasDelMes = { mes: "2026-10", resultado: {}, caja: {}, resultadoDelPanel: 0, cajaNeto: 0, cruces: [], otrasMonedas: 0 };
    const a = armarAsientos(f, extra, SIN_IGV, nombre);
    expect(usa(a, "1011")).toBe(false);
    expect(a.asientos).toHaveLength(0);
    expect(a.otrasFuentes).toBe(0);
  });

  it("compensaciones: liquidación de un trabajador 4111/1412, cuenta forestal 4212/1212, sin con quién → aviso", () => {
    const f: FilasDelMes = {
      mes: "2026-10", resultado: {}, caja: {}, resultadoDelPanel: 0, cajaNeto: 0, cruces: [], otrasMonedas: 0,
      compensaciones: [
        { id: "l1", fecha: "2026-10-03", quien: "Juan", codigo: "LIQ-1", monto: 800, moneda: null, liquidacionId: "l1", con: "persona" },
        { id: "c1", fecha: "2026-10-04", quien: "Aserradero X", codigo: null, monto: 500, moneda: "PEN", liquidacionId: null, con: "parte" },
        { id: "l2", fecha: "2026-10-05", quien: null, codigo: "LIQ-2", monto: 70, moneda: null, liquidacionId: "l2", con: null },
        { id: "c2", fecha: "2026-10-06", quien: null, codigo: null, monto: 10, moneda: "USD", liquidacionId: null, con: "parte" },
      ],
    };
    const a = armarAsientos(f, { ...sinExtra, relacionLiquidacion: { l1: "trabajador" } }, SIN_IGV, nombre);
    expect(a.asientos.map((x) => x.lineas.map((l) => [l.cuenta, l.debe, l.haber]))).toEqual([
      [["4111", 800, 0], ["1412", 0, 800]],
      [["4212", 500, 0], ["1212", 0, 500]],
    ]);
    expect(usa(a, "1011")).toBe(false);
    expect(efectoEnResultado(a.asientos)).toBe(0);
    expect(a.avisos.find((v) => v.codigo === "compensacion_sin_cuenta")?.cuantos).toBe(1);
    expect(a.avisos.find((v) => v.codigo === "otras_monedas")?.cuantos).toBe(1);
  });
});
