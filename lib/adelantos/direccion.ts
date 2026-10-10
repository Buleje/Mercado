/**
 * De qué lado está la plata de un adelanto (ADR-448).
 *
 * Hasta el 29-09-2026 el adelanto sólo sabía «el negocio da la plata y la
 * persona la devuelve con entregas». Brandon pidió registrar también la plata
 * que RECIBE: un adelanto por un servicio que el negocio va a dar (WASACO paga
 * el aserrío antes) o un préstamo que le hacen. En Blas había S/ 3 031 de
 * pagos por aserrío cargados como entregados, sin ingreso en la caja.
 *
 * `saldoPendiente` sigue siendo monto − entregas vivas en los dos sentidos; lo
 * que cambia es QUIÉN le debe a quién y hacia dónde se mueve la caja:
 *
 * | dirección | saldo > 0 (ABIERTO) | saldo < 0 (EXCEDIDO) |
 * |-----------|---------------------|----------------------|
 * | DADO      | te debe             | le debes             |
 * | RECIBIDO  | le debes            | te debe              |
 *
 * Regla de lectura: todo lo que existía antes significa «lo que diste». Lo
 * recibido se pide por nombre, así un lector que no se actualizó deja de verlo
 * en vez de contarlo al revés. Sin Prisma: lo usan el servidor y la pantalla.
 */

import { formatCurrency } from "@/lib/currency";
import { limaDateKey } from "@/lib/utils";

export type AdelantoDireccion = "DADO" | "RECIBIDO";
export type AdelantoConceptoRecibido = "SERVICIO" | "PRESTAMO";

export const DIRECCIONES: readonly AdelantoDireccion[] = ["DADO", "RECIBIDO"] as const;
export const CONCEPTOS_RECIBIDO: readonly AdelantoConceptoRecibido[] = ["SERVICIO", "PRESTAMO"] as const;

/**
 * El filtro de lectura para lo que el negocio DIO. Lo usan los lectores que
 * consultan la tabla por fuera de `AdelantosDB` (por cobrar, finanzas, balance
 * del permiso, liquidación de cuenta): sin él, un recibido abierto se sumaba
 * como «te debe». Vive acá, sin Prisma, para no crear un ciclo de imports
 * entre clases de `lib/db`.
 */
export const SOLO_DADOS = { direccion: "DADO" } as const;

/** Qué pide un lector: una dirección, o `"todas"` explícito. */
export type FiltroDireccion = AdelantoDireccion | "todas";

/** El `where` de una lectura: sin pedir nada, sólo lo dado. */
export function whereDireccion(d: FiltroDireccion | null | undefined): { direccion?: AdelantoDireccion } {
  if (d === "todas") return {};
  return { direccion: d === "RECIBIDO" ? "RECIBIDO" : "DADO" };
}

/** Un adelanto sin dirección (filas y respuestas de antes) es DADO. */
export function direccionDe(v: unknown): AdelantoDireccion {
  return v === "RECIBIDO" ? "RECIBIDO" : "DADO";
}

export const esRecibido = (a: { direccion?: unknown }): boolean => direccionDe(a.direccion) === "RECIBIDO";

type ConSaldo = { direccion?: unknown; status: string; saldoPendiente: number };

/**
 * Quién le debe a quién HOY por este adelanto. `null` = nadie: liquidado,
 * cancelado o saldo en cero.
 */
export function quienDebe(a: ConSaldo): "te-debe" | "le-debes" | null {
  if (a.status === "CANCELADO" || a.status === "LIQUIDADO") return null;
  if (!Number.isFinite(a.saldoPendiente) || a.saldoPendiente === 0) return null;
  const aTuFavor = a.saldoPendiente > 0;
  return esRecibido(a) === aTuFavor ? "le-debes" : "te-debe";
}

/** El saldo visto desde el negocio: + te debe, − le debes, 0 si nadie debe. */
export function saldoConSigno(a: ConSaldo): number {
  const q = quienDebe(a);
  if (q == null) return 0;
  const abs = Math.abs(a.saldoPendiente);
  return q === "te-debe" ? abs : -abs;
}

/**
 * ¿Entra en el tope de crédito? Sólo lo que el negocio DIO y sigue abierto, en
 * soles (misma regla que el guard de `AdelantosDB.create`). Recibir un
 * préstamo no le quita margen a nadie.
 */
export function cuentaParaTope(a: { direccion?: unknown; status: string; moneda?: string | null }): boolean {
  return direccionDe(a.direccion) === "DADO" && a.status === "ABIERTO" && (a.moneda || "PEN") === "PEN";
}

/** El movimiento de caja al crear el adelanto: dar saca plata, recibir la entra. */
export const cajaAlCrear = (d: AdelantoDireccion): "egreso" | "ingreso" => (d === "DADO" ? "egreso" : "ingreso");

/**
 * El movimiento de caja al devolver en plata (una entrega con caja, o la
 * devolución al anular): la persona te devuelve lo que le diste → ingreso; tú
 * le devuelves lo que te dio → egreso.
 */
export const cajaAlDevolver = (d: AdelantoDireccion): "egreso" | "ingreso" => (d === "DADO" ? "ingreso" : "egreso");

/** Cómo se nombra cada caso en pantalla, recibos y exportes. */
export const ETIQUETA_DIRECCION: Record<AdelantoDireccion, string> = {
  DADO: "Plata que diste",
  RECIBIDO: "Plata que recibiste",
};

