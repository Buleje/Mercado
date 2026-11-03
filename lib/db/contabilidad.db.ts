import "server-only";

/**
 * lib/db/contabilidad.db.ts — única vía a Prisma de la Contabilidad (ADR-529).
 *
 * - Mes ABIERTO: los asientos automáticos se arman en vivo con las filas de
 *   `ResultadoNegocioDB.filasDelMes` (las mismas de «Resultado» y «Caja del
 *   mes») + los manuales de la base. Nada se escribe al leer.
 * - Mes CERRADO: todo sale de la base (automáticos congelados al cerrar) y se
 *   compara con lo de hoy para avisar «el mes cerrado se movió».
 * - Acumulados (mayor, comprobación, situación): del `inicio` al mes.
 *
 * `tenantId` 1.er argumento en todo; caché corta (las fuentes cambian solas) y
 * `invalidateByPrefix` tras cada write.
 */

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import { toNumOrZero } from "@/lib/decimal-utils";
import { z } from "zod";
import type { Certeza } from "@/lib/finance/resultado-del-negocio";
import { ResultadoNegocioDB, hoyDeLima, type OpcionesLectura } from "./resultado-negocio.db";
import { armarAsientos, crearAsiento, numerar, sumasDe, type AsientosDelMes, type DatosExtra, type GastoExtra } from "@/lib/contabilidad/armar-asientos";
import { esImputable, fusionarConPropias, nombreDeCuenta, padreDe } from "@/lib/contabilidad/plan-pcge";
import { REGLAS, esRegla, r2, reglasVista, type ContextoReglas } from "@/lib/contabilidad/reglas";
import {
  arrastreAlEjercicio,
  comprobacion,
  cruceConResultado,
  efectoEnResultado,
  estadoResultados,
  estadoSituacion,
  mayor,
  saldosPorCuenta,
  soloResultados,
} from "@/lib/contabilidad/reportes";
import type { AjustesValidados, AsientoManualValidado } from "@/lib/contabilidad/esquemas";
import {
  TASA_IGV,
  type AjustesContables,
  type Asiento,
  type AsientoManualEntrada,
  type AvisoContable,
  type CuentaPlan,
  type CuentaPropiaEntrada,
  type EstadoPeriodo,
  type PeriodoResumen,
  type RespuestaAjustes,
  type RespuestaComprobacion,
  type RespuestaDiario,
  type RespuestaEstados,
  type RespuestaMayor,
  type RespuestaPeriodos,
  type RespuestaPlan,
} from "@/lib/contabilidad/tipos";

const TTL_VIVO_S = 60;
const PREFIJO = "contabilidad";
const clave = (tenantId: string) => `${PREFIJO}:${tenantId}`;
const sufijo = (o: OpcionesLectura) => (o.verPlanilla ? "p1" : "p0");
/** Tope de meses hacia atrás para el inicio automático (el primer hecho). */
const MAX_MESES_ATRAS = 24;

/** Error con su HTTP y la frase para la persona. */
export class ErrorContable extends Error {
  constructor(public readonly status: 400 | 404 | 409, mensaje: string) {
    super(mensaje);
  }
}

// ── Meses ──────────────────────────────────────────────────────────────────

