/**
 * ADR-449 — Cruzar lo recibido contra la cuenta de aserríos: todo lo PURO.
 *
 * El caso real (Blas, 28-09, leído en sólo lectura): WASACO te adelantó
 * S/ 3 031 (ADL-2026-0003 1 731 + ADL-2026-0004 1 300, los dos con la MISMA
 * fecha) y tiene 32 cargos de aserrío por S/ 12 323,02. Además le diste
 * ADL-2026-0002 por S/ 3 217. En el fixture los dos primeros ya van como
 * RECIBIDO (Brandon los corrige con «Corregir dirección»).
 *
 * Lo que se protege: cada adelanto recibe ≤ su saldo, la cuenta forestal nunca
 * cambia de signo, no se cruza en las dos direcciones a la vez, sólo soles, el
 * neto de la persona no cambia con el cruce, y lo de antes (sin recibidos) da la
 * MISMA huella y el MISMO plan.
 */

import { describe, expect, it } from "vitest";
import {
  clasificarAdelantos,
  detalleDeLiquidacion,
  huellaDe,
  intencionDejarEnCero,
  leerPlan,
  liquidacionInputSchema,
  maximoCompensable,
  maximoCruceRecibido,
  planLiquidacion,
  saldosDe,
  textoLiquidacion,
  type AdelantoParaLiquidar,
  type IntencionLiquidacion,
  type LiquidacionDTO,
  type PartidasDePersona,
} from "@/lib/cuentas/liquidacion";
import { normalizarNombre, sugerirVinculo } from "@/lib/adelantos/vinculo-sugerido";
import { armarCuentaDeGuia } from "@/lib/forestal/cuenta-en-la-guia";
import type { MovimientoCuenta } from "@/lib/forestal/cuenta-corriente";

// ── El caso WASACO, con las cifras de Blas ───────────────────────────────────

/** Los 32 cargos de aserrío de WASACO en Blas (fecha, monto), en orden. */
const ASERRIOS: [string, number][] = [
  ["2026-09-07", 271.5], ["2026-09-07", 111.69], ["2026-09-07", 465.8], ["2026-09-07", 125.01],
  ["2026-09-07", 472.71], ["2026-09-07", 172.89], ["2026-09-08", 293.4], ["2026-09-08", 878.24],
  ["2026-09-09", 401.59], ["2026-09-09", 368.96], ["2026-09-09", 323.16], ["2026-09-09", 153.41],
  ["2026-09-09", 143.76], ["2026-09-09", 65.01], ["2026-09-10", 958.01], ["2026-09-10", 606.94],
  ["2026-09-10", 118], ["2026-09-10", 253.5], ["2026-09-11", 1152.46], ["2026-09-11", 308.77],
  ["2026-09-11", 218.99], ["2026-09-12", 454.74], ["2026-09-12", 166.95], ["2026-09-21", 131.9],
  ["2026-09-21", 421.53], ["2026-09-21", 53.84], ["2026-09-21", 59.63], ["2026-09-22", 239],
  ["2026-09-22", 254.7], ["2026-09-22", 139.26], ["2026-09-28", 1268.83], ["2026-10-02", 1268.84],
];

const movs: MovimientoCuenta[] = ASERRIOS.map(([f, m], i) => ({
  id: `m${String(i).padStart(2, "0")}`,
  parteId: "p-wasaco",
  parteNombre: "WASACO",
  fecha: `${f}T00:00:00.000Z`,
  tipo: "cargo",
  concepto: "aserrio_prestado",
  monto: m,
  moneda: "PEN",
  referencia: null,
  fleteId: null,
  notas: null,
}));

const fila = (o: Partial<AdelantoParaLiquidar> & { id: string }): AdelantoParaLiquidar => ({
  codigo: null,
  fecha: "2026-09-19T22:00:00.000Z",
  saldo: 0,
  moneda: "PEN",
  modalidad: "CUENTA_CORRIENTE",
  status: "ABIERTO",
  cuotasPactadas: 0,
  direccion: "DADO",
  ...o,
});

/* Los ids reales: 0003 < 0004 por id (la fecha es la misma). */
const FILAS_WASACO: AdelantoParaLiquidar[] = [
  fila({ id: "cmuk8sitm0035zhvzcjov6wco", codigo: "ADL-2026-0002", saldo: 3217 }),
  fila({ id: "cmuk8vzfu003azhvzvsgul48w", codigo: "ADL-2026-0004", saldo: 1300, direccion: "RECIBIDO" }),
  fila({ id: "cmuk8us2f0038zhvz1gglz6ot", codigo: "ADL-2026-0003", saldo: 1731, direccion: "RECIBIDO" }),
];

