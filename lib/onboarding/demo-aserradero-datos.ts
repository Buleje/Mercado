/**
 * Datos de ejemplo de un aserradero para la DEMO de venta (carril D, noche 04-11).
 *
 * Archivo PURO (sin base): lo usa el sembrador (`demo-aserradero.ts`) para
 * escribir y el modo ensayo del script para imprimir lo que haría sin abrir
 * conexión. Todo nombre es inventado; el RUC es de prueba (20000000001).
 *
 * Reglas de cifras (memorias `pie-tablar-rollo-vs-aserrada` y ADR-531):
 *  - rollo (trozas, ingreso, consumo, patio): PT = m³ × 56 % × 424 (`pieTablarRolloDe`);
 *  - aserrada: PT = espesor″ × ancho″ × largo′ ÷ 12 por pieza; m³ = Σ PT ÷ 424
 *    redondeado UNA vez por fila (paquete), a 3 decimales.
 */
import { pieTablarRolloDe } from "@/lib/forestal/loctp-catalogos";

/** Marca reconocible: va en las notas de cada fila sembrada (idempotencia y purga). */
export const MARCA_DEMO = "[demo-aserradero v1]";
export const USUARIO_DEMO = "demo-sembrador";
/** El criterio de «negocio demo» sin schema: slug con este prefijo (+ `--si-estoy-seguro`). */
export const PREFIJO_SLUG_DEMO = "demo-";
const BLAS_TENANT_ID = "cmpxiv6p4000bohvzwl6bnfpv";
export const TENANTS_PROHIBIDOS: readonly string[] = [BLAS_TENANT_ID, "main"];

export const PT_POR_M3_ASERRADA = 424;
export const RENDIMIENTO_MAXIMO = 0.75;

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function esTenantDemo(t: { id: string; slug: string } | null): boolean {
  if (!t) return false;
  if (TENANTS_PROHIBIDOS.includes(t.id) || TENANTS_PROHIBIDOS.includes(t.slug)) return false;
  return t.slug.startsWith(PREFIJO_SLUG_DEMO) && t.slug.length > PREFIJO_SLUG_DEMO.length;
}

/** Volumen de una troza en rollo (Huber con el diámetro medio): 0,7854 × D² × L. */
export function volumenTroza(diametroCm: number, largoM: number): number {
  return r3(0.7854 * (diametroCm / 100) ** 2 * largoM);
}

/** PT exacto de un paquete de aserrada (sin redondear) y su m³ (redondeado una vez). */
export function cifrasPaquete(p: { cantidad: number; espesorPulg: number; anchoPulg: number; largoPies: number }) {
  const ptExacto = (p.cantidad * p.espesorPulg * p.anchoPulg * p.largoPies) / 12;
  return { pt: r2(ptExacto), m3: r3(ptExacto / PT_POR_M3_ASERRADA) };
}

export const PROVEEDOR_DEMO = {
  nombre: "Bosques Demo del Oriente S.A.C.",
  ruc: "20000000001",
};
export const CLIENTE_DEMO = {
  nombre: "Maderera Ejemplo Andina S.A.C.",
  ruc: "20000000002",
  direccion: "Av. Ejemplo 123, Lima",
};
export const PLAN_DEMO = {
  planNumber: "PO-DEMO-001",
  tituloHabilitante: "TH-DEMO-0001",
  resolucionNumber: "R.D. N.° 0000-2026-DEMO",
  parcelaCorta: "PC-01",
  areaHa: 250,
  region: "Ucayali",
};

interface PaqueteDemo { codigo: string; cantidad: number; espesorPulg: number; anchoPulg: number; largoPies: number }
interface EspecieDemo {
  nombre: string;
  cientifico: string;
  volumenAutorizadoM3: number;
  gtfIngreso: string;
  /** [diámetro cm, largo m] de cada troza que llega. */
  trozas: [number, number][];
  /** Cuántas de esas trozas (las primeras) entran a la sierra. */
  consumidas: number;
  paquetes: PaqueteDemo[];
}