export function sumarMeses(mes: string, n: number): string {
  const [y, m] = mes.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
export function mesesEntre(desde: string, hasta: string): string[] {
  const out: string[] = [];
  for (let m = desde; m <= hasta && out.length < 240; m = sumarMeses(m, 1)) out.push(m);
  return out;
}
const finDeMes = (mes: string) => {
  const sig = sumarMeses(mes, 1);
  return new Date(Date.UTC(Number(sig.slice(0, 4)), Number(sig.slice(5, 7)) - 1, 0)).toISOString().slice(0, 10);
};

// ── Lectura de filas de la base ────────────────────────────────────────────

const META = z.object({
  tab: z.string().optional(),
  params: z.record(z.string(), z.string()).optional(),
  regla: z.string().optional(),
  certeza: z.enum(["medido", "estimado", "incompleto"]).optional(),
});

const INCLUDE_LINEAS = { lineas: { orderBy: { orden: "asc" } } } as const;
type FilaAsiento = Prisma.AsientoContableGetPayload<{ include: typeof INCLUDE_LINEAS }>;

function asientoDeFila(f: FilaAsiento, plan: readonly CuentaPlan[], cerrado: boolean): Asiento {
  const meta = META.safeParse(f.enlace ?? {});
  const m = meta.success ? meta.data : {};
  const tipo = f.tipo === "auto" || f.tipo === "apertura" || f.tipo === "cierre" ? f.tipo : "manual";
  return crearAsiento(
    {
      id: f.id,
      periodo: f.periodo,
      fecha: f.fecha.toISOString().slice(0, 10),
      glosa: f.glosa,
      tipo,
      origen: f.origen,
      regla: m.regla ?? null,
      enlace: m.tab ? { tab: m.tab, params: m.params ?? {} } : null,
      certeza: m.certeza ?? "medido",
      anulado: f.anulado,
      editable: (tipo === "manual" || tipo === "apertura") && !cerrado && !f.anulado,
      lineas: f.lineas.map((l) => ({ cuenta: l.cuenta, debe: r2(toNumOrZero(l.debe)), haber: r2(toNumOrZero(l.haber)), glosa: l.glosa, tercero: l.tercero })),
    },
    (c) => nombreDeCuenta(c, plan),
  );
}

/** Foto que se guarda al cerrar (para el cruce y el «se movió»). */
const RESUMEN = z.object({
  asientos: z.number(),
  totalDebe: z.number(),
  totalHaber: z.number(),
  utilidad: z.number(),
  resultadoDelPanel: z.number(),
  igvVentas: z.number(),
  igvCompras: z.number(),
  otrasFuentes: z.number(),
  cajaNeto: z.number(),
  cajaFueraDelPanel: z.number(),
  /** Huella: saldo (debe − haber) de cada cuenta de los automáticos. Opcional: los cierres viejos no la tienen. */
  saldos: z.record(z.string(), z.number()).optional(),
});

/** Saldo por cuenta de los asientos (sin ceros): la huella del «se movió». */
function huellaDeSaldos(asientos: readonly Asiento[]): Record<string, number> {
  const m = new Map<string, number>();
  for (const a of asientos) {
    if (a.anulado) continue;
    for (const l of a.lineas) m.set(l.cuenta, (m.get(l.cuenta) ?? 0) + l.debe - l.haber);
  }
  return Object.fromEntries([...m].map(([k, v]) => [k, r2(v)] as const).filter(([, v]) => Math.abs(v) >= 0.005).sort(([a], [b]) => a.localeCompare(b)));
}

/** Cuentas cuyo saldo cambió entre dos huellas. */
function cuentasQueCambiaron(antes: Readonly<Record<string, number>>, ahora: Readonly<Record<string, number>>): string[] {
  return [...new Set([...Object.keys(antes), ...Object.keys(ahora)])].filter((k) => Math.abs((antes[k] ?? 0) - (ahora[k] ?? 0)) >= 0.005).sort();
}

/** Lo que solo ve quien ve la planilla: lo ganado por persona y lo pagado o descontado al personal (4111). */
const esDePersonal = (a: Asiento) => a.regla === "planilla" || a.lineas.some((l) => l.cuenta.startsWith("411"));
type Resumen = z.infer<typeof RESUMEN>;

interface MesContable {
  mes: string;
  estado: EstadoPeriodo;
  asientos: Asiento[];
  manuales: Asiento[];
  avisos: AvisoContable[];
  /** Lo vivo (solo meses abiertos o cuando se pide comparar). */
  vivo: AsientosDelMes & { resultadoDelPanel: number; cajaNeto: number } | null;
  resumen: Resumen | null;
  cerradoAt: string | null;
  cerradoPor: string | null;
}

interface Contexto {
  ajustes: AjustesContables;
  plan: CuentaPlan[];
  ctx: ContextoReglas;
}

async function enLotes<T, R>(items: readonly T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += n) out.push(...(await Promise.all(items.slice(i, i + n).map(fn))));
  return out;
}

// ── El DB class ────────────────────────────────────────────────────────────