export const ETIQUETA_CONCEPTO: Record<AdelantoConceptoRecibido, string> = {
  SERVICIO: "Adelanto por un servicio que darás",
  PRESTAMO: "Préstamo que te hicieron",
};

/**
 * ¿La combinación es válida? La misma regla que el CHECK de la base y el
 * `superRefine` del POST: DADO sin concepto; RECIBIDO con concepto y nunca
 * como descuento por planilla (eso es un adelanto de sueldo, siempre dado).
 * Devuelve el motivo en español, o `null` si está bien.
 */
export function problemaDeDireccion(v: {
  direccion?: unknown;
  conceptoRecibido?: unknown;
  modalidad?: unknown;
}): string | null {
  const d = direccionDe(v.direccion);
  const c = v.conceptoRecibido ?? null;
  if (d === "DADO") return c == null ? null : "La plata que das no lleva concepto de recibido.";
  if (c == null || !(CONCEPTOS_RECIBIDO as readonly unknown[]).includes(c)) {
    return "Elige si te adelantaron por un servicio o te prestaron plata.";
  }
  if (v.modalidad === "DESCUENTO_PLANILLA") return "El descuento por planilla es sólo para la plata que das.";
  return null;
}

// ── ¿El alta movió la caja? (revisión de seguridad, ADR-448) ────────────────

/** Un movimiento de caja, lo mínimo para reconocer el del alta. */
export interface MovimientoDeCaja {
  type: string;
  amount: number;
  description: string;
  createdAt: Date | string;
}

/**
 * El movimiento de caja que hizo el ALTA de este adelanto, o `null` si no lo hay.
 *
 * Por qué importa: corregir la dirección de un adelanto cuya alta movió la caja
 * duplica la plata. DADO S/ X con caja (salen X) → corregido a RECIBIDO → una
 * devolución en plata de X saca OTROS X: la persona cobró 2X. Al revés, un
 * recibido con caja corregido a dado entra dos veces.
 *
 * Dos reglas, y basta una para bloquear (ante la duda, bloquea: el peor error
 * es pagar dos veces, no tener que anular y volver a cargar):
 *
 * 1. **Por código** (todo desde ADR-329): un movimiento del negocio que lo nombre
 *    como palabra entera — «ADL-2026-0002» no calza dentro de «ADL-2026-00021».
 *    Como sólo se corrige sin entregas vivas y sin anular, el único movimiento
 *    con ese código es el del alta.
 * 2. **Por monto y día**, con o sin código: un movimiento del SENTIDO del alta
 *    (egreso si se dio, ingreso si se recibió), del **mismo monto exacto**, el
 *    **mismo día de Lima** en que se cargó el adelanto, y que no nombra OTRO
 *    adelanto ni liquidación (`ADL-…`, `LIQ-…`: ésos se explican solos). Atrapa
 *    el egreso anotado a mano en la caja, sin código (revisión 28-09).
 */
export function movimientoDelAlta(
  adelanto: {
    codigoOperacion: string | null;
    montoAdelantado: number;
    createdAt: Date | string;
    /** La dirección con la que se CARGÓ (la de antes de corregir). */
    direccion: AdelantoDireccion;
  },
  movimientos: readonly MovimientoDeCaja[],
): MovimientoDeCaja | null {
  const orden = (a: MovimientoDeCaja, b: MovimientoDeCaja) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  const codigo = adelanto.codigoOperacion?.trim() || null;
  const escapado = codigo ? codigo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : null;
  const palabra = escapado ? new RegExp("(^|[^0-9A-Za-z-])" + escapado + "(?![0-9])") : null;
  const tipoDelAlta = cajaAlCrear(adelanto.direccion);
  const dia = limaDateKey(adelanto.createdAt);
  const centimos = Math.round(adelanto.montoAdelantado * 100);
  const otroCodigo = /\b(?:ADL|LIQ)-\d{4}-\d+/i;
  return (
    [...movimientos]
      .filter((m) => m.type === "ingreso" || m.type === "egreso")
      .sort(orden)
      .find(
        (m) =>
          (palabra != null && palabra.test(m.description)) ||
          (m.type === tipoDelAlta &&
            Math.round(Number(m.amount) * 100) === centimos &&
            limaDateKey(m.createdAt) === dia &&
            !otroCodigo.test(m.description)),
      ) ?? null
  );
}

/** «27/09»: el día de Lima de un instante. */
function diaCorto(v: Date | string): string {
  const [, mes, dia] = limaDateKey(v).split("-");
  return `${dia}/${mes}`;
}

/**
 * El «no» de corregir la dirección cuando el alta movió la caja, en tuteo y con
 * qué hacer. `direccion` es la de AHORA (la que se quiere cambiar).
 */
export function mensajeMovioCaja(direccion: AdelantoDireccion, mov: MovimientoDeCaja): string {
  const cuando = `el ${diaCorto(mov.createdAt)} (${formatCurrency(Number(mov.amount))})`;
  return direccion === "DADO"
    ? `Esta plata salió de tu caja ${cuando}. Para cambiarla a recibida, anúlala devolviendo la plata a la caja y regístrala de nuevo como recibida.`
    : `Esta plata entró a tu caja ${cuando}. Para cambiarla a dada, anúlala devolviéndole la plata (sale de la caja) y regístrala de nuevo como dada.`;
}
