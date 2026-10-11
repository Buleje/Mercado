// @vitest-environment node
/**
 * Aviso de «estamos cerrados» del bot de WhatsApp (11-10).
 *
 * Lo puro: abierto/cerrado con la hora de LIMA (el servidor está en UTC: a las
 * 20:30 de un sábado en Pucallpa el servidor ya marca domingo 01:30), próxima
 * apertura, una vez cada 12 h. Y el webhook: con el aviso prendido y la tienda
 * cerrada manda primero el aviso y después la respuesta del bot; dentro de las
 * 12 h, sólo la del bot; con el hilo pausado, nada. Ningún mensaje real: el
 * envío es el `fetch` mockeado.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const H = vi.hoisted(() => ({
  ajuste: { activo: true, texto: "Cerrado; abrimos {apertura}." },
  horario: null as unknown,
  ultimoAviso: null as Date | null,
  reserva: { id: "m1" } as { id: string } | null,
  reservar: vi.fn(),
  marcarFallido: vi.fn(),
  pausados: [] as string[],
}));

vi.mock("@/lib/db/whatsapp-fuera-de-horario.db", () => ({
  WhatsAppFueraDeHorarioDB: {
    ajuste: async () => H.ajuste,
    horario: async () => H.horario,
    ultimoAviso: async () => H.ultimoAviso,
    reservar: async (...a: unknown[]) => {
      H.reservar(...a);
      return H.reserva;
    },
    marcarFallido: async (...a: unknown[]) => H.marcarFallido(...a),
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenantWhatsAppConfig: {
      findFirst: vi.fn(async () => ({ tenantId: "t1", phoneNumberId: "pn1", whatsappToken: "tok", businessName: "Bodega", yapeNumber: null, isActive: true })),
    },
    tenant: { findUnique: vi.fn(async () => null) },
  },
}));
vi.mock("@/lib/db/whatsapp-messages.db", () => ({
  WhatsAppMessagesDB: { append: vi.fn(async () => null) },
  getBotPausedPhones: async () => H.pausados,
}));
vi.mock("@/lib/whatsapp/anotar", () => ({ pareceVinculacion: () => null }));
vi.mock("@/lib/db/whatsapp-duenos.db", () => ({ WhatsAppDuenosDB: { puedeAnotar: async () => false } }));
vi.mock("@/lib/whatsapp/concierge/concierge-router", () => ({
  handleIncomingMessage: vi.fn(async () => ({ reply: "Respuesta del bot", state: "browsing", escalated: false })),
}));
vi.mock("@/lib/whatsapp/conversation-engine", () => ({ processMessage: vi.fn() }));
vi.mock("@/lib/sse-emitter", () => ({ emitAdminSSE: vi.fn() }));
vi.mock("@/lib/push-sender", () => ({ sendPushToPhone: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import {
  abiertoEnLima,
  avisoQueToca,
  leerAjuste,
  proximaApertura,
  resumenHorario,
  AJUSTE_POR_DEFECTO,
} from "@/lib/whatsapp/fuera-de-horario";
import { avisarSiEstaCerrado } from "@/lib/whatsapp/aviso-fuera-de-horario";
import { processWebhookPayload } from "@/app/api/whatsapp/webhook/route";

/** El horario de `main` (Store.hoursJson medido 11-10): lun-sáb 08-20, domingo cerrado. */
const SEMANA = { open: "08:00", close: "20:00", closed: false };
const MAIN = { mon: SEMANA, tue: SEMANA, wed: SEMANA, thu: SEMANA, fri: SEMANA, sat: SEMANA, sun: { open: "09:00", close: "14:00", closed: true } };

const SAB_0900 = new Date("2026-10-10T14:00:00Z");
const SAB_2030 = new Date("2026-10-11T01:30:00Z"); // en UTC ya es domingo
const DOM_1000 = new Date("2026-10-11T15:00:00Z");
const LUN_0600 = new Date("2026-10-12T11:00:00Z");

