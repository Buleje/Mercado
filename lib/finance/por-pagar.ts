/**
 * Lo que debes (F10) — la lista hermana de «Por cobrar», vista del otro lado.
 *
 * ## Por qué existe (medido 2026-09-29)
 *
 * Desde ADR-448 un adelanto puede ser RECIBIDO (te adelantaron por un servicio
 * o te prestaron plata). «Por cobrar» lo sacó con razón —no es plata que te
 * deben— pero ninguna vista lo tomó: esa deuda quedó sin pantalla. Tampoco la
 * tenían las cuentas por pagar a proveedores con su saldo neto, el aserrío que
 * otro te hizo, ni la cuenta forestal de una parte que quedó a favor suyo. En
 * `main`, tres partes con cuenta a su favor sumaban S/ 6 279,60 y ninguna
 * pantalla de Mi Plata las mostraba.
 *
 * ## Qué entra y qué no
 *
 * | fuente              | de dónde                                  | cuándo es deuda tuya |
 * |---------------------|-------------------------------------------|----------------------|
 * | adelanto_recibido   | `Adelanto` RECIBIDO                        | `quienDebe` = le-debes |
 * | adelanto_excedido   | `Adelanto` DADO que te devolvieron de más  | `quienDebe` = le-debes |
 * | cuenta_por_pagar    | `Payable`                                  | `netoPorPagar` > 0 |
 * | prestamo_recibido   | `Prestamo` RECIBIDO                        | cuotas sin pagar |
 * | aserrio_recibido    | `ForestCuentaMov` concepto aserrio_recibido | lo que la cuenta aún no pagó |
 * | cuenta_forestal     | el resto de la cuenta de la parte           | saldo a favor de la parte |
 *
 * Cancelados, liquidados, pagados y anulados (baja lógica) no entran: la regla
 * de cada fuente es la de su módulo (`quienDebe`, `netoPorPagar`), no una copia.
 *
 * ## El aserrío recibido es PARTE de la cuenta forestal, no una suma aparte
 *
 * La cuenta de una parte es UNA sola: `saldo = cargos − abonos`, y el aserrío
 * que te hicieron es uno de sus abonos. Sumarlo además del saldo contaría la
 * misma plata dos veces. Lo que se hace es DESGLOSAR el saldo a su favor: lo
 * que pagaste (los cargos) cubre primero lo más viejo —la regla de siempre para
 * imputar un pago a varias deudas—, y lo que queda sin cubrir dice de qué es.
 * Las dos partidas de una parte suman exactamente su saldo.
 *
 * ## Las dos direcciones de una misma persona
 *
 * Quien te adelantó plata puede también deberte un aserrío. Cada lista muestra
 * su lado entero (acá, lo que le debes) y la persona lleva además `teDebe` y el
 * `neto`, con el enlace a Liquidar: el cruce se decide allá, nunca restando en
 * silencio acá. La unión de personas es la de «Cuenta por persona»
 * (`unificarCuentas`: vínculo explícito o documento, nunca el nombre); los
 * proveedores y los préstamos no tienen con quién unirse y no llevan neto.
 *
 * Nada de mezclar monedas: cada total va por moneda.
 *
 * PURO: sin React, sin fetch, sin Prisma. `hoy` llega por parámetro.
 */

import { quienDebe, ETIQUETA_CONCEPTO, type AdelantoConceptoRecibido } from "@/lib/adelantos/direccion";
import { netoPorPagar } from "@/lib/finance/finance-kpis";
import { CONCEPTO_LABEL, type Concepto, type MovimientoCuenta } from "@/lib/forestal/cuenta-corriente";
import type { CuentaPersona } from "@/lib/adelantos/cuenta-unificada";

// ── Fuentes ──────────────────────────────────────────────────────────────────

