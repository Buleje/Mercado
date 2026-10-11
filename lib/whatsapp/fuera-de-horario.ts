/**
 * Aviso de «estamos cerrados» por WhatsApp (el «mensaje de ausencia» de
 * WhatsApp Business, con su opción «solo fuera del horario»).
 *
 * Puro: sin base ni red. El horario es el que la tienda YA tiene
 * (`Store.hoursJson`, Marketplace › Tienda › Horario); el ajuste vive en
 * `Settings.featureFlagsJson.whatsappFueraDeHorario` (sin schema). Lo usa el
 * webhook de WhatsApp (`lib/whatsapp/aviso-fuera-de-horario.ts`) y la pantalla
 * Mensajes › Números y bot.
 *
 * La hora es la de Lima, no la del servidor (en Vercel es UTC: a las 20:00 de
 * Pucallpa el servidor ya marca la 01:00 del día siguiente).
 */
import { z } from "zod";
import type { DayHours, DayKey, StoreHours } from "@/lib/marketplace-store-hours";

export const CLAVE_AJUSTE = "whatsappFueraDeHorario";
/** Un aviso por cliente cada 12 horas: el cliente que escribe tres veces de noche lo recibe una. */
export const HORAS_ENTRE_AVISOS = 12;
export const TEXTO_MAXIMO = 600;
/** `{apertura}` se cambia por «mañana a las 08:00», «hoy a las 09:00», «el lunes a las 08:00». */
export const MARCA_APERTURA = "{apertura}";
export const TEXTO_POR_DEFECTO =
  "¡Hola! En este momento la tienda está cerrada; abrimos {apertura}. Igual puedes dejarnos tu pedido por aquí y lo preparamos apenas abramos.";

export const AjusteSchema = z.object({
  activo: z.boolean(),
  texto: z.string().trim().min(1).max(TEXTO_MAXIMO),
});
export type AjusteFueraDeHorario = z.infer<typeof AjusteSchema>;

export const AJUSTE_POR_DEFECTO: AjusteFueraDeHorario = { activo: false, texto: TEXTO_POR_DEFECTO };

/** Lo guardado en los flags → ajuste válido; lo que no cuadra vuelve al de fábrica (apagado). */
export function leerAjuste(flags: Record<string, unknown> | null | undefined): AjusteFueraDeHorario {
  const crudo = flags?.[CLAVE_AJUSTE];
  const r = AjusteSchema.safeParse(crudo);
  if (r.success) return r.data;
  const activo = typeof crudo === "object" && crudo !== null && (crudo as { activo?: unknown }).activo === true;
  return { ...AJUSTE_POR_DEFECTO, activo };
}

const DIAS: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const NOMBRE_DIA: Record<DayKey, string> = {
  sun: "domingo", mon: "lunes", tue: "martes", wed: "miércoles", thu: "jueves", fri: "viernes", sat: "sábado",
};
const CORTO_DIA: Record<DayKey, string> = { mon: "Lun", tue: "Mar", wed: "Mié", thu: "Jue", fri: "Vie", sat: "Sáb", sun: "Dom" };

/** «HH:MM» → minutos; `null` si no es una hora. */
function minutos(hhmm: string | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h <= 23 && mi <= 59 ? h * 60 + mi : null;
}

/** El día abre: no está cerrado y tiene horas legibles. */
function abreEseDia(d: DayHours | undefined): d is DayHours & { open: string; close: string } {
  return !!d && !d.closed && minutos(d.open) !== null && minutos(d.close) !== null;
}

/** El objeto guardado en `Store.hoursJson` → horario, o `null` si no hay ningún día con horas. */
export function horarioValido(crudo: unknown): StoreHours | null {
  if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) return null;
  const h = crudo as StoreHours;
  return DIAS.some((d) => abreEseDia(h[d])) ? h : null;
}

/** Día de la semana y minuto del día en Lima. */
export function ahoraEnLima(now: Date): { dia: number; minuto: number } {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Lima",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
  const dia = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(v("weekday"));
  return { dia: dia < 0 ? 0 : dia, minuto: Number(v("hour")) * 60 + Number(v("minute")) };
}

/**
 * ¿Abierta ahora, en Lima? Mismo criterio que la ficha del marketplace
 * (`isOpenNow`): cierre incluido y cierre pasada la medianoche (19:00 → 02:00).
 * `null` = sin horario: no se decide (el aviso no sale).
 */
export function abiertoEnLima(horario: StoreHours | null, now: Date): boolean | null {
  if (!horario) return null;
  const { dia, minuto } = ahoraEnLima(now);
  const hoy = horario[DIAS[dia]];
  if (!abreEseDia(hoy)) return false;
  const abre = minutos(hoy.open) ?? 0;
  const cierra = minutos(hoy.close) ?? 0;
  if (cierra < abre) return minuto >= abre || minuto <= cierra;
  return minuto >= abre && minuto <= cierra;
}

/** «hoy a las 08:00», «mañana a las 08:00», «el lunes a las 08:00»; `null` si nunca abre. */
export function proximaApertura(horario: StoreHours | null, now: Date): string | null {
  if (!horario) return null;
  const { dia, minuto } = ahoraEnLima(now);
  for (let n = 0; n <= 7; n++) {
    const clave = DIAS[(dia + n) % 7];
    const d = horario[clave];
    if (!abreEseDia(d)) continue;
    if (n === 0 && (minutos(d.open) ?? 0) <= minuto) continue;
    const cuando = n === 0 ? "hoy" : n === 1 ? "mañana" : `el ${NOMBRE_DIA[clave]}`;
    return `${cuando} a las ${d.open}`;
  }
  return null;
}

/** «Lun–Sáb 08:00–20:00 · Dom cerrado» para la pantalla (días seguidos con las mismas horas, juntos). */
export function resumenHorario(horario: StoreHours | null): string | null {
  if (!horario) return null;
  const orden: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const tramo = (k: DayKey) => (abreEseDia(horario[k]) ? `${horario[k]?.open}–${horario[k]?.close}` : "cerrado");
  const grupos: { desde: DayKey; hasta: DayKey; horas: string }[] = [];
  for (const k of orden) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.horas === tramo(k)) ultimo.hasta = k;
    else grupos.push({ desde: k, hasta: k, horas: tramo(k) });
  }
  return grupos
    .map((g) => `${CORTO_DIA[g.desde]}${g.hasta !== g.desde ? `–${CORTO_DIA[g.hasta]}` : ""} ${g.horas}`)
    .join(" · ");
}

/** El texto del ajuste con `{apertura}` reemplazado. */
export function textoDelAviso(ajuste: AjusteFueraDeHorario, horario: StoreHours | null, now: Date): string {
  return ajuste.texto.split(MARCA_APERTURA).join(proximaApertura(horario, now) ?? "pronto");
}

/**
 * ¿Le toca el aviso a este cliente ahora? Devuelve el texto a mandar o `null`:
 * apagado, sin horario, abierto, o ya se le mandó uno hace menos de 12 horas.
 */
export function avisoQueToca(args: {
  ajuste: AjusteFueraDeHorario;
  horario: StoreHours | null;
  now: Date;
  ultimoAviso: Date | null;
}): string | null {
  const { ajuste, horario, now, ultimoAviso } = args;
  if (!ajuste.activo) return null;
  if (abiertoEnLima(horario, now) !== false) return null;
  if (ultimoAviso && now.getTime() - ultimoAviso.getTime() < HORAS_ENTRE_AVISOS * 3_600_000) return null;
  return textoDelAviso(ajuste, horario, now);
}
