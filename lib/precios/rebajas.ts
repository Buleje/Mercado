/**
 * «Rebajar lo que no se vende» — LA regla (19-10), una sola para las dos
 * pantallas que proponen bajar precios:
 *  · Análisis › Predicción › Sugerencias de precio (`/api/forecasting/price-suggestions`);
 *  · Asistente IA › Comandos › Precios en bloque, cuando la frase pide rebajar
 *    lo que no se vende (`/api/admin/comandos-ia/precios/plan`).
 * Antes cada una tenía su cálculo: Análisis sólo miraba la demanda PREVISTA
 * (lo que no vendió nada nunca entraba: 0 sugerencias en main) e inventaba el
 * costo (precio × 0,7) cuando faltaba; la IA bajaba lo que dijera la frase sin
 * piso. Ahora las dos arman la misma lista con esta función.
 *
 * Pura: el servidor junta ventas y lotes (`rebajas-servidor.ts`) y aquí se
 * decide. Plata en céntimos enteros vía `redondear` (sin ruido del float).
 *
 * La regla:
 *  1. Vence primero: el lote NO vencido con stock más próximo a vencer, si
 *     vence en ≤ 15 días → 20 % a 30 % (a menos días, más); el detalle dice
 *     cuántas unidades vencen. Sólo lotes vencidos = no se rebaja: se saca de
 *     la venta.
 *  2. Sin ventas (caja + pedidos no cancelados + salidas como componente de un
 *     kit) en la ventana (30 días) y con stock contado → 15 %. Sin stock no es
 *     «no se mueve»; stock sin controlar (servicios) tampoco: no entran.
 *  3. Rota poco: vendió, pero tiene más de 3 veces lo vendido en la ventana →
 *     10 % a 15 % según el exceso.
 *  Piso: nunca debajo del costo + 5 %. Sin costo cargado no se propone (no hay
 *  cómo saber el piso). Redondeo a 10 céntimos hacia ARRIBA (precio de góndola
 *  que no come margen); si la frase pide otro redondeo, ése.
 */

import {
  aCentimos,
  aplicarOperacion,
  armarFila,
  redondear,
  type FilaDiferencia,
  type Operacion,
  type ProductoPrecio,
  type Redondeo,
} from "@/lib/admin/comandos-ia/precios";

export const REBAJA_VENTANA_DIAS = 30;
export const REBAJA_VENCE_DIAS = 15;
export const REBAJA_VENCE_PCT = { min: 20, max: 30 } as const;
export const REBAJA_SIN_VENTA_PCT = 15;
export const REBAJA_ROTA_POCO_PCT = { min: 10, max: 15 } as const;
/** «Rota poco» = stock de más de 3 veces lo vendido en la ventana. */
export const REBAJA_ROTA_POCO_VECES = 3;
/** El piso: costo + 5 %. */
export const REBAJA_PISO_SOBRE_COSTO = 1.05;
/** Precio de góndola: a 10 céntimos, hacia arriba. */
export const REBAJA_REDONDEO: Redondeo = 0.1;

export type MotivoRebaja = "vence" | "sin-venta" | "rota-poco";
export const MOTIVOS_REBAJA: readonly MotivoRebaja[] = ["vence", "sin-venta", "rota-poco"];

/** El lote que manda para «vence»: su fecha (`YYYY-MM-DD`) y las unidades que vencen ese día. */
export interface LoteQueVence {
  fecha: string;
  cantidad: number;
}

export interface DatosRebaja {
  productos: ProductoPrecio[];
  /** Unidades vendidas en la ventana (caja + pedidos no cancelados + componente de kit). Sin entrada = 0. */
  vendidas: ReadonlyMap<number, number>;
  /** El lote que manda (`elegirLoteQueVence`): el no vencido más próximo; si sólo hay vencidos, ésos. */
  vence: ReadonlyMap<number, LoteQueVence>;
  /** Hoy en Lima, `YYYY-MM-DD`. */
  hoy: string;
  /** La ventana de «no se vende», en días. */
  dias: number;
}

export interface OpcionesRebaja {
  /** Sólo estos motivos («lo que no se vendió en 30 días» = sólo sin-venta). Por defecto, los tres. */
  motivos?: readonly MotivoRebaja[];
  /** La rebaja que dijo la frase («Rebaja 10 %»): pisa el % de la regla; piso y redondeo, los mismos. */
  operacion?: Operacion;
  /** 0 = el de la regla (10 céntimos). */
  redondeo?: Redondeo;
}

export interface FilaRebaja extends FilaDiferencia {
  motivo: MotivoRebaja;
  /** «Vence en 4 días (23/10)», «Sin ventas en 30 días · 12 u. paradas»… */
  detalle: string;
  /** Lo que baja de verdad, tras piso y redondeo (negativo, en %). */
  pct: number;
  /** Quedó en el piso (costo + 5 %): no baja todo lo que la regla pedía. */
  enPiso: boolean;
  stock: number | null;
}

export interface NoEntraRebaja {
  productId: number;
  nombre: string;
  motivo: string;
}

