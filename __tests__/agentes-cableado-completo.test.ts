/**
 * El cableado de TODOS los dominios de agentes, no de uno.
 *
 * Agregar un dominio son seis lugares y **olvidarse de uno no da error**:
 *
 *  | Falta                       | Lo que ve el usuario                        |
 *  |-----------------------------|---------------------------------------------|
 *  | permiso en `permissions.ts` | «no tengo permiso» → parece un problema de rol |
 *  | vocabulario en `tool-routing` | «no puedo hacer eso» → parece decisión del modelo |
 *  | acción en el agente         | el tool resuelve a una acción que nadie ejecuta |
 *  | `requiresApproval`          | una escritura de plata sin confirmación humana |
 *
 * Ninguna de esas cuatro rompe un build ni tira una excepción. Este archivo es
 * el candado: recorre las tablas estáticas y falla nombrando qué falta.
 *
 * No importa los `*.agent.ts` a propósito — arrastrarían las DB classes y
 * Prisma. Todo lo que se verifica acá vive en tablas que no tocan la base.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { AGENT_DOMAINS } = await import("@/lib/agents/types");
const { AGENT_ACTION_PERMISSIONS } = await import("@/lib/agents/permissions");
const { ALL_AGENT_TOOLS, resolveToolCall, isToolApprovalRequired } = await import(
  "@/lib/agents/tool-definitions"
);
const { dominiosMencionados, palabrasPorDominio, toolsParaMensaje } = await import(
  "@/lib/agents/tool-routing"
);

/** Los dominios que cada tool declara, deducidos de su propio mapeo. */
const dominioDeTool = (nombre: string) => resolveToolCall(nombre)?.domain;

type Dominio = (typeof AGENT_DOMAINS)[number];

/** Dominios que hoy tienen al menos un tool expuesto al modelo. */
const dominiosConTools: Dominio[] = [
  ...new Set(ALL_AGENT_TOOLS.map((t) => dominioDeTool(t.function.name))),
].filter((d): d is Dominio => d !== undefined);

describe("cada tool resuelve a un dominio real", () => {
  it("ningún tool queda huérfano", () => {
    const huerfanos = ALL_AGENT_TOOLS.filter((t) => !dominioDeTool(t.function.name)).map(
      (t) => t.function.name,
    );
    expect(huerfanos, `tools sin mapeo a dominio: ${huerfanos.join(", ")}`).toEqual([]);
  });

  it("todos los dominios de las tools están declarados en AGENT_DOMAINS", () => {
    const desconocidos = dominiosConTools.filter(
      (d) => !(AGENT_DOMAINS as readonly string[]).includes(d as string),
    );
    expect(desconocidos, `dominios fuera de AGENT_DOMAINS: ${desconocidos.join(", ")}`).toEqual([]);
  });
});

describe("cada tool tiene su permiso — si falta, el modelo dice «no tengo permiso»", () => {
  it("ninguna acción alcanzable queda sin mapping", () => {
    const sinPermiso: string[] = [];
    for (const tool of ALL_AGENT_TOOLS) {
      const mapa = resolveToolCall(tool.function.name);
      if (!mapa) continue;
      const permisosDelDominio = (
        AGENT_ACTION_PERMISSIONS as Record<string, Record<string, unknown>>
      )[mapa.domain];
      if (!permisosDelDominio?.[mapa.action]) {
        sinPermiso.push(`${tool.function.name} → ${mapa.domain}.${mapa.action}`);
      }
    }
    expect(sinPermiso, `sin permiso (fallan en silencio): ${sinPermiso.join(" · ")}`).toEqual([]);
  });
});

