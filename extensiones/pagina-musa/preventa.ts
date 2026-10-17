/**
 * Preventa y estado de cada producto, con las palabras y fechas del manual de
 * Musa (manual vigente, 11-10). Todo se decide con el día de LIMA (`hoyEnLima`),
 * nunca con la hora del celular ni la del servidor.
 *
 * Lo que dice el manual y de dónde sale cada constante:
 * · «1 a 24 dic · Navidad — Kits en caja, mascarillas — Preventa desde el 16 nov
 *   (se separa con S/ 20) · envíos a provincia hasta el 18 dic» (Fechas que más venden).
 * · «hay 10 kits separados» (Compra extra de Navidad): lo que se separa son kits.
 * · «21 dic – 3 ene · Entregas hasta el 24» (calendario).
 * · «Pagos: Yape, Plin, transferencia. Contraentrega solo en Constitución».
 * · «Campaña 01 · 9 nov – 31 dic 2026 · … · preventa 10 % a las primeras 20
 *   clientas» y «Los descuentos no se suman». La tienda no puede contar a las 20
 *   (el pedido va por WhatsApp): lo verifica Drucila al confirmar.
 *
 * Lo que el manual NO dice (y por eso no se escribe): hasta qué día se puede
 * separar, si los S/ 20 se descuentan del precio, cuándo se paga el resto y si
 * la separación se devuelve. La tienda deja de mostrar la preventa después del
 * último día de entregas (24 dic).
 */
import { esPorEncargo, hoyEnLima, preventaVigente } from "./pedido-whatsapp";

export const PREVENTA_NAVIDAD = {
  /** Se separa desde este día. */
  desde: "2026-11-16",
  /** Con cuánto se separa (soles). */
  separaCon: 20,
  /** Últimos envíos a provincia. */
  enviosProvinciaHasta: "2026-12-18",
  /** Último día de entregas: después, el bloque no se muestra. */
  entregasHasta: "2026-12-24",
} as const;

/** «antes» (se anuncia la fecha), «abierta» (se separa) o null (terminó). */
export type EtapaPreventa = "antes" | "abierta";

export function etapaPreventaNavidad(hoy: string = hoyEnLima()): EtapaPreventa | null {
  if (hoy > PREVENTA_NAVIDAD.entregasHasta) return null;
  return hoy < PREVENTA_NAVIDAD.desde ? "antes" : "abierta";
}

/** Para Navidad, los envíos a provincia van hasta el 18 dic (inclusive). */
export const enviosProvinciaAbiertos = (hoy: string = hoyEnLima()): boolean => hoy <= PREVENTA_NAVIDAD.enviosProvinciaHasta;

const SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

/** «2026-11-16» → «lunes 16/11» (el día de la semana sale de la fecha, no de la zona horaria). */
export function diaCorto(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const dia = SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
  return `${dia} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/** La línea de envíos para Navidad; null después del 18 dic. */
export function avisoEnviosProvincia(hoy: string = hoyEnLima()): string | null {
  return enviosProvinciaAbiertos(hoy) ? `Para Navidad, los envíos a provincia van hasta el ${diaCorto(PREVENTA_NAVIDAD.enviosProvinciaHasta)}.` : null;
}

/**
 * Los marcadores de campaña de la franja (`FRANJA` en anuncios.ts): "" mientras vale, null
 * después (el mensaje desaparece). `{preventa}` = 10 % primeras 20 (hasta el 31 dic),
 * `{navidad}` = separar el kit (hasta el 24 dic), `{provincia}` = envíos (hasta el 18 dic).
 */
export function valoresCampana(hoy: string = hoyEnLima()): Record<"preventa" | "navidad" | "provincia", "" | null> {
  return {
    preventa: preventaVigente(hoy) ? "" : null,
    navidad: etapaPreventaNavidad(hoy) ? "" : null,
    provincia: enviosProvinciaAbiertos(hoy) ? "" : null,
  };
}

/** Debajo del botón del pedido, mientras dura la Campaña 01. */
export const NOTA_PREVENTA_10 =
  "10 % de preventa sólo para las primeras 20 clientas: Drucila te confirma si te toca al responder. No se suma con otros descuentos.";

/* ── Estado de cada producto: en stock / preventa / por encargo ─────────────── */

export type EstadoProducto = "Por encargo" | "Preventa" | "En stock";

/** Los kits del manual (KT01 a KT05): son lo que se separa en la preventa de Navidad. */
export const esKit = (codigo: string | null | undefined): boolean => /^KT\d+$/i.test((codigo ?? "").trim());

/** Un badge del dueño que no es estado ni descuento («Favorito», «Nuevo»…) se respeta tal cual. */
const otroBadge = (badge: string | null | undefined): string | null => {
  const b = (badge ?? "").trim();
  return b && !/%|dscto|oferta|^preventa$/i.test(b) ? b : null;
};

/**
 * La etiqueta de la tarjeta según el manual, con los datos del producto:
 * · «Por encargo»: el badge que el panel ya tiene en los 6 del manual (MU004, 006, 008, 014, 018, 019).
 * · «Preventa»: un kit (KT…) mientras la preventa de Navidad está abierta (desde el 16 nov).
 * · «En stock»: hay existencias cargadas (stock > 0). Sin existencias cargadas no se afirma nada.
 * El badge «Preventa» del panel NO decide: en el manual la preventa es una campaña con
 * fechas, no un estado del producto (los 14 de stock la tenían puesta por igual).
 */
export function estadoProducto(
  p: { badge?: string | null; stock?: number | null; codigo?: string | null },
  hoy: string = hoyEnLima(),
): EstadoProducto | string | null {
  if (esPorEncargo(p.badge)) return "Por encargo";
  if (esKit(p.codigo) && etapaPreventaNavidad(hoy) === "abierta") return "Preventa";
  const otro = otroBadge(p.badge);
  if (otro) return otro;
  return typeof p.stock === "number" && p.stock > 0 ? "En stock" : null;
}
