/**
 * «Manda la resolución a Alex» por WhatsApp/Telegram/n8n del dueño: entra por
 * el atajo (sin el modelo) y queda SIEMPRE esperando el «Sí», aunque el canal
 * venga con `confirmarAutomatico` (n8n con `confirmar: true` ejecuta las demás
 * operaciones sin tarjeta; un papel que sale a un tercero no se deshace).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const H = vi.hoisted(() => ({ callLLM: vi.fn(), executeSync: vi.fn() }));

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/llm-router", () => ({ callLLM: H.callLLM }));
vi.mock("@/lib/agents", () => ({
  orchestrator: { executeSync: H.executeSync },
  ensureAgentsRegistered: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/asistente/contexto", () => ({ contextoDelNegocio: vi.fn().mockResolvedValue("") }));
vi.mock("@/lib/asistente/memoria", () => ({ recordar: vi.fn().mockReturnValue([]), anotarTurno: vi.fn() }));

const { conversar } = await import("@/lib/asistente/conversar");
const { getPendingApproval, _clearApprovalsStore } = await import("@/lib/agents/pending-approvals");

const ENSAYO_OK = {
  success: true,
  data: {
    resumen: '¿Mando "Resolución de plantación.pdf" a Alex Ríos (+51 9•• ••• 123)?',
    payloadConfirmado: { documentoId: "doc-1", telefono: "51987654123", nombre: "Alex Ríos" },
    mostrar: { Papel: "Resolución de plantación.pdf", Para: "Alex Ríos (+51 9•• ••• 123)" },
  },
};

const turno = (texto: string, confirmarAutomatico = false) => ({
  tenantId: "t1",
  sesionId: "n8n:prueba",
  texto,
  actorRole: "admin" as const,
  solicitante: "n8n:prueba",
  canal: "n8n",
  confirmarAutomatico,
});

beforeEach(() => {
  H.callLLM.mockReset();
  H.executeSync.mockReset();
  _clearApprovalsStore();
});

describe("mandar un papel desde la conversación del dueño", () => {
  it("con confirmarAutomatico IGUAL queda pendiente: sólo corre el ensayo, nunca el envío", async () => {
    H.executeSync.mockResolvedValueOnce(ENSAYO_OK);
    const r = await conversar(turno("manda la resolución de plantación a Alex", true));

    expect(H.callLLM).not.toHaveBeenCalled(); // el atajo no gasta tokens
    expect(H.executeSync).toHaveBeenCalledTimes(1);
    expect(H.executeSync.mock.calls[0][0]).toMatchObject({
      domain: "documentos",
      action: "mandar-papel",
      tenantId: "t1",
      actorRole: "admin",
      payload: { papel: "resolución de plantación", persona: "Alex", __validar: true },
    });
    expect(r.registradas).toEqual([]);
    expect(r.pendientes).toHaveLength(1);
    expect(r.pendientes[0]).toMatchObject({ tool: "documentos_mandar_papel", resumen: ENSAYO_OK.data.resumen });

    // Lo que se ejecuta tras el «Sí» es lo que el ensayo resolvió, no la frase.
    const pendiente = getPendingApproval(r.pendientes[0].id);
    expect(pendiente?.payload).toEqual(ENSAYO_OK.data.payloadConfirmado);
    expect(pendiente?.mostrar).toEqual(ENSAYO_OK.data.mostrar);
    expect(pendiente?.tenantId).toBe("t1");
  });

  it("si el ensayo pregunta «¿a cuál Alex?», esa es la respuesta y no queda nada pendiente", async () => {
    H.executeSync.mockResolvedValueOnce({ success: false, error: "Tengo 2 contactos que pueden ser «Alex»: … ¿A cuál?" });
    const r = await conversar(turno("manda la resolución de plantación a Alex"));
    expect(H.callLLM).not.toHaveBeenCalled();
    expect(r.texto).toContain("¿A cuál?");
    expect(r.pendientes).toEqual([]);
  });

  it("lo que no es mandar un papel sigue yendo al modelo", async () => {
    H.callLLM.mockResolvedValueOnce({ ok: true, content: "Hoy vendiste S/ 120.00.", toolCalls: null, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } });
    const r = await conversar(turno("mándale 50 soles a Alex"));
    expect(H.callLLM).toHaveBeenCalledTimes(1);
    expect(H.executeSync).not.toHaveBeenCalled();
    expect(r.texto).toBe("Hoy vendiste S/ 120.00.");
  });
});
