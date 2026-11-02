/**
 * Dos «Sí» al mismo pendiente al mismo tiempo (doble clic, dos pestañas, el
 * reintento del webhook) anotaban el gasto DOS veces: los 4 caminos leían el
 * pendiente, esperaban al orquestador y recién después lo borraban (ADR-528).
 *
 * Acá el store de pendientes es el REAL; solo el orquestador es falso, y tarda
 * para que las dos confirmaciones se crucen de verdad.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const H = vi.hoisted(() => ({
  escrituras: 0,
  auth: { tenantId: "T1", username: "ana", role: "admin" } as Record<string, string>,
}));

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/agents", () => ({
  ensureAgentsRegistered: async () => {},
  orchestrator: {
    executeSync: async () => {
      await new Promise((r) => setTimeout(r, 20));
      H.escrituras++;
      return { success: true, data: { confirmacion: "Gasto S/ 200 anotado" } };
    },
  },
}));
vi.mock("@/lib/asistente/memoria", () => ({ anotarHecho: vi.fn(), olvidar: vi.fn() }));
vi.mock("@/lib/asistente/negocio", () => ({ nombreDelNegocio: async () => "Bodega" }));
vi.mock("@/lib/asistente/conversar", () => ({ conversar: vi.fn(), errorParaLaPersona: (e: unknown) => String(e) }));
vi.mock("@/lib/ai/transcribir", () => ({ transcribirAudio: vi.fn() }));
vi.mock("@/lib/db/tenants.db", () => ({ TenantsDB: { getBasicById: async () => ({ name: "Bodega" }) } }));
vi.mock("@/lib/db/ia-conversaciones.db", () => ({}));
// Panel (approvals)
vi.mock("@/lib/require-admin", () => ({ requireAdmin: async () => H.auth }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
// Telegram
vi.mock("@/lib/telegram/bot", () => ({
  secretoValido: () => true,
  botConfigurado: () => true,
  mandarMensaje: vi.fn(async () => {}),
  editarMensaje: vi.fn(async () => {}),
  contestarBoton: vi.fn(async () => {}),
  mostrarEscribiendo: vi.fn(async () => {}),
  bajarArchivo: vi.fn(),
  esc: (s: string) => s,
}));
vi.mock("@/lib/db/telegram.db", () => ({ TelegramDB: { tenantDeChat: async () => "T1", marcarUso: async () => {} } }));
vi.mock("@/lib/telegram/vinculacion", () => ({ canjearCodigo: vi.fn() }));
// WhatsApp
vi.mock("@/lib/db/whatsapp-duenos.db", () => ({
  WhatsAppDuenosDB: { rolActual: async () => ({ rol: "admin", usuario: "ana" }), marcarUso: async () => {} },
}));
vi.mock("@/lib/whatsapp/bot-dueno", () => ({
  bajarMedia: vi.fn(),
  mandarTexto: vi.fn(async () => true),
  mandarBotones: vi.fn(async () => true),
}));
vi.mock("@/lib/whatsapp/archivar-papel", () => ({
  MENSAJE_NO_GUARDADO: "",
  analizarYOrdenar: vi.fn(),
  archivarPapel: vi.fn(),
  autorDeWhatsApp: vi.fn(),
  mensajeGuardado: vi.fn(),
  mensajeMovido: vi.fn(),
  ordenDeGuardar: vi.fn(),
}));
vi.mock("@/lib/whatsapp/preguntar-archivo", () => ({ leerPreguntaDePapeles: vi.fn() }));

const { stashPendingApproval, getPendingApproval, _clearApprovalsStore } = await import("@/lib/agents/pending-approvals");
const { resolverAprobacion } = await import("@/lib/asistente/confirmar-app");
const approvals = await import("@/app/api/ai-assistant/approvals/route");
const telegram = await import("@/app/api/integrations/telegram/webhook/route");
const { manejarMensajeDeDueno } = await import("@/lib/whatsapp/anotar");

const nuevoPendiente = (tenantId = "T1") =>
  stashPendingApproval({
    tenantId,
    toolName: "registrar_gasto",
    domain: "plata",
    action: "registrar_gasto",
    payload: { monto: 200 },
    requestedBy: "ana",
  });

beforeEach(() => {
  _clearApprovalsStore();
  H.escrituras = 0;
  H.auth = { tenantId: "T1", username: "ana", role: "admin" };
});

describe("dos confirmaciones simultáneas = UNA escritura", () => {
  it("chat de la app (confirmar-app)", async () => {
    const id = nuevoPendiente();
    const args = { tenantId: "T1", username: "ana", role: "admin", conversacionId: "c1", aprobacionId: id, decision: "aprobar" as const };
    const [a, b] = await Promise.all([resolverAprobacion(args), resolverAprobacion(args)]);
    expect(H.escrituras).toBe(1);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect(getPendingApproval(id)).toBeNull();
  });

  it("chat de la app: otro negocio = 403 y el pendiente SIGUE para su dueño", async () => {
    const id = nuevoPendiente("T2");
    const r = await resolverAprobacion({ tenantId: "T1", username: "ana", role: "admin", conversacionId: "c1", aprobacionId: id, decision: "aprobar" });
    expect(r).toMatchObject({ ok: false, status: 403 });
    expect(getPendingApproval(id)).not.toBeNull();
    expect(H.escrituras).toBe(0);
  });

  it("chat de la app: pendiente de OTRA persona del mismo negocio = 403 y no se borra", async () => {
    const id = nuevoPendiente();
    const r = await resolverAprobacion({ tenantId: "T1", username: "beto", role: "admin", conversacionId: "c1", aprobacionId: id, decision: "aprobar" });
    expect(r).toMatchObject({ ok: false, status: 403 });
    expect(getPendingApproval(id)).not.toBeNull();
    expect(H.escrituras).toBe(0);
  });

  it("panel (POST /api/ai-assistant/approvals)", async () => {
    const id = nuevoPendiente();
    const pedir = () =>
      approvals.POST(
        new NextRequest("http://localhost/api/ai-assistant/approvals", {
          method: "POST",
          body: JSON.stringify({ id, action: "approve" }),
          headers: { "content-type": "application/json" },
        }),
      );
    const [a, b] = await Promise.all([pedir(), pedir()]);
    expect(H.escrituras).toBe(1);
    expect([a.status, b.status].sort()).toEqual([200, 404]);
  });

  it("panel: otro negocio = 403 y el pendiente sigue", async () => {
    const id = nuevoPendiente("T2");
    const r = await approvals.POST(
      new NextRequest("http://localhost/api/ai-assistant/approvals", {
        method: "POST",
        body: JSON.stringify({ id, action: "approve" }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(r.status).toBe(403);
    expect(getPendingApproval(id)).not.toBeNull();
  });

  it("Telegram (botón Confirmar tocado dos veces)", async () => {
    const id = nuevoPendiente();
    const toque = (n: number) =>
      telegram.POST(
        new NextRequest("http://localhost/api/integrations/telegram/webhook", {
          method: "POST",
          body: JSON.stringify({
            update_id: n,
            callback_query: { id: `cb${n}`, data: `ok:${id}`, message: { message_id: 7, chat: { id: 99 } } },
          }),
        }),
      );
    await Promise.all([toque(1), toque(2)]);
    expect(H.escrituras).toBe(1);
  });

  it("WhatsApp (botón Sí tocado dos veces)", async () => {
    const id = nuevoPendiente();
    const toque = () =>
      manejarMensajeDeDueno({
        tenantId: "T1",
        telefono: "51911111111",
        nombre: "Ana",
        cred: { phoneNumberId: "pn", token: "tok" },
        texto: "",
        botonId: `anotar-ok:${id}`,
      } as Parameters<typeof manejarMensajeDeDueno>[0]);
    await Promise.all([toque(), toque()]);
    expect(H.escrituras).toBe(1);
  });
});
