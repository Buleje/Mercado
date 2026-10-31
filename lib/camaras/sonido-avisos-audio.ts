/**
 * El lado del NAVEGADOR del sonido de las alarmas de cámaras (la regla pura
 * está en `sonido-avisos.ts`): un contexto de audio propio que se despierta
 * con el primer gesto, el turno entre pestañas, y el aviso del sistema
 * operativo cuando la pestaña no está a la vista.
 *
 * Estado del módulo (no de un componente): lo comparte la cabecera, la
 * ventana «Sonido y avisos» y el mosaico (`sonarAlarma`).
 *
 * Lo que mide `estado` («listo» / «bloqueado» / «sin-audio»): Chrome crea el
 * audio SUSPENDIDO si la pestaña no recibió ningún toque desde que cargó
 * (recargar, abrir el panel desde un enlace, el Modo TV); `resume()` sin gesto
 * queda colgado. Antes eso se tragaba sin aviso: ahora el estado lo dice y la
 * cabecera muestra «Activa el sonido».
 */
import { logger } from "@/lib/logger";
import { prepararPitido } from "@/lib/forestal/pitido";
import {
  CLAVE_ALARMA_CON_SONIDO,
  CLAVE_PREFERENCIAS_SONIDO,
  CLAVE_SILENCIO_ALARMAS,
  CLAVE_SILENCIO_MOVIMIENTO,
  CLAVE_ULTIMA_ALARMA,
  alarmaConSonidoDe,
  decidirSonido,
  escribirMarcaAlarma,
  gananciaPara,
  leerMarcaAlarma,
  leerPreferenciasDe,
  notasDelTono,
  silencioDe,
  tocaSonar,
  type Nota,
  type PreferenciasSonido,
  type Silencios,
  type TipoAlarma,
  type TonoAlarma,
} from "./sonido-avisos";

export type EstadoAudio = "listo" | "bloqueado" | "sin-audio";
export type ResultadoSonido = "sono" | "silenciado" | "apagado" | "otra-pestana" | "bloqueado" | "sin-audio";

/** Cuánto se espera a `resume()`: sin gesto no termina nunca. */
const ESPERA_RESUME_MS = 300;
/** Un solo «no pudo sonar» por minuto, aunque fallen varias alarmas. */
const AVISO_BLOQUEO_CADA_MS = 60_000;

type ConstructorAudio = new () => AudioContext;
interface ConActivacion {
  userActivation?: { hasBeenActive: boolean };
}

let ctx: AudioContext | null = null;
let sinAudio = false;
let estado: EstadoAudio | null = null;
const oyentes = new Set<() => void>();
let alBloquear: (() => void) | null = null;
let ultimoAvisoBloqueo = 0;
let instalaciones = 0;
/** Quién soy entre las pestañas (cada pestaña carga su propio módulo). */
const PESTANA = Math.random().toString(36).slice(2, 10);

function leerTexto(clave: string): string | null {
  try {
    return window.localStorage.getItem(clave);
  } catch (err) {
    logger.warn("[camaras] no se pudo leer una preferencia de sonido", { clave, error: String(err) });
    return null;
  }
}

export const leerPreferencias = (): PreferenciasSonido => leerPreferenciasDe(leerTexto(CLAVE_PREFERENCIAS_SONIDO));
const leerSilencios = (): Silencios => ({
  todo: silencioDe(leerTexto(CLAVE_SILENCIO_ALARMAS)),
  movimiento: silencioDe(leerTexto(CLAVE_SILENCIO_MOVIMIENTO)),
});

function estadoInicial(): EstadoAudio {
  if (typeof window === "undefined") return "listo";
  const act = (navigator as Navigator & ConActivacion).userActivation;
  return act && !act.hasBeenActive ? "bloqueado" : "listo";
}

function fijarEstado(e: EstadoAudio) {
  if (e === estado) return;
  estado = e;
  oyentes.forEach((f) => f());
}

export const leerEstadoAudio = (): EstadoAudio => (estado ??= estadoInicial());
export const leerEstadoAudioServidor = (): EstadoAudio => "listo";
export function suscribirEstadoAudio(f: () => void): () => void {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
}

