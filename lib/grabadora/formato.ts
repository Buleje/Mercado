/**
 * Grabadora de voz del cubicador (Brandon 23-10) — lo puro: nombres, tiempos,
 * formatos del MediaRecorder y la máquina de estados. Sin React ni DOM.
 */

const ZONA = "America/Lima";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

/**
 * Las partes de una fecha en hora de Lima (el negocio vive ahí, el navegador
 * puede no). Sólo números de `Intl`; el día de la semana se escribe a mano
 * (los nombres de `Intl` cambian con la versión de ICU).
 */
function partesLima(fecha: Date): Record<"dia" | "mes" | "hora" | "minuto" | "semana", string> {
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONA,
    year: "numeric",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(fecha);
  const de = (t: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === t)?.value ?? "";
  const semana = DIAS[new Date(Date.UTC(Number(de("year")), Number(de("month")) - 1, Number(de("day")))).getUTCDay()];
  return { dia: de("day"), mes: de("month"), hora: de("hour"), minuto: de("minute"), semana };
}

/**
 * «Grabación 23-10 14:05». Si ya hay una con ese nombre (dos en el mismo
 * minuto), «Grabación 23-10 14:05 (2)».
 */
export function nombrePorDefecto(fecha: Date, existentes: readonly string[] = []): string {
  const p = partesLima(fecha);
  const base = `Grabación ${p.dia}-${p.mes} ${p.hora}:${p.minuto}`;
  const usados = new Set(existentes.map((n) => n.trim().toLowerCase()));
  if (!usados.has(base.toLowerCase())) return base;
  for (let i = 2; i < 100; i++) {
    const otro = `${base} (${i})`;
    if (!usados.has(otro.toLowerCase())) return otro;
  }
  return base;
}

/** «jueves 23/10 · 14:05» para la lista. */
export function fechaGrabacion(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  const p = partesLima(fecha);
  return `${p.semana} ${p.dia}/${p.mes} · ${p.hora}:${p.minuto}`;
}

/** 3.200 ms → «0:03»; 725.000 → «12:05»; 3.723.000 → «1:02:03». Negativo o NaN = «0:00». */
export function formatoDuracion(ms: number): string {
  const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** 12.345 → «12 KB»; 2.400.000 → «2,3 MB». */
export function formatoPeso(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** Nombre limpio: sin saltos de línea ni barras (las barras parecen carpetas), máx. 120. */
export function limpiarNombre(nombre: string): string {
  return nombre.replace(/[\r\n\t/\\]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 120);
}

// ── MediaRecorder ───────────────────────────────────────────────────────────

/**
 * En orden de preferencia. Chrome/Android/Firefox graban webm/opus; Safari de
 * iPhone sólo mp4 (AAC). Ogg queda de respaldo para Firefox viejo.
 */
export const MIMES_CANDIDATOS = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
] as const;

/** El primero que el navegador sabe grabar; `""` = que el navegador elija. */
export function elegirMime(soportado: (mime: string) => boolean): string {
  for (const m of MIMES_CANDIDATOS) {
    try {
      if (soportado(m)) return m;
    } catch {
      /* isTypeSupported puede lanzar en navegadores raros: se prueba el siguiente */
    }
  }
  return "";
}

/** «audio/webm;codecs=opus» → «audio/webm». El drive guarda el MIME sin parámetros. */
export function mimeBase(mime: string): string {
  const base = mime.split(";")[0].trim().toLowerCase();
  return base || "audio/webm";
}

/** La extensión del archivo para ese MIME (iPhone graba mp4, que como audio es .m4a). */
export function extensionDeMime(mime: string): string {
  const base = mimeBase(mime);
  if (base === "audio/mp4" || base === "audio/x-m4a" || base === "audio/aac") return "m4a";
  if (base === "audio/ogg") return "ogg";
  if (base === "audio/wav" || base === "audio/x-wav" || base === "audio/wave") return "wav";
  if (base === "audio/mpeg") return "mp3";
  return "webm";
}

// ── Máquina de estados ──────────────────────────────────────────────────────

/** inactivo → pidiendo → grabando ⇄ pausado → detenido → (guardar / descartar) → inactivo. */
export type EstadoGrabadora = "inactivo" | "pidiendo" | "grabando" | "pausado" | "detenido";

export type EventoGrabadora =
  | "pedir"
  | "permitido"
  | "negado"
  | "pausar"
  | "reanudar"
  | "detener"
  | "descartar"
  | "guardado";

const TRANSICIONES: Record<EstadoGrabadora, Partial<Record<EventoGrabadora, EstadoGrabadora>>> = {
  inactivo: { pedir: "pidiendo" },
  pidiendo: { permitido: "grabando", negado: "inactivo", descartar: "inactivo" },
  grabando: { pausar: "pausado", detener: "detenido", descartar: "inactivo" },
  pausado: { reanudar: "grabando", detener: "detenido", descartar: "inactivo" },
  detenido: { guardado: "inactivo", descartar: "inactivo" },
};

/** El estado siguiente, o `null` si ese evento no vale desde acá (doble clic, botón viejo). */
export function transicion(estado: EstadoGrabadora, evento: EventoGrabadora): EstadoGrabadora | null {
  return TRANSICIONES[estado][evento] ?? null;
}

/** ¿Hay audio que se pierde si se cierra la página? */
export function hayAudioSinGuardar(estado: EstadoGrabadora): boolean {
  return estado === "grabando" || estado === "pausado" || estado === "detenido";
}
