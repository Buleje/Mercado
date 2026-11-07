/**
 * Resumen de la agenda por Telegram (Brandon 20-10) — la parte PURA: la config
 * del negocio, «¿le toca ahora?» y el texto del mensaje. El envío vive en
 * `resumen-telegram.server.ts`; la config y la marca de «ya salió hoy», en
 * `AgendaTelegramDB` (subclaves de `admin_prefs`).
 *
 * Sin imports de servidor: lo usan el cron, la ruta, el panel y los tests.
 */
import { z } from "zod";
import { diaLima, loQueFalta, minutosLima } from "@/lib/agenda/aviso-pantalla";
import type { FechaKey, OcurrenciaDTO, ResumenAgendaHoy } from "@/lib/agenda/tipos";

export const MOMENTOS = ["manana", "noche"] as const;
export type Momento = (typeof MOMENTOS)[number];

/** Subclave de `admin_prefs` con la config del negocio. */
export const CLAVE_CONFIG_TELEGRAM = "agenda-telegram";
/** Subclave con la fecha de Lima en que ya salió ese momento (el dedupe). */
export const claveEnviado = (m: Momento): string => `agenda-telegram-enviado:${m}`;
/**
 * Cuánto después de la hora todavía se manda. El cron corre cada 5 min: seis
 * oportunidades. Si la PC estuvo apagada a las 7:00, a las 11:00 ya NO sale.
 */
export const VENTANA_MIN = 30;

/* Hasta las 23:30: la ventana dura 30 min y no puede cruzar la medianoche (otro día = otra marca, revisión 20-10). */
const HORA = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "La hora va como 07:00")
  .refine((h) => h <= "23:30", "Elige una hora hasta las 23:30");

/** `null` = ese momento apagado. */
export const ResumenTelegramSchema = z
  .object({
    manana: HORA.nullable(),
    noche: HORA.nullable(),
  })
  .strict();
export type ConfigResumenTelegram = z.infer<typeof ResumenTelegramSchema>;

export const RESUMEN_TELEGRAM_POR_DEFECTO: ConfigResumenTelegram = { manana: "07:00", noche: "19:30" };

/** Lo guardado (o nada) → config válida; lo que falta o vino roto toma el valor por defecto. */
export function normalizarConfigTelegram(guardado: unknown): ConfigResumenTelegram {
  const o = typeof guardado === "object" && guardado !== null ? (guardado as Record<string, unknown>) : {};
  const campo = (m: Momento): string | null => {
    const v = o[m];
    if (v === null) return null;
    return HORA.safeParse(v).success ? (v as string) : RESUMEN_TELEGRAM_POR_DEFECTO[m];
  };
  return { manana: campo("manana"), noche: campo("noche") };
}

/** «07:30» → 450. */
const aMinutos = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Los momentos cuya ventana [hora, hora+30 min) incluye `ahora` (hora de Lima; no cruza la medianoche). */
export function momentosEnHora(c: ConfigResumenTelegram, ahora: number): Momento[] {
  const m = minutosLima(ahora);
  return MOMENTOS.filter((k) => {
    const h = c[k];
    if (!h) return false;
    const desde = aMinutos(h);
    return m >= desde && m < desde + VENTANA_MIN;
  });
}

/** Los que tocan ahora y todavía no salieron hoy (`enviados[m]` = fecha de Lima del último envío). */
export function momentosPorMandar(
  c: ConfigResumenTelegram,
  enviados: Partial<Record<Momento, FechaKey | null>>,
  ahora: number,
): Momento[] {
  const hoy = diaLima(ahora);
  return momentosEnHora(c, ahora).filter((m) => enviados[m] !== hoy);
}

/** El de prueba: a la mañana se ve el de la mañana; desde las 14:00, el de la noche. */
export const momentoDePrueba = (ahora: number): Momento => (minutosLima(ahora) < 14 * 60 ? "manana" : "noche");

// ── Texto (HTML de Telegram) ────────────────────────────────────────────────

