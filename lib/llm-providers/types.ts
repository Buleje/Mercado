/**
 * lib/llm-providers/types.ts
 *
 * Interfaz común para providers LLM. Permite swap entre Groq, Anthropic,
 * OpenAI, etc sin cambiar el código que llama al LLM.
 *
 * Ver ADR-010 para la estrategia de router y tiers.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: unknown[];
}

export interface ToolCallResult {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface LLMCallOptions {
  messages: ChatMessage[];
  temperature: number;
  maxTokens?: number;
  tools?: unknown[];
  toolChoice?: "auto" | "none" | { type: "function"; function: { name: string } };
  stream?: boolean;
  /** Solo informativo para logging/tracking. No cambia comportamiento. */
  label?: string;
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMResponse {
  ok: boolean;
  /** Contenido textual de la respuesta (null si hubo tool_calls o error). */
  content: string | null;
  /** Llamadas a tools solicitadas por el modelo. */
  toolCalls: ToolCallResult[] | null;
  usage: LLMUsage;
  /** Body raw para streaming — null si stream=false o si hubo error. */
  body: ReadableStream<Uint8Array> | null;
  /** Mensaje de error legible si ok=false. */
  error?: string;
  /** Identificador del provider que atendió la llamada (para observabilidad). */
  provider: "groq" | "anthropic" | "openai";
  /** Modelo concreto usado (para observabilidad). */
  model: string;
}

export interface LLMProvider {
  readonly name: "groq" | "anthropic" | "openai";
  /** Modelo default para este provider en cada tier. */
  readonly models: Readonly<Record<"cheap" | "balanced" | "premium", string>>;
  /** Indica si el provider tiene API key configurada en el entorno actual. */
  isAvailable(): boolean;
  /** Llamada síncrona — devuelve la respuesta completa. */
  chat(opts: LLMCallOptions, model: string): Promise<LLMResponse>;
}