export const FUENTES_POR_PAGAR = [
  "adelanto_recibido",
  "adelanto_excedido",
  "cuenta_por_pagar",
  "prestamo_recibido",
  "aserrio_recibido",
  "cuenta_forestal",
] as const;
export type FuentePorPagar = (typeof FUENTES_POR_PAGAR)[number];

/** Cómo se nombra cada fuente en pantalla. */
export const ETIQUETA_FUENTE: Record<FuentePorPagar, { label: string; plural: string }> = {
  adelanto_recibido: { label: "Adelanto recibido", plural: "Adelantos recibidos" },
  adelanto_excedido: { label: "Te pagó de más", plural: "Te pagaron de más" },
  cuenta_por_pagar: { label: "Cuenta por pagar", plural: "Cuentas por pagar" },
  prestamo_recibido: { label: "Préstamo recibido", plural: "Préstamos recibidos" },
  aserrio_recibido: { label: "Aserrío que te hicieron", plural: "Aserrío que te hicieron" },
  cuenta_forestal: { label: "Cuenta forestal", plural: "Cuenta forestal" },
};

/**
 * Dónde se abre el origen de una partida: el módulo (`tab`) y, si hace falta,
 * su vista y sub-vista. Lo pinta el cliente con `admin:navigate` o, si es una
 * sección de Mi Plata, cambiando de vista sin recargar.
 */
export interface EnlacePorPagar {
  tab: string;
  vista?: string;
  sub?: string;
}

export const ENLACE_FUENTE: Record<FuentePorPagar, EnlacePorPagar> = {
  adelanto_recibido: { tab: "plata", vista: "adelantos", sub: "lista" },
  adelanto_excedido: { tab: "plata", vista: "adelantos", sub: "lista" },
  cuenta_por_pagar: { tab: "facturacion", sub: "cxp" },
  prestamo_recibido: { tab: "plata", vista: "prestamos" },
  /* La cuenta de la parte, con sus movimientos y el botón Liquidar, vive en
     «Cuenta por persona» (Adelantos → Resumen). */
  aserrio_recibido: { tab: "plata", vista: "adelantos", sub: "resumen" },
  cuenta_forestal: { tab: "plata", vista: "adelantos", sub: "resumen" },
};

/** Liquidar la cuenta de una persona: el modal vive en «Cuenta por persona». */
export const ENLACE_LIQUIDAR: EnlacePorPagar = { tab: "plata", vista: "adelantos", sub: "resumen" };

// ── Entradas (ya traídas de la base, sin Decimal) ────────────────────────────

/** Un adelanto candidato a deuda tuya: RECIBIDO con saldo, o DADO excedido. */
export interface AdelantoParaPagar {
  id: string;
  beneficiarioId: string;
  beneficiarioNombre: string | null;
  codigoOperacion: string | null;
  reciboManual: string | null;
  direccion: string | null;
  conceptoRecibido: string | null;
  status: string;
  moneda: string | null;
  saldoPendiente: number;
  /** `YYYY-MM-DD` */
  fechaAdelanto: string | null;
  /** `YYYY-MM-DD` */
  fechaVencimiento: string | null;
}

/** Un grupo (beneficiario, status, moneda, dirección) de `AdelantosDB.saldosPorPersona`. */
export interface GrupoAdelanto {
  beneficiarioId: string;
  status: string;
  moneda: string | null;
  direccion?: string | null;
  saldoPendiente: number;
}

export interface CuentaPorPagarEntrada {
  id: string;
  supplierId: string;
  supplierName: string | null;
  description: string | null;
  amount: number;
  paidAmount: number;
  status: string;
  /** `YYYY-MM-DD` */
  vence: string | null;
  /** `YYYY-MM-DD` */
  desde: string | null;
}

export interface PrestamoRecibidoEntrada {
  id: string;
  nombre: string | null;
  moneda: string | null;
  /** Sólo las cuotas SIN pagar. */
  cuotas: { monto: number; vence: string | null }[];
  /** `YYYY-MM-DD` */
  desde: string | null;
}

