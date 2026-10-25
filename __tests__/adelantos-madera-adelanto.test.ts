/**
 * El adelanto que se paga con madera (Brandon 25-10). Lo que se protege:
 *   · pt × precio sale de lo que la guía YA tiene anotado; sin precio, no hay
 *     cifra (nunca un precio inventado);
 *   · lo que baja es lo que falta pagar de la guía, hasta lo que te debe — la
 *     misma cuenta que «Descontar de lo adelantado» del pago;
 *   · «ya descontado»: después del cruce la guía no tiene nada pendiente, la
 *     pantalla deja de ofrecerlo y el servidor rechaza un segundo cruce de la
 *     MISMA guía aunque llegue con otra clave;
 *   · la sugerencia de «¿es la misma persona?» es estricta (una sola, o nada).
 */
import { describe, expect, it } from "vitest";
import {
  cuantoBaja,
  estadoDescuentoGuia,
  maderaDeLaGuia,
  precioPromedio,
  ptDelSaldoDelAdelanto,
  ptEquivalente,
  sugerirPersonaDeAdelantos,
  ultimoPrecioPt,
  type LineaGuiaConCosto,
} from "@/lib/adelantos/madera-adelanto";
import { guiasPendientesDe, planLiquidacion, type PartidasDePersona } from "@/lib/cuentas/liquidacion";
import { armarUnionDirectorio, type ParteDelDirectorio } from "@/lib/adelantos/union-directorio";
import type { MovimientoCuenta } from "@/lib/forestal/cuenta-corriente";

const linea = (especie: string, pt: number | null, precio: number | null, o: Partial<LineaGuiaConCosto> = {}): LineaGuiaConCosto => ({
  speciesCommonName: especie,
  costoTotal: pt != null && precio != null ? Math.round(pt * precio * 100) / 100 : null,
  costoDetalle: pt != null && precio != null ? { unidad: "pt", precio, cantidadFactura: pt, ptUsado: pt } : null,
  ...o,
});

describe("pt × precio de la guía", () => {
  it("una especie: 977 pt × S/ 2,50 = S/ 2 442,50", () => {
    const m = maderaDeLaGuia([linea("Tornillo", 977, 2.5)]);
    expect(m).toMatchObject({ monto: 2442.5, pt: 977, precioPt: 2.5, precioUnico: true, sinCosto: 0 });
  });

  it("dos precios: suma los montos y el precio es el promedio (rotulado como tal)", () => {
    const m = maderaDeLaGuia([linea("Tornillo", 1000, 2.5), linea("Cumala", 400, 2)]);
    expect(m?.monto).toBe(3300);
    expect(m?.pt).toBe(1400);
    expect(m?.precioUnico).toBe(false);
    expect(m?.precioPt).toBe(2.36); // 3 300 ÷ 1 400 = 2,357…
    expect(m?.porEspecie.map((e) => [e.especie, e.cantidad, e.precio, e.monto])).toEqual([
      ["Tornillo", 1000, 2.5, 2500],
      ["Cumala", 400, 2, 800],
    ]);
  });

  it("sin precio anotado no hay cifra: null, nunca un precio inventado", () => {
    expect(maderaDeLaGuia([linea("Tornillo", null, null)])).toBeNull();
    expect(maderaDeLaGuia([])).toBeNull();
  });

  it("una línea en m³ deja el total sin pt (no se mezclan unidades)", () => {
    const m3: LineaGuiaConCosto = {
      speciesCommonName: "Capirona",
      costoTotal: 1200,
      costoDetalle: { unidad: "m3", precio: 400, cantidadFactura: 3, ptUsado: null },
    };
    const m = maderaDeLaGuia([linea("Tornillo", 1000, 2.5), m3]);
    expect(m?.monto).toBe(3700);
    expect(m?.pt).toBeNull();
    expect(m?.precioPt).toBeNull();
    expect(m?.porEspecie[1]).toMatchObject({ unidad: "m³", cantidad: 3, precio: 400 });
  });

  it("cuenta las líneas que todavía no tienen costo", () => {
    expect(maderaDeLaGuia([linea("Tornillo", 1000, 2.5), linea("Cumala", null, null)])?.sinCosto).toBe(1);
  });
});

