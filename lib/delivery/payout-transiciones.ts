import { z } from "zod";

/**
 * Qué se puede hacer con un retiro del repartidor desde el panel, sin base.
 *
 * El repartidor PIDE el retiro en su app (`pending`). El dueño lo aprueba
 * (opcional: «ya lo vi, lo pago hoy»), lo paga o lo rechaza:
 *
 *   pending ──aprobar──▶ approved
 *   pending | approved ──pagar──▶ paid       (nace el gasto «Pago a repartidor · …»)
 *   pending | approved ──rechazar──▶ rejected (la plata vuelve a su saldo)
 *   paid ──deshacer──▶ approved              (se borra el gasto; el efectivo vuelve a la caja abierta)
 *
 * Repetir lo mismo no es error: pagar dos veces el mismo retiro devuelve el
 * primer pago (sin otro gasto ni otro retiro de caja). De `paid` a `rejected`
 * no se salta: primero se deshace el pago (409 con el porqué). El gasto de un
 * retiro NO se corrige en Gastos: borrarlo allá devolvía la plata a la caja y
 * dejaba el retiro `paid` (el repartidor perdía ese saldo) — ver `esGastoDeRetiro`.
 */

export const ESTADOS_RETIRO = ["pending", "approved", "paid", "rejected"] as const;
export type EstadoRetiro = (typeof ESTADOS_RETIRO)[number];

/** Estados que apartan plata del saldo del repartidor (todos menos el rechazado). */
export const ESTADOS_COMPROMETIDOS: readonly EstadoRetiro[] = ["pending", "approved", "paid"];

/** Estados que todavía esperan al dueño («Retiros por pagar»). */
export const ESTADOS_POR_PAGAR: readonly EstadoRetiro[] = ["pending", "approved"];

export type AccionRetiro = "aprobar" | "pagar" | "rechazar" | "deshacer";

/** Desde qué estados sale cada acción, y a cuál llega. */
export const TRANSICIONES: Record<AccionRetiro, { desde: readonly EstadoRetiro[]; hacia: EstadoRetiro }> = {
  aprobar: { desde: ["pending"], hacia: "approved" },
  pagar: { desde: ["pending", "approved"], hacia: "paid" },
  rechazar: { desde: ["pending", "approved"], hacia: "rejected" },
  /** Vuelve a «aprobado» (no a pendiente): el dueño ya lo había visto y la plata sigue apartada. */
  deshacer: { desde: ["paid"], hacia: "approved" },
};

export type Veredicto =
  | { tipo: "cambia"; hacia: EstadoRetiro }
  /** Ya estaba hecho: se responde 200 sin escribir nada (idempotencia). */
  | { tipo: "ya-estaba" }
  | { tipo: "no-se-puede"; motivo: string };

const NOMBRE: Record<EstadoRetiro, string> = {
  pending: "pendiente",
  approved: "aprobado",
  paid: "pagado",
  rejected: "rechazado",
};

export function nombreEstado(estado: string): string {
  return NOMBRE[estado as EstadoRetiro] ?? estado;
}

/** ¿Qué pasa si aplico `accion` a un retiro que está en `actual`? */
export function veredicto(accion: AccionRetiro, actual: string): Veredicto {
  const regla = TRANSICIONES[accion];
  if (actual === regla.hacia) return { tipo: "ya-estaba" };
  // Aprobar uno que ya se pagó no cambia nada que importe: también es «ya estaba».
  if (accion === "aprobar" && actual === "paid") return { tipo: "ya-estaba" };
  if ((regla.desde as readonly string[]).includes(actual)) return { tipo: "cambia", hacia: regla.hacia };
  if (accion === "deshacer" && actual === "pending") {
    return { tipo: "no-se-puede", motivo: "Este retiro todavía no se pagó: no hay pago que deshacer." };
  }
  if (actual === "paid") {
    return {
      tipo: "no-se-puede",
      motivo: "Este retiro ya está pagado: no se puede rechazar. Si el pago fue un error, toca «Deshacer pago» en el historial y después recházalo.",
    };
  }
  if (actual === "rejected") {
    return { tipo: "no-se-puede", motivo: "Este retiro ya fue rechazado y la plata volvió al saldo del repartidor: que pida uno nuevo." };
  }
  return { tipo: "no-se-puede", motivo: `Un retiro ${nombreEstado(actual)} no se puede ${accion}.` };
}

const PREFIJO_GASTO_RETIRO = "retiro-repartidor-";

/**
 * Id del gasto que nace al pagar un retiro: el retiro + el instante del pago
 * (`resolvedAt`, en ms). Un pago = un gasto; y si el pago se deshace y se paga
 * de nuevo, el gasto nuevo (y su egreso de caja, `gasto-caja-<id>`) no choca
 * con el del primer pago, que queda en el arqueo con su devolución.
 */
export function idGastoDeRetiro(retiroId: string, pagadoEn: Date): string {
  return `${PREFIJO_GASTO_RETIRO}${retiroId}-${pagadoEn.getTime().toString(36)}`;
}

/** ¿Este gasto es el pago de un retiro? Esos no se editan ni se borran desde Gastos. */
export function esGastoDeRetiro(gastoId: string | null | undefined): boolean {
  return String(gastoId ?? "").startsWith(PREFIJO_GASTO_RETIRO);
}

/** El 409 de Gastos (PUT/DELETE) para un gasto que nació de un retiro. */
export const AVISO_GASTO_DE_RETIRO =
  "Este gasto es el pago de un retiro del repartidor: corrígelo en Repartidores › Retiros con «Deshacer pago», así su saldo y la caja cuadran.";

/** Cómo se lee el gasto (y, con la etiqueta de caja, el egreso del arqueo). */
export function descripcionGastoRetiro(nombreRepartidor: string | null | undefined): string {
  const quien = String(nombreRepartidor ?? "").replace(/\s+/g, " ").trim() || "sin nombre";
  return `Pago a repartidor · ${quien}`;
}

/** Categoría del gasto: entra en «Transporte», junto al resto del reparto. */
export const CATEGORIA_GASTO_RETIRO = "Transporte";

export const METODOS_PAGO_RETIRO = ["yape", "efectivo", "transferencia"] as const;
export type MetodoPagoRetiro = (typeof METODOS_PAGO_RETIRO)[number];

/** Cuerpo del POST del panel. `salidaDeCaja` sólo vale con efectivo (lo valida la ruta). */
export const accionRetiroSchema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("aprobar") }),
  z.object({
    accion: z.literal("pagar"),
    metodo: z.enum(METODOS_PAGO_RETIRO).default("yape"),
    salidaDeCaja: z.boolean().default(false),
    referencia: z.string().trim().max(120).optional(),
  }),
  z.object({
    accion: z.literal("rechazar"),
    motivo: z.string().trim().min(3, "Escribe el motivo (lo verá el repartidor).").max(200),
  }),
  z.object({
    accion: z.literal("deshacer"),
    motivo: z.string().trim().min(3, "Escribe por qué deshaces el pago (queda en la auditoría).").max(200),
  }),
]);

/** Filtro del historial del panel: se aplica en la base, no sobre los últimos N. */
export const FILTROS_HISTORIAL = ["paid", "rejected"] as const;
export type FiltroHistorialRetiros = (typeof FILTROS_HISTORIAL)[number];
export const filtroHistorialSchema = z.enum(FILTROS_HISTORIAL).optional();

export type AccionRetiroInput = z.infer<typeof accionRetiroSchema>;
