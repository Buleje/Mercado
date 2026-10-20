/**
 * Sonidos de los avisos (Brandon 20-10): el de la agenda y el de cada
 * notificación flotante. Sin archivos: cada uno es una receta de notas de
 * WebAudio. Nada rompe si el navegador no deja sonar.
 *
 * - UN `AudioContext` para toda la página (Chrome tope ~6 vivos; crear uno por
 *   aviso los iba gastando). Si nació «suspendido» (sin un clic todavía), se
 *   despierta con el primer clic o tecla.
 * - Anti-ráfaga: 5 avisos que llegan juntos suenan UNA vez (`tocarSonido`).
 *   `probarSonido` (la configuración) no la mira: elegir otro suena siempre.
 * - Un sonido nuevo apaga en 40 ms el que seguía sonando: no se montan.
 */
import { logger } from "@/lib/logger";
import type { SonidoAviso } from "./aviso-pantalla";

export const SONIDOS_UI: Record<SonidoAviso, string> = {
  ninguno: "Sin sonido",
  campanita: "Campanita",
  gota: "Gota",
  doble: "Doble tono",
  suave: "Suave",
  alerta: "Alerta",
};

/** Una nota: frecuencia (Hz), cuándo empieza y cuánto dura (s), y su peso. */
export interface Nota {
  f: number;
  /** Frecuencia al final (barrido), si sube o baja. */
  fFin?: number;
  t: number;
  d: number;
  g: number;
  tipo: OscillatorType;
  /** Subida (s): corta = golpe, larga = suave. */
  ataque?: number;
}

/** Las recetas. Ninguna pasa de 0,8 s; «alerta» insiste con tres toques. */
export const RECETAS: Readonly<Record<Exclude<SonidoAviso, "ninguno">, readonly Nota[]>> = {
  /* Mi6 con su octava apagándose antes: un «ding» de campanita. */
  campanita: [
    { f: 1318.5, t: 0, d: 0.7, g: 1, tipo: "sine", ataque: 0.005 },
    { f: 2637, t: 0, d: 0.3, g: 0.22, tipo: "sine", ataque: 0.005 },
    { f: 3951, t: 0, d: 0.12, g: 0.08, tipo: "sine", ataque: 0.003 },
  ],
  /* Un «plip» que sube rápido, como una gota en el agua. */
  gota: [{ f: 520, fFin: 1480, t: 0, d: 0.26, g: 1, tipo: "sine", ataque: 0.004 }],
  /* La5 → Mi6: el «ding-dong» de un timbre. */
  doble: [
    { f: 880, t: 0, d: 0.32, g: 0.9, tipo: "triangle", ataque: 0.006 },
    { f: 1318.5, t: 0.17, d: 0.45, g: 0.9, tipo: "triangle", ataque: 0.006 },
  ],
  /* Sol4 + Re5 que entran despacio: se oye sin sobresaltar. */
  suave: [
    { f: 392, t: 0, d: 0.65, g: 0.8, tipo: "sine", ataque: 0.06 },
    { f: 587.3, t: 0.08, d: 0.6, g: 0.55, tipo: "sine", ataque: 0.06 },
  ],
  /* Tres toques cortos que suben: para lo que no puede esperar. */
  alerta: [
    { f: 987.8, t: 0, d: 0.13, g: 1, tipo: "square", ataque: 0.003 },
    { f: 987.8, t: 0.17, d: 0.13, g: 1, tipo: "square", ataque: 0.003 },
    { f: 1318.5, t: 0.34, d: 0.32, g: 1, tipo: "square", ataque: 0.003 },
  ],
};

/** Cuánto dura un sonido (s): la nota que termina más tarde. */
export function duracionDe(id: SonidoAviso): number {
  if (id === "ninguno") return 0;
  return Math.max(...RECETAS[id].map((n) => n.t + n.d));
}

/** La onda cuadrada suena el doble de fuerte que la senoidal al mismo valor. */
const PESO_ONDA: Record<string, number> = { sine: 1, triangle: 0.9, square: 0.32, sawtooth: 0.4 };
/** Tope de ganancia al 100 %: más satura con dos notas juntas. */
const GANANCIA_MAX = 0.45;

/**
 * Volumen 0-100 → ganancia, en curva (el oído no oye en línea: al 50 % lineal
 * casi no se nota la diferencia con el 100 %).
 */