export interface EntradaPorPagar {
  /** `YYYY-MM-DD` de Lima. */
  hoy: string;
  /** Las personas de «Cuenta por persona» (`unificarCuentas`): la unión y los movimientos forestales. */
  personas: CuentaPersona[];
  grupos: GrupoAdelanto[];
  adelantos: AdelantoParaPagar[];
  cuentasPorPagar: CuentaPorPagarEntrada[];
  prestamos: PrestamoRecibidoEntrada[];
  /** La cuenta forestal tocó el tope de lectura: puede faltar algo. */
  truncado?: boolean;
}

// ── Salida ───────────────────────────────────────────────────────────────────

export interface MontoEnMoneda {
  moneda: string;
  monto: number;
}

/** Una deuda concreta: de qué, cuánto, desde cuándo y dónde se paga. */
export interface PartidaPorPagar {
  /** Id del registro en su módulo (adelanto, cuenta, préstamo) o `parte:moneda:tramo`. */
  id: string;
  fuente: FuentePorPagar;
  monto: number;
  moneda: string;
  /** `YYYY-MM-DD` — desde cuándo lo debes. */
  desde: string | null;
  /** `YYYY-MM-DD` — cuándo se pactó pagarlo. `null` = sin plazo. */
  vence: string | null;
  /** Texto corto: código, concepto, N° de cuotas. */
  nota: string | null;
  enlace: EnlacePorPagar;
}

export type TipoAcreedor = "persona" | "proveedor" | "entidad";

export interface PersonaPorPagar {
  /** `benef:<id>` · `parte:<id>` (de «Cuenta por persona») · `proveedor:<id>` · `prestamo:<id>`. */
  clave: string;
  nombre: string;
  tipo: TipoAcreedor;
  /** Lo que le debes, por moneda (la suma de sus partidas). */
  debes: MontoEnMoneda[];
  partidas: PartidaPorPagar[];
  /** El plazo más urgente de sus partidas. */
  vence: string | null;
  vencido: boolean;
  /** Lo que ESTA persona te debe por el otro lado (adelantos dados, su cuenta forestal). Vacío = nada. */
  teDebe: MontoEnMoneda[];
  /** teDebe − debes, por moneda. Vacío cuando no hay nada del otro lado. + = te debe. */
  neto: MontoEnMoneda[];
  /** Dónde cruzar las dos direcciones. `null` si no hay qué cruzar. */
  liquidar: EnlacePorPagar | null;
}

export interface TotalPorPagar {
  moneda: string;
  total: number;
  /** Cuántas personas/proveedores tienen deuda en esta moneda. */
  cuentas: number;
  partidas: number;
  /** Cuánto de ese total ya pasó su plazo. */
  vencido: number;
  /**
   * Cuánto de ese total se compensa con lo que ESAS MISMAS personas te deben
   * (Σ min(le debes, te debe) por persona): lo que desaparecería al liquidar.
   * Es el puente con «Cuenta por persona», que muestra los netos.
   */
  cruzable: number;
}

export interface FuenteResumen {
  fuente: FuentePorPagar;
  moneda: string;
  total: number;
  count: number;
}

export interface PorPagarDetalle {
  hoy: string;
  /** Por moneda, soles primero. */
  totales: TotalPorPagar[];
  porFuente: FuenteResumen[];
  personas: PersonaPorPagar[];
  truncado: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const PEN = "PEN";
/** Medio céntimo: la unidad del negocio, no el épsilon del float. */
const CERO = 0.005;
const r2 = (n: number) => Math.round(n * 100) / 100;
const moneda = (m: string | null | undefined) => (m && m.trim() ? m.trim().toUpperCase() : PEN);
const dia = (iso: string | null | undefined): string | null => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null);

