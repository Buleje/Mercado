/**
 * Lo que el detector del mosaico entrega a la pantalla mientras mira el video
 * (ADR-475, 2026-10-08): las personas con su número, las zonas con movimiento
 * y la última aparición para el aviso.
 *
 * Todas las cajas van en FRACCIONES del cuadro (0-1): el video se dibuja en un
 * marco 16:9 de cualquier tamaño y la capa encima las pinta en porcentajes.
 */

/** Un rectángulo en fracciones del cuadro (0-1). */
export interface CajaFraccion {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

/** Una persona seguida entre cuadros. */
export interface PersonaEnVivo extends CajaFraccion {
  /** Número estable mientras siga en cuadro: «Persona 1», «Persona 2»… */
  id: number;
  /** La mejor confianza del modelo en la última vez que la vio (0-1). */
  confianza: number;
  /** Recién apareció (sus primeros segundos): la pantalla la destaca. */
  nueva: boolean;
  /**
   * El modelo no la vio en la última mirada y la caja es la última conocida
   * (se queda quieta o el movimiento no la tocó). La pantalla la atenúa.
   */
  estimada: boolean;
  /** En cuántas miradas la vio el detector (2+ = la misma persona, no un parpadeo). */
  vistas: number;
}

/** Cuándo apareció gente en una cámara: dispara el aviso (sonido + mensaje). */
export interface AparicionPersona {
  camaraId: string;
  nombre: string;
  /** Epoch ms. */
  at: number;
  /** Personas en cuadro en ese momento. */
  personas: number;
}

/** Con qué motor mira el detector (para el ⓘ del chip). */
export type MotorDetector = "dfine-webgpu" | "dfine-wasm" | "mediapipe";

export const MOTOR_DETECTOR_LABEL: Record<MotorDetector, string> = {
  "dfine-webgpu": "D-FINE con la tarjeta gráfica",
  "dfine-wasm": "D-FINE con el procesador",
  mediapipe: "detector liviano (respaldo)",
};

/** Cuántos segundos una persona cuenta como «nueva» en pantalla. */
export const PERSONA_NUEVA_MS = 6_000;