describe("horario en hora de Lima", () => {
  it("sábado 09:00 abierta; sábado 20:30 cerrada aunque en UTC ya sea domingo", () => {
    expect(abiertoEnLima(MAIN, SAB_0900)).toBe(true);
    expect(abiertoEnLima(MAIN, SAB_2030)).toBe(false);
    expect(abiertoEnLima(MAIN, DOM_1000)).toBe(false);
    expect(abiertoEnLima(null, SAB_2030)).toBeNull();
  });

  it("próxima apertura: el lunes / mañana / hoy", () => {
    expect(proximaApertura(MAIN, SAB_2030)).toBe("el lunes a las 08:00");
    expect(proximaApertura(MAIN, DOM_1000)).toBe("mañana a las 08:00");
    expect(proximaApertura(MAIN, LUN_0600)).toBe("hoy a las 08:00");
  });

  it("cierre pasada la medianoche (19:00 → 02:00)", () => {
    const noche = { open: "19:00", close: "02:00" };
    const h = { sat: noche, sun: noche };
    expect(abiertoEnLima(h, new Date("2026-10-11T06:30:00Z"))).toBe(true); // dom 01:30 Lima
    expect(abiertoEnLima(h, new Date("2026-10-11T08:00:00Z"))).toBe(false); // dom 03:00
  });

  it("el turno del sábado 19:00 → 02:00 sigue el domingo a la 01:00 aunque el domingo cierre o abra tarde", () => {
    const noche = { open: "19:00", close: "02:00" };
    const DOM_0100 = new Date("2026-10-11T06:00:00Z");
    expect(abiertoEnLima({ sat: noche, sun: { open: "09:00", close: "14:00", closed: true } }, DOM_0100)).toBe(true);
    expect(abiertoEnLima({ sat: noche, sun: { open: "10:00", close: "14:00" } }, DOM_0100)).toBe(true);
    // Al revés: el domingo 19:00 → 02:00 no abre el domingo a la 01:00 si el sábado no abrió.
    expect(abiertoEnLima({ sat: { open: "08:00", close: "20:00", closed: true }, sun: noche }, DOM_0100)).toBe(false);
  });

  it("resumen de una línea, días iguales juntos", () => {
    expect(resumenHorario(MAIN)).toBe("Lun–Sáb 08:00–20:00 · Dom cerrado");
  });
});

describe("¿le toca el aviso?", () => {
  const ajuste = { activo: true, texto: "Cerrado; abrimos {apertura}." };
  it("apagado, sin horario o abierta → no", () => {
    expect(avisoQueToca({ ajuste: { ...ajuste, activo: false }, horario: MAIN, now: SAB_2030, ultimoAviso: null })).toBeNull();
    expect(avisoQueToca({ ajuste, horario: null, now: SAB_2030, ultimoAviso: null })).toBeNull();
    expect(avisoQueToca({ ajuste, horario: MAIN, now: SAB_0900, ultimoAviso: null })).toBeNull();
  });

  it("cerrada: una vez cada 12 h, con {apertura} reemplazado", () => {
    const hace = (h: number) => new Date(SAB_2030.getTime() - h * 3_600_000);
    expect(avisoQueToca({ ajuste, horario: MAIN, now: SAB_2030, ultimoAviso: hace(11) })).toBeNull();
    expect(avisoQueToca({ ajuste, horario: MAIN, now: SAB_2030, ultimoAviso: hace(13) })).toBe("Cerrado; abrimos el lunes a las 08:00.");
  });

  it("lo guardado que no cuadra vuelve al de fábrica, apagado", () => {
    expect(leerAjuste({})).toEqual(AJUSTE_POR_DEFECTO);
    expect(leerAjuste({ whatsappFueraDeHorario: { activo: "sí", texto: "" } })).toEqual(AJUSTE_POR_DEFECTO);
    expect(leerAjuste({ whatsappFueraDeHorario: { activo: true, texto: "  Hola  " } })).toEqual({ activo: true, texto: "Hola" });
  });
});