/** Suma por moneda, soles primero y el resto por nombre. */
function porMoneda(items: readonly MontoEnMoneda[]): MontoEnMoneda[] {
  const acc = new Map<string, number>();
  for (const it of items) acc.set(it.moneda, (acc.get(it.moneda) ?? 0) + it.monto);
  return ordenarMonedas([...acc.entries()].map(([m, v]) => ({ moneda: m, monto: r2(v) })).filter((x) => Math.abs(x.monto) > CERO));
}

function ordenarMonedas<T extends { moneda: string }>(xs: T[]): T[] {
  return [...xs].sort((a, b) => (a.moneda === PEN ? -1 : b.moneda === PEN ? 1 : a.moneda.localeCompare(b.moneda)));
}

/** 0 vencido · 1 con plazo · 2 sin plazo (la misma escala que «Por cobrar»). */
const grupoDePlazo = (vence: string | null, hoy: string) => (!vence ? 2 : vence < hoy ? 0 : 1);

function ordenarPartidas(ps: PartidaPorPagar[], hoy: string): PartidaPorPagar[] {
  return [...ps].sort((a, b) => {
    const ga = grupoDePlazo(a.vence, hoy);
    const gb = grupoDePlazo(b.vence, hoy);
    if (ga !== gb) return ga - gb;
    if (ga !== 2 && a.vence !== b.vence) return (a.vence ?? "").localeCompare(b.vence ?? "");
    if (a.monto !== b.monto) return b.monto - a.monto;
    return a.id.localeCompare(b.id);
  });
}

const montoEnSoles = (xs: readonly MontoEnMoneda[]) => xs.find((x) => x.moneda === PEN)?.monto ?? 0;

/**
 * Orden de pago: primero lo vencido (lo más viejo arriba), después lo que vence
 * pronto, y al final lo que no tiene plazo, de mayor a menor. Es el orden de
 * «Por cobrar», para que las dos listas se lean igual.
 */
export function ordenarPorPagar(personas: PersonaPorPagar[], hoy: string): PersonaPorPagar[] {
  return [...personas].sort((a, b) => {
    const ga = grupoDePlazo(a.vence, hoy);
    const gb = grupoDePlazo(b.vence, hoy);
    if (ga !== gb) return ga - gb;
    if (ga !== 2 && a.vence !== b.vence) return (a.vence ?? "").localeCompare(b.vence ?? "");
    const sa = montoEnSoles(a.debes);
    const sb = montoEnSoles(b.debes);
    if (sa !== sb) return sb - sa;
    return a.nombre.localeCompare(b.nombre, "es") || a.clave.localeCompare(b.clave);
  });
}

/** Un tramo de la cuenta de una parte que todavía no se pagó. */
export interface TramoPendiente {
  concepto: Concepto | string;
  monto: number;
  /** `YYYY-MM-DD` del abono que lo originó. */
  fecha: string | null;
  /** La guía del abono, si la tiene (ADR-437). */
  gtfNumber: string | null;
}

type MovDeCuenta = Pick<MovimientoCuenta, "id" | "fecha" | "tipo" | "concepto" | "monto" | "gtfNumber">;

/**
 * Lo que la cuenta de UNA parte en UNA moneda todavía no pagó, tramo por tramo.
 *
 * Dos pasos, en el orden en que se imputa un pago de verdad:
 *  1. El cargo que NOMBRA una guía (un pago de la liquidación imputado a esa
 *     guía, ADR-437) cubre primero el abono de esa misma guía.
 *  2. Lo demás —pagos sueltos, ventas, aserríos que le hiciste, y lo que sobre
 *     del paso 1— cubre los abonos del más viejo al más nuevo.
 *
 * Lo que queda de cada abono es lo pendiente. Si los cargos cubren todo, no
 * queda nada: la parte no está a su favor. La suma de los tramos es
 * exactamente `abonos − cargos` (cuando es positiva). Medido en `main`: la
 * parte «QA plata backend» tiene un aserrío de 1 000, un pago suelto de 1 000,
 * una guía de 1 500 y un pago de 500 imputado a ESA guía → lo pendiente son
 * 1 000 de la guía, no del aserrío.
 */
