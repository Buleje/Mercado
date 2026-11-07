/**
 * Análisis de adelantos (`?tab=plata&vista=adelantos&sub=analisis`), ya sumado.
 *
 * Todo lo que dibuja la pestaña sale de acá y lo manda el servidor
 * (`GET /api/adelantos/analisis`): la pantalla no suma plata (CLAUDE.md §4.6).
 * Antes cada gráfico se calculaba en el navegador sobre la lista del módulo y
 * contaba cosas que no decían nada: la dona «Por modalidad» contaba adelantos
 * (en Blas los 8 eran cuenta corriente) y el «Top 5» cortaba el nombre a 14
 * letras sin mostrar el monto.
 *
 * Reglas:
 *  • Cada moneda va aparte; nunca se suman S/ y US$.
 *  • Lo DADO y lo RECIBIDO (ADR-448) no se mezclan: lo recibido sólo alimenta
 *    `recibido` («Lo que recibiste»).
 *  • Lo anulado (CANCELADO) no cuenta para nada.
 *  • Los días se cuentan en fecha de Lima (`limaDateKey`): a las 20:00 de
 *    Pucallpa el UTC ya es mañana.
 *  • El atraso es el MISMO de Cobranza (`deudoresDeCobranza` + `tramoDe`).
 */
import { deudoresDeCobranza, type AdelantoParaCobranza } from "@/lib/adelantos/urgencia-cobranza";
import { TRAMOS, tramoDe, type TramoId } from "@/lib/adelantos/gestion-cobranza";
import { leerDireccion } from "@/lib/adelantos/modos-alta";
import { limaDateKey } from "@/lib/utils";

// ── Entrada ──────────────────────────────────────────────────────────────────

export interface EntregaParaAnalisis {
  fecha: string | Date;
  valor: number;
}

/** Lo mínimo de un adelanto que mira el análisis (`DbAdelanto` lo cumple). */
export interface AdelantoParaAnalisis extends AdelantoParaCobranza {
  montoAdelantado: number;
  conceptoRecibido?: string | null;
  entregas: readonly EntregaParaAnalisis[];
}

// ── Salida ───────────────────────────────────────────────────────────────────

export interface KpiAnalisis {
  /** Lo que diste (sin anulados). */
  adelantado: number;
  /** Lo que te devolvieron (entregas vigentes). */
  liquidado: number;
  /** Lo que te deben hoy (saldo de los abiertos). */
  pendiente: number;
  /** % de lo que diste que ya volvió, entero 0-100. */
  pct: number;
  /** Personas con saldo abierto. */
  deudores: number;
  /** Días promedio entre dar y terminar de cobrar, sobre los ya liquidados. */
  diasParaVolver: number | null;
}

export interface TramoAnalisis {
  id: TramoId;
  label: string;
  monto: number;
  personas: number;
}

export interface MesAnalisis {
  /** «2026-08». */
  clave: string;
  /** «agosto». */
  mes: string;
  /** «ago». */
  corto: string;
  diste: number;
  devolvieron: number;
}

export interface PersonaRecupero {
  id: string;
  nombre: string;
  diste: number;
  devolvio: number;
  /** Lo que te debe hoy (sólo abiertos). */
  debe: number;
  /** % de lo que le diste que ya volvió, entero 0-100 (1 si volvió algo). */
  pctVolvio: number;
  /** Su parte de todo lo que te deben, entero 0-100. */
  pctDeLoQueTeDeben: number;
}

export interface PersonaTardanza {
  id: string;
  nombre: string;
  /** Promedio de sus adelantos: días en pagar (los cerrados) o días sin moverse (los abiertos). */
  diasPromedio: number;
  pagados: number;
  /** Promedio de días en pagar, sólo de los cerrados. */
  diasPagados: number | null;
  abiertos: number;
  /** El abierto que lleva más días sin moverse. */
  diasQuieto: number | null;
}

export interface ModalidadAnalisis {
  id: string;
  label: string;
  /** Plata dada en esa modalidad. */
  monto: number;
  pct: number;
  /** Lo que te deben en esa modalidad. */
  debe: number;
}

export interface RecibidoAnalisis {
  total: number;
  porDevolver: number;
  servicio: number;
  prestamo: number;
  /** A quién le debes, de más a menos (nombre completo). */
  personas: { id: string; nombre: string; monto: number }[];
}

