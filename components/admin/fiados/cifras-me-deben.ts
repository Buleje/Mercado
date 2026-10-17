/**
 * Las reglas de las cifras de «Me deben», puras y con el día de Lima, para que
 * Indicadores, «Por vencer», «Cobrado» y «Cada fiado» no cuenten distinto.
 *
 * Revisión del 10-10: había dos relojes (el mes con la hora del navegador; hoy
 * y la semana con Lima), la semana empezaba domingo en «Cobrado» y lunes en
 * Indicadores, «Vencido» comparaba contra la hora (el fiado que vence hoy ya
 * contaba), las promesas de clientes que terminaron de pagar seguían «sin
 * cumplir» para siempre y la agenda sumaba la promesa y el saldo del mismo
 * cliente. Son vista previa: los saldos vienen del servidor, acá sólo se suman.
 */
import { diaDe, promesasVigentes, type Gestion, type PromesaVigente } from "@/lib/fiados/gestion-cobranza";
import { deudoresDeCobranza, type DeudorCobranza } from "@/lib/fiados/urgencia-cobranza";
import { limaDateKey } from "@/lib/utils";
import { estaAbierto, type Fiado, type FiadoCuota } from "./tipos";

/** Abierto y con saldo: lo que todavía se debe. */
export function debeTodavia(f: Pick<Fiado, "status" | "saldo">): boolean {
  return estaAbierto(f) && f.saldo > 0;
}

/**
 * ¿Ya venció? Con fecha, sólo si su día es ANTERIOR a hoy en Lima: el que vence
 * hoy está al día hasta mañana, como en «Quién debe» y «Por vencer». El estado
 * VENCIDO del servidor decide sólo si no hay fecha (el cron lo pone con la hora
 * UTC: desde las 19:00 de Lima ya marca el que vence mañana).
 */
export function yaVencio(f: { status: string; fechaVence?: string | null }, hoy: string): boolean {
  const dia = diaDe(f.fechaVence);
  return dia ? dia < hoy : f.status === "VENCIDO";
}

/** Los fiados que se deben y ya vencieron (`hoy` = clave de día de Lima). */
export function fiadosVencidos<F extends Pick<Fiado, "status" | "saldo" | "fechaVence">>(fiados: readonly F[], hoy: string): F[] {
  return fiados.filter((f) => debeTodavia(f) && yaVencio(f, hoy));
}

/** Día de Lima en que se pagó una cuota (sin `pagadoEn`, el día en que se anotó). */
export function diaDelCobro(c: Pick<FiadoCuota, "pagadoEn" | "createdAt">): string {
  return limaDateKey(c.pagadoEn ?? c.createdAt);
}

/** Lo cobrado desde `desde` (clave de día de Lima), con la fecha en que se pagó cada cuota. */
export function cobradoDesde(fiados: readonly Pick<Fiado, "cuotas">[], desde: string): number {
  let total = 0;
  for (const f of fiados) {
    for (const c of f.cuotas) {
      const dia = diaDelCobro(c);
      if (dia && dia >= desde) total += c.monto;
    }
  }
  return Math.round(total * 100) / 100;
}

/** El lunes de la semana de `hoy`: la semana de «Me deben» empieza el lunes en TODAS las cifras. */
export function lunesDe(hoy: string): string {
  const d = new Date(`${hoy}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** El 1 del mes de `hoy` (día de Lima). */
export function primeroDelMes(hoy: string): string {
  return `${hoy.slice(0, 8)}01`;
}

/**
 * Las promesas que cuentan: la última de cada cliente que TODAVÍA debe. Quien
 * terminó de pagar ya cumplió; con ella, Indicadores decía «1 sin cumplir» y
 * «Por vencer», «ninguna promesa pendiente».
 */
export function promesasDeQuienDebe(
  gestiones: readonly Gestion[],
  fiados: readonly Pick<Fiado, "status" | "saldo" | "customerId">[],
  ahora: number = Date.now(),
): Map<string, PromesaVigente> {
  const conDeuda = new Set(fiados.filter(debeTodavia).map((f) => f.customerId));
  const out = new Map<string, PromesaVigente>();
  for (const [id, p] of promesasVigentes(gestiones, ahora)) if (conDeuda.has(id)) out.set(id, p);
  return out;
}

export type ItemAgenda = {
  clave: string;
  dia: string;
  tipo: "vence" | "promesa";
  incumplida: boolean;
  deudor: DeudorCobranza;
  monto: number;
  fiado?: Fiado;
  nota?: string | null;
};

/** Los renglones de «Por vencer»: cada fiado abierto con fecha y cada promesa de quien debe, por día. */
export function armarAgenda(fiados: readonly Fiado[], promesas: ReadonlyMap<string, PromesaVigente>): { items: ItemAgenda[]; sinFecha: number } {
  const abiertos = fiados.filter(debeTodavia);
  const porCliente = new Map(deudoresDeCobranza(abiertos).map((d) => [d.id, d]));
  const items: ItemAgenda[] = [];
  for (const f of abiertos) {
    const d = porCliente.get(f.customerId);
    const dia = diaDe(f.fechaVence);
    if (!dia || !d) continue;
    items.push({ clave: `f-${f.id}`, dia, tipo: "vence", incumplida: false, deudor: d, monto: f.saldo, fiado: f });
  }
  for (const [id, p] of promesas) {
    const d = porCliente.get(id);
    const dia = diaDe(p.gestion.fechaPrometida);
    if (!d || !dia) continue;
    items.push({
      clave: `p-${p.gestion.id}`, dia, tipo: "promesa", incumplida: p.estado === "incumplio",
      deudor: d, monto: p.gestion.montoPrometido ?? d.saldo, nota: p.gestion.nota,
    });
  }
  items.sort((a, b) => a.dia.localeCompare(b.dia) || b.monto - a.monto);
  return { items, sinFecha: abiertos.filter((f) => !diaDe(f.fechaVence)).length };
}

/**
 * Lo que suma un grupo de la agenda: sólo los vencimientos. La promesa es una
 * fecha para el MISMO saldo (S/ 50 con promesa y vencimiento la misma semana
 * sumaban S/ 100): se muestra en su renglón, no se suma otra vez.
 */
export function totalPorCobrar(items: readonly Pick<ItemAgenda, "tipo" | "monto">[]): number {
  return Math.round(items.reduce((s, i) => s + (i.tipo === "vence" ? i.monto : 0), 0) * 100) / 100;
}

export interface VencimientoDelDia {
  dia: string;
  /** Lo que vence ese día (sólo fiados; la promesa no suma). */
  monto: number;
  /** Renglones de la agenda ese día, promesas incluidas. */
  cuantos: number;
}

/** El calendario: por día, cuántos renglones hay y cuánto VENCE (la promesa marca el día pero no suma). */
export function calendarioDeAgenda(items: readonly Pick<ItemAgenda, "dia" | "tipo" | "monto">[]): Map<string, VencimientoDelDia> {
  const out = new Map<string, VencimientoDelDia>();
  for (const it of items) {
    if (!it.dia) continue;
    const v = out.get(it.dia) ?? { dia: it.dia, monto: 0, cuantos: 0 };
    if (it.tipo === "vence") v.monto += it.monto;
    v.cuantos += 1;
    out.set(it.dia, v);
  }
  return out;
}
