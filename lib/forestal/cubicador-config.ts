/**
 * cubicador-config.ts — ajustes del cubicador (voz + comandos), persistidos por
 * tenant en localStorage. PURO y client-safe.
 */
import { COMANDOS_DEFAULT, type ComandosCfg } from "./cubicacion";

export interface CubicadorConfig {
  /**
   * Velocidad de la voz (SpeechSynthesis `rate`, 0.6–10). Ojo en Windows: el
   * número NO es un multiplicador real — ver `velocidadEnWindows`.
   */
  voiceRate: number;
  /** voiceURI de la voz elegida. "" = la default del navegador. */
  voiceURI: string;
  /** Tono (SpeechSynthesis `pitch`): 1 = el de la voz; más bajo, más grave. */
  voicePitch: number;
  /** Volumen de la voz y del pitido (0.1–1). */
  voiceVolume: number;
  /** El sistema repite en voz lo que se dicta/hace. */
  speak: boolean;
  /** Resalta las filas con medidas fuera de lo común (no las corrige). */
  avisarRaras: boolean;
  /**
   * Al leer la tabla, un largo que se repite muchas filas seguidas se anuncia
   * una vez («largo fijo 7 pies») y después sólo se leen espesor y ancho. Ver
   * `largoFijoEn` en `cubicador-bloques-especie.ts`.
   */
  largoFijoAlLeer: boolean;
  /**
   * Un «tip» corto cada vez que una pieza dictada entra a la tabla, cuando la
   * voz NO repite (Repite: no). Con la voz prendida la confirmación ya es ella.
   */
  pitidoAlGuardar: boolean;
  /** Frases-gatillo de cada comando (editables). */
  comandos: ComandosCfg;
}

/**
 * Los topes de cada control. `rate` llega a 10 porque es el tope de la Web
 * Speech API: en Windows la voz de Microsoft recién da todo lo que puede ahí
 * (con el tope viejo en 3 quedaba a media velocidad; ver `velocidadEnWindows`).
 */
export const LIMITES_VOZ = {
  rate: { min: 0.6, max: 10, paso: 0.1 },
  pitch: { min: 0.5, max: 2, paso: 0.1 },
  volume: { min: 0.1, max: 1, paso: 0.05 },
} as const;

export const CONFIG_DEFAULT: CubicadorConfig = {
  voiceRate: 2,
  voiceURI: "",
  voicePitch: 1,
  voiceVolume: 1,
  speak: true,
  avisarRaras: true,
  largoFijoAlLeer: true,
  pitidoAlGuardar: true,
  comandos: COMANDOS_DEFAULT,
};

const KEY = () => {
  let slug = "main";
  try { slug = localStorage.getItem("active-tenant-slug") ?? "main"; } catch { /* ignore */ }
  return `buleje-cubicador-config-${slug}`;
};

/** Un número guardado, dentro de su rango; si no sirve, el de fábrica. */
function numeroEn(v: unknown, min: number, max: number, porDefecto: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : porDefecto;
}

/**
 * Lee la config guardada. Lo que no estaba (un navegador que guardó antes de
 * que existiera un ajuste) toma el valor de fábrica. La velocidad guardada NO
 * se toca: quien tenía 3 sigue en 3 — sólo se le quitó el techo.
 */