export interface AnalisisMoneda {
  moneda: string;
  /** Hay algo dado (no anulado) en esta moneda. */
  hayDado: boolean;
  kpi: KpiAnalisis;
  atraso: TramoAnalisis[];
  meses: MesAnalisis[];
  /** Totales de los 6 meses del gráfico. */
  totalMeses: { diste: number; devolvieron: number };
  personas: PersonaRecupero[];
  tardanza: PersonaTardanza[];
  /** Sólo modalidades con plata; la pantalla las muestra si hay más de una. */
  modalidades: ModalidadAnalisis[];
  recibido: RecibidoAnalisis | null;
}

export interface AnalisisAdelantos {
  /** De mayor a menor volumen (dado + recibido). */
  monedas: string[];
  porMoneda: Record<string, AnalisisMoneda>;
  /** Fecha de Lima con la que se contaron los días («2026-10-25»). */
  hoy: string;
}

// ── Utilidades ───────────────────────────────────────────────────────────────

const DIA = 86_400_000;

/** Meses escritos a mano: `Intl` cambia «setiembre»/«septiembre» según la versión de ICU. */
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"] as const;
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"] as const;

const MODALIDAD: Record<string, string> = {
  CUENTA_CORRIENTE: "Cuenta corriente",
  ENTREGAS_PACTADAS: "Entregas pactadas",
  DESCUENTO_PLANILLA: "Descuento por planilla",
};

const r2 = (n: number): number => Math.round(n * 100) / 100;
const monedaDe = (a: { moneda?: string | null }): string => a.moneda || "PEN";

