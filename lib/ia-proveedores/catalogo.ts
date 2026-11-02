/**
 * Buleje IA (ADR-528) — los 12 proveedores que el dueño puede conectar con su
 * propia clave.
 *
 * Direcciones verificadas el 01-11-2026: cada `baseUrl + /models` contestó 401
 * sin clave (= existe y pide clave; Gemini contesta 400 «Please pass a valid
 * API key»). Los nombres de modelo son SUGERENCIAS: los proveedores dan de baja
 * modelos sin aviso (lección Groq, 04-09: el asistente entero cayó por un
 * modelo retirado), así que la lista que se elige en la pantalla es la que el
 * proveedor devuelve HOY en `/models` al probar la clave. Los marcados
 * «sugerido» salieron del listado público de OpenRouter (01-11) y no de la doc
 * de cada empresa; los de Claude salen de `lib/claude-router.ts` y los de Groq
 * de su `/models` con la clave de la plataforma.
 *
 * Sin `server-only`: la pantalla de Modelos dibuja las tarjetas con esto.
 */

import type { ProveedorCatalogo, ProveedorIaId } from "./tipos";

export const CATALOGO_IA: readonly ProveedorCatalogo[] = [
  {
    id: "openai",
    nombre: "ChatGPT",
    empresa: "OpenAI",
    protocolo: "openai",
    baseUrl: "https://api.openai.com/v1",
    urlClave: "https://platform.openai.com/api-keys",
    modelosSugeridos: [
      { id: "gpt-6.1-sol", nombre: "GPT-6.1 Sol", vision: true, nota: "sugerido · equilibrado" },
      { id: "gpt-6.1-terra", nombre: "GPT-6.1 Terra", vision: true, nota: "sugerido · el más listo" },
    ],
    ayuda: "Lee fotos. Se paga por uso (recarga desde US$ 5).",
    gratis: false,
  },
  {
    id: "anthropic",
    nombre: "Claude",
    empresa: "Anthropic",
    protocolo: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    urlClave: "https://console.anthropic.com/settings/keys",
    modelosSugeridos: [
      { id: "claude-sonnet-5-5", nombre: "Claude Sonnet 5.5", vision: true, nota: "equilibrado, anota muy bien" },
      { id: "claude-haiku-5-5", nombre: "Claude Haiku 5.5", vision: true, nota: "barato y rápido" },
      { id: "claude-opus-5-5", nombre: "Claude Opus 5.5", vision: true, nota: "el más listo" },
    ],
    ayuda: "Lee fotos y recibos muy bien. Se paga por uso.",
    gratis: false,
  },
  {
    id: "gemini",
    nombre: "Gemini",
    empresa: "Google",
    protocolo: "openai",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    urlClave: "https://aistudio.google.com/apikey",
    modelosSugeridos: [
      { id: "gemini-3.8-flash", nombre: "Gemini 3.8 Flash", vision: true, nota: "sugerido · rápido, tiene plan gratis" },
      { id: "gemini-4-argon", nombre: "Gemini 4 Argon", vision: true, nota: "sugerido · el más listo" },
    ],
    ayuda: "Tiene plan gratis y lee fotos.",
    gratis: true,
  },
  {
    id: "deepseek",
    nombre: "DeepSeek",
    empresa: "DeepSeek",
    protocolo: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    urlClave: "https://platform.deepseek.com/api_keys",
    modelosSugeridos: [
      { id: "deepseek-chat", nombre: "DeepSeek Chat", vision: false, nota: "sugerido · el más barato" },
      { id: "deepseek-reasoner", nombre: "DeepSeek Reasoner", vision: false, nota: "sugerido · piensa más" },
    ],
    ayuda: "El más barato. No lee fotos.",
    gratis: false,
  },
  {
    id: "qwen",
    nombre: "Qwen",
    empresa: "Alibaba (Qwen)",
    protocolo: "openai",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    urlClave: "https://modelstudio.console.alibabacloud.com/?tab=playground#/api-key",
    modelosSugeridos: [
      { id: "qwen-plus", nombre: "Qwen Plus", vision: false, nota: "sugerido · equilibrado" },
      { id: "qwen-max", nombre: "Qwen Max", vision: false, nota: "sugerido · el más listo" },
      { id: "qwen-vl-max", nombre: "Qwen VL Max", vision: true, nota: "sugerido · para leer fotos" },
    ],
    ayuda: "Trae crédito gratis al empezar. Para fotos, el modelo «VL».",
    gratis: true,
  },
  {
    id: "kimi",
    nombre: "Kimi",
    empresa: "Moonshot AI",
    protocolo: "openai",
    baseUrl: "https://api.moonshot.ai/v1",
    urlClave: "https://platform.moonshot.ai/console/api-keys",
    modelosSugeridos: [
      { id: "kimi-k3", nombre: "Kimi K3", vision: true, nota: "sugerido" },
      { id: "kimi-k2.6", nombre: "Kimi K2.6", vision: true, nota: "sugerido · más barato" },
    ],
    ayuda: "Bueno con herramientas. Se paga por uso.",
    gratis: false,
  },
  {
    id: "glm",
    nombre: "GLM",
    empresa: "Zhipu (Z.ai)",
    protocolo: "openai",
    baseUrl: "https://api.z.ai/api/paas/v4",
    urlClave: "https://z.ai/manage-apikey/apikey-list",
    modelosSugeridos: [
      { id: "glm-5.3", nombre: "GLM 5.3", vision: false, nota: "sugerido · el más listo" },
      { id: "glm-5.3-flash", nombre: "GLM 5.3 Flash", vision: true, nota: "sugerido · rápido, lee fotos" },
    ],
    ayuda: "Tiene modelos «flash» gratis o muy baratos.",
    gratis: true,
  },
  {
    id: "minimax",
    nombre: "MiniMax",
    empresa: "MiniMax",
    protocolo: "openai",
    baseUrl: "https://api.minimax.io/v1",
    urlClave: "https://platform.minimax.io/user-center/basic-information/interface-key",
    modelosSugeridos: [
      { id: "MiniMax-M3", nombre: "MiniMax M3", vision: true, nota: "sugerido" },
      { id: "MiniMax-M2.7", nombre: "MiniMax M2.7", vision: false, nota: "sugerido · más barato" },
    ],
    ayuda: "Barato y rápido. Se paga por uso.",
    gratis: false,
  },
  {
    id: "groq",
    nombre: "Groq",
    empresa: "Groq",
    protocolo: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    urlClave: "https://console.groq.com/keys",
    modelosSugeridos: [
      { id: "openai/gpt-oss-120b", nombre: "GPT-OSS 120B", vision: false, nota: "gratis, rápido" },
      { id: "openai/gpt-oss-20b", nombre: "GPT-OSS 20B", vision: false, nota: "gratis, el más rápido" },
    ],
    ayuda: "Gratis y muy rápido, con límite por minuto. No lee fotos.",
    gratis: true,
  },
  {
    id: "xai",
    nombre: "Grok",
    empresa: "xAI",
    protocolo: "openai",
    baseUrl: "https://api.x.ai/v1",
    urlClave: "https://console.x.ai",
    modelosSugeridos: [
      { id: "grok-4.7", nombre: "Grok 4.7", vision: true, nota: "sugerido" },
    ],
    ayuda: "Lee fotos. Se paga por uso.",
    gratis: false,
  },
  {
    id: "openrouter",
    nombre: "OpenRouter",
    empresa: "OpenRouter (todos en uno)",
    protocolo: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    urlClave: "https://openrouter.ai/settings/keys",
    modelosSugeridos: [
      { id: "anthropic/claude-sonnet-5.5", nombre: "Claude Sonnet 5.5", vision: true, nota: "con una sola clave" },
      { id: "google/gemini-3.8-flash", nombre: "Gemini 3.8 Flash", vision: true, nota: "barato" },
      { id: "deepseek/deepseek-v4.1-flash", nombre: "DeepSeek V4.1 Flash", vision: true, nota: "el más barato" },
    ],
    ayuda: "Una sola clave para cientos de modelos (ChatGPT, Claude, Gemini, DeepSeek…).",
    gratis: true,
  },
  {
    id: "personalizado",
    nombre: "Personalizado",
    empresa: "Cualquier servicio compatible con OpenAI",
    protocolo: "openai",
    baseUrl: null,
    urlClave: null,
    modelosSugeridos: [],
    ayuda: "Ollama, LM Studio, vLLM u otro: pega su dirección (https).",
    gratis: false,
  },
];

