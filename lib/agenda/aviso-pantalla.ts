/**
 * Aviso en pantalla de la agenda (Brandon, 20-10): una ventana que sale sola,
 * cada tanto, con lo que falta hacer hoy y lo atrasado. Acá está la parte pura
 * (sin React ni navegador): la configuración de cada persona, cuándo toca el
 * próximo aviso y qué entra en él. El reloj es el de Lima (UTC−5 fijo, igual
 * que `limaDayRange`). Quién lo dispara: `components/admin/administracion/aviso/`.
 */
import { z } from "zod";
import { diaSemanaDe, sumarDias } from "./recurrencia";
import type { FechaKey, OcurrenciaDTO, ResumenAgendaHoy } from "./tipos";

/** Cada cuánto sale, en minutos (los chips de la configuración). */
export const CADA_MINUTOS = [15, 30, 60, 120, 180, 240] as const;

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export const AvisoPantallaSchema = z
  .object({
    activo: z.boolean(),
    cadaMin: z.number().int().refine((n) => (CADA_MINUTOS as readonly number[]).includes(n), "Elige cada cuánto"),
    /** Horario en que puede salir (hora de Lima): fuera de él, espera. */
    desde: z.string().regex(HORA),
    hasta: z.string().regex(HORA),
    /** 0 = domingo … 6 = sábado. */
    dias: z.array(z.number().int().min(0).max(6)).min(1, "Elige al menos un día").max(7),
    /** También sale cuando a una actividad de hoy le llega su hora (aserrío 17:00 → 17:00). */
    aSuHora: z.boolean(),
    atrasadas: z.boolean(),
    /** Aviso del sistema (Windows/Android) cuando el panel está en otra pestaña o minimizado. */
    notificacion: z.boolean(),
    sonido: z.boolean(),
  })
  .refine((c) => c.desde < c.hasta, { message: "La hora de inicio va antes que la de fin", path: ["hasta"] });

export type AvisoPantalla = z.infer<typeof AvisoPantallaSchema>;

export const AVISO_POR_DEFECTO: AvisoPantalla = {
  activo: true,
  cadaMin: 60,
  desde: "07:00",
  hasta: "20:00",
  dias: [1, 2, 3, 4, 5, 6],
  aSuHora: true,
  atrasadas: true,
  notificacion: false,
  sonido: false,
};

/** Lo guardado (navegador o servidor) sobre lo de fábrica: un campo nuevo o roto no tumba el aviso. */
export function normalizarAviso(guardado: unknown): AvisoPantalla {
  if (!guardado || typeof guardado !== "object") return AVISO_POR_DEFECTO;
  const r = AvisoPantallaSchema.safeParse({ ...AVISO_POR_DEFECTO, ...(guardado as object) });
  return r.success ? r.data : AVISO_POR_DEFECTO;
}

/** El reloj del aviso en ESTE navegador (lo comparten sus pestañas). */
export interface RelojAviso {
  /** ms: desde cuándo toca volver a mirar. 0 = ya. */
  proximo: number;
  /** «No más por hoy»: el día de Lima silenciado. */
  silencioDia: FechaKey | null;
}

export const RELOJ_INICIAL: RelojAviso = { proximo: 0, silencioDia: null };

export function normalizarReloj(guardado: unknown): RelojAviso {
  if (!guardado || typeof guardado !== "object") return RELOJ_INICIAL;
  const { proximo, silencioDia } = guardado as Partial<RelojAviso>;
  return {
    proximo: typeof proximo === "number" && Number.isFinite(proximo) ? proximo : 0,
    silencioDia: typeof silencioDia === "string" ? silencioDia : null,
  };
}

const MIN = 60_000;
const DIA = 24 * 60 * MIN;
const LIMA_MS = 5 * 60 * MIN;

/** Día de Lima de un instante. */
export const diaLima = (t: number): FechaKey => new Date(t - LIMA_MS).toISOString().slice(0, 10);
/** Minutos desde la medianoche de Lima. */
export const minutosLima = (t: number): number => Math.floor((((t - LIMA_MS) % DIA) + DIA) % DIA / MIN);
/** «17:00» del día `fecha` de Lima, en ms. */
export const instanteLima = (fecha: FechaKey, hhmm: string): number => Date.parse(`${fecha}T${hhmm}:00.000-05:00`);