/** Medianoche UTC del día de Lima de `v` (para restar días sin el corrimiento de zona). */
function diaDeLima(v: string | Date | number): number | null {
  const k = limaDateKey(v);
  if (!k) return null;
  const [y, m, d] = k.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Días enteros entre dos fechas, contados en días de Lima; nunca negativo. */
export function diasEntre(desde: string | Date | number, hasta: string | Date | number): number {
  const a = diaDeLima(desde);
  const b = diaDeLima(hasta);
  if (a === null || b === null) return 0;
  return Math.max(0, Math.round((b - a) / DIA));
}

/** Parte entera de un porcentaje que nunca dice 0 % si hay algo, ni 100 % si falta algo. */
function pctHonesto(parte: number, total: number): number {
  if (!(total > 0) || !(parte > 0)) return 0;
  if (parte >= total) return 100;
  return Math.min(99, Math.max(1, Math.round((parte / total) * 100)));
}

function ultimaEntrega(a: AdelantoParaAnalisis): string | Date | null {
  let max: number | null = null;
  let valor: string | Date | null = null;
  for (const e of a.entregas) {
    const t = new Date(e.fecha).getTime();
    if (Number.isFinite(t) && (max === null || t > max)) {
      max = t;
      valor = e.fecha;
    }
  }
  return valor;
}

const sumaEntregas = (a: AdelantoParaAnalisis): number => a.entregas.reduce((s, e) => s + (Number(e.valor) || 0), 0);
const estaAbierto = (a: AdelantoParaAnalisis): boolean => a.status === "ABIERTO" && a.saldoPendiente > 0;
const nombreDe = (a: AdelantoParaAnalisis): string => a.beneficiario?.nombre?.trim() || "Sin nombre";

/** Los 6 meses que terminan en el mes de `hoy` (fecha de Lima), del más viejo al actual. */
function seisMeses(hoy: string): { clave: string; mes: string; corto: string }[] {
  const [y, m] = hoy.split("-").map(Number);
  const out: { clave: string; mes: string; corto: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const idx = y * 12 + (m - 1) - i;
    const anio = Math.floor(idx / 12);
    const mes = idx % 12;
    out.push({ clave: `${anio}-${String(mes + 1).padStart(2, "0")}`, mes: MESES[mes], corto: MESES_CORTOS[mes] });
  }
  return out;
}

// ── Cálculo ──────────────────────────────────────────────────────────────────

function analizarMoneda(moneda: string, dados: AdelantoParaAnalisis[], recibidos: AdelantoParaAnalisis[], ahora: number, hoy: string): AnalisisMoneda {
  // KPIs
  let adelantado = 0, liquidado = 0, pendiente = 0;
  const deudores = new Set<string>();
  const tiemposLiquidados: number[] = [];
  for (const a of dados) {
    adelantado += a.montoAdelantado;
    liquidado += sumaEntregas(a);
    if (estaAbierto(a)) {
      pendiente += a.saldoPendiente;
      deudores.add(a.beneficiarioId);
    }
    const ultima = ultimaEntrega(a);
    if (a.status === "LIQUIDADO" && ultima) tiemposLiquidados.push(diasEntre(a.fechaAdelanto, ultima));
  }
  const kpi: KpiAnalisis = {
    adelantado: r2(adelantado),
    liquidado: r2(liquidado),
    pendiente: r2(pendiente),
    pct: adelantado > 0 ? Math.min(100, Math.round((liquidado / adelantado) * 100)) : 0,
    deudores: deudores.size,
    diasParaVolver: tiemposLiquidados.length ? Math.round(tiemposLiquidados.reduce((s, d) => s + d, 0) / tiemposLiquidados.length) : null,
  };

  // Atraso: la misma regla que Cobranza, por persona.
  const porTramo = new Map<TramoId, { monto: number; personas: number }>();
  for (const d of deudoresDeCobranza(dados.filter(estaAbierto), ahora)) {
    const t = tramoDe(d.dias);
    const acc = porTramo.get(t) ?? { monto: 0, personas: 0 };
    acc.monto += d.saldo;
    acc.personas += 1;
    porTramo.set(t, acc);
  }
  const atraso = TRAMOS.map((t) => ({ id: t.id, label: t.label, monto: r2(porTramo.get(t.id)?.monto ?? 0), personas: porTramo.get(t.id)?.personas ?? 0 }));

  // Por mes: lo que diste y lo que te devolvieron, en el mes de Lima de cada movimiento.
  const meses = seisMeses(hoy).map((m) => ({ ...m, diste: 0, devolvieron: 0 }));
  const indice = new Map(meses.map((m, i) => [m.clave, i]));
  for (const a of dados) {
    const i = indice.get(limaDateKey(a.fechaAdelanto).slice(0, 7));
    if (i !== undefined) meses[i].diste += a.montoAdelantado;
    for (const e of a.entregas) {
      const j = indice.get(limaDateKey(e.fecha).slice(0, 7));
      if (j !== undefined) meses[j].devolvieron += Number(e.valor) || 0;
    }
  }
  for (const m of meses) { m.diste = r2(m.diste); m.devolvieron = r2(m.devolvieron); }
  const totalMeses = { diste: r2(meses.reduce((s, m) => s + m.diste, 0)), devolvieron: r2(meses.reduce((s, m) => s + m.devolvieron, 0)) };

  // Por persona: lo que volvió y cuánto tarda.
  const porPersona = new Map<string, { nombre: string; diste: number; devolvio: number; debe: number; dias: number[]; pagados: number[]; quietos: number[] }>();
  for (const a of dados) {
    const p = porPersona.get(a.beneficiarioId) ?? { nombre: nombreDe(a), diste: 0, devolvio: 0, debe: 0, dias: [], pagados: [], quietos: [] };
    p.diste += a.montoAdelantado;
    p.devolvio += sumaEntregas(a);
    const ultima = ultimaEntrega(a);
    if (estaAbierto(a)) {
      p.debe += a.saldoPendiente;
      // Sin moverse desde la última entrega; si nunca entregó, desde que se le dio.
      const quieto = diasEntre(ultima ?? a.fechaAdelanto, ahora);
      p.quietos.push(quieto);
      p.dias.push(quieto);
    } else if (ultima) {
      const tardo = diasEntre(a.fechaAdelanto, ultima);
      p.pagados.push(tardo);
      p.dias.push(tardo);
    }
    porPersona.set(a.beneficiarioId, p);
  }
  const prom = (xs: number[]): number => Math.round(xs.reduce((s, d) => s + d, 0) / xs.length);
  const personas: PersonaRecupero[] = [...porPersona.entries()]
    .map(([id, p]) => ({
      id,
      nombre: p.nombre,
      diste: r2(p.diste),
      devolvio: r2(p.devolvio),
      debe: r2(p.debe),
      pctVolvio: pctHonesto(p.devolvio, p.diste),
      pctDeLoQueTeDeben: pendiente > 0 ? Math.round((p.debe / pendiente) * 100) : 0,
    }))
    .sort((x, y) => y.debe - x.debe || y.diste - x.diste || x.nombre.localeCompare(y.nombre, "es"));
  const tardanza: PersonaTardanza[] = [...porPersona.entries()]
    .filter(([, p]) => p.dias.length > 0)
    .map(([id, p]) => ({
      id,
      nombre: p.nombre,
      diasPromedio: prom(p.dias),
      pagados: p.pagados.length,
      diasPagados: p.pagados.length ? prom(p.pagados) : null,
      abiertos: p.quietos.length,
      diasQuieto: p.quietos.length ? Math.max(...p.quietos) : null,
    }))
    .sort((x, y) => y.diasPromedio - x.diasPromedio || y.abiertos - x.abiertos || x.nombre.localeCompare(y.nombre, "es"));

  // Por modalidad, en plata.
  const porModalidad = new Map<string, { monto: number; debe: number }>();
  for (const a of dados) {
    const k = a.modalidad || "CUENTA_CORRIENTE";
    const acc = porModalidad.get(k) ?? { monto: 0, debe: 0 };
    acc.monto += a.montoAdelantado;
    if (estaAbierto(a)) acc.debe += a.saldoPendiente;
    porModalidad.set(k, acc);
  }
  const modalidades = [...porModalidad.entries()]
    .filter(([, v]) => v.monto > 0)
    .map(([id, v]) => ({ id, label: MODALIDAD[id] ?? id, monto: r2(v.monto), pct: adelantado > 0 ? Math.round((v.monto / adelantado) * 100) : 0, debe: r2(v.debe) }))
    .sort((x, y) => y.monto - x.monto);

  // Lo que recibiste (ADR-448): aparte, nunca con lo dado.
  let recibido: RecibidoAnalisis | null = null;
  if (recibidos.length > 0) {
    let total = 0, porDevolver = 0, servicio = 0, prestamo = 0;
    const aQuien = new Map<string, { nombre: string; monto: number }>();
    for (const a of recibidos) {
      total += a.montoAdelantado;
      const { concepto } = leerDireccion(a);
      if (concepto === "SERVICIO") servicio += a.montoAdelantado;
      if (concepto === "PRESTAMO") prestamo += a.montoAdelantado;
      if (estaAbierto(a)) {
        porDevolver += a.saldoPendiente;
        const p = aQuien.get(a.beneficiarioId) ?? { nombre: nombreDe(a), monto: 0 };
        p.monto += a.saldoPendiente;
        aQuien.set(a.beneficiarioId, p);
      }
    }
    recibido = {
      total: r2(total),
      porDevolver: r2(porDevolver),
      servicio: r2(servicio),
      prestamo: r2(prestamo),
      personas: [...aQuien.entries()].map(([id, p]) => ({ id, nombre: p.nombre, monto: r2(p.monto) })).sort((x, y) => y.monto - x.monto).slice(0, 8),
    };
  }

  return { moneda, hayDado: dados.length > 0, kpi, atraso, meses, totalMeses, personas, tardanza, modalidades, recibido };
}

/**
 * El análisis entero, por moneda. `ahora` se inyecta para los tests; los días
 * y los meses salen de su fecha de Lima.
 */
export function analizarAdelantos(adelantos: readonly AdelantoParaAnalisis[], ahora: number = Date.now()): AnalisisAdelantos {
  const hoy = limaDateKey(ahora);
  const vigentes = adelantos.filter((a) => a.status !== "CANCELADO");
  const volumen = new Map<string, number>();
  for (const a of vigentes) volumen.set(monedaDe(a), (volumen.get(monedaDe(a)) ?? 0) + a.montoAdelantado);
  const monedas = [...volumen.keys()].sort((x, y) => (volumen.get(y) ?? 0) - (volumen.get(x) ?? 0));

  const porMoneda: Record<string, AnalisisMoneda> = {};
  for (const moneda of monedas) {
    const deEsta = vigentes.filter((a) => monedaDe(a) === moneda);
    const dados = deEsta.filter((a) => leerDireccion(a).direccion === "DADO");
    const recibidos = deEsta.filter((a) => leerDireccion(a).direccion === "RECIBIDO");
    porMoneda[moneda] = analizarMoneda(moneda, dados, recibidos, ahora, hoy);
  }
  return { monedas, porMoneda, hoy };
}
