/**
 * Cuándo el CLIENTE puede aceptar una cotización desde su enlace público y cómo
 * se muestra (noche 04-11, tramo 2). Puro, sin "use client" ni "server-only":
 * lo usan la página pública, su botón y la ruta POST, así los tres dicen lo mismo.
 */
import { ESTADOS_COTIZACION, TRANSICIONES_COTIZACION, type EstadoCotizacion } from "./estados";
import { hoyLima, vigenciaVencida } from "./vigencia";

/** Los estados desde los que la tabla de transiciones deja llegar a ACEPTADA (hoy BORRADOR y ENVIADA). */
export const ESTADOS_ACEPTABLES: readonly EstadoCotizacion[] = ESTADOS_COTIZACION.filter((e) =>
  TRANSICIONES_COTIZACION[e].includes("ACEPTADA"),
);

export const NOMBRE_MIN = 2;
export const NOMBRE_MAX = 80;

/** ¿El cliente todavía puede aceptarla? Estado que permite ACEPTADA y día de vigencia sin terminar. */
export function puedeAceptarse(estado: string, validoHasta: string | Date | null | undefined, ahora: number = Date.now()): boolean {
  if (!(ESTADOS_ACEPTABLES as readonly string[]).includes(estado)) return false;
  return !vigenciaVencida(validoHasta, ahora);
}

/**
 * La misma regla de `vigenciaVencida` dicha para el WHERE del UPDATE.
 *
 * En la columna conviven dos formatos (`vigencia.ts`): lo nuevo = último instante
 * del día en Lima; lo viejo = medianoche UTC de ese día. Un solo corte no sirve
 * para los dos (memoria «día de Lima con columnas mixtas»): sigue vigente si
 * `validoHasta >= hoy 00:00 de Lima` (= 05:00 UTC) o si es EXACTO la medianoche
 * UTC de hoy (lo viejo que vale hasta hoy). Lo que cae entre las 00:00 y las 05:00
 * UTC de hoy es del formato nuevo y venció ayer.
 */
export function condicionVigente(ahora: number = Date.now()): { vigenteDesde: Date; vigenteLegado: Date } {
  const hoy = hoyLima(ahora);
  return { vigenteDesde: new Date(`${hoy}T05:00:00.000Z`), vigenteLegado: new Date(`${hoy}T00:00:00.000Z`) };
}

const fechaFmt = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Lima" });
const horaFmt = new Intl.DateTimeFormat("es-PE", { hour: "numeric", minute: "2-digit", timeZone: "America/Lima" });

/** «Aceptada el 4 de noviembre de 2026 a las 10:32 a. m. por Juan Pérez» (hora de Pucallpa). */
export function textoAceptacion(el: string | Date, nombre: string): string {
  const d = new Date(el);
  if (!Number.isFinite(d.getTime())) return `Aceptada por ${nombre}`;
  return `Aceptada el ${fechaFmt.format(d)} a las ${horaFmt.format(d)} por ${nombre}`;
}

/**
 * Número de WhatsApp (solo dígitos, con 51) del teléfono del membrete, o `null`
 * si no parece un celular peruano (un fijo no tiene WhatsApp: mejor no mostrar el enlace).
 */
export function numeroWhatsapp(telefono: string | null | undefined): string | null {
  const d = (telefono ?? "").replace(/\D/g, "");
  if (/^9\d{8}$/.test(d)) return `51${d}`;
  if (/^519\d{8}$/.test(d)) return d;
  return null;
}

/** Enlace «Pedir un cambio» con el número de la cotización ya escrito. */
export function enlacePedirCambio(whatsapp: string, numero: string): string {
  const texto = `Hola, sobre la cotización ${numero}: quisiera pedir un cambio.`;
  return `https://wa.me/${whatsapp}?text=${encodeURIComponent(texto)}`;
}

/** IP recortada para el registro: el último tramo no se guarda (Ley 29733: lo mínimo). */
export function ipRecortada(ip: string | null | undefined): string {
  // «::ffff:181.65.2.140» = IPv4 dicha como IPv6 (así llega en local y detrás de algunos proxies).
  const v = (ip ?? "").trim().replace(/^::ffff:(?=\d{1,3}(\.\d{1,3}){3}$)/i, "");
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(v);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.x`;
  if (v.includes(":")) return `${v.split(":").slice(0, 3).join(":")}::x`;
  return "desconocida";
}
