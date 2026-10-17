// @vitest-environment node
/**
 * Webhook de WhatsApp (security 11-10):
 * - un mensaje re-entregado por Meta (mismo waMessageId) no hace contestar ni
 *   gastar IA otra vez;
 * - tope por clienta: 20 mensajes cada 10 min por negocio + teléfono; al 21 un
 *   aviso amable, después silencio. Otra clienta del mismo negocio sigue normal.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  append: vi.fn(),
  concierge: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenantWhatsAppConfig: {
      findFirst: vi.fn().mockResolvedValue({
        tenantId: "tenant-musa",
        phoneNumberId: "pn-musa",
        whatsappToken: "tok",
        businessName: "Musa",
        yapeNumber: null,
        isActive: true,
      }),
    },
    tenant: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));
vi.mock("@/lib/db/whatsapp-messages.db", () => ({
  WhatsAppMessagesDB: { append: H.append },
  getBotPausedPhones: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/whatsapp/concierge/concierge-router", () => ({ handleIncomingMessage: H.concierge }));
vi.mock("@/lib/whatsapp/conversation-engine", () => ({ processMessage: vi.fn() }));
vi.mock("@/lib/whatsapp/aviso-fuera-de-horario", () => ({ avisarSiEstaCerrado: vi.fn() }));
vi.mock("@/lib/whatsapp/anotar", () => ({
  pareceVinculacion: vi.fn(() => null),
  intentarVincular: vi.fn(),
  manejarMensajeDeDueno: vi.fn(),
}));
vi.mock("@/lib/db/whatsapp-duenos.db", () => ({ WhatsAppDuenosDB: { puedeAnotar: vi.fn().mockResolvedValue(false) } }));
vi.mock("@/lib/sse-emitter", () => ({ emitAdminSSE: vi.fn() }));
vi.mock("@/lib/push-sender", () => ({ sendPushToPhone: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { processWebhookPayload } from "@/app/api/whatsapp/webhook/route";

let n = 0;
function payload(from: string, texto: string, id = `wamid-${++n}`): string {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "51921585006", phone_number_id: "pn-musa" },
              messages: [{ from, id, timestamp: "1760000000", type: "text", text: { body: texto } }],
            },
          },
        ],
      },
    ],
  });
}

const textosEnviados = () =>
  (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => JSON.parse(String(c[1]?.body)).text?.body as string);

beforeEach(() => {
  vi.clearAllMocks();
  H.append.mockImplementation(async (_t: string, d: { direction: string }) => ({ id: "m", customerName: null, ...d }));
  H.concierge.mockResolvedValue({ reply: "¡Hola, linda!", state: "browsing", escalated: false });
  global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "" } as Response);
});

describe("webhook de WhatsApp — re-entrega", () => {
  it("el mismo mensaje entregado dos veces se contesta una sola", async () => {
    await processWebhookPayload(payload("51911111111", "hola", "wamid-repetido"));
    // Segunda entrega: la base lo reconoce por waMessageId (append → null).
    H.append.mockImplementationOnce(async () => null);
    await processWebhookPayload(payload("51911111111", "hola", "wamid-repetido"));

    expect(H.concierge).toHaveBeenCalledTimes(1);
    expect(textosEnviados()).toEqual(["¡Hola, linda!"]);
  });
});

describe("webhook de WhatsApp — tope por clienta", () => {
  it("20 mensajes pasan; el 21 recibe un aviso; el 22 silencio; otra clienta sigue", async () => {
    const insistente = "51922222222";
    for (let i = 0; i < 20; i++) await processWebhookPayload(payload(insistente, `msg ${i}`));
    expect(H.concierge).toHaveBeenCalledTimes(20);

    await processWebhookPayload(payload(insistente, "msg 21"));
    await processWebhookPayload(payload(insistente, "msg 22"));
    expect(H.concierge).toHaveBeenCalledTimes(20);
    const enviados = textosEnviados();
    expect(enviados.filter((t) => t.startsWith("Recibimos varios mensajes seguidos"))).toHaveLength(1);
    expect(enviados).toHaveLength(21);
    // Los 22 quedaron en la bandeja (más el aviso como saliente).
    expect(H.append.mock.calls.filter((c) => c[1].direction === "in")).toHaveLength(22);

    await processWebhookPayload(payload("51933333333", "hola"));
    expect(H.concierge).toHaveBeenCalledTimes(21);
  });
});
