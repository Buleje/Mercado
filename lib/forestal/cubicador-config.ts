/**
 * cubicador-config.ts — ajustes del cubicador (voz + comandos), persistidos por
 * tenant en localStorage. PURO y client-safe.
 */
import { COMANDOS_DEFAULT, type ComandosCfg } from "./cubicacion";

export interface CubicadorConfig {
  /** Velocidad de la voz que repite (SpeechSynthesis rate 0.6–2). */
  voiceRate: number;
  /** voiceURI de la voz elegida (tono). "" = la default del navegador. */
  voiceURI: string;
  /** El sistema repite en voz lo que se dicta/hace. */
  speak: boolean;
  /** Resalta las filas con medidas fuera de lo común (no las corrige). */
  avisarRaras: boolean;
  /** Frases-gatillo de cada comando (editables). */
  comandos: ComandosCfg;
}

export const CONFIG_DEFAULT: CubicadorConfig = {
  voiceRate: 1.5,
  voiceURI: "",
  speak: true,
  avisarRaras: true,
  comandos: COMANDOS_DEFAULT,
};

const KEY = () => {
  let slug = "main";
  try { slug = localStorage.getItem("active-tenant-slug") ?? "main"; } catch { /* ignore */ }
  return `buleje-cubicador-config-${slug}`;
};

export function loadConfig(): CubicadorConfig {
  if (typeof window === "undefined") return CONFIG_DEFAULT;
  try {
    const raw = localStorage.getItem(KEY());
    if (!raw) return CONFIG_DEFAULT;
    const p = JSON.parse(raw) as Partial<CubicadorConfig>;
    return {
      voiceRate: typeof p.voiceRate === "number" ? p.voiceRate : CONFIG_DEFAULT.voiceRate,
      voiceURI: typeof p.voiceURI === "string" ? p.voiceURI : "",
      speak: typeof p.speak === "boolean" ? p.speak : true,
      avisarRaras: typeof p.avisarRaras === "boolean" ? p.avisarRaras : true,
      comandos: {
        pausar: p.comandos?.pausar ?? COMANDOS_DEFAULT.pausar,
        continuar: p.comandos?.continuar ?? COMANDOS_DEFAULT.continuar,
        borrarUltimo: p.comandos?.borrarUltimo ?? COMANDOS_DEFAULT.borrarUltimo,
        especie: p.comandos?.especie ?? COMANDOS_DEFAULT.especie,
        fijar: p.comandos?.fijar ?? COMANDOS_DEFAULT.fijar,
        desfijar: p.comandos?.desfijar ?? COMANDOS_DEFAULT.desfijar,
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