export function gananciaDeVolumen(volumen: number): number {
  const v = Math.min(100, Math.max(0, Number.isFinite(volumen) ? volumen : 0)) / 100;
  return GANANCIA_MAX * v * v;
}

/** Dos avisos a menos de esto suenan una sola vez. */
export const RAFAGA_MS = 1500;
/** Un sonido pedido con el audio dormido que despierta después de esto ya no sale (llegaría a destiempo). */
const VENCE_MS = 1200;

let ctx: AudioContext | null = null;
let ultimo = -Infinity;
let vozAnterior: GainNode | null = null;
let desbloqueoPuesto = false;

function contexto(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  if (ctx.state === "suspended" && !desbloqueoPuesto) {
    desbloqueoPuesto = true;
    const despertar = () => {
      void ctx?.resume().catch((err: unknown) => logger.warn("[sonidos] el audio no despertó", { error: String(err) }));
    };
    window.addEventListener("pointerdown", despertar, { once: true, capture: true });
    window.addEventListener("keydown", despertar, { once: true, capture: true });
  }
  return ctx;
}

function programar(c: AudioContext, notas: readonly Nota[], ganancia: number): void {
  const t0 = c.currentTime + 0.01;
  if (vozAnterior) {
    const vieja = vozAnterior;
    vieja.gain.cancelScheduledValues(t0);
    vieja.gain.setTargetAtTime(0, t0, 0.012);
    setTimeout(() => vieja.disconnect(), 120);
  }
  const voz = c.createGain();
  voz.gain.setValueAtTime(ganancia, t0);
  voz.connect(c.destination);
  vozAnterior = voz;
  let fin = 0;
  for (const n of notas) {
    const osc = c.createOscillator();
    const env = c.createGain();
    const ini = t0 + n.t;
    const pico = n.g * (PESO_ONDA[n.tipo] ?? 1);
    osc.type = n.tipo;
    osc.frequency.setValueAtTime(n.f, ini);
    if (n.fFin) osc.frequency.exponentialRampToValueAtTime(n.fFin, ini + Math.min(0.14, n.d * 0.6));
    env.gain.setValueAtTime(0.0001, ini);
    env.gain.linearRampToValueAtTime(pico, ini + (n.ataque ?? 0.01));
    env.gain.exponentialRampToValueAtTime(0.0001, ini + n.d);
    osc.connect(env);
    env.connect(voz);
    osc.start(ini);
    osc.stop(ini + n.d + 0.02);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
    };
    fin = Math.max(fin, n.t + n.d);
  }
  setTimeout(() => {
    if (vozAnterior === voz) vozAnterior = null;
    voz.disconnect();
  }, (fin + 0.15) * 1000);
}

function sonar(id: SonidoAviso, volumen: number): boolean {
  if (id === "ninguno") return false;
  const ganancia = gananciaDeVolumen(volumen);
  const notas = RECETAS[id];
  if (ganancia <= 0 || !notas) return false;
  try {
    const c = contexto();
    if (!c) return false;
    if (c.state === "running") {
      programar(c, notas, ganancia);
      return true;
    }
    const pedido = Date.now();
    void c
      .resume()
      .then(() => {
        if (c.state === "running" && Date.now() - pedido < VENCE_MS) programar(c, notas, ganancia);
      })
      .catch((err: unknown) => logger.warn("[sonidos] el navegador no dejó sonar", { id, error: String(err) }));
    return true;
  } catch (err) {
    logger.warn("[sonidos] el navegador no dejó sonar", { id, error: String(err) });
    return false;
  }
}

/** El sonido de un aviso: si otro sonó hace menos de 1,5 s, éste se calla. */
export function tocarSonido(id: SonidoAviso, volumen: number): void {
  const ahora = Date.now();
  if (ahora - ultimo < RAFAGA_MS) return;
  if (sonar(id, volumen)) ultimo = ahora;
}

/** «Escuchar» y elegir en la configuración: suena siempre (sin anti-ráfaga). */
export function probarSonido(id: SonidoAviso, volumen: number): void {
  if (sonar(id, volumen)) ultimo = Date.now();
}

/** Sólo tests: vuelve al estado de la página recién abierta. */
export function _reiniciarSonidosParaTest(): void {
  ctx = null;
  ultimo = -Infinity;
  vozAnterior = null;
  desbloqueoPuesto = false;
}
