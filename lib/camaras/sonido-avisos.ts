/**
 * El sonido de las alarmas de las cámaras: qué suena, a qué volumen, cuándo
 * NO suena y cuál pestaña suena. Puro (sin navegador): lo prueba
 * `__tests__/camaras-sonido-avisos.test.ts`; lo que toca el audio y las
 * notificaciones vive en `sonido-avisos-audio.ts`.
 *
 * Por qué existe (Brandon 2026-10-15: «el audio, sonido, alarma a veces no
 * funcionan bien»). Medido en el código y en el navegador:
 * - El pitido se creaba sin gesto y, si el navegador lo bloqueaba, fallaba
 *   en silencio (`resume()` sin aviso y la función decía «sonó»).
 * - Con dos pestañas mirando, sonaban las dos; sin preferencias, el volumen
 *   y el sonido no se podían cambiar; el silencio sólo apagaba los mensajes.
 *
 * Las preferencias son de ESTE navegador (localStorage), como el silencio.
 * «Alarma con sonido» sigue en su clave de siempre (la usa el mosaico).
 */
import { z } from "zod";

export const TONOS_ALARMA = ["timbre", "sirena", "campana"] as const;
export type TonoAlarma = (typeof TONOS_ALARMA)[number];

export const NOMBRE_TONO: Record<TonoAlarma, string> = {
  timbre: "Timbre",
  sirena: "Sirena",
  campana: "Campana",
};

/** Preferencias nuevas (volumen, sonido, movimiento, avisos del sistema). */
export const CLAVE_PREFERENCIAS_SONIDO = "camaras:sonido-avisos";
/** «Alarma con sonido» del mosaico (booleano JSON, `useLocalStorage`). */
export const CLAVE_ALARMA_CON_SONIDO = "camaras-mosaico:aviso-sonido";
/** «Vigilar sin pausa»: el mosaico minimizado no se pausa a los 5 min. */
export const CLAVE_VIGILAR_SIN_PAUSA = "camaras-mosaico:sin-pausa";
/** Silencio de TODAS las alarmas: «Silenciar alarmas» del menú y de «Sonido y avisos» (epoch ms en texto). */
export const CLAVE_SILENCIO_ALARMAS = "camaras:alarmas-silencio-hasta";
/**
 * Silencio SÓLO del movimiento: el «Silenciar» del mensaje de movimiento. Es
 * la clave que ese botón usó siempre: un silencio guardado antes del 15-10
 * sigue callando sólo el movimiento, nunca a las personas.
 */
export const CLAVE_SILENCIO_MOVIMIENTO = "camaras:avisos-silencio-hasta";
/** La última alarma que sonó en CUALQUIER pestaña (`escribirMarcaAlarma`). */
export const CLAVE_ULTIMA_ALARMA = "camaras:alarma-sono-at";

/**
 * Dos pestañas con el mosaico abierto ven a la misma persona con segundos de
 * diferencia: dentro de esta ventana suena una sola (la otra sólo muestra).
 */
export const VENTANA_UNA_PESTANA_MS = 6_000;

export const SILENCIOS_MIN = [30, 60, 240] as const;

export interface PreferenciasSonido {
  /** 0 a 1. */
  volumen: number;
  tono: TonoAlarma;
  /** Sonar también con los avisos de movimiento (no sólo con personas). */
  conMovimiento: boolean;
  /** Aviso del sistema operativo cuando la pestaña no está a la vista. */
  sistema: boolean;
}

export const PREFERENCIAS_INICIALES: PreferenciasSonido = {
  volumen: 0.8,
  tono: "timbre",
  conMovimiento: false,
  sistema: false,
};

const ESQUEMA = z.object({
  volumen: z.number().min(0).max(1).catch(PREFERENCIAS_INICIALES.volumen),
  tono: z.enum(TONOS_ALARMA).catch(PREFERENCIAS_INICIALES.tono),
  conMovimiento: z.boolean().catch(PREFERENCIAS_INICIALES.conMovimiento),
  sistema: z.boolean().catch(PREFERENCIAS_INICIALES.sistema),
});

/** Lo guardado (texto de localStorage o `null`) → preferencias completas; lo roto vuelve a lo de fábrica. */
export function leerPreferenciasDe(texto: string | null): PreferenciasSonido {
  if (!texto) return PREFERENCIAS_INICIALES;
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    return PREFERENCIAS_INICIALES;
  }
  const r = ESQUEMA.safeParse(crudo);
  return r.success ? r.data : PREFERENCIAS_INICIALES;
}

/** «Alarma con sonido»: prendida salvo que diga `false` (así nació en el mosaico). */
export const alarmaConSonidoDe = (texto: string | null): boolean => texto !== "false";

