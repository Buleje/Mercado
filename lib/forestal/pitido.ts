/**
 * pitido.ts — un «tip» corto para confirmar sin palabras (Brandon, 2026-09-23).
 *
 * Con «Repite: no» el dictado queda mudo: la pieza entra a la tabla y quien
 * dicta, con las manos en la pila y sin mirar la pantalla, no sabe si se
 * guardó. Un tono de 70 ms lo dice sin tapar la siguiente medida — la voz que
 * repite tarda un segundo; el tip, un parpadeo.
 *
 * Sin archivos de audio: un oscilador de Web Audio. El `AudioContext` se crea
 * la primera vez que se usa (perezoso) y UNA sola vez: cada contexto nuevo
 * cuesta, y los navegadores limitan cuántos puede tener una página. Donde no
 * hay Web Audio (o el navegador lo bloquea) no pasa nada: el dictado sigue
 * igual, sólo que sin tip.
 *
 * Lo que NO hace: sonar al agregar a mano. Ahí los ojos ya están en la
 * pantalla y el tip sería ruido en cada Enter — eso lo decide quien llama.
 */
import { descartarEsperado } from "@/lib/errores/sin-dato";

/** «guardado» es el tip agudo de siempre; «revisa», uno grave para una pieza con medidas raras. */
export type TonoPitido = "guardado" | "revisa";

const FRECUENCIA_HZ: Record<TonoPitido, number> = { guardado: 1320, revisa: 440 };
/** Lo que dura cada tip, en segundos. */
export const DURACION_PITIDO_S = 0.07;
/** Entre un tip y el siguiente cuando entran varias piezas en una frase. */
const SEPARACION_S = 0.12;
/** Volumen tope (ganancia) con el volumen de Ajustes al máximo: bajo a propósito. */
const GANANCIA_MAX = 0.12;
/** Más de tres tips seguidos ya no se cuentan de oído. */
const MAX_VECES = 3;

type ConstructorAudio = new () => AudioContext;

let contexto: AudioContext | null = null;
/** El navegador no tiene Web Audio o se negó a crearlo: no se reintenta en cada pieza. */
let sinAudio = false;

function obtenerContexto(): AudioContext | null {
  if (contexto) return contexto;
  if (sinAudio || typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: ConstructorAudio; webkitAudioContext?: ConstructorAudio };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) { sinAudio = true; return null; }
  try {
    contexto = new Ctor();
  } catch {
    sinAudio = true;
    return null;
  }
  return contexto;
}

/**
 * Despierta el audio. Llamarlo desde un GESTO (tocar el micrófono): Chrome
 * arranca un `AudioContext` suspendido si se crea sin uno, y las piezas
 * llegan desde el reconocedor de voz, que no cuenta como gesto.
 */
export function prepararPitido(): void {
  const ctx = obtenerContexto();
  if (ctx?.state === "suspended") void ctx.resume().catch(descartarEsperado);
}

export interface OpcionesPitido {
  tono?: TonoPitido;
  /** Cuántos tips: uno por pieza cuando una frase trae varias (tope 3). */
  veces?: number;
  /** Volumen de Ajustes (0–1). */
  volumen?: number;
}

/**
 * Suena el tip. Devuelve `false` si no se pudo (sin Web Audio): quien llama
 * no tiene que hacer nada con eso, sirve para los tests.
 */
export function pitido(opciones: OpcionesPitido = {}): boolean {
  const ctx = obtenerContexto();
  if (!ctx) return false;
  try {
    if (ctx.state === "suspended") void ctx.resume().catch(descartarEsperado);
    const tono = opciones.tono ?? "guardado";
    const veces = Math.max(1, Math.min(MAX_VECES, Math.round(opciones.veces ?? 1)));
    const volumen = Math.min(1, Math.max(0, opciones.volumen ?? 1));
    const pico = Math.max(0.0002, GANANCIA_MAX * volumen);
    const t0 = ctx.currentTime + 0.005;
    for (let i = 0; i < veces; i++) {
      const t = t0 + i * SEPARACION_S;
      const osc = ctx.createOscillator();
      const gan = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(FRECUENCIA_HZ[tono], t);
      /* Subida y caída exponenciales de pocos ms: un tono cortado en seco
         suena a «clic» en el parlante del celular. */
      gan.gain.setValueAtTime(0.0001, t);
      gan.gain.exponentialRampToValueAtTime(pico, t + 0.006);
      gan.gain.exponentialRampToValueAtTime(0.0001, t + DURACION_PITIDO_S);
      osc.connect(gan);
      gan.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + DURACION_PITIDO_S + 0.01);
    }
    return true;
  } catch {
    return false;
  }
}

/** Sólo para tests: olvida el contexto creado. */
export function reiniciarPitidoParaTests(): void {
  contexto = null;
  sinAudio = false;
}