describe("cuánto baja el adelanto", () => {
  it("madera de más que el adelanto: baja todo el adelanto y el resto se le debe", () => {
    /* «MAMA DE ALEX» de Blas: S/ 2 442 de adelanto; una guía de S/ 3 300. */
    expect(cuantoBaja(3300, 2442)).toEqual({ baja: 2442, quedaAdelanto: 0, quedaPorPagar: 858 });
  });

  it("madera de menos: baja la guía entera y le queda adelanto", () => {
    expect(cuantoBaja(800, 2442)).toEqual({ baja: 800, quedaAdelanto: 1642, quedaPorPagar: 0 });
  });

  it("céntimos y negativos no dan vuelta el signo", () => {
    expect(cuantoBaja(0.1 + 0.2, 10)).toEqual({ baja: 0.3, quedaAdelanto: 9.7, quedaPorPagar: 0 });
    expect(cuantoBaja(-5, 10).baja).toBe(0);
  });
});

describe("qué decir en la guía", () => {
  const base = { totalMadera: 800, pendiente: 800, cruzado: 0, cruzable: true, adelantoTeDebe: 2442 };

  it("ofrece descontar con la cifra", () => {
    expect(estadoDescuentoGuia(base)).toEqual({ tipo: "ofrecer", yaBajo: 0, baja: 800, quedaAdelanto: 1642, quedaPorPagar: 0 });
  });

  it("sin costo pide el precio", () => {
    expect(estadoDescuentoGuia({ ...base, totalMadera: null })).toEqual({ tipo: "sin_costo" });
  });

  it("sin la unión con su persona de Adelantos, pide unirla", () => {
    expect(estadoDescuentoGuia({ ...base, cruzable: false })).toEqual({ tipo: "sin_unir" });
  });

  it("ya descontado: la guía cubierta por el cruce no vuelve a ofrecerlo", () => {
    expect(estadoDescuentoGuia({ ...base, pendiente: 0, cruzado: 800, adelantoTeDebe: 1642 })).toEqual({ tipo: "ya_descontado", monto: 800 });
    /* El adelanto se acabó antes que la guía: también es «ya bajó». */
    expect(estadoDescuentoGuia({ ...base, totalMadera: 3300, pendiente: 858, cruzado: 2442, adelantoTeDebe: 0 })).toEqual({
      tipo: "ya_descontado",
      monto: 2442,
    });
  });

  it("pagada con plata, sin cuenta o sin adelanto: nada que decir", () => {
    expect(estadoDescuentoGuia({ ...base, pendiente: 0 })).toEqual({ tipo: "nada" });
    expect(estadoDescuentoGuia({ ...base, pendiente: null })).toEqual({ tipo: "nada" });
    expect(estadoDescuentoGuia({ ...base, adelantoTeDebe: 0 })).toEqual({ tipo: "nada" });
  });

  it("un cruce parcial anterior se dice y se ofrece el resto", () => {
    expect(estadoDescuentoGuia({ ...base, totalMadera: 3300, pendiente: 1300, cruzado: 2000, adelantoTeDebe: 442 })).toMatchObject({
      tipo: "ofrecer",
      yaBajo: 2000,
      baja: 442,
    });
  });
});