function partidasDe(filas: readonly AdelantoParaLiquidar[], o: Partial<PartidasDePersona> = {}): PartidasDePersona {
  const { adelantos, recibidos, fuera } = clasificarAdelantos(filas);
  return {
    persona: { beneficiarioId: "b-wasaco", parteId: "p-wasaco", nombre: "WASACO", documento: null },
    cruzable: true,
    adelantos,
    recibidos,
    forestal: { saldo: 12323.02, desde: "2026-09-07T00:00:00.000Z", movimientos: movs },
    fuera,
    ...o,
  };
}

const wasaco = () => partidasDe(FILAS_WASACO);

const intencion = (o: Partial<IntencionLiquidacion> = {}): IntencionLiquidacion => ({ fecha: "2026-09-28", compensar: 0, pago: null, ...o });

function plan(p: PartidasDePersona, i: IntencionLiquidacion) {
  const r = planLiquidacion(p, i);
  if (!r.ok) throw new Error(r.errores.join(" · "));
  return r.plan;
}
function errores(p: PartidasDePersona, i: IntencionLiquidacion): string[] {
  const r = planLiquidacion(p, i);
  return r.ok ? [] : r.errores;
}

describe("WASACO de punta a punta", () => {
  it("los 32 aserríos suman lo que dice Blas", () => {
    expect(Math.round(movs.reduce((a, m) => a + m.monto, 0) * 100) / 100).toBe(12323.02);
  });

  it("lo recibido va a `recibidos` en orden FIFO; el dado, al FIFO de siempre", () => {
    const p = wasaco();
    expect(p.adelantos.map((a) => a.codigo)).toEqual(["ADL-2026-0002"]);
    expect(p.recibidos?.map((r) => [r.codigo, r.saldo])).toEqual([["ADL-2026-0003", 1731], ["ADL-2026-0004", 1300]]);
    expect(p.fuera).toEqual([]);
    expect(maximoCruceRecibido(p)).toBe(3031);
    /* El cruce de siempre pide la cuenta a favor suyo: acá no hay. */
    expect(maximoCompensable(p)).toBe(0);
  });

  it("cruzar 3 031: dos entregas LIBRE (≤ su saldo), un abono `compensacion`, la caja quieta y el neto igual", () => {
    const p = wasaco();
    const pl = plan(p, intencion({ cruzarRecibido: 3031 }));
    expect(pl.entregas).toEqual([
      { adelantoId: "cmuk8us2f0038zhvz1gglz6ot", codigo: "ADL-2026-0003", valor: 1731, paso: "cruce", descripcion: "Cruce con sus aserríos", lado: "recibido" },
      { adelantoId: "cmuk8vzfu003azhvzvsgul48w", codigo: "ADL-2026-0004", valor: 1300, paso: "cruce", descripcion: "Cruce con sus aserríos", lado: "recibido" },
    ]);
    expect(pl.movimientos).toEqual([
      { tipo: "abono", concepto: "compensacion", monto: 3031, paso: "cruce", notas: "Cruce con lo que adelantó (ADL-2026-0003, ADL-2026-0004)" },
    ]);
    expect(pl.caja).toBeNull();
    expect(pl.compensado).toBe(0);
    expect(pl.cruceRecibido).toBe(3031);
    expect(pl.antes).toEqual({ adelantosTeDebe: 3217, maderaSaldo: 12323.02, recibidoLeDebes: 3031, recibidoTeDebe: 0, neto: 12509.02 });
    expect(pl.despues).toEqual({ adelantosTeDebe: 3217, maderaSaldo: 9292.02, recibidoLeDebes: 0, recibidoTeDebe: 0, neto: 12509.02 });
    /* Lo cubierto por antigüedad: los aserríos más viejos, 3 031 exactos. */
    expect(Math.round(pl.cubiertos.reduce((a, c) => a + c.cubierto, 0) * 100) / 100).toBe(3031);
    expect(pl.cubiertos[0].fecha.slice(0, 10)).toBe("2026-09-07");
  });

  it("el acta, el texto y la lectura lo dicen con el código del acto", () => {
    const pl = plan(wasaco(), intencion({ cruzarRecibido: 3031 }));
    const det = detalleDeLiquidacion(pl, { codigo: "LIQ-2026-0009", entregaIds: ["e1", "e2"], movimientoIds: ["f1"] });
    expect(det.entregas.map((e) => e.descripcion)).toEqual(["Cruce LIQ-2026-0009 con sus aserríos", "Cruce LIQ-2026-0009 con sus aserríos"]);
    expect(det.movimientos[0].notas).toBe("LIQ-2026-0009 · Cruce con lo que adelantó (ADL-2026-0003, ADL-2026-0004)");
    expect(det.cruceRecibido).toBe(3031);
    expect(leerPlan(pl, "WASACO")).toContain("No mueve la caja.");
    const dto: LiquidacionDTO = {
      id: "l1",
      codigo: "LIQ-2026-0009",
      fecha: "2026-09-28",
      persona: { beneficiarioId: "b-wasaco", parteId: "p-wasaco", nombre: "WASACO", documento: null },
      compensado: 3031,
      pago: null,
      caja: { resultado: "no_mover", movimientoId: null },
      detalle: det,
      notas: null,
      creadaPor: "qa",
      creadaEn: "2026-09-28T15:00:00.000Z",
      anulada: null,
    };
    const texto = textoLiquidacion(dto);
    expect(texto).toMatch(/Cruce de su adelanto contra sus aserríos: S\/\s?3[.,]?031/);
    expect(texto).not.toMatch(/Cruce entre adelantos y cuenta forestal/);
  });

  it("«Dejar en cero» (llamando de verdad a la función): cruza 3 031 y cobra 12 509,02; todo queda en cero", () => {
    const p = wasaco();
    const i = intencionDejarEnCero(p, "2026-09-28", "efectivo", true);
    expect(i).toEqual({
      fecha: "2026-09-28",
      compensar: 0,
      cruzarRecibido: 3031,
      pago: { direccion: "recibido", monto: 12509.02, metodo: "efectivo", moverCaja: true },
    });
    const pl = plan(p, i as IntencionLiquidacion);
    expect(pl.despues).toEqual({ adelantosTeDebe: 0, maderaSaldo: 0, recibidoLeDebes: 0, recibidoTeDebe: 0, neto: 0 });
    expect(pl.caja).toEqual({ tipo: "ingreso", monto: 12509.02, metodo: "efectivo" });
    /* El pago se imputa a ADL-0002 y a la cuenta forestal, nunca a lo recibido. */
    const pagos = pl.entregas.filter((e) => e.paso === "pago");
    expect(pagos.map((e) => [e.codigo, e.valor])).toEqual([["ADL-2026-0002", 3217]]);
    expect(pl.movimientos.find((m) => m.concepto === "pago")?.monto).toBe(9292.02);
  });
});