/** Quien muestra «No pudo sonar · Activa el sonido» (la cabecera). */
export function alBloquearSonido(fn: (() => void) | null): void {
  alBloquear = fn;
}

function contexto(): AudioContext | null {
  if (ctx) return ctx;
  if (sinAudio || typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: ConstructorAudio; webkitAudioContext?: ConstructorAudio };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  try {
    if (!Ctor) throw new Error("sin Web Audio");
    ctx = new Ctor();
  } catch (err) {
    sinAudio = true;
    fijarEstado("sin-audio");
    logger.warn("[camaras] este navegador no deja crear el audio", { error: String(err) });
    return null;
  }
  const c = ctx;
  /* iOS lo «interrumpe» con una llamada; cambiar de parlante también puede. */
  c.addEventListener("statechange", () => fijarEstado(c.state === "running" ? "listo" : "bloqueado"));
  fijarEstado(c.state === "running" ? "listo" : "bloqueado");
  return c;
}

/** ¿Quedó andando? Con un gesto, siempre; sin gesto, se rinde a los 300 ms. */
async function despertar(c: AudioContext): Promise<boolean> {
  if ((c.state as string) !== "running") {
    try {
      await Promise.race([c.resume(), new Promise((r) => setTimeout(r, ESPERA_RESUME_MS))]);
    } catch (err) {
      logger.warn("[camaras] el navegador no dejó encender el audio", { error: String(err) });
    }
  }
  const ok = (c.state as string) === "running";
  fijarEstado(ok ? "listo" : "bloqueado");
  return ok;
}

/** Desde un gesto: despierta este audio y el del tip/aviso viejo (`pitido.ts`). */
export async function desbloquearAudio(): Promise<EstadoAudio> {
  prepararPitido();
  const c = contexto();
  if (c) await despertar(c);
  return leerEstadoAudio();
}

function alGesto() {
  if (ctx && ctx.state === "running") return;
  desbloquearAudio().catch((err: unknown) =>
    logger.warn("[camaras] desbloquear el audio falló", { error: String(err) }),
  );
}
function alVolver() {
  if (document.hidden || !ctx || ctx.state === "running") return;
  despertar(ctx).catch((err: unknown) => logger.warn("[camaras] reanudar el audio falló", { error: String(err) }));
}

/**
 * Escucha el primer gesto (y los siguientes, por si el sistema lo vuelve a
 * suspender). `pointerup` porque en pantallas táctiles `pointerdown` no
 * cuenta como gesto para el navegador. Devuelve cómo quitarlo.
 */
export function instalarDesbloqueo(): () => void {
  if (typeof window === "undefined") return () => undefined;
  instalaciones += 1;
  if (instalaciones === 1) {
    for (const ev of ["pointerdown", "pointerup", "keydown"] as const) {
      window.addEventListener(ev, alGesto, { capture: true, passive: true });
    }
    document.addEventListener("visibilitychange", alVolver);
  }
  return () => {
    instalaciones -= 1;
    if (instalaciones > 0) return;
    for (const ev of ["pointerdown", "pointerup", "keydown"] as const) {
      window.removeEventListener(ev, alGesto, { capture: true });
    }
    document.removeEventListener("visibilitychange", alVolver);
  };
}

/** Una pestaña por alarma: el candado del navegador hace atómico «mirar y marcar». */
async function reclamarTurno(tipo: TipoAlarma): Promise<boolean> {
  const marcar = (): boolean => {
    const ahora = Date.now();
    if (!tocaSonar(leerMarcaAlarma(leerTexto(CLAVE_ULTIMA_ALARMA)), { pestana: PESTANA, tipo }, ahora)) return false;
    try {
      window.localStorage.setItem(CLAVE_ULTIMA_ALARMA, escribirMarcaAlarma({ pestana: PESTANA, at: ahora, tipo }));
    } catch (err) {
      logger.warn("[camaras] no se pudo anotar la alarma para las otras pestañas", { error: String(err) });
    }
    return true;
  };
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks) return marcar();
  try {
    return await locks.request("camaras-alarma", { ifAvailable: true }, (lock) => (lock ? marcar() : false));
  } catch (err) {
    logger.warn("[camaras] candado de la alarma no disponible", { error: String(err) });
    return marcar();
  }
}