export interface ListaRebajas {
  filas: FilaRebaja[];
  noEntran: NoEntraRebaja[];
  dias: number;
}

const DIA_MS = 86_400_000;

/** Días de `hoy` a `fecha` (las dos `YYYY-MM-DD`, días calendario de Lima). Negativo = ya pasó. */
export function diasHasta(hoy: string, fecha: string): number | null {
  const a = Date.parse(`${hoy}T00:00:00Z`);
  const b = Date.parse(`${fecha.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / DIA_MS);
}

/**
 * Por producto, el lote que manda para la regla «vence»: el NO vencido con
 * stock que vence primero (y cuántas unidades vencen ese día). Un lote vencido
 * viejo no tapa al que está por vencer; sólo si no queda ninguno sin vencer,
 * manda el vencido más reciente con el total de unidades vencidas.
 */
export function elegirLoteQueVence(
  lotes: ReadonlyArray<{ productId?: number | null; expiryDate: string; quantity: number }>,
  hoy: string,
  productos?: ReadonlySet<number>,
): Map<number, LoteQueVence> {
  const vigente = new Map<number, LoteQueVence>();
  const vencido = new Map<number, LoteQueVence>();
  for (const l of lotes) {
    const id = l.productId;
    if (id == null || (productos && !productos.has(id)) || !(l.quantity > 0)) continue;
    const fecha = l.expiryDate.slice(0, 10);
    if (fecha >= hoy) {
      const previo = vigente.get(id);
      if (!previo || fecha < previo.fecha) vigente.set(id, { fecha, cantidad: l.quantity });
      else if (fecha === previo.fecha) previo.cantidad += l.quantity;
    } else {
      const previo = vencido.get(id);
      vencido.set(id, { fecha: previo && previo.fecha > fecha ? previo.fecha : fecha, cantidad: (previo?.cantidad ?? 0) + l.quantity });
    }
  }
  for (const [id, l] of vencido) if (!vigente.has(id)) vigente.set(id, l);
  return vigente;
}

const ddmm = (iso: string) => iso.slice(0, 10).split("-").slice(1).reverse().join("/");
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const soles = (n: number) => `S/ ${n.toFixed(2)}`;

/** El % de la regla (positivo = cuánto baja). */
export function pctDeRegla(motivo: MotivoRebaja, x: { diasVence?: number | null; stock?: number | null; vendidas?: number }): number {
  if (motivo === "vence") {
    const d = Math.min(Math.max(x.diasVence ?? 0, 0), REBAJA_VENCE_DIAS);
    return REBAJA_VENCE_PCT.min + (1 - d / REBAJA_VENCE_DIAS) * (REBAJA_VENCE_PCT.max - REBAJA_VENCE_PCT.min);
  }
  if (motivo === "sin-venta") return REBAJA_SIN_VENTA_PCT;
  const vendidas = x.vendidas ?? 0;
  const stock = x.stock ?? 0;
  if (!(vendidas > 0)) return REBAJA_ROTA_POCO_PCT.min;
  const exceso = Math.min(Math.max((stock / (REBAJA_ROTA_POCO_VECES * vendidas) - 1) / 2, 0), 1);
  return REBAJA_ROTA_POCO_PCT.min + exceso * (REBAJA_ROTA_POCO_PCT.max - REBAJA_ROTA_POCO_PCT.min);
}

/** El motivo por el que el producto entra a la lista (o null). Vence > sin ventas > rota poco. */
function motivoDe(
  p: ProductoPrecio,
  vendidas: number,
  diasVence: number | null,
  motivos: ReadonlySet<MotivoRebaja>,
): MotivoRebaja | null {
  if (motivos.has("vence") && diasVence != null && diasVence <= REBAJA_VENCE_DIAS) return "vence";
  const stock = p.stock;
  // Stock sin controlar (null: servicios, a pedido) no dice si algo está parado: no entra.
  if (motivos.has("sin-venta") && !(vendidas > 0) && stock != null) return "sin-venta";
  if (motivos.has("rota-poco") && vendidas > 0 && stock != null && stock > REBAJA_ROTA_POCO_VECES * vendidas) return "rota-poco";
  return null;
}

function detalleDe(motivo: MotivoRebaja, p: ProductoPrecio, x: { diasVence: number | null; lote?: LoteQueVence; vendidas: number; dias: number }): string {
  if (motivo === "vence") {
    const d = x.diasVence ?? 0;
    const cuando = d === 0 ? "hoy" : `en ${plural(d, "día", "días")}${x.lote ? ` (${ddmm(x.lote.fecha)})` : ""}`;
    if (!x.lote) return `Vence ${cuando}`;
    const n = x.lote.cantidad;
    const de = p.stock != null && p.stock > n ? ` de ${p.stock}` : "";
    return `${n} u.${de} ${n === 1 ? "vence" : "vencen"} ${cuando}`;
  }
  if (motivo === "sin-venta") {
    return `Sin ventas en ${x.dias} días${p.stock != null && p.stock > 0 ? ` · ${p.stock} u. paradas` : ""}`;
  }
  return `Vendió ${x.vendidas} en ${x.dias} días y tiene ${p.stock ?? 0} u.`;
}

/** Plata parada = stock × costo: lo que más plata tiene quieta va primero dentro de su motivo. */
const plataParada = (p: ProductoPrecio) => Math.max(p.stock ?? 0, 0) * (p.costPrice ?? 0);
const ORDEN: Record<MotivoRebaja, number> = { vence: 0, "sin-venta": 1, "rota-poco": 2 };

/**
 * La lista de rebajas: qué baja, a cuánto y por qué; y lo que calificaba pero
 * no entra (vencido, sin stock, sin costo, ya en su piso), con el motivo.
 */
export function armarRebajas(datos: DatosRebaja, opciones: OpcionesRebaja = {}): ListaRebajas {
  const motivos = new Set(opciones.motivos ?? MOTIVOS_REBAJA);
  const paso: Redondeo = opciones.redondeo || REBAJA_REDONDEO;
  const filas: Array<FilaRebaja & { _orden: number; _plata: number; _dias: number }> = [];
  const noEntran: NoEntraRebaja[] = [];
  const no = (p: ProductoPrecio, motivo: string) => noEntran.push({ productId: p.id, nombre: p.name, motivo });

  for (const p of datos.productos) {
    const vendidas = datos.vendidas.get(p.id) ?? 0;
    const lote = datos.vence.get(p.id);
    const diasVence = lote ? diasHasta(datos.hoy, lote.fecha) : null;
    // Un vencido califica como «vence» o «sin ventas»: se avisa, nunca se rebaja.
    const vencido = diasVence != null && diasVence < 0;
    const motivo = motivoDe(p, vendidas, vencido ? null : diasVence, motivos);
    if (vencido && (motivo || motivos.has("vence"))) {
      no(p, `venció el ${ddmm(lote?.fecha ?? "")} (${lote?.cantidad ?? 0} u.): sácalo de la venta, no se rebaja`);
      continue;
    }
    if (!motivo) continue;
    if (p.stock != null && p.stock <= 0) {
      no(p, "sin stock: no se vende porque no hay");
      continue;
    }
    const costo = p.costPrice;
    if (costo == null || !(costo > 0)) {
      no(p, "sin costo cargado: no sé hasta dónde bajar sin perder");
      continue;
    }
    const bruto = opciones.operacion
      ? aplicarOperacion(p.price, costo, opciones.operacion)
      : p.price * (1 - pctDeRegla(motivo, { diasVence, stock: p.stock, vendidas }) / 100);
    if (bruto == null || !(bruto > 0)) {
      no(p, "quedaría en S/ 0 o menos");
      continue;
    }
    const piso = redondear(costo * REBAJA_PISO_SOBRE_COSTO, paso);
    const rebajado = redondear(bruto, paso);
    const precio = Math.max(rebajado, piso);
    if (aCentimos(precio) >= aCentimos(p.price)) {
      no(
        p,
        aCentimos(piso) >= aCentimos(p.price)
          ? `ya está en su piso (costo ${soles(costo)} + 5 %): bajarlo es perder`
          : "la rebaja no llega al redondeo: queda igual",
      );
      continue;
    }
    const enPiso = aCentimos(piso) > aCentimos(rebajado);
    const base = armarFila(p, { precio, costo });
    filas.push({
      ...base,
      motivo,
      detalle: detalleDe(motivo, p, { diasVence, lote, vendidas, dias: datos.dias }) + (enPiso ? " · tope: costo + 5 %" : ""),
      pct: Math.round(((precio - p.price) / p.price) * 1000) / 10,
      enPiso,
      stock: p.stock ?? null,
      _orden: ORDEN[motivo],
      _plata: plataParada(p),
      _dias: diasVence ?? 0,
    });
  }

  filas.sort((a, b) => a._orden - b._orden || (a.motivo === "vence" ? a._dias - b._dias : 0) || b._plata - a._plata || a.nombre.localeCompare(b.nombre));
  return {
    filas: filas.map(({ _orden, _plata, _dias, ...f }) => f),
    noEntran,
    dias: datos.dias,
  };
}

/** «Rebajar lo que no se vende · vence en 15 días, sin ventas en 30 días, rota poco · redondea a 10 céntimos». */
export function describirRebajas(dias: number, opciones: OpcionesRebaja = {}): string {
  const motivos = opciones.motivos ?? MOTIVOS_REBAJA;
  const quien = motivos
    .map((m) => (m === "vence" ? `vence en ${REBAJA_VENCE_DIAS} días` : m === "sin-venta" ? `sin ventas en ${dias} días` : "rota poco"))
    .join(", ");
  const paso = opciones.redondeo || REBAJA_REDONDEO;
  const red = paso < 1 ? `${Math.round(paso * 100)} céntimos` : "S/ 1";
  const op = opciones.operacion
    ? opciones.operacion.tipo === "pct"
      ? `Baja ${Math.abs(opciones.operacion.valor)} %`
      : `Baja ${soles(Math.abs(opciones.operacion.valor))}`
    : "Rebajar lo que no se vende";
  return `${op} · ${quien} · nunca bajo el costo + 5 % · redondea a ${red}`;
}