// ── Los bordes ───────────────────────────────────────────────────────────────

describe("los límites del cruce", () => {
  it("un céntimo de más se rechaza con la cifra", () => {
    const e = errores(wasaco(), intencion({ cruzarRecibido: 3031.01 }));
    expect(e).toHaveLength(1);
    expect(e[0]).toMatch(/^Lo máximo que cruza es S\/\s?3[.,\s]?031[.,]00\.$/);
  });

  it("lo recibido pasa de lo que debe: cruza sólo lo que debe, la cuenta queda en 0 (nunca a favor suyo) y «Dejar en cero» no propone", () => {
    const p = partidasDe(FILAS_WASACO, { forestal: { saldo: 1000, desde: null, movimientos: [movs[0]] } });
    expect(maximoCruceRecibido(p)).toBe(1000);
    const pl = plan(p, intencion({ cruzarRecibido: 1000 }));
    expect(pl.despues.maderaSaldo).toBe(0);
    expect(pl.despues.recibidoLeDebes).toBe(2031);
    expect(pl.entregas.map((e) => [e.codigo, e.valor])).toEqual([["ADL-2026-0003", 1000]]);
    expect(errores(p, intencion({ cruzarRecibido: 1000.01 }))[0]).toMatch(/Lo máximo que cruza es/);
    expect(intencionDejarEnCero(p, "2026-09-28", "efectivo", true)).toBeNull();
  });

  it("sin deuda en la cuenta forestal no hay contra qué cruzar", () => {
    const p = partidasDe(FILAS_WASACO, { forestal: { saldo: -50, desde: null, movimientos: [] } });
    expect(maximoCruceRecibido(p)).toBe(0);
    expect(errores(p, intencion({ cruzarRecibido: 10 }))[0]).toMatch(/no te debe nada en la cuenta forestal/);
  });

  it("FIFO con la misma fecha: desempata el id, siempre igual", () => {
    const p = wasaco();
    const pl = plan(p, intencion({ cruzarRecibido: 2000 }));
    expect(pl.entregas.map((e) => [e.codigo, e.valor])).toEqual([["ADL-2026-0003", 1731], ["ADL-2026-0004", 269]]);
    /* El orden de llegada de las filas no cambia nada. */
    const alReves = partidasDe([...FILAS_WASACO].reverse());
    expect(plan(alReves, intencion({ cruzarRecibido: 2000 })).entregas).toEqual(pl.entregas);
  });

  it("repartir a mano: suma exacta, ≤ cada saldo y sólo de lo recibido de esta persona", () => {
    const p = wasaco();
    const a3 = "cmuk8us2f0038zhvz1gglz6ot";
    const a4 = "cmuk8vzfu003azhvzvsgul48w";
    const ok = plan(p, intencion({ cruzarRecibido: 1500, imputacion: { cruceRecibido: [{ adelantoId: a4, monto: 1300 }, { adelantoId: a3, monto: 200 }] } }));
    expect(ok.entregas.map((e) => [e.codigo, e.valor])).toEqual([["ADL-2026-0004", 1300], ["ADL-2026-0003", 200]]);
    expect(errores(p, intencion({ cruzarRecibido: 1400, imputacion: { cruceRecibido: [{ adelantoId: a4, monto: 1400 }] } }))[0]).toMatch(/le debes .*1[.,]?300/);
    /* Un adelanto DADO (ADL-0002) no es algo que te dio. */
    expect(errores(p, intencion({ cruzarRecibido: 100, imputacion: { cruceRecibido: [{ adelantoId: "cmuk8sitm0035zhvzcjov6wco", monto: 100 }] } }))[0]).toMatch(/no es algo que te haya dado/);
    expect(errores(p, intencion({ cruzarRecibido: 500, imputacion: { cruceRecibido: [{ adelantoId: a3, monto: 400 }] } }))[0]).toMatch(/El reparto suma/);
  });

  it("sin vínculo explícito no se cruza", () => {
    const p = partidasDe(FILAS_WASACO, { cruzable: false });
    expect(maximoCruceRecibido(p)).toBe(0);
    expect(errores(p, intencion({ cruzarRecibido: 100 }))[0]).toMatch(/primero confirma que es la misma persona/);
    expect(intencionDejarEnCero(p, "2026-09-28", "efectivo", true)).toBeNull();
    /* Sin la cuenta forestal (el servidor no la manda sin vínculo): lo mismo. */
    const sinCuenta = partidasDe(FILAS_WASACO, { cruzable: false, forestal: null, persona: { beneficiarioId: "b", parteId: null, nombre: "Wasaco", documento: null } });
    expect(errores(sinCuenta, intencion({ cruzarRecibido: 100 }))[0]).toMatch(/primero confirma/);
  });

  it("en dólares queda fuera con su motivo y no se cruza", () => {
    const p = partidasDe([...FILAS_WASACO, fila({ id: "zusd", codigo: "ADL-2026-0099", saldo: 200, moneda: "USD", direccion: "RECIBIDO" })]);
    expect(p.recibidos?.map((r) => r.codigo)).toEqual(["ADL-2026-0003", "ADL-2026-0004"]);
    expect(p.fuera).toEqual([
      { etiqueta: "Adelanto ADL-2026-0099", monto: 200, moneda: "USD", motivo: "Es en USD: la cuenta se liquida en soles.", direccion: "RECIBIDO", quien: "le-debes" },
    ]);
    expect(maximoCruceRecibido(p)).toBe(3031);
    /* Los dólares no pesan en el neto en soles. */
    expect(saldosDe(p).recibidoLeDebes).toBe(3031);
  });

  it("con cuotas pactadas o excedido, queda fuera y «Dejar en cero» no propone", () => {
    const cuotas = partidasDe([...FILAS_WASACO, fila({ id: "zc", codigo: "ADL-2026-0098", saldo: 50, direccion: "RECIBIDO", cuotasPactadas: 2 })]);
    expect(cuotas.fuera[0].motivo).toMatch(/cuotas pactadas/);
    expect(saldosDe(cuotas).recibidoLeDebes).toBe(3081);
    expect(intencionDejarEnCero(cuotas, "2026-09-28", "efectivo", true)).toBeNull();
    const excedido = partidasDe([...FILAS_WASACO, fila({ id: "ze", codigo: "ADL-2026-0097", saldo: -20, status: "EXCEDIDO", direccion: "RECIBIDO" })]);
    expect(excedido.fuera[0]).toMatchObject({ quien: "te-debe", monto: 20 });
    expect(intencionDejarEnCero(excedido, "2026-09-28", "efectivo", true)).toBeNull();
  });

  it("no se cruza en las dos direcciones a la vez", () => {
    expect(errores(wasaco(), intencion({ compensar: 10, cruzarRecibido: 10 }))).toEqual(["No se cruza en las dos direcciones a la vez: elige un solo cruce."]);
  });

  it("un cruce de lo recibido no se imputa a una guía (las guías bajan lo que le debes)", () => {
    const e = errores(wasaco(), intencion({ cruzarRecibido: 100, imputacion: { guias: [{ gtfNumber: "G-1", monto: 100, paso: "cruce" }] } }));
    expect(e.length).toBe(1);
  });
});

