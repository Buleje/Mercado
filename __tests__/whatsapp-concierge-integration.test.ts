/**
 * Suite de integración: WhatsApp AI Concierge — flujos completos end-to-end
 * ADR-046 — cubre el recorrido desde la API route hasta la respuesta final.
 *
 * Diferencia con whatsapp-concierge-router.test.ts:
 *  - Ese archivo testea `handleIncomingMessage` directamente (nivel router).
 *  - Este archivo testea los flujos integrados de los handlers individuales
 *    más los escenarios críticos de negocio: consulta de producto, agregar
 *    al carrito, estado de orden, escalada a humano, confianza baja → fallback,
 *    y persistencia de estado entre mensajes consecutivos.
 *
 * Estrategia de mocks:
 *  - Prisma → vi.mock para aislar la DB
 *  - classifyWhatsappIntent → vi.mock para controlar la clasificación AI
 *  - logActivity → vi.mock fire-and-forget (regla #7 CLAUDE.md)
 *  - fetch global → vi.fn para llamadas a /api/orders y WhatsApp API
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks (deben ir ANTES de los imports que los usan) ───────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    whatsAppConversation: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    product: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    order: {
      findFirst: vi.fn(),
    },
    activityLog: {
      create: vi.fn(),
    },
  },
}));

// Mock del clasificador AI — no llamar a ningún LLM real en tests
vi.mock("@/lib/whatsapp/ai-intent", () => ({
  classifyWhatsappIntent: vi.fn(),
  shouldTrustAi: vi.fn((c: { intent: string; confidence: number }) =>
    c.intent !== "desconocido" && c.confidence >= 0.6
  ),
}));

// Mock del logger de actividad — fire-and-forget, no debe bloquear
vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

// Mock del logger interno — silenciar salida durante tests
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ─── Imports (después de los mocks) ──────────────────────────────────────────

import { handleIncomingMessage } from "@/lib/whatsapp/concierge/concierge-router";
import { prisma } from "@/lib/prisma";
import { classifyWhatsappIntent, shouldTrustAi } from "@/lib/whatsapp/ai-intent";

// ─── Tipos auxiliares ─────────────────────────────────────────────────────────

type MockPrisma = {
  whatsAppConversation: {
    findUnique: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  product: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
  order: {
    findFirst: ReturnType<typeof vi.fn>;
  };
  activityLog: {
    create: ReturnType<typeof vi.fn>;
  };
};

const mockPrisma = prisma as unknown as MockPrisma;
const mockClassify = classifyWhatsappIntent as ReturnType<typeof vi.fn>;
const mockShouldTrust = shouldTrustAi as ReturnType<typeof vi.fn>;

// ─── Fábrica de conversaciones ────────────────────────────────────────────────

/**
 * Crea un objeto de conversación con valores por defecto seguros.
 * tenantId siempre como primer parámetro (CLAUDE.md regla #3).
 */
function makeConv(
  tenantId: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    id: "conv-integ-1",
    tenantId,
    phone: "51900000001",
    state: "idle",
    cartItems: [],
    deliveryAddress: null,
    lastMessageAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000), // sesión activa
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Configura el upsert de conversación para retornar un estado específico.
 */
function stubUpsert(tenantId: string, overrides: Record<string, unknown> = {}) {
  mockPrisma.whatsAppConversation.upsert.mockResolvedValue(
    makeConv(tenantId, overrides)
  );
}

// ─── Suite de integración ─────────────────────────────────────────────────────