/** Escapa para el HTML de Telegram (también `"`: va dentro de `href`). */
export function escaparHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Para que un día cargado no pase el tope de 4096 caracteres de Telegram. */
const TOPE_FILAS = 15;
const TOPE_ATRASADAS = 5;
const ddmm = (f: FechaKey) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;
const cuenta = (o: OcurrenciaDTO) => o.estado !== "omitida" && o.estado !== "pospuesta";

function fila(o: OcurrenciaDTO): string {
  const marca = o.estado === "hecha" ? "✅" : "•";
  const hora = o.hora ? `${o.hora} ` : "";
  const detalle = o.detalle ? ` — ${escaparHtml(o.detalle)}` : "";
  return `${marca} ${hora}<b>${escaparHtml(o.nombre)}</b>${detalle}`;
}

function filas(lista: readonly OcurrenciaDTO[]): string[] {
  const resto = lista.length - TOPE_FILAS;
  return [...lista.slice(0, TOPE_FILAS).map(fila), ...(resto > 0 ? [`<i>y ${resto} más en el panel</i>`] : [])];
}

/** «Atrasadas: 5 (Gastos 18/10 y 19/10, Asistencia 19/10)»: cada actividad una vez, con sus días. */
function lineaAtrasadas(atrasadas: readonly OcurrenciaDTO[]): string[] {
  if (atrasadas.length === 0) return [];
  const dias = new Map<string, string[]>();
  for (const o of [...atrasadas].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    dias.set(o.nombre, [...(dias.get(o.nombre) ?? []), ddmm(o.fecha)]);
  }
  const nombres = [...dias].slice(0, TOPE_ATRASADAS).map(([n, f]) => `${escaparHtml(n)} ${f.length > 1 ? `${f.slice(0, -1).join(", ")} y ${f.at(-1)}` : f[0]}`);
  const resto = dias.size - TOPE_ATRASADAS;
  return [`⏰ <b>Atrasadas: ${atrasadas.length}</b> (${nombres.join(", ")}${resto > 0 ? ` y ${resto} más` : ""})`];
}

/** Con dominio https, un enlace; en la PC (http://localhost) un enlace no abre desde el celular: sólo el camino. */
function lineaEnlace(url: string): string {
  return /^https:\/\//i.test(url) ? `<a href="${escaparHtml(url)}">Abrir Administración › Hoy</a>` : "<i>Panel › Administración › Hoy</i>";
}

export interface OpcionesTexto {
  /** URL absoluta de Administración › Hoy. */
  url: string;
  prueba?: boolean;
}

/** El mensaje entero de ese momento, listo para `mandarMensaje` (parse_mode HTML). */
export function textoResumen(m: Momento, r: ResumenAgendaHoy, o: OpcionesTexto): string {
  const prefijo = o.prueba ? "[prueba] " : "";
  const falta = loQueFalta(r, { atrasadas: true });
  const deHoy = r.hoy.filter(cuenta);
  const bloques: string[][] = [];

  if (m === "manana") {
    bloques.push(
      deHoy.length > 0
        ? [`${prefijo}☀️ <b>Buenos días</b> — hoy toca:`, ...filas(deHoy)]
        : [`${prefijo}☀️ <b>Buenos días</b> — hoy no te toca nada de la agenda.`],
    );
  } else {
    if (falta.hoy.length === 0 && falta.atrasadas.length === 0) {
      return `${prefijo}🌙 <b>Cierre del día</b>: todo hecho hoy ✅`;
    }
    const hechas = deHoy.filter((x) => x.estado === "hecha").length;
    const titulo =
      deHoy.length > 0 ? `${prefijo}🌙 <b>Cierre del día</b>: hiciste ${hechas} de ${deHoy.length}` : `${prefijo}🌙 <b>Cierre del día</b>: hoy no tocaba nada`;
    bloques.push(falta.hoy.length > 0 ? [titulo, "Falta:", ...filas(falta.hoy)] : [titulo]);
  }

  const atrasadas = lineaAtrasadas(falta.atrasadas);
  if (atrasadas.length > 0) bloques.push(atrasadas);
  bloques.push([lineaEnlace(o.url)]);
  return bloques.map((b) => b.join("\n")).join("\n\n");
}