export function loadConfig(): CubicadorConfig {
  if (typeof window === "undefined") return CONFIG_DEFAULT;
  try {
    const raw = localStorage.getItem(KEY());
    if (!raw) return CONFIG_DEFAULT;
    const p = JSON.parse(raw) as Partial<CubicadorConfig>;
    return {
      voiceRate: numeroEn(p.voiceRate, 0.1, LIMITES_VOZ.rate.max, CONFIG_DEFAULT.voiceRate),
      voiceURI: typeof p.voiceURI === "string" ? p.voiceURI : "",
      voicePitch: numeroEn(p.voicePitch, LIMITES_VOZ.pitch.min, LIMITES_VOZ.pitch.max, CONFIG_DEFAULT.voicePitch),
      voiceVolume: numeroEn(p.voiceVolume, LIMITES_VOZ.volume.min, LIMITES_VOZ.volume.max, CONFIG_DEFAULT.voiceVolume),
      speak: typeof p.speak === "boolean" ? p.speak : true,
      avisarRaras: typeof p.avisarRaras === "boolean" ? p.avisarRaras : true,
      largoFijoAlLeer: typeof p.largoFijoAlLeer === "boolean" ? p.largoFijoAlLeer : CONFIG_DEFAULT.largoFijoAlLeer,
      pitidoAlGuardar: typeof p.pitidoAlGuardar === "boolean" ? p.pitidoAlGuardar : CONFIG_DEFAULT.pitidoAlGuardar,
      comandos: {
        pausar: p.comandos?.pausar ?? COMANDOS_DEFAULT.pausar,
        continuar: p.comandos?.continuar ?? COMANDOS_DEFAULT.continuar,
        borrarUltimo: p.comandos?.borrarUltimo ?? COMANDOS_DEFAULT.borrarUltimo,
        especie: p.comandos?.especie ?? COMANDOS_DEFAULT.especie,
        fijar: p.comandos?.fijar ?? COMANDOS_DEFAULT.fijar,
        desfijar: p.comandos?.desfijar ?? COMANDOS_DEFAULT.desfijar,
        dueno: p.comandos?.dueno ?? COMANDOS_DEFAULT.dueno,
      },
    };
  } catch { return CONFIG_DEFAULT; }
}

export function saveConfig(cfg: CubicadorConfig): void {
  try { localStorage.setItem(KEY(), JSON.stringify(cfg)); } catch { /* quota */ }
}

/** "a, b, c" ↔ ["a","b","c"] para editar frases en un input. */
export const frasesToText = (list: string[]) => list.join(", ");
export const textToFrases = (text: string) =>
  text.split(",").map((s) => s.trim()).filter(Boolean);

/** Lo que una utterance toma de los ajustes. */
export type AjustesDeVoz = Pick<CubicadorConfig, "voiceRate" | "voiceURI" | "voicePitch" | "voiceVolume">;

/**
 * Pone voz, velocidad, tono y volumen en una utterance. Una sola función para
 * la voz que repite (madera y trozas) y «Probar voz»: si cada una los pusiera
 * a mano, el tono nuevo sonaría en una y no en la otra.
 */
export function aplicarAjustesDeVoz(
  u: SpeechSynthesisUtterance,
  cfg: AjustesDeVoz,
  voces: readonly SpeechSynthesisVoice[],
): void {
  u.lang = "es-PE";
  u.rate = numeroEn(cfg.voiceRate, 0.1, LIMITES_VOZ.rate.max, CONFIG_DEFAULT.voiceRate);
  u.pitch = numeroEn(cfg.voicePitch, 0, 2, CONFIG_DEFAULT.voicePitch);
  u.volume = numeroEn(cfg.voiceVolume, 0, 1, CONFIG_DEFAULT.voiceVolume);
  if (cfg.voiceURI) {
    const v = voces.find((x) => x.voiceURI === cfg.voiceURI);
    if (v) u.voice = v;
  }
}

/**
 * Cuántas veces más rápido suena de verdad una voz de Windows con este `rate`.
 *
 * Chrome (y Edge) le pasan la velocidad al motor de Windows como
 * `SetRate(int(10 · log10(rate)))` (chromium `tts_win.cc`), y el motor sube de
 * a escalones de ∛3 ÷ 10 (×1,116 cada uno, 10 escalones = ×3). O sea: el
 * número del control NO es un multiplicador. Pedir 3× da el escalón 4, que
 * suena a ×1,55; recién 10 llega al tope del motor (×3). Por eso con el
 * control al máximo viejo (3) la lectura se sentía lenta.
 */
export function velocidadEnWindows(rate: number): number {
  const r = Math.min(10, Math.max(0.1, Number.isFinite(rate) ? rate : 1));
  return Math.pow(3, Math.trunc(10 * Math.log10(r)) / 10);
}

/**
 * ¿Esta voz la maneja el motor de Windows (el de `velocidadEnWindows`)?
 * Las locales de Microsoft sí («Microsoft Pablo - Spanish (Spain)»); las
 * «Online (Natural)» de Edge y las de Google van por otro camino. Sin voz
 * elegida manda la del sistema: en Windows, la de Microsoft.
 */
export function esVozDeWindows(voz: Pick<SpeechSynthesisVoice, "name" | "localService"> | undefined, userAgent: string): boolean {
  if (voz) return voz.localService && /^Microsoft\b/i.test(voz.name);
  return /Windows/i.test(userAgent);
}
