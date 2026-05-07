import "server-only";

/**
 * lib/ai-safety/sanitize.ts
 *
 * Helpers de sanitización mínima para inputs de usuario antes de interpolarlos
 * en prompts de LLM. Previene prompt injection y junk tokens que inflan costos.
 */

const MAX_INPUT_LENGTH = 500;

// Patrones de prompt injection conocidos (case-insensitive)
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/i,
  /forget\s+(all\s+)?(previous|your)\s+instructions?/i,
  /you\s+are\s+now\s+(a\s+)?/i,
  /act\s+as\s+(a\s+|an\s+)?/i,
  /new\s+system\s+prompt/i,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /\[INST\]/i,
  /<<SYS>>/i,
  /\[\/INST\]/i,
];

export interface InjectionResult {
  detected: boolean;
  severity: "none" | "low" | "high";
}

/**
 * Limpia un texto de usuario para uso seguro en prompts LLM:
 * - Trunca a MAX_INPUT_LENGTH caracteres
 * - Elimina caracteres de control (salvo \n y \t)
 * - Escapa comillas dobles para evitar salida del string literal del prompt
 */
export function processSafeInput(raw: string): string {
  // 1. Truncar
  const truncated = raw.slice(0, MAX_INPUT_LENGTH);

  // 2. Strip control chars salvo \n y \t
  // eslint-disable-next-line no-control-regex
  const stripped = truncated.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // 3. Escapar comillas dobles
  return stripped.replace(/"/g, '\\"');
}

/**
 * Detecta señales de prompt injection en el texto.
 * Severity "high" → rechazar. "low" → loggear pero permitir.
 */
export function detectPromptInjection(text: string): InjectionResult {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return { detected: true, severity: "high" };
    }
  }
  return { detected: false, severity: "none" };
}
