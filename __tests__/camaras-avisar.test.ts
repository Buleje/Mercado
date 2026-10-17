/**
 * Aviso de cámara por WhatsApp (`avisarSiCorresponde`) con la cuenta DEL
 * NEGOCIO: el número del bot si tiene uno activo, la del servidor si no. Sólo
 * se marca «avisada» (lo que frena el próximo aviso) si Meta lo aceptó; sólo
 * se reintenta lo pasajero.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  configs: [] as Record<string, unknown>[],
  configsPedidas: [] as string[],
  marcadas: [] as { tenantId: string; camaraId: string }[],
}));

vi.mock("@/lib/db/whatsapp-messages.db", () => ({
  listWhatsAppConfigs: async (tenantId: string) => {
    H.configsPedidas.push(tenantId);
    return H.configs;
  },
}));
vi.mock("@/lib/whatsapp/templates", () => ({ getApprovedTemplates: async () => [] }));
vi.mock("@/lib/logger", () => ({ logger: { warn: () => {}, error: () => {}, info: () => {}, debug: () => {} } }));
vi.mock("@/lib/camaras/camaras", () => ({
  debeAvisar: () => true,
  textoDelAviso: () => "📷 Portón: se ve una persona\nMíralo en el panel",
}));
vi.mock("@/lib/db/camaras.db", () => ({
  CamarasDB: {
    list: async () => [camara],
    marcarAvisada: async (tenantId: string, camaraId: string) => {
      H.marcadas.push({ tenantId, camaraId });
    },
  },
}));

const camara = { id: "cam-porton", nombre: "Portón", avisos: { whatsapp: "987 654 675", cuando: "siempre" } };

import { avisarSiCorresponde } from "@/lib/camaras/avisar";
import type { Camara } from "@/lib/camaras/camaras";

const TOKEN = "tok-negocio-camaras-123456";
let llamadas: { url: string; auth: string; body: { to: string; type: string } }[] = [];
let respuestas: Array<() => Response> = [];

const captura = { id: "cap-1", lectura: { personas: 1 } } as unknown as Parameters<typeof avisarSiCorresponde>[2];

beforeEach(() => {
  H.configs = [];
  H.configsPedidas = [];
  H.marcadas = [];
  llamadas = [];
  respuestas = [];
  vi.stubEnv("WHATSAPP_API_URL", "https://graph.facebook.com/v17.0/999/messages");
  vi.stubEnv("WHATSAPP_API_TOKEN", "tok-servidor-000000000");
  vi.stubEnv("WHATSAPP_PLANTILLA_AVISOS", "");
  vi.stubGlobal("fetch", async (url: string, init: RequestInit & { headers: Record<string, string> }) => {
    llamadas.push({ url, auth: init.headers.Authorization, body: JSON.parse(String(init.body)) });
    const r = respuestas.shift();
    return r ? r() : new Response(JSON.stringify({ messages: [{ id: "wamid.CAM" }] }), { status: 200 });
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("avisarSiCorresponde — WhatsApp con la cuenta del negocio", () => {
  it("con número del negocio activo: sale por él, al teléfono de la cámara, y queda marcada", async () => {
    H.configs = [{ tenantId: "t-blas", phoneNumberId: "1256186244239842", whatsappToken: TOKEN, wabaId: null, isActive: true }];
    await avisarSiCorresponde("t-blas", camara as unknown as Camara, captura);
    expect(H.configsPedidas).toEqual(["t-blas"]);
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].url).toBe("https://graph.facebook.com/v21.0/1256186244239842/messages");
    expect(llamadas[0].auth).toBe(`Bearer ${TOKEN}`);
    expect(llamadas[0].body).toMatchObject({ to: "51987654675", type: "text" });
    expect(H.marcadas).toEqual([{ tenantId: "t-blas", camaraId: "cam-porton" }]);
  });

  it("sin número del negocio cae a la cuenta del servidor", async () => {
    await avisarSiCorresponde("t-blas", camara as unknown as Camara, captura);
    expect(llamadas[0].url).toBe("https://graph.facebook.com/v17.0/999/messages");
    expect(H.marcadas).toHaveLength(1);
  });

  it("un rechazo de Meta (131030) no se reintenta ni marca la cámara", async () => {
    H.configs = [{ tenantId: "t-blas", phoneNumberId: "1256186244239842", whatsappToken: TOKEN, wabaId: null, isActive: true }];
    respuestas = [
      () =>
        new Response(JSON.stringify({ error: { message: "(#131030) Recipient phone number not in allowed list", code: 131030, type: "OAuthException" } }), {
          status: 400,
        }),
    ];
    await avisarSiCorresponde("t-blas", camara as unknown as Camara, captura);
    expect(llamadas).toHaveLength(1);
    expect(H.marcadas).toHaveLength(0);
  });

  it("un 503 pasajero se reintenta (como el viejo `WithRetry`) y al salir queda marcada", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    H.configs = [{ tenantId: "t-blas", phoneNumberId: "1256186244239842", whatsappToken: TOKEN, wabaId: null, isActive: true }];
    respuestas = [() => new Response("Service Unavailable", { status: 503 })];
    const p = avisarSiCorresponde("t-blas", camara as unknown as Camara, captura);
    await vi.advanceTimersByTimeAsync(2000);
    await p;
    expect(llamadas).toHaveLength(2);
    expect(H.marcadas).toHaveLength(1);
  });
});