export function proveedorDelCatalogo(id: string): ProveedorCatalogo | null {
  return CATALOGO_IA.find((p) => p.id === id) ?? null;
}

export function esProveedorIa(id: string): id is ProveedorIaId {
  return CATALOGO_IA.some((p) => p.id === id);
}

/**
 * ¿El modelo lee fotos? Primero el catálogo; si no está, por el nombre (los
 * que dicen «vl», «vision», «4o», «gemini», «claude» suelen ver). Es una
 * pista para la pantalla y para elegir `modeloVision`; la verdad la dice el
 * proveedor cuando se le manda la foto.
 */
export function modeloLeeFotos(proveedor: string, modelo: string): boolean {
  const sugerido = proveedorDelCatalogo(proveedor)?.modelosSugeridos.find((m) => m.id === modelo);
  if (sugerido) return sugerido.vision;
  if (proveedor === "groq" || proveedor === "deepseek") return /vision|vl\b|-vl-|scout|maverick/i.test(modelo);
  return /vision|[-_.]vl([-_.]|$)|-v$|4o|gpt-[5-9]|gemini|claude|grok-4|kimi-k[3-9]|omni|pixtral|llava/i.test(modelo);
}

export type VeredictoUrl = { ok: true; url: string } | { ok: false; motivo: string };

