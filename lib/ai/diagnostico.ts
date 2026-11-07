import "server-only";

/**
 * lib/ai/diagnostico.ts — ¿la capa de IA está realmente viva?
 *
 * ── Por qué existe ───────────────────────────────────────────────────────────
 * Todo lo que se rompe acá se rompe EN SILENCIO. Groq dio de baja tres modelos
 * sin aviso y el asistente quedó mudo semanas: cada llamada devolvía 404
 * `model_not_found`, el router lo traducía a «no pude responder» y desde el chat
 * parecía un problema de conexión. Lo mismo con un dominio de agente sin
 * permiso («no tengo permiso» → parece un problema de rol) o sin vocabulario
 * («no puedo hacer eso» → parece una decisión del modelo).
 *
 * Ninguno de esos casos tira una excepción, aparece en Sentry ni rompe un
 * build. La única forma de verlos es ir a preguntar. Esto va a preguntar.
 *
 * ── Qué NO hace ──────────────────────────────────────────────────────────────
 * No arregla nada ni cambia configuración: informa. Y no inventa un veredicto
 * cuando no pudo consultar — «no pude preguntarle al proveedor» es una
 * respuesta distinta de «está todo bien», y confundirlas sería repetir el bug
 * que este archivo existe para evitar.
 */

import { logger } from "@/lib/logger";
import { groqProvider } from "@/lib/llm-providers/groq";
import { AGENT_ACTION_PERMISSIONS } from "@/lib/agents/permissions";
import { ALL_AGENT_TOOLS, resolveToolCall } from "@/lib/agents/tool-definitions";
import { palabrasPorDominio } from "@/lib/agents/tool-routing";
import { MODELO_VISION } from "@/lib/documents/modelo-vision";

export type EstadoSalud = "ok" | "roto" | "sin-verificar";

export interface ModeloRevisado {
  /** Para qué se usa, en palabras del negocio. */
  para: string;
  modelo: string;
  estado: EstadoSalud;
  detalle?: string;
}

export interface HuecoCableado {
  /** `permiso` | `vocabulario` */
  tipo: string;
  donde: string;
  /** Qué va a ver el usuario si esto no se arregla. */
  sintoma: string;
}

export interface Diagnostico {
  generadoEn: string;
  proveedor: {
    nombre: string;
    configurado: boolean;
    /** Cuántos modelos declara servir hoy. `null` si no se pudo preguntar. */
    modelosDisponibles: number | null;
    error?: string;
  };
  modelos: ModeloRevisado[];
  vision: { disponible: boolean; modelo: string; nota: string };
  agentes: { tools: number; huecos: HuecoCableado[] };
  /** El veredicto de una línea, para no obligar a leer el resto. */
  resumen: string;
  estado: EstadoSalud;
}

/**
 * Cachear está bien: esto se mira a mano, no en un loop, y preguntarle el
 * catálogo al proveedor en cada carga de pantalla es gastar cuota en algo que
 * cambia una vez cada varios meses.
 */
let cache: { valor: Diagnostico; expira: number } | null = null;
const TTL_MS = 5 * 60 * 1000;

/** El catálogo real del proveedor. `null` = no se pudo preguntar. */
async function catalogoDeGroq(): Promise<Set<string> | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      logger.warn("[ia/diagnostico] el proveedor no devolvió su catálogo", { status: res.status });
      return null;
    }
    const json = (await res.json()) as { data?: Array<{ id?: string }> };
    return new Set((json.data ?? []).map((m) => m.id).filter((x): x is string => Boolean(x)));
  } catch (err) {
    logger.warn("[ia/diagnostico] no se pudo consultar el catálogo", { error: String(err) });
    return null;
  }
}

/**
 * Los huecos de cableado de los agentes.
 *
 * Es el mismo chequeo que hace `__tests__/agentes-cableado-completo.test.ts`,
 * pero en runtime: el test protege lo que se commitea, esto muestra lo que está
 * corriendo de verdad —que puede diferir si alguien tocó algo sin correr los
 * tests, o si un import dinámico falló.
 */
