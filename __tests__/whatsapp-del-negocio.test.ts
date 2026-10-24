/**
 * WhatsApp del negocio (`enviarWhatsAppDelNegocio`): con qué cuenta sale, en
 * qué forma (plantilla o texto libre) y que el token no aparezca nunca en un
 * error ni en un log.
 *
 * Medido 26-09: la cuenta del servidor (entorno) daba 401 «Cannot parse access
 * token» y la del negocio en `TenantWhatsAppConfig` (la del bot) respondía 200.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  configs: [] as Record<string, unknown>[],
  configFalla: false,
  plantillas: [] as { name: string; language: string; category: string; body: string; paramCount: number }[],
  logs: [] as unknown[],
}));

vi.mock("@/lib/db/whatsapp-messages.db", () => ({
  listWhatsAppConfigs: async () => {
    if (H.configFalla) throw new Error("P1001 base caída");
    return H.configs;
  },
}));
vi.mock("@/lib/whatsapp/templates", () => ({
  getApprovedTemplates: async () => H.plantillas,
}));
vi.mock("@/lib/logger", () => {
  const guardar = (...a: unknown[]) => void H.logs.push(a);
  return { logger: { warn: guardar, error: guardar, info: guardar, debug: guardar } };
});

import { enviarWhatsAppDelNegocio, sinSecreto } from "@/lib/whatsapp-tenant";
import {
  aplanarParaPlantilla,
  describirEnvioWhatsApp,
  esFalloTransitorio,
  esTextoLibreSinGarantia,
  resumenEnvioWhatsApp,
  topeDelParametro,
} from "@/lib/whatsapp/aviso-plantilla";
import { explicarEnvioOk, explicarFalloEnvio } from "@/lib/forestal/reporte-diario";
import { comoArreglar } from "@/lib/forestal/estado-de-avisos";

const TOKEN_NEGOCIO = "tok-negocio-secreto-1234567890";
const TOKEN_SERVIDOR = "tok-servidor-roto-0987654321";

const configBlas = (extra: Record<string, unknown> = {}) => ({
  id: "wa-meta-test",
  tenantId: "t-blas",
  label: "Blas SAC",
  phoneNumberId: "1256186244239842",
  whatsappToken: TOKEN_NEGOCIO,
  webhookVerifyToken: "verif",
  wabaId: null,
  businessName: "Blas",
  yapeNumber: null,
  isActive: true,
  ...extra,
});

type Llamada = { url: string; init: RequestInit & { headers: Record<string, string> } };
let llamadas: Llamada[] = [];
let respuesta: () => Promise<Response> = async () =>
  new Response(JSON.stringify({ messages: [{ id: "wamid.HBgPRUEBA" }] }), { status: 200 });

interface CuerpoMeta {
  type: string;
  to: string;
  text?: { body: string };
  template?: { name: string; language: { code: string }; components: unknown[] };
}
const cuerpo = (i = 0) => JSON.parse(String(llamadas[i].init.body)) as CuerpoMeta;

beforeEach(() => {
  H.configs = [];
  H.configFalla = false;
  H.plantillas = [];
  H.logs = [];
  llamadas = [];
  respuesta = async () => new Response(JSON.stringify({ messages: [{ id: "wamid.HBgPRUEBA" }] }), { status: 200 });
  vi.stubEnv("WHATSAPP_API_URL", "https://graph.facebook.com/v17.0/999/messages");
  vi.stubEnv("WHATSAPP_API_TOKEN", TOKEN_SERVIDOR);
  vi.stubEnv("WHATSAPP_PLANTILLA_AVISOS", "");
  vi.stubEnv("WHATSAPP_PLANTILLA_IDIOMA", "");
  vi.stubGlobal("fetch", async (url: string, init: Llamada["init"]) => {
    llamadas.push({ url, init });
    return respuesta();
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("enviarWhatsAppDelNegocio — con qué cuenta sale", () => {
  it("con número activo del negocio usa SU phone-number-id y SU token, no los del entorno", async () => {
    H.configs = [configBlas({ id: "vieja", phoneNumberId: "111", isActive: false }), configBlas()];
    const r = await enviarWhatsAppDelNegocio("t-blas", "900 000 000", "Hola\nmundo");
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].url).toBe("https://graph.facebook.com/v21.0/1256186244239842/messages");
    expect(llamadas[0].init.headers.Authorization).toBe(`Bearer ${TOKEN_NEGOCIO}`);
    expect(cuerpo()).toEqual({ messaging_product: "whatsapp", to: "51900000000", type: "text", text: { body: "Hola\nmundo" } });
    expect(r).toMatchObject({ ok: true, via: "negocio", modo: "texto", wamid: "wamid.HBgPRUEBA", puedeNoLlegar: true });
  });

  it("sin número activo cae a la cuenta del servidor (el envío de siempre)", async () => {
    H.configs = [configBlas({ isActive: false })];
    const r = await enviarWhatsAppDelNegocio("t-blas", "51900000000", "hola");
    expect(llamadas[0].url).toBe("https://graph.facebook.com/v17.0/999/messages");
    expect(llamadas[0].init.headers.Authorization).toBe(`Bearer ${TOKEN_SERVIDOR}`);
    expect(r).toMatchObject({ ok: true, via: "servidor", modo: "texto", puedeNoLlegar: true });
  });

  it("si no se puede leer la config del negocio, prueba con la del servidor", async () => {
    H.configFalla = true;
    const r = await enviarWhatsAppDelNegocio("t-blas", "51900000000", "hola");
    expect(r.via).toBe("servidor");
    expect(r.ok).toBe(true);
  });

  it("sin ninguna cuenta no llama a Meta y dice «no configurado»", async () => {
    vi.stubEnv("WHATSAPP_API_URL", "");
    const r = await enviarWhatsAppDelNegocio("t-blas", "51900000000", "hola");
    expect(llamadas).toHaveLength(0);
    expect(r).toMatchObject({ ok: false, via: null });
    expect(r.error).toMatch(/no configurado/);
    expect(explicarFalloEnvio("whatsapp", r.error)).toMatch(/Bot WhatsApp/);
  });

  it("teléfono vacío: no llama a Meta", async () => {
    H.configs = [configBlas()];
    const r = await enviarWhatsAppDelNegocio("t-blas", " - ", "hola");
    expect(llamadas).toHaveLength(0);
    expect(r.ok).toBe(false);
  });
});

describe("enviarWhatsAppDelNegocio — plantilla o texto libre", () => {
  const texto = "*Cierre del día*\n\nTala:\t3 árboles\n\n\nProducción:     120 pt\n";

  it("con la plantilla aprobada en el WABA sale como plantilla, con su idioma real y el texto aplanado", async () => {
    H.configs = [configBlas({ wabaId: "123" })];
    H.plantillas = [
      { name: "hello_world", language: "en_US", category: "UTILITY", body: "Welcome", paramCount: 0 },
      { name: "aviso_libro_ctp", language: "es_PE", category: "UTILITY", body: "Aviso del Libro CTP: {{1}}. Buleje", paramCount: 1 },
    ];
    const r = await enviarWhatsAppDelNegocio("t-blas", "51900000000", texto);
    expect(cuerpo()).toEqual({
      messaging_product: "whatsapp",
      to: "51900000000",
      type: "template",
      template: {
        name: "aviso_libro_ctp",
        language: { code: "es_PE" },
        components: [{ type: "body", parameters: [{ type: "text", text: "*Cierre del día* · Tala: 3 árboles · Producción: 120 pt" }] }],
      },
    });
    expect(r).toMatchObject({ ok: true, modo: "plantilla", plantilla: "aviso_libro_ctp", puedeNoLlegar: false });
    expect(describirEnvioWhatsApp(r)).toBe("plantilla «aviso_libro_ctp» · número del negocio · wamid.HBgPRUEBA");
  });

  it("sin la plantilla en el WABA sale como texto libre, y la constancia lo advierte", async () => {
    H.configs = [configBlas({ wabaId: "123" })];
    H.plantillas = [{ name: "hello_world", language: "en_US", category: "UTILITY", body: "Welcome", paramCount: 0 }];
    const r = await enviarWhatsAppDelNegocio("t-blas", "51900000000", texto);
    expect(cuerpo().type).toBe("text");
    const constancia = describirEnvioWhatsApp(r);
    expect(esTextoLibreSinGarantia(constancia)).toBe(true);
    expect(constancia).toContain("wamid.HBgPRUEBA");
    expect(explicarEnvioOk("whatsapp", constancia)).toMatch(/últimas 24 h/);
    expect(explicarEnvioOk("whatsapp", "Cierre · plantilla «aviso_libro_ctp»")).toBe("Salió.");
  });

  it("una plantilla con 2 variables no sirve (el aviso va entero en {{1}}): texto libre + nota", async () => {
    H.configs = [configBlas({ wabaId: "123" })];
    H.plantillas = [{ name: "aviso_libro_ctp", language: "es", category: "UTILITY", body: "Hola {{1}}, {{2}}", paramCount: 2 }];
    const r = await enviarWhatsAppDelNegocio("t-blas", "51900000000", texto);
    expect(cuerpo().type).toBe("text");
    expect(r.nota).toMatch(/2 variables/);
  });

  it("WHATSAPP_PLANTILLA_AVISOS nombrada y sin WABA: plantilla a ciegas en «es» (también con la cuenta del servidor)", async () => {
    vi.stubEnv("WHATSAPP_PLANTILLA_AVISOS", "aviso_blas");
    const r = await enviarWhatsAppDelNegocio("t-blas", "51900000000", texto);
    expect(r).toMatchObject({ via: "servidor", modo: "plantilla", plantilla: "aviso_blas" });
    expect(cuerpo().template?.language).toEqual({ code: "es" });
  });
});

describe("aplanarParaPlantilla — lo que Meta acepta en un parámetro", () => {
  it("sin saltos de línea, tabulaciones ni 4+ espacios seguidos", () => {
    const p = aplanarParaPlantilla("a\r\nb\n\n\tc     d\n");
    expect(p).toBe("a · b · c d");
    expect(p).not.toMatch(/[\n\r\t]| {4,}/);
  });
  it("corta a 1000 con «…» sin partir un emoji", () => {
    const largo = `${"x".repeat(998)}🌳🌳🌳`;
    const p = aplanarParaPlantilla(largo);
    expect(Array.from(p)).toHaveLength(1000);
    expect(p.endsWith("🌳…")).toBe(true);
    expect(aplanarParaPlantilla("")).toBe("(sin texto)");
  });
  it("con el cuerpo conocido, el tope deja lugar al texto fijo (el cuerpo relleno no pasa de 1024)", () => {
    expect(topeDelParametro("Aviso del Libro CTP: {{1}}. Buleje")).toBe(1024 - 29);
    expect(topeDelParametro(null)).toBe(1000);
    const fijo = "y".repeat(100);
    expect(topeDelParametro(`${fijo} {{1}}`)).toBe(1024 - 101);
  });
});

describe("el token nunca sale en un error ni en un log", () => {
  it("un 401 de Meta que repite el token → error y logs sin el token", async () => {
    H.configs = [configBlas()];
    respuesta = async () =>
      new Response(
        JSON.stringify({ error: { message: `Invalid OAuth access token ${TOKEN_NEGOCIO} (Bearer ${TOKEN_NEGOCIO})`, code: 190 } }),
        { status: 401 },
      );
    const r = await enviarWhatsAppDelNegocio("t-blas", "51900000000", "hola");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/^WhatsApp API error: 401/);
    expect(r.error).not.toContain(TOKEN_NEGOCIO);
    expect(JSON.stringify(H.logs)).not.toContain(TOKEN_NEGOCIO);
    expect(JSON.stringify(H.logs)).not.toContain("51900000000");
  });

  it("una excepción de red con el token adentro también sale limpia", async () => {
    H.configs = [configBlas()];
    respuesta = async () => {
      throw new Error(`fetch failed: Authorization: Bearer ${TOKEN_NEGOCIO}`);
    };
    const r = await enviarWhatsAppDelNegocio("t-blas", "51900000000", "hola");
    expect(r.error).toContain("fetch failed");
    expect(r.error).not.toContain(TOKEN_NEGOCIO);
    expect(JSON.stringify(H.logs)).not.toContain(TOKEN_NEGOCIO);
  });

  it("sinSecreto tapa también los tokens de Meta (EAA…) que no conoce", () => {
    expect(sinSecreto("token EAANabcdefghijklmnopqrstuvwxyz0123 inválido", null)).toBe("token [token] inválido");
  });
});

describe("explicarFalloEnvio — el token del negocio se arregla en el panel, no en Vercel", () => {
  const crudo = 'WhatsApp API error: 401 {"error":{"message":"Error validating access token: Session has expired","code":190}}';
  it("vía número del negocio → Bot WhatsApp; cuenta del servidor → Vercel", () => {
    expect(explicarFalloEnvio("whatsapp", `${crudo} · vía número del negocio`)).toMatch(/Mensajes → Bot WhatsApp/);
    expect(explicarFalloEnvio("whatsapp", `${crudo} · vía cuenta del servidor`)).toMatch(/Vercel/);
  });
  it("131030 REAL (con «OAuthException» adentro) es la lista permitida, no el token — en los dos traductores", () => {
    // Lo que devolvió Meta el 26-09 con la cuenta de Blas a un número fuera de la lista.
    const real =
      'WhatsApp API error: 400 {"error":{"message":"(#131030) Recipient phone number not in allowed list","code":131030,"type":"OAuthException"}} · vía número del negocio';
    expect(explicarFalloEnvio("whatsapp", real)).toMatch(/lista permitida/);
    expect(comoArreglar("whatsapp", real)).toMatch(/lista permitida/);
  });
  it("132001 = la plantilla no está aprobada con ese nombre", () => {
    expect(
      explicarFalloEnvio("whatsapp", "WhatsApp API error: 404 (#132001) Template name does not exist in the translation"),
    ).toMatch(/aviso_libro_ctp/);
  });
});

describe("reintentos y constancia para los registros", () => {
  it("sólo lo pasajero se reintenta: 503 sí, 401 no", async () => {
    H.configs = [configBlas()];
    const cola = [
      () => new Response("Service Unavailable", { status: 503 }),
      () => new Response(JSON.stringify({ messages: [{ id: "wamid.OK" }] }), { status: 200 }),
    ];
    respuesta = async () => (cola.shift() ?? cola[0])();
    const r = await enviarWhatsAppDelNegocio("t-blas", "51900000000", "hola", { reintentos: 2, pausaMs: 0 });
    expect(llamadas).toHaveLength(2);
    expect(r).toMatchObject({ ok: true, wamid: "wamid.OK" });

    llamadas = [];
    respuesta = async () => new Response(JSON.stringify({ error: { message: "Invalid OAuth access token", code: 190 } }), { status: 401 });
    const r2 = await enviarWhatsAppDelNegocio("t-blas", "51900000000", "hola", { reintentos: 2, pausaMs: 0 });
    expect(llamadas).toHaveLength(1);
    expect(r2.ok).toBe(false);
    expect(esFalloTransitorio("WhatsApp API error: 429 rate")).toBe(true);
    expect(esFalloTransitorio("The operation was aborted due to timeout")).toBe(true);
  });

  it("resumenEnvioWhatsApp: una línea que dice cómo salió o qué hacer", async () => {
    H.configs = [configBlas()];
    const ok = await enviarWhatsAppDelNegocio("t-blas", "51900000000", "hola");
    expect(resumenEnvioWhatsApp(ok)).toMatch(/^WhatsApp: texto libre: puede no llegar .* · número del negocio · wamid\.HBgPRUEBA$/);
    respuesta = async () =>
      new Response(JSON.stringify({ error: { message: "(#131030) Recipient phone number not in allowed list", code: 131030, type: "OAuthException" } }), {
        status: 400,
      });
    const mal = await enviarWhatsAppDelNegocio("t-blas", "51900000000", "hola");
    expect(resumenEnvioWhatsApp(mal)).toBe("WhatsApp no salió: la cuenta está en modo prueba — agrega ese número a la lista permitida en Meta.");
  });
});