describe("avisarSiEstaCerrado", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.ajuste = { activo: true, texto: "Cerrado; abrimos {apertura}." };
    H.horario = MAIN;
    H.ultimoAviso = null;
    H.reserva = { id: "m1" };
  });

  it("reserva en la bandeja y después manda", async () => {
    const enviar = vi.fn(async () => true);
    const r = await avisarSiEstaCerrado({ tenantId: "t1", phoneNumberId: "pn1", customerPhone: "51999", enviar, now: SAB_2030 });
    expect(r).toBe("enviado");
    expect(H.reservar).toHaveBeenCalledWith("t1", expect.objectContaining({ customerPhone: "51999", texto: "Cerrado; abrimos el lunes a las 08:00." }));
    expect(enviar).toHaveBeenCalledWith("Cerrado; abrimos el lunes a las 08:00.");
  });

  it("otro mensaje del mismo cliente ya lo reservó → no manda dos veces", async () => {
    H.reserva = null;
    const enviar = vi.fn(async () => true);
    expect(await avisarSiEstaCerrado({ tenantId: "t1", phoneNumberId: "pn1", customerPhone: "51999", enviar, now: SAB_2030 })).toBeNull();
    expect(enviar).not.toHaveBeenCalled();
  });

  it("Meta lo rechaza → queda fallido en la bandeja", async () => {
    const enviar = vi.fn(async () => false);
    expect(await avisarSiEstaCerrado({ tenantId: "t1", phoneNumberId: "pn1", customerPhone: "51999", enviar, now: SAB_2030 })).toBe("fallido");
    expect(H.marcarFallido).toHaveBeenCalledWith("t1", "m1");
  });
});

describe("webhook de WhatsApp con el aviso", () => {
  const payload = (texto: string) =>
    JSON.stringify({
      entry: [{ changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { display_phone_number: "1", phone_number_id: "pn1" }, messages: [{ from: "51999111222", id: `w-${texto}`, timestamp: "1", type: "text", text: { body: texto } }] } }] }],
    });
  const cuerpos = () =>
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => (JSON.parse(String((c[1] as RequestInit).body)) as { text: { body: string } }).text.body);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(SAB_2030);
    H.ajuste = { activo: true, texto: "Cerrado; abrimos {apertura}." };
    H.horario = MAIN;
    H.ultimoAviso = null;
    H.reserva = { id: "m1" };
    H.pausados = [];
    global.fetch = vi.fn(async () => ({ ok: true, status: 200, text: async () => "" })) as unknown as typeof fetch;
  });
  afterEach(() => vi.useRealTimers());

  it("cerrada → primero el aviso, después la respuesta del bot", async () => {
    await processWebhookPayload(payload("hola"));
    expect(cuerpos()).toEqual(["Cerrado; abrimos el lunes a las 08:00.", "Respuesta del bot"]);
  });

  it("ya se le avisó hace menos de 12 h → sólo el bot", async () => {
    H.ultimoAviso = new Date(SAB_2030.getTime() - 3_600_000);
    await processWebhookPayload(payload("hola"));
    expect(cuerpos()).toEqual(["Respuesta del bot"]);
  });

  it("abierta o aviso apagado → sólo el bot", async () => {
    vi.setSystemTime(SAB_0900);
    await processWebhookPayload(payload("hola"));
    H.ajuste = { ...H.ajuste, activo: false };
    vi.setSystemTime(SAB_2030);
    await processWebhookPayload(payload("otra"));
    expect(cuerpos()).toEqual(["Respuesta del bot", "Respuesta del bot"]);
  });

  it("hilo pausado (atiende una persona) → ni aviso ni bot", async () => {
    H.pausados = ["51999111222"];
    await processWebhookPayload(payload("hola"));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("si el aviso revienta, el bot contesta igual", async () => {
    H.reservar.mockImplementationOnce(() => {
      throw new Error("base caída");
    });
    await processWebhookPayload(payload("hola"));
    expect(cuerpos()).toEqual(["Respuesta del bot"]);
  });
});
