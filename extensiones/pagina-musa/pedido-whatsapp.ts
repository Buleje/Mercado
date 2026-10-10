/**
 * El pedido de Musa por WhatsApp (decisión de Brandon, 09-10): la bolsa NO
 * crea un pedido en el sistema; arma el mensaje y abre el chat de Drucila.
 *
 * Función pura (sin React ni navegador): la usa `PedirPorWhatsapp.tsx` y la
 * prueba `__tests__/musa-pedido-whatsapp.test.ts`. El total es una vista
 * previa del mensaje (Drucila confirma envío y pago por WhatsApp).
 *
 * Formato exacto:
 *   Hola Drucila, quiero:
 *   • 1 × Kit Rutina facial (KT02) S/ 179
 *   Total: S/ 179
 *   Nombre: …
 *   Entrega: Ciudad Constitución
 *   Pago: Yape
 * Un producto «Por encargo» suma, debajo de su línea,
 * «(por encargo: pago 100 % adelantado)».
 *
 * Abajo, también puras: lo que el cajón muestra ARRIBA del pedido (cuánto falta
 * para el envío gratis y para el regalo de la campaña) y «Drucila te sugiere»
 * (el kit que completa lo que llevas). Ninguna toca el mensaje.
 */

/** El WhatsApp de Drucila (asesora de Musa): 921 585 006. */
export const WHATSAPP_MUSA = "51921585006";

export const PUEBLO_SIN_COSTO = "Ciudad Constitución";
export const PUEBLOS = [
  PUEBLO_SIN_COSTO,
  "Villa Rica",
  "Oxapampa",
  "Puerto Bermúdez",
  "Otro",
] as const;
export type Pueblo = (typeof PUEBLOS)[number];

export const PAGOS = ["Yape", "Plin", "Transferencia", "Contraentrega"] as const;
export type Pago = (typeof PAGOS)[number];

/** Contraentrega sólo en Constitución (allá entrega Musa misma). */
export function pagosPara(pueblo: Pueblo): readonly Pago[] {
  return pueblo === PUEBLO_SIN_COSTO ? PAGOS : PAGOS.filter((p) => p !== "Contraentrega");
}

export const NOTA_ENCARGO = "(por encargo: pago 100 % adelantado)";
export const ETIQUETA_ENCARGO = "Por encargo";

export const esPorEncargo = (etiqueta: string | null | undefined): boolean =>
  (etiqueta ?? "").trim().toLowerCase() === ETIQUETA_ENCARGO.toLowerCase();

export interface LineaPedido {
  nombre: string;
  /** El `barcode` del producto (MU001, KT02…); sin código, la línea va sin paréntesis. */
  codigo: string | null;
  cantidad: number;
  /** Precio unitario en soles. */
  precio: number;
  porEncargo: boolean;
}

export interface DatosPedido {
  lineas: readonly LineaPedido[];
  nombre: string;
  pueblo: Pueblo;
  pago: Pago;
}

export type ResultadoPedido =
  | { ok: true; mensaje: string; url: string; total: number }
  | { ok: false; motivo: "bolsa_vacia" | "falta_nombre" | "contraentrega_fuera" };