describe("«ya descontado» en el servidor: un segundo cruce de la misma guía se rechaza", () => {
  const mov = (o: Partial<MovimientoCuenta>): MovimientoCuenta => ({
    id: "m",
    parteId: "p1",
    parteNombre: "Mamá de Alex",
    fecha: "2026-10-20",
    tipo: "abono",
    concepto: "madera",
    monto: 800,
    moneda: "PEN",
    referencia: null,
    fleteId: null,
    notas: null,
    ...o,
  });
  const partidasCon = (movimientos: MovimientoCuenta[], saldoAdelanto: number): PartidasDePersona => {
    const saldo = movimientos.reduce((t, m) => t + (m.tipo === "abono" ? -m.monto : m.monto), 0);
    return {
      persona: { beneficiarioId: "b1", parteId: "p1", nombre: "Mamá de Alex", documento: null },
      cruzable: true,
      adelantos: saldoAdelanto > 0
        ? [{ adelantoId: "a1", codigo: "ADL-2026-0003", fecha: "2026-08-01T12:00:00.000Z", saldo: saldoAdelanto, modalidad: "CUENTA_CORRIENTE" }]
        : [],
      forestal: { saldo, desde: "2026-10-20", movimientos, guias: guiasPendientesDe(movimientos) },
      fuera: [],
    };
  };
  const guia = mov({ id: "g", gtfNumber: "GTF-777" });
  const cruce = { fecha: "2026-10-25", compensar: 800, pago: null, imputacion: { guias: [{ gtfNumber: "GTF-777", monto: 800, paso: "cruce" as const }] } };

  it("el primer cruce baja el adelanto y nombra la guía", () => {
    const r = planLiquidacion(partidasCon([guia], 2442), cruce);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.entregas.map((e) => [e.adelantoId, e.valor])).toEqual([["a1", 800]]);
    expect(r.plan.movimientos.map((m) => [m.concepto, m.monto, m.gtfNumber])).toEqual([["compensacion", 800, "GTF-777"]]);
  });

  it("con el cruce ya anotado la guía no tiene pendiente y otro cruce da error (aunque venga con otra clave)", () => {
    const yaCruzada = mov({ id: "c", tipo: "cargo", concepto: "compensacion", monto: 800, gtfNumber: "GTF-777" });
    expect(guiasPendientesDe([guia, yaCruzada])).toEqual([]);
    const r = planLiquidacion(partidasCon([guia, yaCruzada], 1642), cruce);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errores.join(" ")).toMatch(/GTF-777 no tiene nada pendiente/);
  });
});

describe("equivalente en pt", () => {
  it("S/ → pt al precio que se conoce; sin precio, null", () => {
    expect(ptEquivalente(2442, 2.5)).toBe(976.8);
    expect(ptEquivalente(2442, null)).toBeNull();
    expect(ptEquivalente(2442, 0)).toBeNull();
    expect(ptEquivalente(0, 2.5)).toBeNull();
  });

  it("precio promedio de un lote", () => {
    expect(precioPromedio(2500, 1000)).toBe(2.5);
    expect(precioPromedio(null, 1000)).toBeNull();
    expect(precioPromedio(100, 0)).toBeNull();
  });

  it("el saldo de un adelanto con sus pt declarados (sólo lo COMPRADO)", () => {
    const a = { montoAdelantado: 3642, saldoPendiente: 2442, piesTablares: 1457, piesTablaresTipo: "COMPRADO" };
    expect(ptDelSaldoDelAdelanto(a)).toBe(976.93); // 2 442 × 1 457 ÷ 3 642
    expect(ptDelSaldoDelAdelanto({ ...a, piesTablaresTipo: "SERVICIO" })).toBeNull();
    expect(ptDelSaldoDelAdelanto({ ...a, piesTablares: null })).toBeNull();
    expect(ptDelSaldoDelAdelanto({ ...a, saldoPendiente: 0 })).toBeNull();
  });

  it("el último precio por pt: la cubicación aplicada más nueva, en pt y de compra", () => {
    const c = (codigo: string, fecha: string, o: Partial<Parameters<typeof ultimoPrecioPt>[0][number]> = {}) => ({
      codigo, fecha, unidad: "PT" as const, sentido: "compra", estado: "aplicada", monto: 2500, volumen: 1000, ...o,
    });
    expect(ultimoPrecioPt([
      c("CUB-1", "2026-10-01"),
      c("CUB-2", "2026-10-10", { monto: 2400, volumen: 1000 }),
      c("CUB-3", "2026-10-20", { unidad: "m³" }),
      c("CUB-4", "2026-10-21", { sentido: "venta" }),
      c("CUB-5", "2026-10-22", { estado: "anulada" }),
      c("CUB-6", "2026-10-23", { monto: null }),
    ])).toEqual({ precioPt: 2.4, codigo: "CUB-2", fecha: "2026-10-10" });
    expect(ultimoPrecioPt([])).toBeNull();
  });
});

