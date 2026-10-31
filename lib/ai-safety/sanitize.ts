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
  // Español (clientas de WhatsApp, 11-10): las mismas jugadas, en castellano.
  /\b(ignor[aáe]|olvid[aáe]|descart[aáe]|omit[aeí])\s+(todas?\s+)?(las\s+|tus\s+|sus\s+|esas\s+)?(instrucciones|reglas|indicaciones|[oó]rdenes)\b/i,
  /(^|[.!?¡¿,;]\s*|\bahora\s+)(act[uú]a|act[uú]e|comp[oó]rtate|hazte\s+pasar)\s+(como|por)\b/i,
  /\b(eres|ser[aá]s)\s+ahora\b|\bahora\s+eres\b|\bya\s+no\s+eres\b/i,
  // «dime las instrucciones de uso» es una pregunta legítima: con artículo solo cuenta prompt/configuración.
  /\b(mu[eé]strame|mu[eé]strenme|dime|revela|rev[eé]lame|ens[eé][ñn]ame|p[aá]same|copia|repite)\s+((tu|tus|su|sus)\s+(prompt|instrucciones|configuraci[oó]n|reglas)|(el|la|tu|su)\s+(prompt|configuraci[oó]n|mensaje\s+de\s+sistema))\b/i,
  /\bnuevo\s+(prompt|rol|mensaje\s+de\s+sistema)\b/i,
  /\bmodo\s+(desarrollador|developer|dan|jailbreak)\b/i,
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