export const ESPECIES_DEMO: readonly EspecieDemo[] = [
  {
    nombre: "Tornillo",
    cientifico: "Cedrelinga cateniformis",
    volumenAutorizadoM3: 120,
    gtfIngreso: "DEMO-0001",
    trozas: [[62, 5.2], [58, 4.8], [70, 5.0], [55, 4.6], [66, 5.4], [60, 5.0]],
    consumidas: 4,
    paquetes: [
      { codigo: "T-2x6x10", cantidad: 60, espesorPulg: 2, anchoPulg: 6, largoPies: 10 },
      { codigo: "T-1x8x8", cantidad: 80, espesorPulg: 1, anchoPulg: 8, largoPies: 8 },
    ],
  },
  {
    nombre: "Cumala",
    cientifico: "Virola sp.",
    volumenAutorizadoM3: 80,
    gtfIngreso: "DEMO-0002",
    trozas: [[50, 4.5], [54, 5.0], [48, 4.2], [52, 4.8], [56, 5.2]],
    consumidas: 3,
    paquetes: [{ codigo: "C-1x6x8", cantidad: 100, espesorPulg: 1, anchoPulg: 6, largoPies: 8 }],
  },
];

/** Lo que sale con GTF: el primer paquete del tornillo, entero, a un cliente. */
export const DESPACHO_DEMO = { especie: "Tornillo", paquete: "T-2x6x10", gtfNumber: "DEMO-0101", precioPt: 4.2, abono: 1000 };

const DIA = 86_400_000;
/** Mediodía UTC (07:00 en Lima): ninguna fecha cae al día anterior. */
function diaAntes(hoy: Date, dias: number): Date {
  const d = new Date(hoy.getTime() - dias * DIA);
  d.setUTCHours(12, 0, 0, 0);
  return d;
}

export function planDemoAserradero(hoy: Date = new Date()) {
  const fechas = { ingreso: diaAntes(hoy, 20), consumo: diaAntes(hoy, 12), despacho: diaAntes(hoy, 5) };
  const especies = ESPECIES_DEMO.map((e) => {
    const trozas = e.trozas.map(([d, l], i) => ({ orden: i + 1, codigo: `${e.gtfIngreso}-${String(i + 1).padStart(2, "0")}`, diametroCm: d, largoM: l, volumenM3: volumenTroza(d, l) }));
    const ingresoM3 = r3(trozas.reduce((s, t) => s + t.volumenM3, 0));
    const consumidas = trozas.slice(0, e.consumidas);
    const consumoM3 = r3(consumidas.reduce((s, t) => s + t.volumenM3, 0));
    const paquetes = e.paquetes.map((p) => ({ ...p, ...cifrasPaquete(p) }));
    const producidoM3 = r3(paquetes.reduce((s, p) => s + p.m3, 0));
    const producidoPt = r2(paquetes.reduce((s, p) => s + p.pt, 0));
    return {
      ...e,
      trozasCalc: trozas,
      ingresoM3,
      ingresoPtRollo: pieTablarRolloDe(ingresoM3),
      consumoM3,
      consumoPtRollo: pieTablarRolloDe(consumoM3),
      trozasConsumidas: consumidas.length,
      saldoM3: r3(ingresoM3 - consumoM3),
      saldoPtRollo: pieTablarRolloDe(r3(ingresoM3 - consumoM3)),
      paquetesCalc: paquetes,
      producidoM3,
      producidoPt,
      piezas: paquetes.reduce((s, p) => s + p.cantidad, 0),
      rendimientoPct: r2((producidoM3 / consumoM3) * 100),
    };
  });
  const esp = especies.find((e) => e.nombre === DESPACHO_DEMO.especie)!;
  const paq = esp.paquetesCalc.find((p) => p.codigo === DESPACHO_DEMO.paquete)!;
  const montoVenta = r2(paq.pt * DESPACHO_DEMO.precioPt);
  const despacho = {
    especie: esp.nombre,
    cientifico: esp.cientifico,
    gtfNumber: DESPACHO_DEMO.gtfNumber,
    paquete: paq,
    m3: paq.m3,
    pt: paq.pt,
    piezas: paq.cantidad,
    precioPt: DESPACHO_DEMO.precioPt,
    montoVenta,
    abono: DESPACHO_DEMO.abono,
    debe: r2(montoVenta - DESPACHO_DEMO.abono),
  };
  return { fechas, especies, despacho };
}

export type PlanDemo = ReturnType<typeof planDemoAserradero>;