export function pendienteDeLaCuenta(movs: readonly MovDeCuenta[]): TramoPendiente[] {
  const abonos = movs
    .filter((m) => m.tipo === "abono")
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id))
    .map((m) => ({ m, resto: r2(m.monto) }));
  let pozo = 0;
  for (const c of movs) {
    if (c.tipo !== "cargo") continue;
    let queda = r2(c.monto);
    const guia = c.gtfNumber?.trim();
    if (guia) {
      for (const a of abonos) {
        if (queda <= CERO) break;
        if (a.m.gtfNumber?.trim() !== guia || a.resto <= CERO) continue;
        const tomado = Math.min(queda, a.resto);
        a.resto = r2(a.resto - tomado);
        queda = r2(queda - tomado);
      }
    }
    pozo = r2(pozo + queda);
  }
  const tramos: TramoPendiente[] = [];
  for (const a of abonos) {
    const tomado = Math.min(pozo, a.resto);
    pozo = r2(pozo - tomado);
    const resto = r2(a.resto - tomado);
    if (resto > CERO) {
      tramos.push({ concepto: a.m.concepto, monto: resto, fecha: dia(a.m.fecha), gtfNumber: a.m.gtfNumber?.trim() || null });
    }
  }
  return tramos;
}

/** «guía 019-0000003» · «guías A, B y 2 más». */
function guiasDe(tramos: readonly TramoPendiente[]): string | null {
  const guias = [...new Set(tramos.map((t) => t.gtfNumber).filter((g): g is string => !!g))];
  if (guias.length === 0) return null;
  if (guias.length === 1) return `guía ${guias[0]}`;
  const vistas = guias.slice(0, 2).join(", ");
  return guias.length > 2 ? `guías ${vistas} y ${guias.length - 2} más` : `guías ${vistas}`;
}

const etiquetaConcepto = (c: string) => CONCEPTO_LABEL[c as Concepto] ?? c;

/** Las partidas de la cuenta forestal de una parte, por moneda; y lo que la parte te debe. */
function cuentaForestal(parteId: string, movs: readonly MovimientoCuenta[]): { partidas: PartidaPorPagar[]; teDebe: MontoEnMoneda[] } {
  const porMon = new Map<string, MovimientoCuenta[]>();
  for (const m of movs) {
    const k = moneda(m.moneda);
    const lista = porMon.get(k) ?? [];
    lista.push(m);
    porMon.set(k, lista);
  }
  const partidas: PartidaPorPagar[] = [];
  const teDebe: MontoEnMoneda[] = [];
  for (const [mon, lista] of porMon) {
    const saldo = r2(lista.reduce((s, m) => s + (m.tipo === "cargo" ? m.monto : -m.monto), 0));
    if (saldo > CERO) {
      teDebe.push({ moneda: mon, monto: saldo });
      continue;
    }
    if (saldo >= -CERO) continue;
    const tramos = pendienteDeLaCuenta(lista);
    const aserrio = tramos.filter((t) => t.concepto === "aserrio_recibido");
    const resto = tramos.filter((t) => t.concepto !== "aserrio_recibido");
    const masViejo = (ts: TramoPendiente[]) => ts.map((t) => t.fecha).filter((f): f is string => !!f).sort()[0] ?? null;
    const suma = (ts: TramoPendiente[]) => r2(ts.reduce((s, t) => s + t.monto, 0));
    if (aserrio.length > 0) {
      partidas.push({
        id: `${parteId}:${mon}:aserrio`,
        fuente: "aserrio_recibido",
        monto: suma(aserrio),
        moneda: mon,
        desde: masViejo(aserrio),
        vence: null,
        nota: `${aserrio.length} ${aserrio.length === 1 ? "aserrío" : "aserríos"} sin pagar`,
        enlace: ENLACE_FUENTE.aserrio_recibido,
      });
    }
    if (resto.length > 0) {
      const conceptos = [...new Set(resto.map((t) => etiquetaConcepto(String(t.concepto))))];
      partidas.push({
        id: `${parteId}:${mon}:cuenta`,
        fuente: "cuenta_forestal",
        monto: suma(resto),
        moneda: mon,
        desde: masViejo(resto),
        vence: null,
        nota: [conceptos.join(" · "), guiasDe(resto)].filter(Boolean).join(" · "),
        enlace: ENLACE_FUENTE.cuenta_forestal,
      });
    }
  }
  return { partidas, teDebe };
}