// ── Lo de antes no cambia ────────────────────────────────────────────────────

describe("compatibilidad", () => {
  it("sin recibidos, la huella es la de siempre (con o sin la clave `recibidos`)", () => {
    /* ADL-0002 + un DADO excedido + uno en dólares: lo que ya caía en `fuera`. */
    const { recibidos: _r, ...sinClave } = partidasDe([
      FILAS_WASACO[0],
      fila({ id: "zx", codigo: "ADL-2026-0090", fecha: "2026-09-18T22:00:00.000Z", saldo: -40, status: "EXCEDIDO" }),
      fila({ id: "zu", codigo: "ADL-2026-0091", fecha: "2026-09-18T22:00:00.000Z", saldo: 60, moneda: "USD" }),
    ]);
    expect(sinClave.fuera).toHaveLength(2);
    const conVacio: PartidasDePersona = { ...sinClave, recibidos: [] };
    expect(huellaDe(conVacio)).toBe(huellaDe(sinClave));
    /* Medido contra `git show HEAD:lib/cuentas/liquidacion.ts` (probe con tsx,
       28-09): la misma persona, con los 32 aserríos. Plan e «dejar en cero»
       también dieron idénticos en ese probe. */
    expect(huellaDe(sinClave)).toBe(HUELLA_HEAD_SIN_RECIBIDOS);
  });

  it("la huella mira lo recibido: saldo y fecha", () => {
    const base = wasaco();
    const otroSaldo = { ...base, recibidos: base.recibidos?.map((r, i) => (i === 0 ? { ...r, saldo: 1730 } : r)) };
    const otraFecha = { ...base, recibidos: base.recibidos?.map((r, i) => (i === 0 ? { ...r, fecha: "2026-09-20T22:00:00.000Z" } : r)) };
    expect(huellaDe(otroSaldo)).not.toBe(huellaDe(base));
    expect(huellaDe(otraFecha)).not.toBe(huellaDe(base));
  });

  it("sin cruce de lo recibido, el plan no trae `cruceRecibido` ni `lado`", () => {
    const pl = plan(wasaco(), intencion({ pago: { direccion: "recibido", monto: 100, metodo: "efectivo", moverCaja: false } }));
    expect("cruceRecibido" in pl).toBe(false);
    expect(pl.entregas.every((e) => !("lado" in e))).toBe(true);
  });

  it("la entrada acepta el cruce solo, y rechaza montos negativos", () => {
    const base = {
      idempotencyKey: "0b8f6c1e-1b1f-4e0a-9f0a-0c1d2e3f4a5b",
      persona: { beneficiarioId: "b1" },
      fecha: "2026-09-01",
      compensar: 0,
      pago: null,
      huella: "abcd1234",
    };
    expect(liquidacionInputSchema.safeParse({ ...base, cruzarRecibido: 3031 }).success).toBe(true);
    expect(liquidacionInputSchema.safeParse({ ...base, cruzarRecibido: 3031, imputacion: { cruceRecibido: [{ adelantoId: "a3", monto: 3031 }] } }).success).toBe(true);
    expect(liquidacionInputSchema.safeParse(base).success).toBe(false);
    expect(liquidacionInputSchema.safeParse({ ...base, cruzarRecibido: -1 }).success).toBe(false);
  });
});