function huecosDeCableado(): HuecoCableado[] {
  const huecos: HuecoCableado[] = [];

  for (const tool of ALL_AGENT_TOOLS) {
    const mapa = resolveToolCall(tool.function.name);
    if (!mapa) {
      huecos.push({
        tipo: "mapeo",
        donde: tool.function.name,
        sintoma: "el modelo puede elegir esta herramienta y nadie sabe qué ejecutar",
      });
      continue;
    }
    const permisos = (AGENT_ACTION_PERMISSIONS as Record<string, Record<string, unknown>>)[mapa.domain];
    if (!permisos?.[mapa.action]) {
      huecos.push({
        tipo: "permiso",
        donde: `${mapa.domain}.${mapa.action}`,
        sintoma: "el asistente contesta «no tengo permiso» — parece un problema de rol y es un mapping faltante",
      });
    }
  }

  // `ui` no tiene vocabulario a propósito: sus tools se ofrecen siempre.
  const SIN_VOCABULARIO_A_PROPOSITO = new Set(["ui"]);
  const conteo = palabrasPorDominio();
  const dominiosConTools = new Set(
    ALL_AGENT_TOOLS.map((t) => resolveToolCall(t.function.name)?.domain).filter(Boolean) as string[],
  );
  for (const dominio of dominiosConTools) {
    if (SIN_VOCABULARIO_A_PROPOSITO.has(dominio)) continue;
    if ((conteo[dominio as keyof typeof conteo] ?? 0) === 0) {
      huecos.push({
        tipo: "vocabulario",
        donde: dominio,
        sintoma: "inalcanzable desde el chat: el modelo dice «no puedo hacer eso» y nunca recibió la herramienta",
      });
    }
  }

  return huecos;
}

export async function diagnosticarIA(opts?: { refrescar?: boolean }): Promise<Diagnostico> {
  if (!opts?.refrescar && cache && cache.expira > Date.now()) return cache.valor;

  const configurado = Boolean(process.env.GROQ_API_KEY);
  const catalogo = configurado ? await catalogoDeGroq() : null;

  /**
   * Los modelos que el sistema dice usar. Se leen de los MISMOS registros que
   * usan las llamadas reales — si se copiaran acá, este diagnóstico podría dar
   * verde sobre un modelo que ya nadie usa.
   */
  const aRevisar: Array<{ para: string; modelo: string }> = [
    { para: "Asistente y bots (respuestas cortas)", modelo: groqProvider.models.cheap },
    { para: "Asistente y bots (razonamiento)", modelo: groqProvider.models.balanced },
    { para: "Transcripción de audio (notas de voz)", modelo: "whisper-large-v3-turbo" },
  ];

  const modelos: ModeloRevisado[] = aRevisar.map(({ para, modelo }) => {
    if (!configurado) {
      return { para, modelo, estado: "sin-verificar", detalle: "Falta GROQ_API_KEY" };
    }
    if (catalogo === null) {
      return { para, modelo, estado: "sin-verificar", detalle: "No se pudo consultar el catálogo del proveedor" };
    }
    return catalogo.has(modelo)
      ? { para, modelo, estado: "ok" }
      : {
          para,
          modelo,
          estado: "roto",
          detalle: "El proveedor ya no sirve este modelo — las llamadas devuelven 404 y el bot queda mudo",
        };
  });

  const visionDisponible = catalogo !== null && catalogo.has(MODELO_VISION);
  const huecos = huecosDeCableado();

  const modelosRotos = modelos.filter((m) => m.estado === "roto");
  const sinVerificar = modelos.some((m) => m.estado === "sin-verificar");

  const estado: EstadoSalud =
    modelosRotos.length > 0 || huecos.length > 0 ? "roto" : sinVerificar ? "sin-verificar" : "ok";

  const resumen =
    modelosRotos.length > 0
      ? `${modelosRotos.length} modelo(s) que el proveedor ya no sirve: el bot queda mudo sin dar error.`
      : huecos.length > 0
        ? `${huecos.length} hueco(s) de cableado en los agentes: hay herramientas que el asistente no puede usar.`
        : sinVerificar
          ? "No se pudo verificar contra el proveedor — esto NO quiere decir que esté bien."
          : "Todo lo que el sistema dice usar existe y responde.";

  const valor: Diagnostico = {
    generadoEn: new Date().toISOString(),
    proveedor: {
      nombre: "Groq",
      configurado,
      modelosDisponibles: catalogo?.size ?? null,
      error: configurado && catalogo === null ? "No se pudo leer el catálogo" : undefined,
    },
    modelos,
    vision: {
      disponible: visionDisponible,
      modelo: MODELO_VISION,
      nota: visionDisponible
        ? "Se pueden leer fotos (boletas, documentos)."
        : "Sin modelo de visión: leer una boleta o un documento por foto no funciona. Se destraba configurando ANTHROPIC_API_KEY o DOC_VISION_BASE_URL.",
    },
    agentes: { tools: ALL_AGENT_TOOLS.length, huecos },
    resumen,
    estado,
  };

  cache = { valor, expira: Date.now() + TTL_MS };
  return valor;
}