export function horaLima(t: number): string {
  const m = minutosLima(t);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** El primer instante ≥ `t` dentro del horario y los días elegidos (`null` si no hay ninguno en una semana). */
export function dentroDelHorario(c: Pick<AvisoPantalla, "desde" | "hasta" | "dias">, t: number): number | null {
  const hoy = diaLima(t);
  for (let i = 0; i < 8; i++) {
    const fecha = sumarDias(hoy, i);
    if (!c.dias.includes(diaSemanaDe(fecha))) continue;
    const fin = instanteLima(fecha, c.hasta);
    if (t < fin) return Math.max(t, instanteLima(fecha, c.desde));
  }
  return null;
}

const falta = (o: OcurrenciaDTO) => o.estado === "pendiente" || o.estado === "parcial" || o.estado === "atrasada";

/** Lo que entra en el aviso: lo que falta de hoy y, si se pidió, lo atrasado. Lo hecho, omitido o pospuesto no. */
export function loQueFalta(r: ResumenAgendaHoy, c: Pick<AvisoPantalla, "atrasadas">): { hoy: OcurrenciaDTO[]; atrasadas: OcurrenciaDTO[] } {
  return { hoy: r.hoy.filter(falta), atrasadas: c.atrasadas ? r.atrasadas.filter(falta) : [] };
}

/**
 * Cuándo vuelve a salir: dentro de `cadaMin`, antes si a una actividad pendiente
 * de hoy le llega su hora, y nunca fuera del horario (espera a que empiece).
 */
export function proximoAviso(c: AvisoPantalla, ahora: number, pendientesHoy: readonly OcurrenciaDTO[]): number {
  let p = ahora + c.cadaMin * MIN;
  if (c.aSuHora) {
    const hoy = diaLima(ahora);
    for (const o of pendientesHoy) {
      if (!o.hora || o.fecha !== hoy) continue;
      const t = instanteLima(hoy, o.hora);
      if (t > ahora + MIN && t < p) p = t;
    }
  }
  return dentroDelHorario(c, p) ?? p;
}

/** ¿Toca mirar si hay algo pendiente? */
export function tocaMirar(c: AvisoPantalla, reloj: RelojAviso, ahora: number): boolean {
  if (!c.activo || reloj.silencioDia === diaLima(ahora) || ahora < reloj.proximo) return false;
  return dentroDelHorario(c, ahora) === ahora;
}

/** «hoy 16:40» · «mañana 07:00» · «el lunes 07:00» — para decir cuándo vuelve. */
export function cuandoVuelve(t: number, ahora: number): string {
  const dias = Math.round((instanteLima(diaLima(t), "12:00") - instanteLima(diaLima(ahora), "12:00")) / DIA);
  const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const dia = dias <= 0 ? "hoy" : dias === 1 ? "mañana" : `el ${DIAS[diaSemanaDe(diaLima(t))]}`;
  return `${dia} ${horaLima(t)}`;
}

export function textoCada(min: number): string {
  return min < 60 ? `${min} min` : min === 60 ? "1 hora" : `${min / 60} horas`;
}

/** Título y cuerpo del aviso del sistema: lo cuenta y nombra las tres primeras. */
export function textoNotificacion(f: { hoy: readonly OcurrenciaDTO[]; atrasadas: readonly OcurrenciaDTO[] }): { titulo: string; cuerpo: string } {
  const n = f.hoy.length + f.atrasadas.length;
  const nombres = [...new Set([...f.hoy, ...f.atrasadas].map((o) => o.nombre))];
  const resto = nombres.length - 3;
  return {
    titulo: n === 1 ? "Te falta 1 cosa de administración" : `Te faltan ${n} cosas de administración`,
    cuerpo: nombres.slice(0, 3).join(" · ") + (resto > 0 ? ` y ${resto} más` : ""),
  };
}