/** La partida de un adelanto que el negocio debe, o `null` si no es deuda tuya. */
function partidaDeAdelanto(a: AdelantoParaPagar): PartidaPorPagar | null {
  if (quienDebe({ direccion: a.direccion, status: a.status, saldoPendiente: a.saldoPendiente }) !== "le-debes") return null;
  const recibido = a.direccion === "RECIBIDO";
  const concepto = recibido && a.conceptoRecibido ? ETIQUETA_CONCEPTO[a.conceptoRecibido as AdelantoConceptoRecibido] : null;
  const codigo = a.codigoOperacion?.trim() || (a.reciboManual?.trim() ? `Recibo ${a.reciboManual.trim()}` : null);
  const fuente: FuentePorPagar = recibido ? "adelanto_recibido" : "adelanto_excedido";
  return {
    id: a.id,
    fuente,
    monto: r2(Math.abs(a.saldoPendiente)),
    moneda: moneda(a.moneda),
    desde: dia(a.fechaAdelanto),
    vence: recibido ? dia(a.fechaVencimiento) : null,
    nota: [codigo, concepto ?? (recibido ? null : "Te devolvió más de lo que le diste")].filter(Boolean).join(" · ") || null,
    enlace: ENLACE_FUENTE[fuente],
  };
}

/** Lo que la persona te debe por sus adelantos (lo dado abierto y lo recibido excedido). */
function teDebePorAdelantos(grupos: readonly GrupoAdelanto[]): MontoEnMoneda[] {
  const out: MontoEnMoneda[] = [];
  for (const g of grupos) {
    const recibido = g.direccion === "RECIBIDO";
    if (!recibido && g.status === "ABIERTO" && g.saldoPendiente > CERO) out.push({ moneda: moneda(g.moneda), monto: g.saldoPendiente });
    if (recibido && g.status === "EXCEDIDO" && g.saldoPendiente < -CERO) out.push({ moneda: moneda(g.moneda), monto: -g.saldoPendiente });
  }
  return out;
}

function netoDe(teDebe: MontoEnMoneda[], debes: MontoEnMoneda[]): MontoEnMoneda[] {
  if (teDebe.length === 0) return [];
  const monedas = new Set([...teDebe.map((x) => x.moneda), ...debes.map((x) => x.moneda)]);
  const valor = (xs: MontoEnMoneda[], m: string) => xs.find((x) => x.moneda === m)?.monto ?? 0;
  return ordenarMonedas([...monedas].map((m) => ({ moneda: m, monto: r2(valor(teDebe, m) - valor(debes, m)) })));
}

function armarPersona(
  base: { clave: string; nombre: string; tipo: TipoAcreedor },
  partidasSueltas: PartidaPorPagar[],
  teDebeCrudo: MontoEnMoneda[],
  hoy: string,
  conLiquidar: boolean,
): PersonaPorPagar | null {
  const partidas = ordenarPartidas(partidasSueltas.filter((p) => p.monto > CERO), hoy);
  if (partidas.length === 0) return null;
  const debes = porMoneda(partidas.map((p) => ({ moneda: p.moneda, monto: p.monto })));
  const teDebe = porMoneda(teDebeCrudo);
  const vence = partidas.map((p) => p.vence).filter((v): v is string => !!v).sort()[0] ?? null;
  return {
    ...base,
    debes,
    partidas,
    vence,
    vencido: vence != null && vence < hoy,
    teDebe,
    neto: netoDe(teDebe, debes),
    liquidar: conLiquidar && teDebe.length > 0 ? ENLACE_LIQUIDAR : null,
  };
}

