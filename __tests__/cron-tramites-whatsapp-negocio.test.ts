/**
 * Cron `tramites-vencimiento` con el WhatsApp DEL NEGOCIO.
 *
 * El `tenantId` de los trámites viene mixto (cuid o slug): la config del
 * número (`TenantWhatsAppConfig`) se guarda con el cuid, así que el cron tiene
 * que buscarla con `tenant.id`, no con lo que trae la fila. Sólo sella el
 * trámite si Meta lo aceptó; el texto libre se cuenta aparte.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  configsPedidas: [] as string[],
  plantillas: [] as { name: string; language: string; category: string; body: string; paramCount: number }[],
  sellados: [] as { tenantId: string; ids: string[] }[],
}));

vi.mock("@/lib/cron-auth", () => ({
  withCronAuth: (_n: string, h: () => Promise<Response>) => h,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: {
      findFirst: async () => ({ id: "cuid-blas", ownerPhone: "+51 987 654 675" }),
    },
  },
}));
vi.mock("@/lib/db/forest-tramites.db", () => ({
  ForestTramitesDB: {
    listAllTenants: async () => [{ tenantId: "blas-slug", tramites: [{ id: "tr-1" }, { id: "tr-2" }] }],
    marcarAvisoVencimientoEnviado: async (tenantId: string, ids: string[]) => {
      H.sellados.push({ tenantId, ids });
    },
  },
}));
vi.mock("@/lib/forestal/tramites-registro", () => ({
  tramitesPorVencer: (t: { id: string }[]) => t.map((x) => ({ ...x, diasRestantes: 2 })),
}));
vi.mock("@/lib/forestal/tramites-aviso-mensaje", () => ({
  mensajeAvisoTramites: () => "⏰ Trámites por vencer\n• Permiso — vence en 2 días",
}));
vi.mock("@/lib/db/whatsapp-messages.db", () => ({
  listWhatsAppConfigs: async (tenantId: string) => {
    H.configsPedidas.push(tenantId);
    return tenantId === "cuid-blas"
      ? [{ tenantId, phoneNumberId: "1256186244239842", whatsappToken: "tok-blas-0123456789", wabaId: "waba-1", isActive: true }]
      : [];
  },
}));
vi.mock("@/lib/whatsapp/templates", () => ({ getApprovedTemplates: async () => H.plantillas }));
vi.mock("@/lib/logger", () => ({ logger: { warn: () => {}, error: () => {}, info: () => {}, debug: () => {} } }));

import { GET } from "@/app/api/cron/tramites-vencimiento/route";

let llamadas: { url: string; body: { type: string; template?: { name: string } } }[] = [];
let respuesta: () => Response;

const correr = async () => (await GET({} as never)).json() as Promise<Record<string, number>>;

beforeEach(() => {
  H.configsPedidas = [];
  H.plantillas = [];
  H.sellados = [];
  llamadas = [];
  respuesta = () => new Response(JSON.stringify({ messages: [{ id: "wamid.TRAMITE" }] }), { status: 200 });
  vi.stubEnv("WHATSAPP_API_URL", "https://graph.facebook.com/v17.0/999/messages");
  vi.stubEnv("WHATSAPP_API_TOKEN", "tok-servidor-000000000");
  vi.stubEnv("WHATSAPP_PLANTILLA_AVISOS", "");
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    llamadas.push({ url, body: JSON.parse(String(init.body)) });
    return respuesta();
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("cron tramites-vencimiento — WhatsApp del negocio", () => {
  it("busca la cuenta con el cuid (no el slug de la fila), sale por el número del negocio y sella", async () => {
    const r = await correr();
    expect(H.configsPedidas).toEqual(["cuid-blas"]);
    expect(llamadas[0].url).toBe("https://graph.facebook.com/v21.0/1256186244239842/messages");
    expect(llamadas[0].body.type).toBe("text");
    expect(H.sellados).toEqual([{ tenantId: "blas-slug", ids: ["tr-1", "tr-2"] }]);
    expect(r).toMatchObject({ whatsappEnviados: 1, whatsappSinGarantia: 1, whatsappFallidos: 0 });
  });

  it("con la plantilla aprobada sale como plantilla y no cuenta como «sin garantía»", async () => {
    H.plantillas = [{ name: "aviso_libro_ctp", language: "es", category: "UTILITY", body: "Aviso: {{1}}. Buleje", paramCount: 1 }];
    const r = await correr();
    expect(llamadas[0].body).toMatchObject({ type: "template", template: { name: "aviso_libro_ctp" } });
    expect(r).toMatchObject({ whatsappEnviados: 1, whatsappSinGarantia: 0 });
  });

  it("si Meta lo rechaza no sella: mañana lo vuelve a intentar", async () => {
    respuesta = () =>
      new Response(JSON.stringify({ error: { message: "(#131030) Recipient phone number not in allowed list", code: 131030 } }), { status: 400 });
    const r = await correr();
    expect(H.sellados).toHaveLength(0);
    expect(r).toMatchObject({ whatsappEnviados: 0, whatsappFallidos: 1 });
  });
});
