/**
 * Lo que el atajo de papeles NO reconoce va a `conversar`, que también tiene
 * herramientas del Archivo (`documentos_buscar`, `documentos_por_vencer`).
 * Hasta el 22-10 ese camino corría con rol «admin» fijo: «¿dónde está la
 * planilla de sueldos de octubre?» (cae a plata por «sueldos») le devolvía a
 * un encargado vinculado los NOMBRES de los papeles con candado.
 *
 * Acá `conversar` es el REAL (sólo el modelo y el orquestador son falsos): la
 * herramienta del Archivo tiene que recibir el rol ACTUAL de quien vinculó el
 * teléfono, y un «no autorizado» del permiso tiene que llegarle al modelo en
 * palabras de persona, igual que en el panel.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const H = vi.hoisted(() => ({
  callLLM: vi.fn(),
  executeSync: vi.fn(),
  mandarTexto: vi.fn(),
  rolActual: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/llm-router", () => ({ callLLM: H.callLLM }));
vi.mock("@/lib/agents", () => ({
  orchestrator: { executeSync: H.executeSync },
  ensureAgentsRegistered: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/agents/pending-approvals", () => ({
  getPendingApproval: vi.fn(),
  removePendingApproval: vi.fn(),
  stashPendingApproval: vi.fn().mockReturnValue("pend-1"),
}));
vi.mock("@/lib/asistente/contexto", () => ({ contextoDelNegocio: vi.fn().mockResolvedValue("") }));
vi.mock("@/lib/asistente/memoria", () => ({
  recordar: vi.fn().mockReturnValue([]),
  anotarTurno: vi.fn(),
  olvidar: vi.fn(),
  anotarHecho: vi.fn(),
}));
vi.mock("@/lib/asistente/negocio", () => ({ nombreDelNegocio: vi.fn().mockResolvedValue("Bodega") }));
vi.mock("@/lib/db/whatsapp-duenos.db", () => ({
  WhatsAppDuenosDB: { marcarUso: vi.fn().mockResolvedValue(undefined), desvincular: vi.fn(), rolActual: H.rolActual },
}));
vi.mock("@/lib/db/tenants.db", () => ({ TenantsDB: { getBasicById: vi.fn().mockResolvedValue({ name: "Bodega" }) } }));
vi.mock("@/lib/db/documents.db", () => ({
  DocumentsDB: { list: vi.fn().mockResolvedValue([]), carpetasParaBuscar: vi.fn().mockResolvedValue([]), log: vi.fn() },
}));
vi.mock("@/lib/documents/storage", () => ({
  downloadFromStorage: vi.fn(),
  buildStoragePath: vi.fn(),
  uploadToStorage: vi.fn(),
  deleteFromStorage: vi.fn(),
  isMimeAllowed: vi.fn(),
}));
vi.mock("@/lib/documents/precalcular-miniatura", () => ({ precalcularMiniatura: vi.fn() }));
vi.mock("@/lib/documents/cola-analisis", () => ({ enColaDeAnalisis: vi.fn() }));
vi.mock("@/lib/documents/analyze-document", () => ({ analyzeDocumentContent: vi.fn() }));
vi.mock("@/lib/whatsapp/bot-dueno", () => ({
  bajarMedia: vi.fn(),
  bajarMediaConTope: vi.fn(),
  mandarTexto: H.mandarTexto,
  mandarBotones: vi.fn().mockResolvedValue(true),
  mandarArchivo: vi.fn(),
}));
vi.mock("@/lib/ai/transcribir", () => ({ transcribirAudio: vi.fn() }));

const { manejarMensajeDeDueno } = await import("@/lib/whatsapp/anotar");

const base = { tenantId: "t-a", telefono: "51911111111", nombre: "Juan", cred: { phoneNumberId: "pn-a", token: "tok" } };
const PREGUNTA = "¿dónde está la planilla de sueldos de octubre?";

/** El modelo pide buscar en el Archivo y, con lo que vuelva, contesta. */
function modeloQueBuscaEnElArchivo() {
  H.callLLM
    .mockResolvedValueOnce({
      ok: true,
      content: "",
      toolCalls: [
        { id: "call-1", type: "function", function: { name: "documentos_buscar", arguments: '{"texto":"planilla sueldos octubre"}' } },
      ],
    })
    .mockResolvedValueOnce({ ok: true, content: "Listo.", toolCalls: [] });
}

/** Lo que la herramienta le devolvió al modelo en la segunda vuelta. */
function loQueVolvioDeLaHerramienta(): string {
  const mensajes = H.callLLM.mock.calls[1][1].messages as Array<{ role: string; tool_call_id?: string; content: string }>;
  return mensajes.find((m) => m.role === "tool" && m.tool_call_id === "call-1")?.content ?? "";
}

beforeEach(() => {
  H.callLLM.mockReset();
  H.executeSync.mockReset();
  H.mandarTexto.mockReset().mockResolvedValue(true);
  H.rolActual.mockReset().mockResolvedValue({ rol: "manager" });
});

describe("conversar corre con el rol ACTUAL del teléfono", () => {
  it("encargado: la herramienta del Archivo recibe rol manager, no admin", async () => {
    modeloQueBuscaEnElArchivo();
    H.executeSync.mockResolvedValueOnce({ success: true, data: { documentos: [] } });

    await manejarMensajeDeDueno({ ...base, texto: PREGUNTA });

    expect(H.rolActual).toHaveBeenCalledWith("t-a", base.telefono);
    expect(H.executeSync).toHaveBeenCalledTimes(1);
    expect(H.executeSync.mock.calls[0][0]).toMatchObject({ domain: "documentos", tenantId: "t-a", actorRole: "manager" });
  });

  it("un rol al que el permiso le dice que no recibe el mismo «no autorizado» del panel", async () => {
    H.rolActual.mockResolvedValue({ rol: "cajero" });
    modeloQueBuscaEnElArchivo();
    H.executeSync.mockResolvedValueOnce({ success: false, error: 'FORBIDDEN: role "cajero" lacks read:documents' });

    await manejarMensajeDeDueno({ ...base, texto: PREGUNTA });

    expect(H.executeSync.mock.calls[0][0].actorRole).toBe("cajero");
    const devuelto = loQueVolvioDeLaHerramienta();
    expect(devuelto).toContain("No autorizado");
    expect(devuelto).not.toContain("FORBIDDEN");
  });

  it("vínculo cuyo autor ya no está activo: ni el modelo ni las herramientas corren", async () => {
    H.rolActual.mockResolvedValue({ revocado: true });

    await manejarMensajeDeDueno({ ...base, texto: PREGUNTA });

    expect(H.callLLM).not.toHaveBeenCalled();
    expect(H.executeSync).not.toHaveBeenCalled();
    expect(String(H.mandarTexto.mock.calls[0][2])).toContain("necesita volver a vincularse");
  });
});