// ── La sugerencia de vínculo por nombre ──────────────────────────────────────

describe("¿es la misma persona? (sugerencia por nombre)", () => {
  /* Blas, 28-09: las 4 fichas de Adelantos contra las 11 partes del directorio. */
  const FICHAS = ["MAMA DE ALEX", "PRUEBA TEST - Juan Perez", "Quispe Galindo  Victor", "Wasaco"];
  const PARTES = [
    "20605859438",
    "BULEJE LAURA BRANDON LUIS",
    "COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI",
    "COMUNIDAD SANTA ROSA DE CHIVIS",
    "INVERSIONES AGROFORESTALES BLAS SOCIEDAD ANONIMA CERRADA",
    "Lucho",
    "Maderera San Martín S.A.C.",
    "QUINCHUNLLA PEREZ, NELLY",
    "SANTOS MUÑOZ JOSE HORD",
    "Transportes Rio Verde SAC",
    "WASACO",
  ].map((nombre, i) => ({ parteId: `p${i}`, nombre, documento: null }));

  it("en Blas: 1 sugerencia (Wasaco ↔ WASACO) y ningún falso positivo", () => {
    const hallazgos = FICHAS.map((n) => [n, sugerirVinculo({ nombre: n, documento: null }, PARTES)?.candidata.nombre ?? null]);
    expect(hallazgos).toEqual([
      ["MAMA DE ALEX", null],
      ["PRUEBA TEST - Juan Perez", null],
      ["Quispe Galindo  Victor", null],
      ["Wasaco", "WASACO"],
    ]);
  });

  it("normaliza tildes, mayúsculas, puntuación y la forma de empresa", () => {
    expect(normalizarNombre("Transportes Río Verde S.A.C.")).toBe("transportes rio verde");
    expect(normalizarNombre("TRANSPORTES RIO VERDE SAC")).toBe("transportes rio verde");
    expect(normalizarNombre("Maderera San Martín E.I.R.L.")).toBe("maderera san martin");
    expect(normalizarNombre("INVERSIONES AGROFORESTALES BLAS SOCIEDAD ANONIMA CERRADA")).toBe("inversiones agroforestales blas");
    /* La ñ es otra letra: MUÑOZ no es MUNOZ. */
    expect(normalizarNombre("SANTOS MUÑOZ")).not.toBe(normalizarNombre("SANTOS MUNOZ"));
    /* Una empresa que se llama sólo «SAC» no se queda vacía. */
    expect(normalizarNombre("SAC")).toBe("sac");
  });

  it("dos homónimos o un nombre muy corto no sugieren nada; el documento manda si lo hay", () => {
    const dos = [{ parteId: "a", nombre: "WASACO", documento: null }, { parteId: "b", nombre: "Wasaco S.A.C.", documento: null }];
    expect(sugerirVinculo({ nombre: "wasaco", documento: null }, dos)).toBeNull();
    expect(sugerirVinculo({ nombre: "Lu", documento: null }, [{ parteId: "a", nombre: "LU", documento: null }])).toBeNull();
    const porDoc = sugerirVinculo({ nombre: "Otro nombre", documento: "20-60585943-8" }, [{ parteId: "a", nombre: "X", documento: "20605859438" }]);
    expect(porDoc).toMatchObject({ motivo: "mismo-documento", candidata: { parteId: "a" } });
    /* Una candidata sin parte no es una parte. */
    expect(sugerirVinculo({ nombre: "Wasaco", documento: null }, [{ parteId: null, nombre: "WASACO", documento: null }])).toBeNull();
  });
});

// ── La cuenta vista desde la guía ────────────────────────────────────────────

describe("«Plata de la guía»: el abono del cruce no resta de lo pagado", () => {
  it("pagado cuenta el cruce que le paga (cargo), no el que baja sus aserríos (abono)", () => {
    const linea = (conceptoForestal: "compensacion" | "pago_hecho", monto: number) => ({
      fecha: "2026-09-28T00:00:00.000Z",
      origen: "forestal" as const,
      concepto: "Cruce",
      referencia: null,
      monto,
      moneda: "PEN",
      acumulado: 0,
      conceptoForestal,
    });
    const dto = armarCuentaDeGuia({
      parteId: "p",
      nombre: "X",
      beneficiarioId: "b",
      neto: 0,
      adelantado: 0,
      otrasMonedas: {},
      lineas: [linea("pago_hecho", 500), linea("compensacion", 200), linea("compensacion", -3031)] as never,
      dia: (iso) => iso.slice(0, 10),
    });
    expect(dto.pagado).toBe(700);
  });
});

/** La huella de ese fixture con el código de HEAD (antes de ADR-449). */
const HUELLA_HEAD_SIN_RECIBIDOS = "68988e1c";
