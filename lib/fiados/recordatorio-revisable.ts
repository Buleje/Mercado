/**
 * lib/fiados/recordatorio-revisable.ts — el recordatorio por WhatsApp se
 * revisa antes de salir y no se repite en el día (auditoría 15-10, M36).
 *
 * Antes el botón abría WhatsApp directo con el texto de la plantilla y la
 * ronda de Cobranza le escribía a todos los marcados, aunque a alguno ya se le
 * hubiera escrito esa mañana. Ahora quien cobra ve a quién le escribe, cuánto
 * debe y cuándo fue el último contacto, puede cambiar el texto, y la ronda se
 * salta a los que ya recibieron un recordatorio HOY (día de Lima).
 *
 * La «ronda» es el día: la bitácora de gestiones (RECORDATORIO) es la misma en
 * todas las pestañas y en todos los equipos, así que no hace falta una marca
 * aparte. PURO y client-safe.
 */
import { limaDateKey } from "@/lib/utils";
import { diasEntre, etiquetaGestion, type Gestion } from "@/lib/fiados/gestion-cobranza";

const HORA = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hour12: false });

/** El último recordatorio de HOY (día de Lima) de cada cliente. */
export function recordatoriosDeHoy(gestiones: readonly Gestion[], ahora: Date = new Date()): Map<string, Gestion> {
  const hoy = limaDateKey(ahora);
  const out = new Map<string, Gestion>();
  for (const g of gestiones) {
    if (g.tipo !== "RECORDATORIO" || limaDateKey(g.fecha) !== hoy) continue;
    const previa = out.get(g.customerId);
    if (!previa || g.fecha > previa.fecha) out.set(g.customerId, g);
  }
  return out;
}

/** Parte la ronda: a quién se le escribe y a quién ya se le escribió hoy (no se repite). */
export function partirRonda<T extends { id: string }>(deudores: readonly T[], deHoy: ReadonlyMap<string, Gestion>): { enviar: T[]; yaHoy: T[] } {
  const enviar: T[] = [];
  const yaHoy: T[] = [];
  for (const d of deudores) (deHoy.has(d.id) ? yaHoy : enviar).push(d);
  return { enviar, yaHoy };
}

/** La última gestión de UN cliente (de cualquier tipo). */
export function ultimaGestionDe(gestiones: readonly Gestion[], customerId: string): Gestion | undefined {
  let ultima: Gestion | undefined;
  for (const g of gestiones) if (g.customerId === customerId && (!ultima || g.fecha > ultima.fecha)) ultima = g;
  return ultima;
}

/** «Último contacto: recordatorio hoy a las 10:32» / «llamada hace 3 días» / «nunca». */
export function ultimoContactoLeido(ultima: Gestion | undefined, ahora: Date = new Date()): string {
  if (!ultima) return "Último contacto: ninguno anotado";
  const que = etiquetaGestion(ultima.tipo).toLowerCase();
  const dias = diasEntre(limaDateKey(ultima.fecha), limaDateKey(ahora));
  const cuando = dias <= 0 ? `hoy a las ${HORA.format(new Date(ultima.fecha))}` : dias === 1 ? "ayer" : `hace ${dias} días`;
  return `Último contacto: ${que} ${cuando}`;
}

/** Tope de la nota de una gestión en la API (`nota: max(600)`). */
const TOPE_NOTA = 600;

/** Nota de la gestión con el texto que salió (registro del envío). */
export function notaDelEnvio(texto: string, origen = "Me deben"): string {
  const cabeza = `WhatsApp desde ${origen}: «`;
  const limpio = texto.replace(/\s+/g, " ").trim();
  const cabe = TOPE_NOTA - cabeza.length - 2;
  return `${cabeza}${limpio.length > cabe ? `${limpio.slice(0, cabe - 1)}…` : limpio}»`;
}
