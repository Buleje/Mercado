/**
 * El número de WhatsApp de un negocio vende lo de ESE negocio:
 * - sin ajuste, el Concierge ya no cruza tiendas (antes buscaba en todas primero);
 * - con la asesora activa, contesta con el catálogo del tenant del número y al
 *   traspasar pausa el bot en ese hilo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  flags: {} as Record<string, unknown>,
  getPage: vi.fn(),
  generateText: vi.fn(),
  setBotPaused: vi.fn(),
  setNote: vi.fn(),
  cross: vi.fn(),
  classify: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    whatsAppConversation: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({}), delete: vi.fn() },
    product: { findMany: h.findMany, findFirst: vi.fn() },
    order: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/db/settings.db", () => ({ SettingsDB: { getFeatureFlags: vi.fn(async () => h.flags) } }));
vi.mock("@/lib/db/products.db", () => ({ ProductsDB: { getPage: h.getPage } }));
vi.mock("@/lib/db/whatsapp-messages.db", () => ({
  setBotPaused: h.setBotPaused,
  getNotesMap: vi.fn().mockResolvedValue({}),
  setConversationNote: h.setNote,
  WhatsAppMessagesDB: { listMessages: vi.fn().mockResolvedValue([]) },
}));
vi.mock("ai", () => ({ generateText: h.generateText }));
vi.mock("@/lib/ai/provider", () => ({ smartModel: "modelo", chatModel: "modelo" }));
vi.mock("@/lib/ai/cost-control", () => ({
  aiCostGuard: { canSpend: vi.fn().mockResolvedValue(true), recordSpend: vi.fn() },
}));
vi.mock("@/lib/whatsapp/concierge/cross-tenant-search", () => ({
  searchProductsCrossTenant: h.cross,
  formatCrossTenantResults: vi.fn(() => "LISTA CRUZADA"),
}));
vi.mock("@/lib/whatsapp/ai-intent", () => ({
  classifyWhatsappIntent: h.classify,
  shouldTrustAi: (c: { intent: string; confidence: number }) => c.intent !== "desconocido" && c.confidence >= 0.6,
}));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { handleIncomingMessage } from "@/lib/whatsapp/concierge/concierge-router";
import type { AjusteAsistente } from "@/lib/whatsapp/asistente-negocio";

const MUSA = "tenant-musa";
const PHONE = "51900000001";
const AJUSTE: AjusteAsistente = {
  activo: true,
  cruzarTiendas: false,
  nombreNegocio: "Musa",
  nombreAsistente: "la asistente virtual de Musa",
  presentacion: "Tienda de belleza. Tuteo.",
  horario: "lunes a sábado, de 9:00 a 20:00",
  preguntasFrecuentes: [],
  consejos: [],
  cuidados: [],
  traspaso: { nombre: "Drucila", telefono: "51921585006", cuando: "" },
  pausarAlTraspasar: true,
};

const prod = (tenantId: string, name: string, price: number) => ({ id: name.length, tenantId, name, price, active: true });

beforeEach(() => {
  vi.clearAllMocks();
  h.flags = {};
  h.getPage.mockResolvedValue({
    products: [prod(MUSA, "Sérum de vitamina C", 69), prod("tenant-bodega", "Aceite Primor Premium 1L", 12.5)],
    nextCursor: null,
    total: 2,
  });
});

describe("sin ajuste: el número del negocio no cruza tiendas", () => {
  it("una consulta de precio busca SOLO en el catálogo del tenant del número", async () => {
    h.classify.mockResolvedValue({ intent: "precio", confidence: 0.9, productQuery: "aceite" });
    h.findMany.mockResolvedValue([{ id: 1, name: "Aceite de argán", price: 49, stock: null, unit: "unidad" }]);

    const r = await handleIncomingMessage(MUSA, PHONE, "¿tienen aceite?");

    expect(h.cross).not.toHaveBeenCalled();
    expect(h.findMany.mock.calls[0][0]).toMatchObject({ where: { tenantId: MUSA } });
    expect(r.reply).toContain("Aceite de argán");
  });

  it("recomendar tampoco cruza: va al catálogo propio", async () => {
    h.classify.mockResolvedValue({ intent: "recomendar", confidence: 0.9, productQuery: "aceite" });
    h.findMany.mockResolvedValue([]);
    await handleIncomingMessage(MUSA, PHONE, "¿qué me recomiendas?");
    expect(h.cross).not.toHaveBeenCalled();
    expect(h.generateText).not.toHaveBeenCalled();
  });

  it("el marketplace que lo prende sí cruza", async () => {
    h.flags = { whatsappAsistente: { cruzarTiendas: true } };
    h.classify.mockResolvedValue({ intent: "precio", confidence: 0.9, productQuery: "aceite" });
    h.cross.mockResolvedValue([{ productId: 9, storeId: "otra", name: "Aceite", price: 12 }]);
    const r = await handleIncomingMessage("tenant-marketplace", PHONE, "aceite");
    expect(h.cross).toHaveBeenCalled();
    expect(r.reply).toBe("LISTA CRUZADA");
  });
});

describe("asesora activa", () => {
  beforeEach(() => {
    h.flags = { whatsappAsistente: AJUSTE };
  });

  it("contesta sin clasificador, con el catálogo del tenant del número y nada ajeno", async () => {
    h.generateText.mockResolvedValue({ text: '{"respuesta":"El *Sérum de vitamina C* cuesta S/ 69.","traspasar":false}' });

    const r = await handleIncomingMessage(MUSA, PHONE, "¿tienen sérum para manchas?");

    expect(h.classify).not.toHaveBeenCalled();
    expect(h.getPage).toHaveBeenCalledWith(expect.objectContaining({ tenantId: MUSA, active: true }));
    const system = h.generateText.mock.calls[0][0].system as string;
    expect(system).toContain("Sérum de vitamina C · S/ 69");
    expect(system).not.toContain("Aceite Primor");
    expect(r).toMatchObject({ reply: "El *Sérum de vitamina C* cuesta S/ 69.", escalated: false });
    expect(h.setBotPaused).not.toHaveBeenCalled();
  });

  it("compra lista → traspaso a Drucila y el bot se calla en ese hilo", async () => {
    h.generateText.mockResolvedValue({
      text: '{"respuesta":"¡Perfecto! Te confirmo con Drucila.","traspasar":true,"resumen":"Kit Regalo especial"}',
    });
    const r = await handleIncomingMessage(MUSA, PHONE, "quiero el kit regalo, pago con yape");
    expect(r.escalated).toBe(true);
    expect(h.setBotPaused).toHaveBeenCalledWith(MUSA, PHONE, true);
    expect(h.setNote).toHaveBeenCalledWith(MUSA, PHONE, expect.stringContaining("Kit Regalo especial"));
  });

  it("un monto que no está en el catálogo no sale: traspasa con la respuesta fija", async () => {
    h.generateText.mockResolvedValue({ text: '{"respuesta":"Todo junto te sale S/ 207.","traspasar":false}' });
    const r = await handleIncomingMessage(MUSA, PHONE, "¿cuánto todo junto?");
    expect(r.reply).not.toContain("207");
    expect(r.reply).toContain("Drucila");
    expect(r.escalated).toBe(true);
  });

  it("el total de varios productos lo agrega el servidor con los precios del catálogo", async () => {
    h.generateText.mockResolvedValue({
      text: '{"respuesta":"Te los separo.","traspasar":false,"pedido":[{"producto":"Sérum de vitamina C","cantidad":2}]}',
    });
    const r = await handleIncomingMessage(MUSA, PHONE, "quiero 2 sérum");
    expect(r.reply).toContain("*Total: S/ 138*");
  });

  it("si la IA falla, la clienta no queda sin respuesta: traspaso", async () => {
    h.generateText.mockRejectedValue(new Error("429"));
    const r = await handleIncomingMessage(MUSA, PHONE, "hola");
    expect(r.reply).toContain("Drucila");
    expect(r.escalated).toBe(true);
  });
});