describe("¿es la misma persona?", () => {
  const fila = (clave: string, nombre: string, o: Partial<{ beneficiarioId: string | null; parteId: string | null; abiertos: number }> = {}) => ({
    clave,
    nombre,
    beneficiarioId: o.beneficiarioId === undefined ? clave.replace("benef:", "") : o.beneficiarioId,
    parteId: o.parteId ?? null,
    adelantos: { abiertos: o.abiertos ?? 1, teDebe: 100 },
  });

  it("Wasaco (Adelantos) ↔ WASACO (directorio): el caso real de Blas", () => {
    const filas = [fila("benef:w", "Wasaco", { abiertos: 3 }), fila("benef:q", "Quispe Galindo Victor"), fila("parte:x", "WASACO", { beneficiarioId: null, parteId: "x" })];
    expect(sugerirPersonaDeAdelantos({ nombre: "WASACO" }, filas)).toMatchObject({ candidata: { parteId: "w", nombre: "Wasaco" }, motivo: "mismo-nombre" });
  });

  it("dos que calzan, una ya unida o sin nada abierto: no sugiere", () => {
    expect(sugerirPersonaDeAdelantos({ nombre: "Juana" }, [fila("benef:a", "Juana"), fila("benef:b", "JUANA")])).toBeNull();
    expect(sugerirPersonaDeAdelantos({ nombre: "Juana" }, [fila("benef:a", "Juana", { parteId: "p9" })])).toBeNull();
    expect(sugerirPersonaDeAdelantos({ nombre: "Juana" }, [fila("benef:a", "Juana", { abiertos: 0 })])).toBeNull();
  });
});

// ── Unir con su ficha del Directorio: lo que lee la ficha de la persona ──────

describe("armarUnionDirectorio", () => {
  const parte = (id: string, nombre: string, doc: string | null = null, activo = true): ParteDelDirectorio => ({
    id, nombre, docTipo: doc ? "RUC" : null, docNumero: doc, activo,
  });
  const partes = [
    parte("p1", "WASACO", "20601234438"),
    parte("p2", "Maderera Wasaco Norte", "20609998887"),
    parte("p3", "Juan Pérez", "45678912"),
    parte("p4", "Wasaco Viejo", null, false),
  ];
  const persona = (o: Partial<{ nombre: string; documento: string | null; forestPartyId: string | null }> = {}) => ({
    id: "b1", nombre: "Wasaco", documento: null, forestPartyId: null, ...o,
  });

  it("sugiere la ficha libre del mismo nombre y el documento sale enmascarado", () => {
    const u = armarUnionDirectorio(persona(), partes, new Map(), "");
    expect(u.unida).toBeNull();
    expect(u.sugerida?.motivo).toBe("mismo-nombre");
    expect(u.sugerida?.parte).toEqual({ id: "p1", nombre: "WASACO", documento: "RUC ••••••••438", activo: true, unidaA: null });
    expect(JSON.stringify(u)).not.toContain("20601234438");
    expect(u.resultados).toEqual([]);
  });

  it("por documento gana aunque el nombre no se parezca", () => {
    const u = armarUnionDirectorio(persona({ nombre: "Don Juan", documento: "45678912" }), partes, new Map(), "");
    expect(u.sugerida).toMatchObject({ motivo: "mismo-documento", parte: { id: "p3" } });
  });

  it("ya unida: muestra a quién y no sugiere otra", () => {
    const u = armarUnionDirectorio(persona({ forestPartyId: "p1" }), partes, new Map(), "wasaco");
    expect(u.unida?.id).toBe("p1");
    expect(u.sugerida).toBeNull();
    expect(u.resultados.map((p) => p.id)).toEqual(["p2"]);
  });

  it("la ficha de otra persona no se sugiere y en la búsqueda sale al final con su dueña", () => {
    const unidas = new Map([["p1", "Wasaco SAC"]]);
    const u = armarUnionDirectorio(persona(), partes, unidas, "wasaco");
    expect(u.sugerida).toBeNull();
    expect(u.resultados.map((p) => [p.id, p.unidaA])).toEqual([["p2", null], ["p1", "Wasaco SAC"]]);
  });

  it("busca por 3+ dígitos del documento y nunca ofrece una dada de baja", () => {
    expect(armarUnionDirectorio(persona(), partes, new Map(), "887").resultados.map((p) => p.id)).toEqual(["p2"]);
    expect(armarUnionDirectorio(persona(), partes, new Map(), "viejo").resultados).toEqual([]);
    expect(armarUnionDirectorio(persona(), partes, new Map(), "w").resultados).toEqual([]);
    expect(armarUnionDirectorio(persona(), partes, new Map(), "12").resultados).toEqual([]);
  });
});
