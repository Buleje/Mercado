/**
 * Para cuándo pidió el cliente su pedido (N01, 17-10).
 *
 * El checkout (`components/checkout/CheckoutDeliverySchedule.tsx`) manda
 * `deliverySlot` con el turno elegido («hoy-14-16», «manana-8-10»: «manana» es
 * el día de mañana, no la franja) y, si eligió día y hora a mano,
 * `deliveryDate` + `deliveryTime`. También se entiende la franja suelta
 * («manana» | «tarde» | «noche», la del selector viejo). Hasta el 17-10 el POST
 * de pedidos aceptaba la franja y la tiraba (`OrdersDB.add` no la guarda) y la
 * fecha y la hora ni pasaban el Zod: `DeliverySlot` tenía 0 filas en toda la
 * base. Esto traduce lo que eligió a la fila de `DeliverySlot` (día + franja +
 * nota con la hora), con la MISMA regla que le mostró la tienda
 * (`components/DeliveryEstimation.tsx:computeETA`): «Mañana 8-12» elegido a
 * las 13:00 es para el día siguiente.
 *
 * Sin React, sin `window` y sin base: se prueba sola.
 */
import { limaDateKey } from "@/lib/utils";

export type Franja = "manana" | "tarde" | "noche";
export const FRANJAS: readonly Franja[] = ["manana", "tarde", "noche"];

/** Rótulo y horario, los mismos que ve el cliente en la tienda. */
export const FRANJA_INFO: Readonly<Record<Franja, { rotulo: string; horario: string; hastaHora: number }>> = {
  manana: { rotulo: "Mañana", horario: "8:00 a 12:00", hastaHora: 12 },
  tarde: { rotulo: "Tarde", horario: "12:00 a 17:00", hastaHora: 17 },
  noche: { rotulo: "Noche", horario: "17:00 a 20:00", hastaHora: 20 },
};

export function esFranja(v: unknown): v is Franja {
  return typeof v === "string" && (FRANJAS as readonly string[]).includes(v);
}

const LIMA_MS = 5 * 3_600_000;
const DIA_MS = 86_400_000;

/** La hora (0-23) en Lima: Perú es UTC−5 todo el año. */
function horaLima(ahora: Date): number {
  return new Date(ahora.getTime() - LIMA_MS).getUTCHours();
}

/** La franja de una hora «HH:MM» (la que eligió a mano). */
export function franjaDeHora(hhmm: string): Franja | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  if (h > 23) return null;
  if (h < FRANJA_INFO.manana.hastaHora) return "manana";
  if (h < FRANJA_INFO.tarde.hastaHora) return "tarde";
  return "noche";
}

export interface EntregaElegida {
  /** «YYYY-MM-DD» (hora de Lima). */
  fecha: string;
  franja: Franja | "";
  /** «a las 15:30» si eligió la hora; null si sólo la franja. */
  nota: string | null;
}

/**
 * Lo que se guarda en `DeliverySlot`, o `null` si el cliente pidió «lo antes
 * posible» (o mandó algo que no se entiende: no se inventa un día).
 */
export function entregaElegida(
  pedido: { franja?: string | null; fecha?: string | null; hora?: string | null },
  ahora: Date = new Date(),
): EntregaElegida | null {
  const fecha = pedido.fecha?.trim() ?? "";
  const hora = pedido.hora?.trim() ?? "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(fecha) && !Number.isNaN(Date.parse(`${fecha}T00:00:00Z`))) {
    const deHora = hora ? franjaDeHora(hora) : null;
    const franja = deHora ?? (esFranja(pedido.franja) ? pedido.franja : "");
    return { fecha, franja, nota: deHora ? `a las ${hora.split(":").slice(0, 2).join(":")}` : null };
  }
  const turno = /^(hoy|manana)-(\d{1,2})-(\d{1,2})$/.exec(pedido.franja?.trim() ?? "");
  if (turno) {
    const [, dia, desde, hasta] = turno;
    const franja = franjaDeHora(`${desde}:00`);
    if (!franja || Number(hasta) <= Number(desde) || Number(hasta) > 24) return null;
    return {
      fecha: limaDateKey(dia === "hoy" ? ahora : new Date(ahora.getTime() + DIA_MS)),
      franja,
      nota: `de ${desde}:00 a ${hasta}:00`,
    };
  }
  if (!esFranja(pedido.franja)) return null;
  const hoy = horaLima(ahora) < FRANJA_INFO[pedido.franja].hastaHora;
  return { fecha: limaDateKey(hoy ? ahora : new Date(ahora.getTime() + DIA_MS)), franja: pedido.franja, nota: null };
}

/** Un pedido en marcha con día de entrega pedido (N01, la agenda). */
export interface EntregaAgendada {
  id: string;
  cliente: string;
  estado: string;
  total: number;
  fecha: string;
  franja: string;
  nota: string | null;
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** «jueves 16/10» de una clave «YYYY-MM-DD» (sin año: es la agenda de la semana). */
export function diaConFecha(clave: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clave)) return "—";
  const d = new Date(`${clave}T12:00:00Z`);
  return `${DIAS[d.getUTCDay()]} ${clave.slice(8, 10)}/${clave.slice(5, 7)}`;
}

/** «Hoy», «Mañana», «Ayer» o «jueves 16/10», contando el día en Lima. */
export function diaRelativo(clave: string, ahora: Date = new Date()): string {
  const hoy = limaDateKey(ahora);
  if (clave === hoy) return "Hoy";
  if (clave === limaDateKey(new Date(ahora.getTime() + DIA_MS))) return "Mañana";
  if (clave === limaDateKey(new Date(ahora.getTime() - DIA_MS))) return "Ayer";
  return diaConFecha(clave);
}

/** «Tarde (12:00 a 17:00)» o el texto guardado si no es una franja conocida. */
export function textoFranja(franja: string): string {
  return esFranja(franja) ? `${FRANJA_INFO[franja].rotulo} (${FRANJA_INFO[franja].horario})` : franja || "Sin franja";
}
