/**
 * Rondas de `conversar()` (Buleje IA, ADR-528) — dos fallas que el revisor
 * encontró el 01-11:
 *
 * 1. El modelo pide más herramientas de las que se contestan por ronda: si el
 *    mensaje guardado lleva las 6 llamadas y solo 5 tienen resultado, OpenAI y
 *    Claude devuelven 400 y, como queda en la memoria de 30 min, el bot queda
 *    mudo en esa conversación.
 * 2. El modelo propio del negocio se cae y se usa la plataforma: las rondas
 *    siguientes del MISMO turno no lo vuelven a esperar.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const H = vi.hoisted(() => ({ llm: vi.fn(), executeSync: vi.fn() }));

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/ia-proveedores/router-negocio", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/ia-proveedores/router-negocio")>();
  return { ...real, callLLMDelNegocio: H.llm };
});
vi.mock("@/lib/agents", () => ({
  orchestrator: { executeSync: H.executeSync },
  ensureAgentsRegistered: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/asistente/contexto", () => ({ contextoDelNegocio: vi.fn().mockResolvedValue("") }));
vi.mock("@/lib/asistente/memoria", () => ({ recordar: vi.fn().mockReturnValue([]), anotarTurno: vi.fn() }));

const { conversar } = await import("@/lib/asistente/conversar");

const PLATAFORMA = { proveedor: "groq", modelo: "x", deLaPlataforma: true };
const PROPIO = { proveedor: "openai", modelo: "gpt", deLaPlataforma: false };

const respuesta = (over: Record<string, unknown>) => ({
  ok: true,
  content: null,
  toolCalls: null,
  usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
  body: null,
  provider: "groq",
  model: "x",
  modeloUsado: PROPIO,
  ...over,
});

const llamada = (n: number) => ({
  id: `call_${n}`,
  function: { name: "memoria_buscar", arguments: JSON.stringify({ texto: `cosa ${n}` }) },
});

const turno = {
  tenantId: "t1",
  sesionId: "app:prueba",
  texto: "¿qué sabes del camión?",
  actorRole: "admin" as const,
  solicitante: "qa",
  canal: "app",
};

type Mensaje = { role: string; tool_call_id?: string; tool_calls?: Array<{ id: string }> };

beforeEach(() => {
  H.llm.mockReset();
  H.executeSync.mockReset();
  H.executeSync.mockResolvedValue({ success: true, data: { items: [] } });
});

describe("conversar — cada llamada guardada tiene su resultado", () => {
  it("con 6 llamadas en una ronda, guarda y contesta las mismas (ninguna queda huérfana)", async () => {
    H.llm
      .mockResolvedValueOnce(respuesta({ toolCalls: [1, 2, 3, 4, 5, 6].map(llamada) }))
      .mockResolvedValueOnce(respuesta({ content: "No tengo nada del camión todavía." }));

    const r = await conversar(turno);

    expect(r.texto).toBe("No tengo nada del camión todavía.");
    const mensajes = H.llm.mock.calls[1][2].messages as Mensaje[];
    const pedidas = mensajes.flatMap((m) => (m.role === "assistant" ? (m.tool_calls ?? []).map((t) => t.id) : []));
    const contestadas = new Set(mensajes.filter((m) => m.role === "tool").map((m) => m.tool_call_id));
    expect(pedidas.length).toBeGreaterThan(0);
    for (const id of pedidas) expect(contestadas.has(id)).toBe(true);
    expect(pedidas).not.toContain("call_6");
  });
});

describe("conversar — el modelo propio caído no se vuelve a esperar en el mismo turno", () => {
  it("tras caer a la plataforma, la ronda siguiente pide saltarPropio", async () => {
    H.llm
      .mockResolvedValueOnce(respuesta({ toolCalls: [llamada(1)], modeloUsado: PLATAFORMA, estadoPropio: "limite_ia" }))
      .mockResolvedValueOnce(respuesta({ content: "Listo.", modeloUsado: PLATAFORMA }));

    await conversar(turno);

    expect(H.llm.mock.calls[0][3]).toMatchObject({ saltarPropio: false });
    expect(H.llm.mock.calls[1][3]).toMatchObject({ saltarPropio: true });
  });

  it("si el propio contestó bien, sigue usándolo", async () => {
    H.llm
      .mockResolvedValueOnce(respuesta({ toolCalls: [llamada(1)], estadoPropio: "ok" }))
      .mockResolvedValueOnce(respuesta({ content: "Listo." }));

    await conversar(turno);

    expect(H.llm.mock.calls[1][3]).toMatchObject({ saltarPropio: false });
  });
});