describe("cada dominio con tools es alcanzable desde una frase", () => {
  /**
   * `ui` no tiene vocabulario a propósito: sus tools se ofrecen siempre, no por
   * palabras. Cualquier otro dominio sin vocabulario es inalcanzable — el
   * modelo nunca recibe sus herramientas y contesta «no puedo hacer eso».
   */
  const SIN_VOCABULARIO_A_PROPOSITO = new Set(["ui"]);

  it("ningún dominio con tools quedó con el diccionario vacío", () => {
    const conteo = palabrasPorDominio();
    const mudos = dominiosConTools.filter(
      (d) => !SIN_VOCABULARIO_A_PROPOSITO.has(d as string) && (conteo[d] ?? 0) === 0,
    );
    expect(
      mudos,
      `dominios inalcanzables desde el chat (el modelo dirá «no puedo hacer eso»): ${mudos.join(", ")}`,
    ).toEqual([]);
  });

  it("los dominios que el negocio usa a diario responden a su frase típica", () => {
    const frasesReales: Array<[string, string]> = [
      ["plata", "anotame 25 galones de petróleo para el camión"],
      ["agenda", "recordame el lunes llamar al ingeniero"],
      ["inventory", "¿cuánto stock queda de arroz?"],
      ["cobranzas", "¿quién me debe plata?"],
      ["forestal", "¿cuántas trozas hay en el patio?"],
      ["documentos", "buscame el contrato de alquiler"],
      ["caja", "¿cómo viene la caja hoy?"],
      ["orders", "¿qué pedidos tengo?"],
    ];
    const fallan = frasesReales.filter(
      ([dominio, frase]) => !dominiosMencionados(frase).includes(dominio as never),
    );
    expect(
      fallan.map(([d, f]) => `${d} ← «${f}»`),
      "dominios que su propia frase típica no activa",
    ).toEqual([]);
  });
});

describe("las escrituras piden confirmación humana", () => {
  /**
   * Una tool que escribe sin `requiresApproval` ejecuta apenas el modelo la
   * elige. Para plata y agenda eso significa un asiento —o un compromiso— que
   * nadie confirmó.
   */
  it("toda tool de plata que registra o mueve algo pide aprobación", () => {
    const escrituras = ALL_AGENT_TOOLS.filter((t) => {
      const m = resolveToolCall(t.function.name);
      return m?.domain === "plata" && /^(registrar|cobrar|liquidar|mover)/.test(m.action);
    });
    expect(escrituras.length).toBeGreaterThan(0);
    const sinGate = escrituras
      .filter((t) => !isToolApprovalRequired(t.function.name))
      .map((t) => t.function.name);
    expect(sinGate, `escriben plata sin confirmación: ${sinGate.join(", ")}`).toEqual([]);
  });

  it("agendar y completar piden aprobación; consultar no", () => {
    expect(isToolApprovalRequired("agenda_agendar")).toBe(true);
    expect(isToolApprovalRequired("agenda_completar")).toBe(true);
    expect(isToolApprovalRequired("agenda_ver")).toBe(false);
  });
});

describe("presupuesto de tokens del catálogo", () => {
  /**
   * El free tier de Groq son 8.000 tokens POR MINUTO y el catálogo de tools
   * viaja en CADA llamada. Ya pasó una vez que una sola pregunta consumía el
   * minuto entero (ADR-390). Este tope no es estético: es la diferencia entre
   * que la segunda pregunta de una conversación funcione o muera con 429.
   */
  /** El techo real del free tier de Groq: 8.000 tokens por minuto. */
  const TECHO_POR_MINUTO = 8_000;

  it("una frase típica manda MUCHO menos que el catálogo entero", () => {
    // Este es el caso real: `tool-routing` recorta por vocabulario. Si el
    // recorte dejara de funcionar, una sola pregunta volvería a comerse el
    // minuto y la segunda moriría con 429 (ADR-390).
    const completo = Math.round(JSON.stringify(ALL_AGENT_TOOLS).length / 4);
    const ruteado = Math.round(
      JSON.stringify(toolsParaMensaje("anotame 25 galones de petróleo para el camión N12")).length / 4,
    );
    expect(ruteado, `ruteado ~${ruteado} tok vs catálogo ~${completo} tok`).toBeLessThan(completo / 2);
    expect(ruteado, "una sola frase no puede comerse medio minuto").toBeLessThan(TECHO_POR_MINUTO / 2);
  });

  it("avisa si el catálogo completo se acerca al techo del minuto", () => {
    const tokens = Math.round(JSON.stringify(ALL_AGENT_TOOLS).length / 4);
    // Medido 2026-09-05: 62 tools ≈ 7.029 tokens, o sea el 88% del minuto.
    // Ya está cerca; este tope existe para que sumar tools sin comprimir sus
    // descripciones falle acá y no en producción con un 429.
    expect(
      tokens,
      `el catálogo pesa ~${tokens} tok y el minuto entero son ${TECHO_POR_MINUTO}`,
    ).toBeLessThan(TECHO_POR_MINUTO);
  });
});