export const ContabilidadDB = {
  /** Primer mes con un hecho del negocio (venta, pedido, gasto o adelanto), con tope de 24 meses. */
  async primerMes(tenantId: string): Promise<string | null> {
    if (!tenantId) throw new Error("tenantId is required");
    return getOrSet(`${clave(tenantId)}:primer-mes`, 3600, async () => {
      const [v, o, g, a] = await Promise.all([
        prisma.sale.aggregate({ where: { tenantId }, _min: { createdAt: true } }),
        prisma.order.aggregate({ where: { tenantId }, _min: { createdAt: true } }),
        prisma.expense.aggregate({ where: { tenantId, recurring: false }, _min: { date: true } }),
        prisma.adelanto.aggregate({ where: { tenantId, direccion: { in: ["DADO", "RECIBIDO"] } }, _min: { fechaAdelanto: true } }),
      ]);
      const fechas = [v._min.createdAt, o._min.createdAt, g._min.date, a._min.fechaAdelanto].filter((d): d is Date => d instanceof Date);
      if (fechas.length === 0) return null;
      const min = new Date(Math.min(...fechas.map((d) => d.getTime())));
      const mes = min.toISOString().slice(0, 7);
      const tope = sumarMeses(hoyDeLima().mes, -MAX_MESES_ATRAS);
      return mes < tope ? tope : mes;
    });
  },

  async contexto(tenantId: string): Promise<Contexto> {
    if (!tenantId) throw new Error("tenantId is required");
    const [aj, st, propias, primer] = await Promise.all([
      prisma.contabilidadAjustes.findUnique({ where: { tenantId } }),
      prisma.settings.findUnique({ where: { tenantId }, select: { regimenTributario: true } }),
      prisma.cuentaContablePropia.findMany({ where: { tenantId }, select: { codigo: true, nombre: true, naturaleza: true, activa: true } }),
      ContabilidadDB.primerMes(tenantId),
    ]);
    const regimen = st?.regimenTributario?.trim().toLowerCase() || null;
    const elegido = aj?.ventasConIgv ?? null;
    // NRUS o sin régimen anotado → sin IGV; RER/RMT/General → 18 % incluido.
    const ventasConIgv = elegido ?? (regimen != null && regimen !== "nrus");
    const mapeoCrudo = z.record(z.string(), z.string()).safeParse(aj?.mapeo ?? {});
    const mapeo = mapeoCrudo.success ? mapeoCrudo.data : {};
    const inicio = aj?.inicio ?? primer ?? hoyDeLima().mes;
    const ajustes: AjustesContables = { ventasConIgv, ventasConIgvElegido: elegido, regimen, tasaIgv: TASA_IGV, inicio, mapeo };
    return { ajustes, plan: fusionarConPropias(propias), ctx: { ventasConIgv, tasaIgv: TASA_IGV, mapeo } };
  },

  /** Lo que las filas no traen, por lote: categoría/IGV del gasto y tipo de persona. */
  async datosExtra(tenantId: string, mes: string, f: Awaited<ReturnType<typeof ResultadoNegocioDB.filasDelMes>>): Promise<DatosExtra> {
    const ids = (xs: readonly { id: string }[] | undefined) => (xs ?? []).map((x) => x.id);
    const gastoIds = [...new Set([...ids(f.resultado.gastos), ...ids(f.caja.gastos_pagados)])];
    const adelantoIds = ids(f.caja.adelanto_dado);
    const entregaIds = [...new Set([...ids(f.caja.adelanto_devuelto), ...f.cruces.filter((c) => c.direccion === "DADO").map((c) => c.id)])];
    const benefIds = [...new Set(Object.values(f.liquidacionBeneficiario ?? {}).filter((x): x is string => !!x))];
    const [gastos, adelantos, entregas, benefs] = await Promise.all([
      gastoIds.length ? prisma.expense.findMany({ where: { tenantId, id: { in: gastoIds } }, select: { id: true, category: true, documentNumber: true, igvAmount: true, afectoIgv: true } }) : [],
      adelantoIds.length ? prisma.adelanto.findMany({ where: { tenantId, id: { in: adelantoIds }, direccion: "DADO" }, select: { id: true, beneficiario: { select: { tipoRelacion: true } } } }) : [],
      entregaIds.length ? prisma.adelantoEntrega.findMany({ where: { id: { in: entregaIds }, anuladaAt: null, adelanto: { tenantId } }, select: { id: true, adelanto: { select: { beneficiario: { select: { tipoRelacion: true } } } } } }) : [],
      benefIds.length ? prisma.adelantoBeneficiario.findMany({ where: { tenantId, id: { in: benefIds } }, select: { id: true, tipoRelacion: true } }) : [],
    ]);
    const mapaGastos: Record<string, GastoExtra> = {};
    for (const g of gastos) mapaGastos[g.id] = { category: g.category, documentNumber: g.documentNumber, igvAmount: g.igvAmount == null ? null : r2(toNumOrZero(g.igvAmount)), afectoIgv: g.afectoIgv };
    const relB = new Map(benefs.map((b) => [b.id, b.tipoRelacion]));
    const relacionLiquidacion: Record<string, string | null> = {};
    for (const [lid, bid] of Object.entries(f.liquidacionBeneficiario ?? {})) relacionLiquidacion[lid] = bid ? relB.get(bid) ?? null : null;
    return {
      gastos: mapaGastos,
      relacionAdelanto: Object.fromEntries(adelantos.map((a) => [a.id, a.beneficiario.tipoRelacion])),
      relacionEntrega: Object.fromEntries(entregas.map((e) => [e.id, e.adelanto.beneficiario.tipoRelacion])),
      relacionLiquidacion,
    };
  },

  /** Los automáticos del mes armados en vivo (no escribe). */
  async mesVivo(tenantId: string, mes: string, hoy: string, opciones: OpcionesLectura, c?: Contexto): Promise<NonNullable<MesContable["vivo"]>> {
    if (!tenantId) throw new Error("tenantId is required");
    const cx = c ?? (await ContabilidadDB.contexto(tenantId));
    const huella = JSON.stringify([cx.ctx.ventasConIgv, cx.ctx.mapeo]);
    return getOrSet(`${clave(tenantId)}:vivo:${mes}:${hoy}:${sufijo(opciones)}:${huella}`, TTL_VIVO_S, async () => {
      const f = await ResultadoNegocioDB.filasDelMes(tenantId, mes, hoy, opciones);
      const extra = await ContabilidadDB.datosExtra(tenantId, mes, f);
      const a = armarAsientos(f, extra, cx.ctx, (k) => nombreDeCuenta(k, cx.plan));
      return { ...a, resultadoDelPanel: r2(f.resultadoDelPanel), cajaNeto: r2(f.cajaNeto) };
    });
  },

  /** Los meses `desde..hasta` con sus asientos (abiertos en vivo, cerrados de la base). */
  async rango(tenantId: string, desde: string, hasta: string, hoy: string, opciones: OpcionesLectura, c?: Contexto, compararCerrados = false): Promise<MesContable[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const cx = c ?? (await ContabilidadDB.contexto(tenantId));
    const meses = mesesEntre(desde < cx.ajustes.inicio ? cx.ajustes.inicio : desde, hasta);
    if (meses.length === 0) return [];
    const [periodos, filas] = await Promise.all([
      prisma.periodoContable.findMany({ where: { tenantId, periodo: { in: meses } } }),
      prisma.asientoContable.findMany({ where: { tenantId, periodo: { in: meses } }, include: INCLUDE_LINEAS }),
    ]);
    const porMes = new Map(periodos.map((p) => [p.periodo, p]));
    return enLotes(meses, 3, async (mes): Promise<MesContable> => {
      const p = porMes.get(mes);
      const cerrado = p?.estado === "cerrado";
      const delMes = filas.filter((f) => f.periodo === mes);
      const manuales = delMes.filter((f) => f.tipo !== "auto").map((f) => asientoDeFila(f, cx.plan, cerrado));
      const resumenP = RESUMEN.safeParse(p?.resumen ?? null);
      const resumen = resumenP.success ? resumenP.data : null;
      let autos: Asiento[];
      let vivo: MesContable["vivo"] = null;
      const avisos: AvisoContable[] = [];
      if (cerrado) {
        autos = delMes
          .filter((f) => f.tipo === "auto")
          .map((f) => asientoDeFila(f, cx.plan, true))
          // Sin permiso de RRHH no se ve lo ganado ni lo pagado por persona, tampoco congelado.
          .filter((a) => opciones.verPlanilla || !esDePersonal(a));
        if (compararCerrados) {
          vivo = await ContabilidadDB.mesVivo(tenantId, mes, hoy, opciones, cx);
          const s = sumasDe(vivo.asientos);
          // Con huella se compara cuenta por cuenta (un cambio que mueve plata entre cuentas sin cambiar el total también cuenta).
          const cambiaron = resumen?.saldos ? cuentasQueCambiaron(resumen.saldos, huellaDeSaldos(vivo.asientos)) : null;
          const seMovio = resumen && (cambiaron ? cambiaron.length > 0 : Math.abs(s.debe - resumen.totalDebe) >= 0.005 || vivo.asientos.length !== resumen.asientos);
          if (resumen && seMovio && opciones.verPlanilla) {
            const donde = cambiaron?.length ? ` (cuentas ${cambiaron.slice(0, 6).join(", ")}${cambiaron.length > 6 ? "…" : ""})` : "";
            avisos.push({ codigo: "mes_cerrado_se_movio", cuantos: cambiaron?.length ?? Math.abs(vivo.asientos.length - resumen.asientos), texto: `Después de cerrar alguien cambió algo del mes${donde}: hoy suma S/ ${s.debe.toFixed(2)} y al cerrar ${resumen.totalDebe.toFixed(2)}. Reabre y vuelve a cerrar para tomarlo.` });
          }
        }
      } else {
        vivo = await ContabilidadDB.mesVivo(tenantId, mes, hoy, opciones, cx);
        autos = vivo.asientos;
        avisos.push(...vivo.avisos);
      }
      return {
        mes,
        estado: cerrado ? "cerrado" : "abierto",
        asientos: numerar([...autos, ...manuales]),
        manuales,
        avisos,
        vivo,
        resumen,
        cerradoAt: p?.cerradoAt?.toISOString() ?? null,
        cerradoPor: p?.cerradoPor ?? null,
      };
    });
  },

  // ── Libros ───────────────────────────────────────────────────────────────

  async diario(tenantId: string, mes: string, hoy: string, opciones: OpcionesLectura): Promise<RespuestaDiario> {
    const cx = await ContabilidadDB.contexto(tenantId);
    const avisos: AvisoContable[] = [];
    if (mes < cx.ajustes.inicio) {
      avisos.push({ codigo: "antes_del_inicio", cuantos: 0, texto: `La contabilidad empieza en ${cx.ajustes.inicio}: antes de eso no se arman asientos (cámbialo en Ajustes).` });
      return { mes, estado: "abierto", asientos: [], totalDebe: 0, totalHaber: 0, cuadra: true, avisos, generadoEn: new Date().toISOString() };
    }
    const [m] = await ContabilidadDB.rango(tenantId, mes, mes, hoy, opciones, cx, true);
    const aperturas = await prisma.asientoContable.count({ where: { tenantId, tipo: "apertura", anulado: false } });
    avisos.push(...m.avisos);
    if (aperturas === 0) avisos.push({ codigo: "sin_apertura", cuantos: 0, texto: "Falta el asiento de apertura (lo que tenías al empezar): sin él el balance arranca en cero." });
    const s = sumasDe(m.asientos);
    const cuadra = Math.abs(s.debe - s.haber) < 0.005;
    if (!cuadra) avisos.push({ codigo: "no_cuadra", cuantos: 1, texto: `El libro no cuadra por S/ ${r2(s.debe - s.haber).toFixed(2)}.` });
    return { mes, estado: m.estado, asientos: m.asientos, totalDebe: s.debe, totalHaber: s.haber, cuadra, avisos, generadoEn: new Date().toISOString() };
  },

  /** `conMovimientos` (Excel): los movimientos de todas las cuentas aunque no se filtre. */
  async mayor(tenantId: string, mes: string, cuenta: string | undefined, hoy: string, opciones: OpcionesLectura, conMovimientos = !!cuenta): Promise<RespuestaMayor> {
    const cx = await ContabilidadDB.contexto(tenantId);
    const meses = await ContabilidadDB.rango(tenantId, cx.ajustes.inicio, mes, hoy, opciones, cx);
    const previos = meses.filter((m) => m.mes < mes).flatMap((m) => m.asientos);
    const delMes = meses.find((m) => m.mes === mes)?.asientos ?? [];
    return { mes, cuentas: mayor(cx.plan, previos, delMes, cuenta, conMovimientos) };
  },

  async comprobacion(tenantId: string, mes: string, hoy: string, opciones: OpcionesLectura): Promise<RespuestaComprobacion> {
    const cx = await ContabilidadDB.contexto(tenantId);
    const desde = `${mes.slice(0, 4)}-01` > cx.ajustes.inicio ? `${mes.slice(0, 4)}-01` : cx.ajustes.inicio;
    const meses = await ContabilidadDB.rango(tenantId, cx.ajustes.inicio, mes, hoy, opciones, cx);
    const saldos = arrastreAlEjercicio(saldosPorCuenta(meses.filter((m) => m.mes < desde).flatMap((m) => m.asientos)));
    saldosPorCuenta(meses.filter((m) => m.mes >= desde).flatMap((m) => m.asientos), saldos);
    return { mes, desde, ...comprobacion(cx.plan, saldos) };
  },

  async estados(tenantId: string, mes: string, hoy: string, opciones: OpcionesLectura): Promise<RespuestaEstados> {
    const cx = await ContabilidadDB.contexto(tenantId);
    const desde = `${mes.slice(0, 4)}-01` > cx.ajustes.inicio ? `${mes.slice(0, 4)}-01` : cx.ajustes.inicio;
    const meses = await ContabilidadDB.rango(tenantId, cx.ajustes.inicio, mes, hoy, opciones, cx);
    const todos = meses.flatMap((m) => m.asientos);
    const anteriores = meses.filter((m) => m.mes < desde).flatMap((m) => m.asientos);
    const ejercicio = meses.filter((m) => m.mes >= desde).flatMap((m) => m.asientos);
    const m = meses.find((x) => x.mes === mes);
    const delMes = m?.asientos ?? [];
    const resultadosDelEjercicio = estadoResultados(soloResultados(saldosPorCuenta(ejercicio)));
    const situacion = estadoSituacion(saldosPorCuenta(todos), resultadosDelEjercicio.utilidad, efectoEnResultado(anteriores));
    const resultadosDelMes = estadoResultados(soloResultados(saldosPorCuenta(delMes)));
    // Mes cerrado + sin permiso de planilla: la foto del cierre trae la planilla
    // (la tomó el admin) y la «diferencia» la dejaría ver. Se cruza en vivo con
    // SUS permisos, igual que los asientos que ve (security 02-11, Ley 29733).
    const base = m?.vivo ?? (m && !opciones.verPlanilla ? await ContabilidadDB.mesVivo(tenantId, mes, hoy, opciones, cx) : m?.resumen) ?? null;
    const cruce = cruceConResultado({
      resultadoDelPanel: base?.resultadoDelPanel ?? 0,
      igvVentas: base?.igvVentas ?? 0,
      igvCompras: base?.igvCompras ?? 0,
      otrasFuentes: base?.otrasFuentes ?? 0,
      ajustesManuales: efectoEnResultado(m?.manuales ?? []),
      utilidadContable: resultadosDelMes.utilidad,
    });
    return { mes, desde, situacion, resultadosDelMes, resultadosDelEjercicio, cruce };
  },

  /** Cifras para verificar (scripts): caja 10 del mes contra «Caja del mes». */
  async cifrasDelMes(tenantId: string, mes: string, hoy: string, opciones: OpcionesLectura) {
    const cx = await ContabilidadDB.contexto(tenantId);
    const [m] = await ContabilidadDB.rango(tenantId, mes, mes, hoy, opciones, cx);
    const vivo = m?.vivo ?? (await ContabilidadDB.mesVivo(tenantId, mes, hoy, opciones, cx));
    const caja = saldosPorCuenta(vivo.asientos).get("1011") ?? { debe: 0, haber: 0 };
    return { ...sumasDe(vivo.asientos), asientos: vivo.asientos.length, caja10: r2(caja.debe - caja.haber), cajaNeto: vivo.cajaNeto, cajaFueraDelPanel: vivo.cajaFueraDelPanel, inicio: cx.ajustes.inicio, ventasConIgv: cx.ajustes.ventasConIgv };
  },

  // ── Meses ────────────────────────────────────────────────────────────────

  async periodos(tenantId: string, hoy: string, opciones: OpcionesLectura): Promise<RespuestaPeriodos> {
    const cx = await ContabilidadDB.contexto(tenantId);
    const actual = hoy.slice(0, 7);
    const meses = await ContabilidadDB.rango(tenantId, cx.ajustes.inicio, actual, hoy, opciones, cx, true);
    const periodos: PeriodoResumen[] = meses.map((m) => resumenDe(m)).reverse();
    return { inicio: cx.ajustes.inicio, periodos };
  },

  async cerrar(tenantId: string, mes: string, usuario: string, hoy: string, opciones: OpcionesLectura): Promise<PeriodoResumen> {
    if (!tenantId) throw new Error("tenantId is required");
    const cx = await ContabilidadDB.contexto(tenantId);
    if (mes > hoy.slice(0, 7)) throw new ErrorContable(400, "No se puede cerrar un mes que todavía no llega.");
    if (mes < cx.ajustes.inicio) throw new ErrorContable(409, `La contabilidad empieza en ${cx.ajustes.inicio}.`);
    invalidateByPrefix(`${clave(tenantId)}:vivo:${mes}:`);
    const vivo = await ContabilidadDB.mesVivo(tenantId, mes, hoy, opciones, cx);
    const s = sumasDe(vivo.asientos);
    if (Math.abs(s.debe - s.haber) >= 0.005) throw new ErrorContable(409, "El mes no cuadra: revisa los avisos antes de cerrarlo.");
    const manuales = await prisma.asientoContable.findMany({ where: { tenantId, periodo: mes, tipo: { not: "auto" } }, include: INCLUDE_LINEAS });
    const utilidad = r2(efectoEnResultado(vivo.asientos) + efectoEnResultado(manuales.map((f) => asientoDeFila(f, cx.plan, true))));
    const resumen: Resumen = {
      asientos: vivo.asientos.length, totalDebe: s.debe, totalHaber: s.haber, utilidad, resultadoDelPanel: vivo.resultadoDelPanel,
      igvVentas: vivo.igvVentas, igvCompras: vivo.igvCompras, otrasFuentes: vivo.otrasFuentes, cajaNeto: vivo.cajaNeto, cajaFueraDelPanel: vivo.cajaFueraDelPanel,
      saldos: huellaDeSaldos(vivo.asientos),
    };
    const filas = vivo.asientos.map((a) => ({ a, id: randomUUID() }));
    await prisma.$transaction(
      async (tx) => {
        await tx.periodoContable.createMany({ data: [{ tenantId, periodo: mes, estado: "abierto" }], skipDuplicates: true });
        // La condición va en el WHERE: dos cierres a la vez → uno solo pasa.
        const r = await tx.periodoContable.updateMany({
          where: { tenantId, periodo: mes, estado: "abierto" },
          data: { estado: "cerrado", cerradoAt: new Date(), cerradoPor: usuario, resumen: resumen as unknown as Prisma.InputJsonValue },
        });
        if (r.count === 0) throw new ErrorContable(409, "Ese mes ya está cerrado.");
        await tx.asientoContable.deleteMany({ where: { tenantId, periodo: mes, tipo: "auto" } });
        await tx.asientoContable.createMany({
          data: filas.map(({ a, id }) => ({
            id, tenantId, periodo: mes, fecha: new Date(`${a.fecha}T00:00:00.000Z`), glosa: a.glosa.slice(0, 500), tipo: "auto", origen: a.origen,
            enlace: { ...(a.enlace ?? {}), regla: a.regla, certeza: a.certeza } as Prisma.InputJsonValue,
            total: a.total, creadoPor: usuario,
          })),
        });
        await tx.asientoContableLinea.createMany({
          data: filas.flatMap(({ a, id }) => a.lineas.map((l, i) => ({ asientoId: id, tenantId, orden: i, cuenta: l.cuenta, debe: l.debe, haber: l.haber, glosa: l.glosa, tercero: l.tercero }))),
        });
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
    invalidateByPrefix(clave(tenantId));
    const [m] = await ContabilidadDB.rango(tenantId, mes, mes, hoy, opciones, cx);
    return resumenDe(m);
  },

  async reabrir(tenantId: string, mes: string, hoy: string, opciones: OpcionesLectura): Promise<PeriodoResumen> {
    if (!tenantId) throw new Error("tenantId is required");
    await prisma.$transaction(async (tx) => {
      const r = await tx.periodoContable.updateMany({
        where: { tenantId, periodo: mes, estado: "cerrado" },
        data: { estado: "abierto", cerradoAt: null, cerradoPor: null, resumen: Prisma.DbNull },
      });
      if (r.count === 0) throw new ErrorContable(409, "Ese mes no está cerrado.");
      await tx.asientoContable.deleteMany({ where: { tenantId, periodo: mes, tipo: "auto" } });
    });
    invalidateByPrefix(clave(tenantId));
    const [m] = await ContabilidadDB.rango(tenantId, mes, mes, hoy, opciones);
    if (!m) throw new ErrorContable(409, "Ese mes es anterior al inicio de la contabilidad.");
    return resumenDe(m);
  },

  // ── Asientos manuales ────────────────────────────────────────────────────

  async crearManual(tenantId: string, e: AsientoManualValidado, usuario: string): Promise<Asiento> {
    if (!tenantId) throw new Error("tenantId is required");
    const cx = await ContabilidadDB.contexto(tenantId);
    const malas = e.lineas.filter((l) => !esImputable(l.cuenta, cx.plan)).map((l) => l.cuenta);
    if (malas.length) throw new ErrorContable(400, `Estas cuentas no aceptan asientos (no existen, agrupan o están de baja): ${[...new Set(malas)].join(", ")}.`);
    const debe = r2(e.lineas.reduce((a, l) => a + l.debe, 0));
    const haber = r2(e.lineas.reduce((a, l) => a + l.haber, 0));
    if (Math.abs(debe - haber) >= 0.005) throw new ErrorContable(409, `No cuadra: el debe suma ${debe.toFixed(2)} y el haber ${haber.toFixed(2)}.`);
    const periodo = e.fecha.slice(0, 7);
    if (periodo < cx.ajustes.inicio) throw new ErrorContable(400, `La contabilidad empieza en ${cx.ajustes.inicio}: un asiento de antes no entra a ningún libro (cambia el inicio en Ajustes).`);
    const fila = await prisma.$transaction(async (tx) => {
      const p = await bloquearPeriodo(tx, tenantId, periodo);
      if (p === "cerrado") throw new ErrorContable(409, `${periodo} está cerrado: reábrelo para anotar.`);
      return tx.asientoContable.create({
        data: {
          tenantId, periodo, fecha: new Date(`${e.fecha}T00:00:00.000Z`), glosa: e.glosa, tipo: e.tipo, total: debe, creadoPor: usuario,
          lineas: { create: e.lineas.map((l, i) => ({ tenantId, orden: i, cuenta: l.cuenta, debe: r2(l.debe), haber: r2(l.haber), glosa: l.glosa ?? null, tercero: l.tercero ?? null })) },
        },
        include: INCLUDE_LINEAS,
      });
    });
    invalidateByPrefix(clave(tenantId));
    return asientoDeFila(fila, cx.plan, false);
  },

  async anular(tenantId: string, id: string): Promise<void> {
    if (!tenantId) throw new Error("tenantId is required");
    await prisma.$transaction(async (tx) => {
      const a = await tx.asientoContable.findFirst({ where: { id, tenantId }, select: { tipo: true, periodo: true, anulado: true } });
      if (!a) throw new ErrorContable(404, "Ese asiento no existe.");
      if (a.tipo !== "manual" && a.tipo !== "apertura") throw new ErrorContable(409, "Los asientos automáticos se corrigen en su origen (la venta, el gasto…).");
      // El candado del mes: un cierre a la vez no puede colarse entre la revisión y el cambio.
      if ((await bloquearPeriodo(tx, tenantId, a.periodo)) === "cerrado") throw new ErrorContable(409, `${a.periodo} está cerrado: reábrelo para anular.`);
      const r = await tx.asientoContable.updateMany({ where: { id, tenantId, anulado: false, tipo: { in: ["manual", "apertura"] } }, data: { anulado: true } });
      if (r.count === 0) throw new ErrorContable(409, "Ese asiento ya estaba anulado.");
    });
    invalidateByPrefix(clave(tenantId));
  },

  /**
   * Apertura sugerida: las cuentas en 0 para completar con los saldos al cierre
   * del mes anterior al inicio. No se rellena con lo pendiente de HOY: una venta
   * posterior que sigue sin cobrar quedaría dos veces en 1212 (la apertura y su
   * propio asiento) e inflaría el capital; ese saldo histórico no se puede
   * reconstruir con certeza.
   */
  async aperturaSugerida(tenantId: string): Promise<AsientoManualEntrada> {
    const cx = await ContabilidadDB.contexto(tenantId);
    const [y, m] = cx.ajustes.inicio.split("-").map(Number);
    const corte = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10).split("-").reverse().join("/");
    const lineas: AsientoManualEntrada["lineas"] = [
      { cuenta: "1011", debe: 0, haber: 0, glosa: "La plata en caja" },
      { cuenta: "1212", debe: 0, haber: 0, glosa: "Lo que te deben" },
      { cuenta: "4212", debe: 0, haber: 0, glosa: "Lo que debes" },
      { cuenta: "5011", debe: 0, haber: 0, glosa: "Capital (lo que queda)" },
    ];
    return { fecha: `${cx.ajustes.inicio}-01`, glosa: `Asiento de apertura: completa con tus saldos al ${corte}`, tipo: "apertura", lineas };
  },

  // ── Plan de cuentas ──────────────────────────────────────────────────────

  async plan(tenantId: string, hoy: string, opciones: OpcionesLectura): Promise<RespuestaPlan> {
    const cx = await ContabilidadDB.contexto(tenantId);
    const [enBase, vivo] = await Promise.all([
      prisma.asientoContableLinea.groupBy({ by: ["cuenta"], where: { tenantId } }),
      hoy.slice(0, 7) >= cx.ajustes.inicio ? ContabilidadDB.mesVivo(tenantId, hoy.slice(0, 7), hoy, opciones, cx) : null,
    ]);
    const usadas = new Set(enBase.map((g) => g.cuenta));
    for (const a of vivo?.asientos ?? []) for (const l of a.lineas) usadas.add(l.cuenta);
    return { cuentas: cx.plan, usadas: [...usadas].sort() };
  },

  async crearCuenta(tenantId: string, e: CuentaPropiaEntrada): Promise<CuentaPlan> {
    if (!tenantId) throw new Error("tenantId is required");
    const cx = await ContabilidadDB.contexto(tenantId);
    if (cx.plan.some((c) => c.codigo === e.codigo)) throw new ErrorContable(409, `La cuenta ${e.codigo} ya existe.`);
    const padre = padreDe(e.codigo, cx.plan);
    if (!padre) throw new ErrorContable(400, `${e.codigo} no cuelga de ninguna cuenta del plan (empieza con los dígitos de su cuenta madre, p. ej. 10411 cuelga de 1041).`);
    try {
      const c = await prisma.cuentaContablePropia.create({ data: { tenantId, codigo: e.codigo, nombre: e.nombre, naturaleza: e.naturaleza } });
      invalidateByPrefix(clave(tenantId));
      return { codigo: c.codigo, nombre: c.nombre, naturaleza: e.naturaleza, imputable: true, propia: true, activa: c.activa };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new ErrorContable(409, `La cuenta ${e.codigo} ya existe.`);
      throw err;
    }
  },

  async editarCuenta(tenantId: string, codigo: string, patch: { nombre?: string; activa?: boolean }): Promise<CuentaPlan> {
    if (!tenantId) throw new Error("tenantId is required");
    const r = await prisma.cuentaContablePropia.updateMany({ where: { tenantId, codigo }, data: patch });
    if (r.count === 0) throw new ErrorContable(404, "Solo se editan las cuentas propias del negocio (las del PCGE no cambian).");
    invalidateByPrefix(clave(tenantId));
    const cx = await ContabilidadDB.contexto(tenantId);
    const c = cx.plan.find((x) => x.codigo === codigo);
    if (!c) throw new ErrorContable(404, "Esa cuenta no existe.");
    return c;
  },

  // ── Ajustes ──────────────────────────────────────────────────────────────

  async ajustes(tenantId: string): Promise<RespuestaAjustes> {
    const cx = await ContabilidadDB.contexto(tenantId);
    return { ajustes: cx.ajustes, reglas: reglasVista() };
  },

  async guardarAjustes(tenantId: string, e: AjustesValidados, usuario: string): Promise<RespuestaAjustes> {
    if (!tenantId) throw new Error("tenantId is required");
    const cx = await ContabilidadDB.contexto(tenantId);
    if (e.mapeo) {
      for (const [regla, cuenta] of Object.entries(e.mapeo)) {
        if (!esRegla(regla) || REGLAS[regla].cambiable == null) throw new ErrorContable(400, `La regla «${regla}» no tiene cuenta cambiable.`);
        if (!esImputable(cuenta, cx.plan)) throw new ErrorContable(400, `La cuenta ${cuenta} no acepta asientos.`);
      }
    }
    if (e.inicio && e.inicio > hoyDeLima().mes) throw new ErrorContable(400, "El inicio no puede ser un mes que todavía no llega.");
    const data = {
      ...(e.ventasConIgv !== undefined && { ventasConIgv: e.ventasConIgv }),
      ...(e.inicio !== undefined && { inicio: e.inicio }),
      ...(e.mapeo !== undefined && { mapeo: e.mapeo as Prisma.InputJsonValue }),
      updatedPor: usuario,
    };
    await prisma.contabilidadAjustes.upsert({ where: { tenantId }, create: { tenantId, ...data }, update: data });
    invalidateByPrefix(clave(tenantId));
    return ContabilidadDB.ajustes(tenantId);
  },

  /** Razón social y RUC para la cabecera del Excel. */
  async cabecera(tenantId: string): Promise<{ ruc: string | null; razonSocial: string | null }> {
    const s = await prisma.settings.findUnique({ where: { tenantId }, select: { ruc: true, razonSocial: true, businessName: true } });
    return { ruc: s?.ruc ?? null, razonSocial: s?.razonSocial ?? s?.businessName ?? null };
  },
};

/**
 * Asegura la fila del mes y la bloquea hasta el fin de la tx (`FOR UPDATE`): el
 * cierre la cambia con `updateMany`, así que espera o se ve. Devuelve el estado.
 */
async function bloquearPeriodo(tx: Prisma.TransactionClient, tenantId: string, periodo: string): Promise<string | null> {
  await tx.periodoContable.createMany({ data: [{ tenantId, periodo, estado: "abierto" }], skipDuplicates: true });
  const filas = await tx.$queryRaw<{ estado: string }[]>`SELECT "estado" FROM "PeriodoContable" WHERE "tenantId" = ${tenantId} AND "periodo" = ${periodo} FOR UPDATE`;
  return filas[0]?.estado ?? null;
}

function resumenDe(m: MesContable): PeriodoResumen {
  const s = sumasDe(m.asientos);
  return {
    periodo: m.mes,
    estado: m.estado,
    asientos: m.asientos.filter((a) => !a.anulado).length,
    totalDebe: s.debe,
    totalHaber: s.haber,
    cuadra: Math.abs(s.debe - s.haber) < 0.005,
    utilidad: efectoEnResultado(m.asientos),
    cerradoAt: m.cerradoAt,
    cerradoPor: m.cerradoPor,
    seMovioDespues: m.avisos.some((a) => a.codigo === "mes_cerrado_se_movio"),
  };
}

export type { Certeza };
export { finDeMes };