/** Las reglas que tienen que cerrar. Vacío = cuadra. */
export function verificarCuadre(plan: PlanDemo): string[] {
  const errores: string[] = [];
  for (const e of plan.especies) {
    if (e.saldoM3 !== r3(e.ingresoM3 - e.consumoM3)) errores.push(`${e.nombre}: saldo ≠ ingreso − consumo`);
    if (e.saldoM3 < 0) errores.push(`${e.nombre}: saldo negativo`);
    if (e.producidoM3 > r3(e.consumoM3 * RENDIMIENTO_MAXIMO)) errores.push(`${e.nombre}: producido supera el 75 % de lo consumido`);
    for (const p of e.paquetesCalc) {
      if (p.m3 !== r3(((p.cantidad * p.espesorPulg * p.anchoPulg * p.largoPies) / 12) / PT_POR_M3_ASERRADA)) errores.push(`${p.codigo}: m³ ≠ PT ÷ 424`);
    }
  }
  const esp = plan.especies.find((e) => e.nombre === plan.despacho.especie);
  if (!esp || plan.despacho.m3 > esp.producidoM3) errores.push("La GTF de despacho supera lo producido");
  if (plan.despacho.debe <= 0) errores.push("El cliente no queda debiendo: «Quién te debe» saldría vacío");
  return errores;
}

/** La secuencia de llamadas que hará el sembrador, en palabras y con cifras (modo ensayo). */
export function pasosDelPlan(plan: PlanDemo): { llamada: string; detalle: string }[] {
  const pasos: { llamada: string; detalle: string }[] = [];
  for (const e of plan.especies) pasos.push({ llamada: "ForestEspeciesDB.agregar", detalle: `${e.nombre} (${e.cientifico})` });
  pasos.push({ llamada: "ForestDirectorioDB.guardarParte", detalle: `proveedor ${PROVEEDOR_DEMO.nombre} · RUC ${PROVEEDOR_DEMO.ruc}` });
  pasos.push({ llamada: "ForestDirectorioDB.guardarParte", detalle: `cliente ${CLIENTE_DEMO.nombre} · RUC ${CLIENTE_DEMO.ruc}` });
  pasos.push({
    llamada: "ForestPlanDB.crearPlanConEspecies",
    detalle: `${PLAN_DEMO.planNumber} · ${plan.especies.map((e) => `${e.nombre} ${e.volumenAutorizadoM3} m³`).join(" + ")}`,
  });
  for (const e of plan.especies) {
    pasos.push({
      llamada: "WoodEntriesDB.create",
      detalle: `${e.nombre} · GTF ${e.gtfIngreso} · ${e.trozasCalc.length} trozas · ${e.ingresoM3} m³ · ${e.ingresoPtRollo} PT rollo`,
    });
  }
  for (const e of plan.especies) {
    pasos.push({ llamada: "ForestLoteAserrioDB.create", detalle: `lote de ${e.nombre}` });
    pasos.push({
      llamada: "ForestLoteAserrioDB.consumirEnPatio",
      detalle: `${e.trozasConsumidas} trozas · ${e.consumoM3} m³ (${e.consumoPtRollo} PT rollo) → patio queda ${e.saldoM3} m³ (${e.saldoPtRollo} PT rollo)`,
    });
    pasos.push({
      llamada: "ForestCtpDB.declararProduccion",
      detalle: `${e.paquetesCalc.map((p) => `${p.codigo} ${p.cantidad} pzs ${p.pt} PT = ${p.m3} m³`).join(" + ")} → ${e.producidoM3} m³ · rendimiento ${e.rendimientoPct} %`,
    });
  }
  const d = plan.despacho;
  pasos.push({ llamada: "ForestCtpDB.create (despacho)", detalle: `GTF ${d.gtfNumber} · ${d.especie} ${d.piezas} pzs · ${d.pt} PT = ${d.m3} m³ → ${CLIENTE_DEMO.nombre}` });
  pasos.push({ llamada: "ForestCubicacionesDB.save", detalle: `${d.pt} PT × S/ ${d.precioPt} = S/ ${d.montoVenta}` });
  pasos.push({ llamada: "ForestCuentaDB.guardar (cargo venta)", detalle: `S/ ${d.montoVenta}` });
  pasos.push({ llamada: "ForestCuentaDB.guardar (abono pago)", detalle: `S/ ${d.abono} → debe S/ ${d.debe} («Quién te debe»)` });
  return pasos;
}