const IPV4_PRIVADA = /^(?:127\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|255\.|22[4-9]\.|23\d\.)/;
const LOCALES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Valida la dirección de un proveedor «personalizado» (anti-SSRF, 1.ª capa).
 * - Solo `https://`. `http://` únicamente a localhost/127.0.0.1 FUERA de
 *   producción (Ollama o LM Studio en la PC del dueño).
 * - En producción: nunca localhost, IPs privadas, link-local (169.254 = la
 *   metadata de la nube), CGNAT ni IPv6 locales. La 2.ª capa (en el servidor)
 *   resuelve el DNS antes de llamar (`safeFetch`), por si un nombre apunta a una
 *   IP privada.
 * Devuelve la URL normalizada sin barra final.
 */
export function validarBaseUrl(bruta: string, opts: { produccion: boolean }): VeredictoUrl {
  const texto = (bruta ?? "").trim();
  if (!texto) return { ok: false, motivo: "Escribe la dirección del servicio (por ejemplo https://mi-servidor.com/v1)." };
  if (texto.length > 500) return { ok: false, motivo: "Esa dirección es demasiado larga." };
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return { ok: false, motivo: "Esa dirección no es válida. Tiene que empezar con https://" };
  }
  if (url.username || url.password) return { ok: false, motivo: "La dirección no puede llevar usuario ni contraseña: la clave va en su campo." };
  if (url.search || url.hash) return { ok: false, motivo: "La dirección no puede llevar «?» ni «#»." };
  const host = url.hostname.toLowerCase();
  const esLocal = LOCALES.has(host) || host.endsWith(".localhost");

  if (url.protocol === "http:") {
    if (!esLocal || opts.produccion) {
      return { ok: false, motivo: "Solo se aceptan direcciones https:// (http solo para localhost en desarrollo)." };
    }
  } else if (url.protocol !== "https:") {
    return { ok: false, motivo: "Solo se aceptan direcciones https://" };
  }

  if (opts.produccion) {
    if (esLocal) return { ok: false, motivo: "En el servidor no se puede usar «localhost»: pon la dirección pública del servicio." };
    if (esIpPrivada(host)) return { ok: false, motivo: "Esa dirección es de una red privada: no se puede llamar desde el servidor." };
  }
  return { ok: true, url: url.toString().replace(/\/+$/, "") };
}

/** IPv4/IPv6 literal privada, loopback, link-local, CGNAT o multicast. */
export function esIpPrivada(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return IPV4_PRIVADA.test(h);
  if (!h.includes(":")) return false;
  if (h === "::" || h === "::1") return true;
  const mapeada = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(h);
  if (mapeada) return IPV4_PRIVADA.test(mapeada[1]);
  if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(h)) return true; // IPv4 mapeada en hex: no se arriesga
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(h);
}