function tocar(c: AudioContext, notas: readonly Nota[], volumen: number) {
  const pico = Math.max(0.0002, gananciaPara(volumen));
  const t0 = c.currentTime + 0.01;
  for (const nota of notas) {
    const t = t0 + nota.desde;
    const osc = c.createOscillator();
    const gan = c.createGain();
    osc.type = nota.onda;
    osc.frequency.setValueAtTime(nota.hz, t);
    /* Subida y caída de pocos ms: cortado en seco suena a «clic». */
    gan.gain.setValueAtTime(0.0001, t);
    gan.gain.exponentialRampToValueAtTime(pico, t + 0.012);
    gan.gain.exponentialRampToValueAtTime(0.0001, t + nota.dura);
    osc.connect(gan);
    gan.connect(c.destination);
    osc.start(t);
    osc.stop(t + nota.dura + 0.02);
  }
}

function avisarBloqueo() {
  const ahora = Date.now();
  if (ahora - ultimoAvisoBloqueo < AVISO_BLOQUEO_CADA_MS) return;
  ultimoAvisoBloqueo = ahora;
  alBloquear?.();
}

/**
 * Suena la alarma, si corresponde (silencio, preferencias, turno entre
 * pestañas). `probar` salta todo eso: es el botón «Probar sonido».
 * Dice qué pasó: quien llama puede mostrar «no pudo sonar».
 */
export async function sonarAlarma(p: { tipo: TipoAlarma; probar?: boolean; tono?: TonoAlarma }): Promise<ResultadoSonido> {
  if (typeof window === "undefined") return "sin-audio";
  const prefs = leerPreferencias();
  if (!p.probar) {
    const d = decidirSonido({
      tipo: p.tipo,
      prefs,
      alarmaConSonido: alarmaConSonidoDe(leerTexto(CLAVE_ALARMA_CON_SONIDO)),
      silencios: leerSilencios(),
      ahora: Date.now(),
    });
    if (d !== "sonar") return d;
  } else if (prefs.volumen <= 0) {
    return "apagado";
  }
  const c = contexto();
  if (!c) return "sin-audio";
  if (!(await despertar(c))) {
    if (!p.probar) avisarBloqueo();
    return "bloqueado";
  }
  if (!p.probar && !(await reclamarTurno(p.tipo))) return "otra-pestana";
  try {
    tocar(c, notasDelTono(p.tono ?? prefs.tono), prefs.volumen);
    return "sono";
  } catch (err) {
    logger.warn("[camaras] la alarma no pudo sonar", { error: String(err) });
    return "sin-audio";
  }
}

export type PermisoAvisos = NotificationPermission | "no-soportado";

export const permisoAvisos = (): PermisoAvisos =>
  typeof Notification === "undefined" ? "no-soportado" : Notification.permission;

/** Desde un gesto (el interruptor «Avisos del sistema»). */
export async function pedirPermisoAvisos(): Promise<PermisoAvisos> {
  if (typeof Notification === "undefined") return "no-soportado";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch (err) {
    logger.warn("[camaras] no se pudo pedir permiso para avisos", { error: String(err) });
    return Notification.permission;
  }
}

/**
 * Aviso del sistema operativo, sólo con la pestaña OCULTA (a la vista ya
 * está el mensaje del panel), con permiso, pedido en Ajustes y sin silencio.
 * La `etiqueta` hace que dos pestañas con el mismo aviso muestren uno.
 * En Android `new Notification` no existe: ahí avisa el push del celular.
 */
export function notificarSistema(p: { titulo: string; cuerpo?: string; etiqueta: string; alTocar?: () => void }): boolean {
  if (typeof window === "undefined" || typeof Notification === "undefined" || !document.hidden) return false;
  if (Notification.permission !== "granted" || !leerPreferencias().sistema) return false;
  if (leerSilencios().todo > Date.now()) return false;
  try {
    const aviso = new Notification(p.titulo, { body: p.cuerpo, tag: p.etiqueta, icon: "/icons/icon-192x192.png" });
    aviso.onclick = () => {
      window.focus();
      p.alTocar?.();
      aviso.close();
    };
    return true;
  } catch (err) {
    logger.warn("[camaras] aviso del sistema no disponible", { error: String(err) });
    return false;
  }
}