// ── El armado ────────────────────────────────────────────────────────────────

/**
 * Todo lo que debes, una fila por acreedor, con el desglose por fuente.
 *
 * Los totales salen de las MISMAS partidas que se listan: la cabecera no puede
 * decir un número que la lista no sume.
 */
export function armarPorPagar(e: EntradaPorPagar): PorPagarDetalle {
  const { hoy } = e;
  const adelantosPorBenef = new Map<string, AdelantoParaPagar[]>();
  for (const a of e.adelantos) {
    const lista = adelantosPorBenef.get(a.beneficiarioId) ?? [];
    lista.push(a);
    adelantosPorBenef.set(a.beneficiarioId, lista);
  }
  const gruposPorBenef = new Map<string, GrupoAdelanto[]>();
  for (const g of e.grupos) {
    const lista = gruposPorBenef.get(g.beneficiarioId) ?? [];
    lista.push(g);
    gruposPorBenef.set(g.beneficiarioId, lista);
  }

  const personas: PersonaPorPagar[] = [];
  const benefVistos = new Set<string>();

  // 1) Personas de «Cuenta por persona»: adelantos + cuenta forestal unidos.
  for (const p of e.personas) {
    const partidas: PartidaPorPagar[] = [];
    const teDebe: MontoEnMoneda[] = [];
    if (p.beneficiarioId) {
      benefVistos.add(p.beneficiarioId);
      for (const a of adelantosPorBenef.get(p.beneficiarioId) ?? []) {
        const partida = partidaDeAdelanto(a);
        if (partida) partidas.push(partida);
      }
      teDebe.push(...teDebePorAdelantos(gruposPorBenef.get(p.beneficiarioId) ?? []));
    }
    if (p.parteId && p.madera) {
      const f = cuentaForestal(p.parteId, p.madera.movimientos);
      partidas.push(...f.partidas);
      teDebe.push(...f.teDebe);
    }
    const fila = armarPersona({ clave: p.clave, nombre: p.nombre?.trim() || "Sin nombre", tipo: "persona" }, partidas, teDebe, hoy, true);
    if (fila) personas.push(fila);
  }

  // 2) Adelantos de alguien que la unión no trajo (defensa: la deuda no se
  //    pierde porque falte la ficha en la lista de personas).
  for (const [benefId, lista] of adelantosPorBenef) {
    if (benefVistos.has(benefId)) continue;
    const partidas = lista.map(partidaDeAdelanto).filter((x): x is PartidaPorPagar => x != null);
    const nombre = lista.find((a) => a.beneficiarioNombre?.trim())?.beneficiarioNombre?.trim() || "Sin nombre";
    const fila = armarPersona({ clave: `benef:${benefId}`, nombre, tipo: "persona" }, partidas, teDebePorAdelantos(gruposPorBenef.get(benefId) ?? []), hoy, true);
    if (fila) personas.push(fila);
  }

  // 3) Proveedores: una fila por proveedor, una partida por cuenta.
  const porProveedor = new Map<string, { nombre: string; partidas: PartidaPorPagar[] }>();
  for (const c of e.cuentasPorPagar) {
    const falta = r2(netoPorPagar({ amount: c.amount, paidAmount: c.paidAmount, status: c.status }));
    if (falta <= CERO) continue;
    const prev = porProveedor.get(c.supplierId) ?? { nombre: "", partidas: [] };
    if (!prev.nombre && c.supplierName?.trim()) prev.nombre = c.supplierName.trim();
    prev.partidas.push({
      id: c.id,
      fuente: "cuenta_por_pagar",
      monto: falta,
      moneda: PEN,
      desde: c.desde,
      vence: c.vence,
      nota: c.description?.trim() || (c.paidAmount > 0 ? "Pagada en parte" : null),
      enlace: ENLACE_FUENTE.cuenta_por_pagar,
    });
    porProveedor.set(c.supplierId, prev);
  }
  for (const [supplierId, v] of porProveedor) {
    const fila = armarPersona({ clave: `proveedor:${supplierId}`, nombre: v.nombre || "Proveedor sin nombre", tipo: "proveedor" }, v.partidas, [], hoy, false);
    if (fila) personas.push(fila);
  }

  // 4) Préstamos que te hicieron: cada uno es su propio acreedor.
  for (const pr of e.prestamos) {
    const impagas = pr.cuotas.length;
    const monto = r2(pr.cuotas.reduce((s, c) => s + c.monto, 0));
    const vence = pr.cuotas.map((c) => c.vence).filter((v): v is string => !!v).sort()[0] ?? null;
    const fila = armarPersona(
      { clave: `prestamo:${pr.id}`, nombre: pr.nombre?.trim() || "Préstamo sin nombre", tipo: "entidad" },
      [{
        id: pr.id,
        fuente: "prestamo_recibido",
        monto,
        moneda: moneda(pr.moneda),
        desde: pr.desde,
        vence,
        nota: `${impagas} cuota${impagas === 1 ? "" : "s"} sin pagar`,
        enlace: ENLACE_FUENTE.prestamo_recibido,
      }],
      [],
      hoy,
      false,
    );
    if (fila) personas.push(fila);
  }

  const ordenadas = ordenarPorPagar(personas, hoy);
  return { hoy, ...resumirPorPagar(ordenadas, hoy), personas: ordenadas, truncado: e.truncado === true };
}