/** «S/ 258» sin céntimos; «S/ 49.90» con céntimos (punto decimal, como se escribe en Perú). */
export function solesPedido(n: number): string {
  const centimos = Math.round(n * 100);
  const entero = centimos % 100 === 0;
  return `S/ ${(centimos / 100).toLocaleString("es-PE", { minimumFractionDigits: entero ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export function armarMensajePedido(
  d: DatosPedido,
  numero: string = WHATSAPP_MUSA,
): ResultadoPedido {
  const lineas = d.lineas.filter((l) => l.cantidad > 0);
  if (lineas.length === 0) return { ok: false, motivo: "bolsa_vacia" };
  const nombre = d.nombre.trim().replace(/\s+/g, " ");
  if (!nombre) return { ok: false, motivo: "falta_nombre" };
  if (!pagosPara(d.pueblo).includes(d.pago)) return { ok: false, motivo: "contraentrega_fuera" };

  // En céntimos enteros: 0,1 + 0,2 no suma 0,30000000000000004 en el mensaje.
  const totalCentimos = lineas.reduce((s, l) => s + Math.round(l.precio * 100) * l.cantidad, 0);
  const renglones = ["Hola Drucila, quiero:"];
  for (const l of lineas) {
    const codigo = l.codigo?.trim() ? ` (${l.codigo.trim()})` : "";
    renglones.push(
      `• ${l.cantidad} × ${l.nombre.trim()}${codigo} ${solesPedido((Math.round(l.precio * 100) * l.cantidad) / 100)}`,
    );
    if (l.porEncargo) renglones.push(NOTA_ENCARGO);
  }
  const total = totalCentimos / 100;
  renglones.push(
    `Total: ${solesPedido(total)}`,
    `Nombre: ${nombre}`,
    `Entrega: ${d.pueblo}`,
    `Pago: ${d.pago}`,
  );
  const mensaje = renglones.join("\n");
  return {
    ok: true,
    mensaje,
    url: `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`,
    total,
  };
}

/* ── Avance de la bolsa: envío gratis y regalo de la campaña ───────────────── */

/** Fuera de Constitución el envío es gratis desde este monto (manual, «Envío»). */
export const ENVIO_GRATIS_DESDE = 99;

/** Campaña 01 (manual, «Campaña 01»): 1 mascarilla de regalo desde S/ 150, del 9 nov al 31 dic 2026 (días de Lima). */
export const CAMPANA_REGALO = {
  desde: "2026-11-09",
  hasta: "2026-12-31",
  monto: 150,
  regalo: "mascarilla",
} as const;

/** La preventa del manual («10 % a las primeras 20 clientas») es parte de la Campaña 01: se anuncia hasta su último día. */
export function preventaVigente(hoy: string = hoyEnLima()): boolean {
  return hoy <= CAMPANA_REGALO.hasta;
}

export interface Avance {
  /** De 0 a 1: cuánto se llena la barra. */
  fraccion: number;
  /** Soles que faltan para la meta (0 si ya llegó). */
  falta: number;
  logrado: boolean;
}

const centimos = (n: number) => Math.round(n * 100);

function avanceHasta(subtotal: number, meta: number): Avance {
  const falta = Math.max(0, centimos(meta) - centimos(subtotal)) / 100;
  return { fraccion: Math.min(1, Math.max(0, subtotal / meta)), falta, logrado: falta === 0 };
}

/** En Constitución el envío es siempre gratis (la barra sale llena); fuera, lo que falta para los S/ 99. */
export function avanceEnvio(subtotal: number, pueblo: Pueblo): Avance & { siempreGratis: boolean } {
  if (pueblo === PUEBLO_SIN_COSTO)
    return { fraccion: 1, falta: 0, logrado: true, siempreGratis: true };
  return { ...avanceHasta(subtotal, ENVIO_GRATIS_DESDE), siempreGratis: false };
}

/** «AAAA-MM-DD» de hoy en Lima: la campaña cambia de día con la hora del Perú, no con la del celular. */
export function hoyEnLima(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

/**
 * El regalo de la campaña según el día (`hoy` = «AAAA-MM-DD»): «antes» todavía no
 * empieza (se avisa la fecha, sin barra: un pedido de hoy no lleva regalo),
 * «activa» con la barra hacia los S/ 150, y null cuando ya terminó (no se muestra).
 */
export function avanceRegalo(
  subtotal: number,
  hoy: string,
): (Avance & { estado: "antes" | "activa" }) | null {
  if (hoy > CAMPANA_REGALO.hasta) return null;
  return {
    ...avanceHasta(subtotal, CAMPANA_REGALO.monto),
    estado: hoy < CAMPANA_REGALO.desde ? "antes" : "activa",
  };
}

/* ── «Drucila te sugiere»: el kit que completa lo que llevas ──────────────── */

export interface KitSugerible {
  codigo: string;
  precio: number;
  /** Los códigos que trae, con repetidos (el dúo MU013-2 = MU013 + MU013). */
  componentes: readonly string[];
}

export interface Sugerencia {
  kit: string;
  /** Los códigos de tu bolsa que el kit reemplaza (uno por componente). */
  reemplaza: string[];
  /** Los que faltan para completarlo. */
  faltan: string[];
  /** Suma de los precios de la base de sus componentes (sin tachar nada). */
  porSeparado: number;
  ahorro: number;
}

const mejorQue = (a: Sugerencia, b: Sugerencia) =>
  a.faltan.length !== b.faltan.length
    ? a.faltan.length < b.faltan.length
    : a.reemplaza.length !== b.reemplaza.length
      ? a.reemplaza.length > b.reemplaza.length
      : a.ahorro > b.ahorro;

/**
 * Entre los kits que NO están en la bolsa y comparten algo con ella, el que menos
 * cosas pide agregar (después, el que más reemplaza y el de mayor ahorro). El
 * ahorro es real: «por separado» (suma de los precios de la base) menos el precio
 * del kit. Sin el precio de algún componente o sin ahorro, ese kit no se sugiere.
 */
export function sugerirKit(
  bolsa: ReadonlyArray<{ codigo: string | null; cantidad: number }>,
  kits: readonly KitSugerible[],
  precioDe: (codigo: string) => number | undefined,
): Sugerencia | null {
  const tengo = new Map<string, number>();
  for (const l of bolsa)
    if (l.codigo && l.cantidad > 0) tengo.set(l.codigo, (tengo.get(l.codigo) ?? 0) + l.cantidad);
  let mejor: Sugerencia | null = null;
  for (const k of kits) {
    if (tengo.has(k.codigo) || k.componentes.length < 2) continue;
    const precios = k.componentes.map(precioDe);
    if (precios.some((p) => p === undefined)) continue;
    const porSeparadoC = precios.reduce<number>((s, p) => s + centimos(p ?? 0), 0);
    const ahorroC = porSeparadoC - centimos(k.precio);
    if (ahorroC <= 0) continue;
    const quedan = new Map(tengo);
    const reemplaza: string[] = [];
    const faltan: string[] = [];
    for (const c of k.componentes) {
      const n = quedan.get(c) ?? 0;
      if (n > 0) {
        reemplaza.push(c);
        quedan.set(c, n - 1);
      } else faltan.push(c);
    }
    if (reemplaza.length === 0) continue;
    const s: Sugerencia = {
      kit: k.codigo,
      reemplaza,
      faltan,
      porSeparado: porSeparadoC / 100,
      ahorro: ahorroC / 100,
    };
    if (!mejor || mejorQue(s, mejor)) mejor = s;
  }
  return mejor;
}