/** Epoch ms del silencio, o 0 si no hay (o está roto). */
export function silencioDe(texto: string | null): number {
  const v = Number(texto);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

export interface Nota {
  hz: number;
  /** Desde el inicio, en segundos. */
  desde: number;
  dura: number;
  onda: OscillatorType;
}

const n = (hz: number, desde: number, dura: number, onda: OscillatorType): Nota => ({ hz, desde, dura, onda });

/**
 * Cada sonido dura menos de 1 s y se oye con el parlante de una laptop:
 * - Timbre: las dos notas del aviso de siempre (si → fa#), DOS veces (una
 *   sola, de 250 ms, se perdía con la burbuja minimizada).
 * - Sirena: cuatro notas que suben y bajan, para el patio.
 * - Campana: tres notas que suben, suave, para la oficina.
 */
const NOTAS: Record<TonoAlarma, readonly Nota[]> = {
  timbre: [n(988, 0, 0.12, "triangle"), n(740, 0.13, 0.14, "triangle"), n(988, 0.4, 0.12, "triangle"), n(740, 0.53, 0.16, "triangle")],
  sirena: [n(880, 0, 0.17, "triangle"), n(660, 0.19, 0.17, "triangle"), n(880, 0.38, 0.17, "triangle"), n(660, 0.57, 0.2, "triangle")],
  campana: [n(784, 0, 0.3, "sine"), n(988, 0.16, 0.3, "sine"), n(1319, 0.32, 0.5, "sine")],
};

export const notasDelTono = (tono: TonoAlarma): readonly Nota[] => NOTAS[tono] ?? NOTAS.timbre;

/** Ganancia tope con el volumen al 100 % (el tip del dictado usa 0,12; el aviso viejo, 0,18). */
export const GANANCIA_MAX = 0.32;

export const gananciaPara = (volumen: number): number =>
  GANANCIA_MAX * Math.min(1, Math.max(0, Number.isFinite(volumen) ? volumen : 0));

export type TipoAlarma = "persona" | "movimiento";

export type DecisionSonido = "sonar" | "silenciado" | "apagado";

/** Hasta cuándo (epoch ms, 0 = no) calla cada silencio. */
export interface Silencios {
  /** «Silenciar alarmas»: personas, movimiento y avisos del sistema. */
  todo: number;
  /** El «Silenciar» del mensaje de movimiento: sólo el movimiento. */
  movimiento: number;
}

export const SIN_SILENCIO: Silencios = { todo: 0, movimiento: 0 };

/**
 * ¿Este tipo de alarma está en silencio? El de movimiento NO calla a las
 * personas (15-10: «Silenciar 1 h» en el mensaje de movimiento dejaba muda
 * una hora la alarma de personas, el «a veces no suena» de Brandon).
 */
export function silenciadoPara(tipo: TipoAlarma, s: Silencios, ahora: number): boolean {
  if (s.todo > ahora) return true;
  return tipo === "movimiento" && s.movimiento > ahora;
}

/**
 * ¿Suena esta alarma? Su silencio manda; «Alarma con sonido» apagada calla
 * las de personas; las de movimiento suenan sólo si se pidió.
 * Volumen en 0 = apagado (no «sonó» sin que se oiga).
 */
export function decidirSonido(p: {
  tipo: TipoAlarma;
  prefs: PreferenciasSonido;
  alarmaConSonido: boolean;
  silencios: Silencios;
  ahora: number;
}): DecisionSonido {
  if (silenciadoPara(p.tipo, p.silencios, p.ahora)) return "silenciado";
  if (p.prefs.volumen <= 0) return "apagado";
  if (p.tipo === "persona" && !p.alarmaConSonido) return "apagado";
  if (p.tipo === "movimiento" && !p.prefs.conMovimiento) return "apagado";
  return "sonar";
}

/** La última alarma que sonó: en qué pestaña, cuándo y de qué tipo. */
export interface MarcaAlarma {
  pestana: string;
  at: number;
  tipo: TipoAlarma;
}

export const escribirMarcaAlarma = (m: MarcaAlarma): string => `${m.pestana}|${m.at}|${m.tipo}`;

/** Lee la marca. La de antes del 15-10 (sólo la hora) cuenta como persona de otra pestaña. */
export function leerMarcaAlarma(texto: string | null): MarcaAlarma | null {
  if (!texto) return null;
  const partes = texto.split("|");
  const viejo = partes.length === 1;
  const at = Number(viejo ? partes[0] : partes[1]);
  if (!Number.isFinite(at) || at <= 0) return null;
  return {
    pestana: viejo ? "" : partes[0],
    at,
    tipo: !viejo && partes[2] === "movimiento" ? "movimiento" : "persona",
  };
}

/**
 * ¿Le toca sonar a esta pestaña? La ventana existe para que, con el mosaico
 * abierto en dos pestañas, la misma persona suene UNA vez:
 * - la marca es de esta misma pestaña → suena (el ritmo dentro de la pestaña
 *   lo pone quien llama; antes un movimiento callaba 6 s a la persona que lo
 *   confirmaba 1-3 s después, y decía «otra pestaña»);
 * - una persona nunca calla por un movimiento de otra pestaña;
 * - si no, suena si nadie sonó dentro de la ventana. Una marca del futuro
 *   lejano (otro reloj) no calla para siempre.
 */
export function tocaSonar(
  marca: MarcaAlarma | null,
  yo: { pestana: string; tipo: TipoAlarma },
  ahora: number,
  ventana = VENTANA_UNA_PESTANA_MS,
): boolean {
  if (!marca) return true;
  if (marca.pestana === yo.pestana) return true;
  if (yo.tipo === "persona" && marca.tipo === "movimiento") return true;
  if (marca.at > ahora + ventana) return true;
  return ahora - marca.at >= ventana;
}