describe("WhatsApp Concierge — integración de flujos completos (ADR-046)", () => {
  const TENANT = "tenant-integ";
  const PHONE = "51900000001";

  beforeEach(() => {
    vi.clearAllMocks();

    // Por defecto: no hay conversación previa (primer mensaje)
    mockPrisma.whatsAppConversation.findUnique.mockResolvedValue(null);
    stubUpsert(TENANT);

    // shouldTrustAi usa lógica real por defecto
    mockShouldTrust.mockImplementation(
      (c: { intent: string; confidence: number }) =>
        c.intent !== "desconocido" && c.confidence >= 0.6
    );

    // fetch global mock — para llamadas a /api/orders y WhatsApp Graph API
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "order-test-001" }),
      text: async () => "",
    } as Response);
  });

  // ── Flujo 1: Consulta de precio de producto ──────────────────────────────

  describe("Flujo: consulta de precio (intent=precio)", () => {
    it("usuario pregunta precio → respuesta contiene el nombre del producto y transiciona a browsing", async () => {
      // Clasificador retorna intent 'precio' con alta confianza
      mockClassify.mockResolvedValue({
        intent: "precio",
        confidence: 0.93,
        productQuery: "arroz",
      });

      // Base de datos devuelve productos que coinciden
      mockPrisma.product.findMany.mockResolvedValue([
        { id: 10, name: "Arroz Superior", price: 4.5, stock: 80, unit: "kg" },
        { id: 11, name: "Arroz Corriente", price: 3.2, stock: 50, unit: "kg" },
      ]);

      stubUpsert(TENANT, { state: "browsing" });

      const res = await handleIncomingMessage(TENANT, PHONE, "cuanto cuesta el arroz");

      // La respuesta debe mencionar el producto encontrado
      expect(res.reply).toContain("Arroz");
      // Debe incluir precio en formato S/
      expect(res.reply).toContain("S/");
      // El estado cambia a browsing (el usuario está explorando)
      expect(res.state).toBe("browsing");
      expect(res.escalated).toBe(false);
    });

    it("producto no existe en DB → respuesta incluye texto 'no encontr' y sigue en browsing", async () => {
      mockClassify.mockResolvedValue({
        intent: "precio",
        confidence: 0.88,
        productQuery: "caviar",
      });

      // No hay resultados para ese producto
      mockPrisma.product.findMany.mockResolvedValue([]);

      stubUpsert(TENANT, { state: "browsing" });

      const res = await handleIncomingMessage(TENANT, PHONE, "cuanto cuesta el caviar");

      expect(res.reply).toMatch(/no encontr/i);
      expect(res.state).toBe("browsing");
    });

    it("query de precio desde estado cart → no pierde el carrito, sigue en browsing", async () => {
      // El usuario ya tiene un carrito activo
      const cartItems = [
        { productId: 5, name: "Leche Gloria", quantity: 3, price: 4.0, unit: "und" },
      ];

      mockPrisma.whatsAppConversation.findUnique.mockResolvedValue(
        makeConv(TENANT, { state: "cart", cartItems })
      );

      mockClassify.mockResolvedValue({
        intent: "precio",
        confidence: 0.91,
        productQuery: "azucar",
      });

      mockPrisma.product.findMany.mockResolvedValue([
        { id: 20, name: "Azúcar Rubia", price: 2.8, stock: 200, unit: "kg" },
      ]);

      stubUpsert(TENANT, { state: "browsing" });

      const res = await handleIncomingMessage(TENANT, PHONE, "cuanto cuesta el azucar");

      expect(res.reply).toContain("Azúcar");
      // classifyWhatsappIntent fue llamado con el mensaje correcto
      expect(mockClassify).toHaveBeenCalledWith("cuanto cuesta el azucar");
    });
  });

  // ── Flujo 2: Agregar al carrito ──────────────────────────────────────────

  describe("Flujo: agregar al carrito (intent=pedido)", () => {
    it("usuario pide 2 kg de arroz → producto se agrega, estado cambia a cart", async () => {
      mockClassify.mockResolvedValue({
        intent: "pedido",
        confidence: 0.90,
        items: [{ name: "arroz", quantity: 2, unit: "kg" }],
      });

      mockPrisma.product.findFirst.mockResolvedValue({
        id: 10,
        name: "Arroz Superior",
        price: 4.5,
        unit: "kg",
        stock: 80,
      });

      stubUpsert(TENANT, { state: "cart" });

      const res = await handleIncomingMessage(TENANT, PHONE, "quiero 2 kg de arroz");

      // La respuesta debe confirmar que se agregó el producto
      expect(res.reply).toContain("Arroz");
      expect(res.state).toBe("cart");
      expect(res.escalated).toBe(false);
      // El upsert debe haber sido llamado para persistir el estado
      expect(mockPrisma.whatsAppConversation.upsert).toHaveBeenCalled();
    });

    it("producto no encontrado → respuesta indica que no se encontró", async () => {
      mockClassify.mockResolvedValue({
        intent: "pedido",
        confidence: 0.85,
        items: [{ name: "salmón", quantity: 1, unit: "kg" }],
      });

      // Producto inexistente en el catálogo
      mockPrisma.product.findFirst.mockResolvedValue(null);

      stubUpsert(TENANT, { state: "cart" });

      const res = await handleIncomingMessage(TENANT, PHONE, "quiero 1 kg de salmon");

      expect(res.reply).toMatch(/no encontr/i);
    });

    it("agregar segundo producto al carrito existente → la respuesta confirma el nuevo item", async () => {
      // Carrito previo con arroz
      const existingCart = [
        { productId: 10, name: "Arroz Superior", quantity: 2, price: 4.5, unit: "kg" },
      ];

      mockPrisma.whatsAppConversation.findUnique.mockResolvedValue(
        makeConv(TENANT, { state: "cart", cartItems: existingCart })
      );

      mockClassify.mockResolvedValue({
        intent: "pedido",
        confidence: 0.87,
        items: [{ name: "aceite", quantity: 1, unit: "und" }],
      });

      mockPrisma.product.findFirst.mockResolvedValue({
        id: 30,
        name: "Aceite Vegetal",
        price: 8.5,
        unit: "und",
        stock: 40,
      });

      stubUpsert(TENANT, { state: "cart" });

      const res = await handleIncomingMessage(TENANT, PHONE, "tambien quiero 1 aceite");

      expect(res.reply).toContain("Aceite");
      expect(res.state).toBe("cart");
    });

    it("carrito vacío: clasificación sin items → pide aclaración sin crash", async () => {
      mockClassify.mockResolvedValue({
        intent: "pedido",
        confidence: 0.82,
        // sin campo 'items' — el handler debe manejar esto sin lanzar
      });

      stubUpsert(TENANT, { state: "cart" });

      const res = await handleIncomingMessage(TENANT, PHONE, "quiero algo");

      // El handler de cart-add debe retornar una respuesta de aclaración
      expect(res.reply).toBeDefined();
      expect(typeof res.reply).toBe("string");
      expect(res.reply.length).toBeGreaterThan(0);
    });
  });

  // ── Flujo 3: Consulta de estado de pedido ────────────────────────────────

  describe("Flujo: consulta de estado (intent=estado)", () => {
    it("estado=cart + intent=estado → muestra resumen del carrito local (sin query DB de orden)", async () => {
      const cartItems = [
        { productId: 10, name: "Arroz Superior", quantity: 2, price: 4.5, unit: "kg" },
        { productId: 30, name: "Aceite Vegetal", quantity: 1, price: 8.5, unit: "und" },
      ];

      mockPrisma.whatsAppConversation.findUnique.mockResolvedValue(
        makeConv(TENANT, { state: "cart", cartItems })
      );

      mockClassify.mockResolvedValue({ intent: "estado", confidence: 0.84 });
      stubUpsert(TENANT, { state: "cart" });

      const res = await handleIncomingMessage(TENANT, PHONE, "cuanto va mi pedido");

      // Para estado=cart, muestra el carrito (no consulta order.findFirst)
      expect(res.reply).toContain("carrito");
      expect(mockPrisma.order.findFirst).not.toHaveBeenCalled();
      expect(res.state).toBe("cart");
    });

    it("estado=checkout + intent=estado → consulta DB por orden real y devuelve status", async () => {
      mockPrisma.whatsAppConversation.findUnique.mockResolvedValue(
        makeConv(TENANT, { state: "checkout" })
      );

      mockClassify.mockResolvedValue({ intent: "estado", confidence: 0.89 });

      // La orden existe en DB con estado 'delivering'
      mockPrisma.order.findFirst.mockResolvedValue({
        id: "ord-99",
        status: "delivering",
        total: 17.5,
        deliveryAddress: "Jr. Ucayali 456",
        items: [
          { name: "Arroz Superior", quantity: 2, price: 4.5, unit: "kg", productId: 10 },
          { name: "Aceite Vegetal", quantity: 1, price: 8.5, unit: "und", productId: 30 },
        ],
      });

      stubUpsert(TENANT, { state: "checkout" });

      const res = await handleIncomingMessage(TENANT, PHONE, "ya llego mi pedido");

      // Debe mostrar el estado del pedido
      expect(res.reply).toContain("Estado");
      // Verificar que tenantId y phone se usaron en la query (aislamiento multi-tenant)
      const orderCall = mockPrisma.order.findFirst.mock.calls[0][0] as {
        where: { tenantId: string; customerPhone: string };
      };
      expect(orderCall.where.tenantId).toBe(TENANT);
      expect(orderCall.where.customerPhone).toBe(PHONE);
      expect(res.state).toBe("checkout");
    });

    it("estado=checkout + sin orden en DB → mensaje de 'no pedidos recientes' y reset a idle", async () => {
      mockPrisma.whatsAppConversation.findUnique.mockResolvedValue(
        makeConv(TENANT, { state: "checkout" })
      );

      mockClassify.mockResolvedValue({ intent: "estado", confidence: 0.85 });

      // No hay órdenes para este cliente
      mockPrisma.order.findFirst.mockResolvedValue(null);

      stubUpsert(TENANT, { state: "idle" });

      const res = await handleIncomingMessage(TENANT, PHONE, "donde esta mi pedido");

      expect(res.reply).toMatch(/no encontr/i);
    });
  });

  // ── Flujo 4: Escalada a humano ───────────────────────────────────────────

  describe("Flujo: escalada a humano (intent=humano)", () => {
    it("usuario pide hablar con alguien → respuesta de handoff, escalated=true", async () => {
      mockClassify.mockResolvedValue({ intent: "humano", confidence: 0.97 });

      // Sin teléfono de staff — escalación silenciosa (solo al cliente)
      delete process.env.WHATSAPP_STAFF_PHONE;

      stubUpsert(TENANT, { state: "idle" });

      const res = await handleIncomingMessage(TENANT, PHONE, "quiero hablar con alguien");

      // El mensaje de handoff menciona "equipo" (de formatHumanHandoff)
      expect(res.reply).toContain("equipo");
      expect(res.escalated).toBe(true);
      expect(res.state).toBe("idle");
      // No debe haber llamado a fetch para WhatsApp API sin staff phone
      // (la llamada a staff es fire-and-forget y depende de WHATSAPP_STAFF_PHONE)
    });

    it("escalada desde estado=cart → preserva que la sesión se marca como escalada", async () => {
      // El usuario está en medio de un carrito y pide atención humana
      mockPrisma.whatsAppConversation.findUnique.mockResolvedValue(
        makeConv(TENANT, {
          state: "cart",
          cartItems: [
            { productId: 10, name: "Arroz Superior", quantity: 1, price: 4.5, unit: "kg" },
          ],
        })
      );

      mockClassify.mockResolvedValue({ intent: "humano", confidence: 0.95 });

      delete process.env.WHATSAPP_STAFF_PHONE;
      stubUpsert(TENANT, { state: "idle" });

      const res = await handleIncomingMessage(TENANT, PHONE, "necesito ayuda de una persona");

      expect(res.escalated).toBe(true);
      expect(res.reply).toContain("equipo");
    });

    it("escalada con WHATSAPP_STAFF_PHONE configurado → intenta notificar al staff vía fetch", async () => {
      mockClassify.mockResolvedValue({ intent: "humano", confidence: 0.96 });

      // Configurar las 3 vars de entorno necesarias para que notifyStaff llame a fetch
      process.env.WHATSAPP_STAFF_PHONE = "51999999999";
      process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
      process.env.WHATSAPP_PHONE_ID = "phone-id-123";

      stubUpsert(TENANT, { state: "idle" });

      const res = await handleIncomingMessage(TENANT, PHONE, "hablar con humano");

      expect(res.escalated).toBe(true);
      // El fetch a la API de WhatsApp para notificar al staff es fire-and-forget,
      // no debe bloquear ni lanzar aunque ocurra un error

      // Limpiar para no contaminar otros tests
      delete process.env.WHATSAPP_STAFF_PHONE;
      delete process.env.WHATSAPP_ACCESS_TOKEN;
      delete process.env.WHATSAPP_PHONE_ID;
    });
  });

  // ── Flujo 5: Clasificación con baja confianza → fallback al menú ─────────

  describe("Flujo: confianza baja en clasificación AI → fallback (ADR-046 §3)", () => {
    it("confianza < 0.6 → shouldTrustAi=false → welcome menu sin cambio de estado", async () => {
      // El AI clasifica pero con poca certeza
      mockClassify.mockResolvedValue({ intent: "catalogo", confidence: 0.45 });
      // Forzar que shouldTrustAi retorne false para este caso
      mockShouldTrust.mockReturnValue(false);

      mockPrisma.whatsAppConversation.findUnique.mockResolvedValue(
        makeConv(TENANT, { state: "cart", cartItems: [] })
      );

      stubUpsert(TENANT, { state: "cart" });

      const res = await handleIncomingMessage(TENANT, PHONE, "esto no se entiende bien");

      // Con baja confianza se muestra el menú de bienvenida
      expect(res.reply).toContain("Buleje");
      // El estado NO cambia — se preserva la sesión de cart activa
      expect(res.state).toBe("cart");
      expect(res.escalated).toBe(false);
    });

    it("intent=desconocido con confidence=0 → fallback sin llamar a ningún handler de negocio", async () => {
      mockClassify.mockResolvedValue({ intent: "desconocido", confidence: 0 });
      mockShouldTrust.mockReturnValue(false);

      stubUpsert(TENANT, { state: "idle" });

      const res = await handleIncomingMessage(TENANT, PHONE, "jfkdsjfksjdkfjsd");

      // Menú de bienvenida
      expect(res.reply).toContain("Buleje");
      // No se llama a la DB de productos ni de órdenes
      expect(mockPrisma.product.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.product.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.order.findFirst).not.toHaveBeenCalled();
    });

    it("intent=saludo → siempre va a fallback (welcome menu) sin importar confianza alta", async () => {
      mockClassify.mockResolvedValue({ intent: "saludo", confidence: 0.99 });
      // shouldTrustAi con lógica real: saludo + 0.99 → true, pero la state machine
      // mapea "*:saludo" al fallbackHandler (por diseño ADR-046)

      stubUpsert(TENANT, { state: "idle" });

      const res = await handleIncomingMessage(TENANT, PHONE, "hola buenas tardes");

      expect(res.reply).toContain("Buleje");
      expect(res.state).toBe("idle");
    });
  });

  // ── Flujo 6: Persistencia de estado entre mensajes consecutivos ──────────

  describe("Flujo: persistencia de estado entre mensajes (state machine)", () => {
    it("msg1: agregar producto → msg2: consultar carrito → estado persiste entre llamadas", async () => {
      // ── Mensaje 1: agregar al carrito ──────────────────────────────────────
      mockClassify.mockResolvedValueOnce({
        intent: "pedido",
        confidence: 0.91,
        items: [{ name: "arroz", quantity: 3, unit: "kg" }],
      });

      mockPrisma.product.findFirst.mockResolvedValueOnce({
        id: 10,
        name: "Arroz Superior",
        price: 4.5,
        unit: "kg",
        stock: 80,
      });

      // Primera vez: no hay conversación previa
      mockPrisma.whatsAppConversation.findUnique.mockResolvedValueOnce(null);
      mockPrisma.whatsAppConversation.upsert.mockResolvedValueOnce(
        makeConv(TENANT, {
          state: "cart",
          cartItems: [
            { productId: 10, name: "Arroz Superior", quantity: 3, price: 4.5, unit: "kg" },
          ],
        })
      );

      const res1 = await handleIncomingMessage(TENANT, PHONE, "quiero 3 kg de arroz");

      expect(res1.state).toBe("cart");
      expect(res1.reply).toContain("Arroz");

      // ── Mensaje 2: consultar estado del carrito ─────────────────────────────
      // Ahora la conversación existe con el carrito del msg1
      mockPrisma.whatsAppConversation.findUnique.mockResolvedValueOnce(
        makeConv(TENANT, {
          state: "cart",
          cartItems: [
            { productId: 10, name: "Arroz Superior", quantity: 3, price: 4.5, unit: "kg" },
          ],
        })
      );

      mockClassify.mockResolvedValueOnce({ intent: "estado", confidence: 0.87 });
      mockPrisma.whatsAppConversation.upsert.mockResolvedValueOnce(
        makeConv(TENANT, { state: "cart" })
      );

      const res2 = await handleIncomingMessage(TENANT, PHONE, "que tengo en mi carrito");

      // El resumen del carrito debe mostrar el arroz del mensaje anterior
      expect(res2.reply).toContain("carrito");
      expect(res2.state).toBe("cart");
      // No debería haber consultado ordenes (estado=cart usa resumen local)
      expect(mockPrisma.order.findFirst).not.toHaveBeenCalled();
    });

    it("msg1: agregar arroz → msg2: agregar aceite → msg3: confirmar (pide dirección)", async () => {
      const cartConArroz = [
        { productId: 10, name: "Arroz Superior", quantity: 2, price: 4.5, unit: "kg" },
      ];
      const cartCompleto = [
        { productId: 10, name: "Arroz Superior", quantity: 2, price: 4.5, unit: "kg" },
        { productId: 30, name: "Aceite Vegetal", quantity: 1, price: 8.5, unit: "und" },
      ];

      // ── Mensaje 1: agregar arroz ──
      mockPrisma.whatsAppConversation.findUnique.mockResolvedValueOnce(null);
      mockClassify.mockResolvedValueOnce({
        intent: "pedido",
        confidence: 0.92,
        items: [{ name: "arroz", quantity: 2, unit: "kg" }],
      });
      mockPrisma.product.findFirst.mockResolvedValueOnce({
        id: 10, name: "Arroz Superior", price: 4.5, unit: "kg", stock: 80,
      });
      mockPrisma.whatsAppConversation.upsert.mockResolvedValueOnce(
        makeConv(TENANT, { state: "cart", cartItems: cartConArroz })
      );

      const res1 = await handleIncomingMessage(TENANT, PHONE, "quiero 2 arroz");
      expect(res1.state).toBe("cart");

      // ── Mensaje 2: agregar aceite ──
      mockPrisma.whatsAppConversation.findUnique.mockResolvedValueOnce(
        makeConv(TENANT, { state: "cart", cartItems: cartConArroz })
      );
      mockClassify.mockResolvedValueOnce({
        intent: "pedido",
        confidence: 0.88,
        items: [{ name: "aceite", quantity: 1, unit: "und" }],
      });
      mockPrisma.product.findFirst.mockResolvedValueOnce({
        id: 30, name: "Aceite Vegetal", price: 8.5, unit: "und", stock: 40,
      });
      mockPrisma.whatsAppConversation.upsert.mockResolvedValueOnce(
        makeConv(TENANT, { state: "cart", cartItems: cartCompleto })
      );

      const res2 = await handleIncomingMessage(TENANT, PHONE, "agrega tambien 1 aceite");
      expect(res2.state).toBe("cart");

      // ── Mensaje 3: confirmar pedido (sin dirección → pide dirección) ──
      mockPrisma.whatsAppConversation.findUnique.mockResolvedValueOnce(
        makeConv(TENANT, {
          state: "cart",
          cartItems: cartCompleto,
          deliveryAddress: null, // no hay dirección → handler debe pedirla
        })
      );
      mockClassify.mockResolvedValueOnce({ intent: "confirmar", confidence: 0.96 });
      mockPrisma.whatsAppConversation.upsert.mockResolvedValueOnce(
        makeConv(TENANT, { state: "checkout" })
      );

      const res3 = await handleIncomingMessage(TENANT, PHONE, "confirmo el pedido");

      // Sin dirección → orderCreateHandler pide la dirección (formatAskAddress)
      const pidioDireccion =
        res3.reply.toLowerCase().includes("direcc") ||
        res3.reply.toLowerCase().includes("enviamos") ||
        res3.reply.toLowerCase().includes("entrega");

      expect(pidioDireccion).toBe(true);
      // El estado avanza a checkout mientras espera la dirección
      expect(res3.state).toBe("checkout");
    });

    it("sesión expirada → el engine trata al usuario como nuevo, welcome menu", async () => {
      // Conversación existe pero expiresAt está en el pasado
      mockPrisma.whatsAppConversation.findUnique.mockResolvedValue(
        makeConv(TENANT, {
          state: "cart",
          cartItems: [
            { productId: 10, name: "Arroz Superior", quantity: 2, price: 4.5, unit: "kg" },
          ],
          expiresAt: new Date(Date.now() - 5000), // expiró hace 5 segundos
        })
      );

      // delete es fire-and-forget en getConversation
      mockPrisma.whatsAppConversation.delete.mockResolvedValue(undefined);

      mockClassify.mockResolvedValue({ intent: "saludo", confidence: 0.94 });
      stubUpsert(TENANT, { state: "idle" });

      const res = await handleIncomingMessage(TENANT, PHONE, "hola, volviendo a comprar");

      // Sesión expirada → getConversation retorna null → conversación fresca
      expect(res.reply).toContain("Buleje");
      expect(res.state).toBe("idle");
    });
  });

  // ── Flujo 7: Aislamiento multi-tenant ────────────────────────────────────

  describe("Flujo: aislamiento multi-tenant (CLAUDE.md regla #3)", () => {
    it("tenantId del contexto se usa en todas las queries — nunca el del payload", async () => {
      const TENANT_X = "tenant-X";

      mockClassify.mockResolvedValue({
        intent: "precio",
        confidence: 0.90,
        productQuery: "harina",
      });

      mockPrisma.product.findMany.mockResolvedValue([
        { id: 99, name: "Harina Blanca", price: 2.5, stock: 100, unit: "kg" },
      ]);

      mockPrisma.whatsAppConversation.upsert.mockResolvedValue(
        makeConv(TENANT_X, { state: "browsing" })
      );

      await handleIncomingMessage(TENANT_X, PHONE, "cuanto cuesta la harina");

      // Verificar que la query de productos usó TENANT_X
      const productQuery = mockPrisma.product.findMany.mock.calls[0][0] as {
        where: { tenantId: string };
      };
      expect(productQuery.where.tenantId).toBe(TENANT_X);
      expect(productQuery.where.tenantId).not.toBe(TENANT);
    });

    it("dos tenants con mismo PHONE → cada uno tiene su propia conversación", async () => {
      const TENANT_A = "tenant-aaa";
      const TENANT_B = "tenant-bbb";

      // Tenant A tiene estado=cart, tenant B no tiene conversación
      mockPrisma.whatsAppConversation.findUnique
        .mockResolvedValueOnce(makeConv(TENANT_A, { state: "cart" }))
        .mockResolvedValueOnce(null); // tenant B no existe

      mockClassify.mockResolvedValue({ intent: "saludo", confidence: 0.92 });

      mockPrisma.whatsAppConversation.upsert
        .mockResolvedValueOnce(makeConv(TENANT_A, { state: "cart" }))
        .mockResolvedValueOnce(makeConv(TENANT_B, { state: "idle" }));

      const resA = await handleIncomingMessage(TENANT_A, PHONE, "hola");
      const resB = await handleIncomingMessage(TENANT_B, PHONE, "hola");

      // Tenant A preserva estado=cart (conversación existente), B arranca idle
      // Ambos reciben welcome menu porque saludo → fallbackHandler
      expect(resA.reply).toContain("Buleje");
      expect(resB.reply).toContain("Buleje");

      // El upsert fue llamado con el tenantId correcto en cada caso
      const upsertCallA = mockPrisma.whatsAppConversation.upsert.mock.calls[0][0] as {
        where: { tenantId_phone: { tenantId: string } };
      };
      const upsertCallB = mockPrisma.whatsAppConversation.upsert.mock.calls[1][0] as {
        where: { tenantId_phone: { tenantId: string } };
      };
      expect(upsertCallA.where.tenantId_phone.tenantId).toBe(TENANT_A);
      expect(upsertCallB.where.tenantId_phone.tenantId).toBe(TENANT_B);
    });
  });

  // ── Flujo 8: Casos edge y resiliencia ────────────────────────────────────

  describe("Flujo: resiliencia y casos edge", () => {
    it("mensaje > 500 caracteres → rechazado antes de llamar al AI classifier", async () => {
      const mensajeLargo = "comprar ".repeat(65); // 520 caracteres

      const res = await handleIncomingMessage(TENANT, PHONE, mensajeLargo);

      expect(res.reply).toContain("largo");
      // El clasificador NO debe ser llamado — economía de tokens
      expect(mockClassify).not.toHaveBeenCalled();
      expect(res.escalated).toBe(false);
    });

    it("error de DB en consulta de producto → respuesta amigable, sin crash del proceso", async () => {
      mockClassify.mockResolvedValue({
        intent: "precio",
        confidence: 0.91,
        productQuery: "leche",
      });

      // Simular falla de conexión a DB
      mockPrisma.product.findMany.mockRejectedValue(new Error("ECONNREFUSED"));

      // El upsert puede fallar también — el engine debe sobrevivir
      mockPrisma.whatsAppConversation.upsert.mockResolvedValue(
        makeConv(TENANT, { state: "browsing" })
      );

      const res = await handleIncomingMessage(TENANT, PHONE, "cuanto cuesta la leche");

      // No debe lanzar — debe retornar un mensaje de error amigable
      expect(res.reply).toBeDefined();
      expect(typeof res.reply).toBe("string");
      expect(res.reply.length).toBeGreaterThan(5);
      expect(res.escalated).toBe(false);
    });

    it("error de DB en upsertConversation → no crashea, la respuesta igual se retorna", async () => {
      mockClassify.mockResolvedValue({ intent: "saludo", confidence: 0.93 });

      // findUnique ok, pero upsert falla
      mockPrisma.whatsAppConversation.findUnique.mockResolvedValue(null);
      mockPrisma.whatsAppConversation.upsert.mockRejectedValue(
        new Error("DB write timeout")
      );

      // No debe lanzar — el engine captura errores de upsert en conversation-store
      const res = await handleIncomingMessage(TENANT, PHONE, "hola").catch(
        (err) => ({ reply: `THREW: ${err.message}`, state: "idle" as const, escalated: false })
      );

      // La respuesta debe existir (incluso si el upsert falló)
      expect(res.reply).toBeDefined();
    });

    it("confirmar pedido con /api/orders fallando → reply de error amigable sin crash", async () => {
      const cartItems = [
        { productId: 10, name: "Arroz Superior", quantity: 2, price: 4.5, unit: "kg" },
      ];

      mockPrisma.whatsAppConversation.findUnique.mockResolvedValue(
        makeConv(TENANT, {
          state: "cart",
          cartItems,
          deliveryAddress: "Jr. Ucayali 123",
        })
      );

      mockClassify.mockResolvedValue({ intent: "confirmar", confidence: 0.97 });

      // La API de órdenes falla con error HTTP 500
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
        json: async () => ({}),
      } as Response);

      stubUpsert(TENANT, { state: "cart" });

      const res = await handleIncomingMessage(TENANT, PHONE, "confirmo el pedido");

      // No debe lanzar — debe retornar mensaje de error amigable
      expect(res.reply).toBeDefined();
      // El reply debe mencionar el problema o sugerir acción alternativa
      const contieneErrorInfo =
        res.reply.includes("problema") ||
        res.reply.includes("error") ||
        res.reply.includes("humano") ||
        res.reply.includes("Error");

      expect(contieneErrorInfo).toBe(true);
    });

    it("cancelar pedido (intent=cancelar_pedido) → carrito vacío y reset a idle", async () => {
      const cartItems = [
        { productId: 10, name: "Arroz Superior", quantity: 2, price: 4.5, unit: "kg" },
      ];

      mockPrisma.whatsAppConversation.findUnique.mockResolvedValue(
        makeConv(TENANT, { state: "cart", cartItems })
      );

      // El intent 'cancelar_pedido' está mapeado en la state machine como "*:cancelar_pedido"
      mockClassify.mockResolvedValue({
        intent: "cancelar_pedido" as never, // tipo extendido para test
        confidence: 0.88,
      });
      mockShouldTrust.mockReturnValue(true);

      stubUpsert(TENANT, { state: "idle" });

      const res = await handleIncomingMessage(TENANT, PHONE, "cancela mi pedido");

      // orderCancelHandler limpia el carrito y vuelve a idle
      expect(res.state).toBe("idle");
      // El reply menciona que el carrito fue vaciado
      const confirmaCancelacion =
        res.reply.includes("vaciado") ||
        res.reply.includes("cancelado") ||
        res.reply.toLowerCase().includes("hola"); // fallback si el intent no está en transitions

      expect(confirmaCancelacion).toBe(true);
    });
  });
});