/** Totales por moneda y por fuente, derivados de las partidas. */
export function resumirPorPagar(personas: readonly PersonaPorPagar[], hoy: string): { totales: TotalPorPagar[]; porFuente: FuenteResumen[] } {
  const tot = new Map<string, { total: number; cuentas: Set<string>; partidas: number; vencido: number; cruzable: number }>();
  const fue = new Map<string, FuenteResumen>();
  for (const p of personas) {
    for (const d of p.debes) {
      const te = p.teDebe.find((x) => x.moneda === d.moneda)?.monto ?? 0;
      if (te <= CERO) continue;
      const t = tot.get(d.moneda) ?? { total: 0, cuentas: new Set<string>(), partidas: 0, vencido: 0, cruzable: 0 };
      t.cruzable += Math.min(d.monto, te);
      tot.set(d.moneda, t);
    }
    for (const x of p.partidas) {
      const t = tot.get(x.moneda) ?? { total: 0, cuentas: new Set<string>(), partidas: 0, vencido: 0, cruzable: 0 };
      t.total += x.monto;
      t.cuentas.add(p.clave);
      t.partidas += 1;
      if (x.vence && x.vence < hoy) t.vencido += x.monto;
      tot.set(x.moneda, t);
      const k = `${x.fuente}|${x.moneda}`;
      const f = fue.get(k) ?? { fuente: x.fuente, moneda: x.moneda, total: 0, count: 0 };
      f.total += x.monto;
      f.count += 1;
      fue.set(k, f);
    }
  }
  const totales = ordenarMonedas(
    [...tot.entries()].map(([m, t]) => ({
      moneda: m, total: r2(t.total), cuentas: t.cuentas.size, partidas: t.partidas, vencido: r2(t.vencido), cruzable: r2(t.cruzable),
    })),
  );
  const orden = (f: FuentePorPagar) => FUENTES_POR_PAGAR.indexOf(f);
  const porFuente = [...fue.values()]
    .map((f) => ({ ...f, total: r2(f.total) }))
    .sort((a, b) => orden(a.fuente) - orden(b.fuente) || (a.moneda === PEN ? -1 : b.moneda === PEN ? 1 : a.moneda.localeCompare(b.moneda)));
  return { totales, porFuente };
}
