/**
 * Tests para lib/queue.ts y lib/workers/*.worker.ts
 *
 * Valida:
 * - queue.enqueue: genera jobId, llama fetch interno, no bloquea
 * - queue.retry: incrementa attempt, respeta maxAttempts (dead-letter)
 * - verifyWorkerSecret: acepta secret válido, rechaza inválido
 * - Schemas Zod: EmailPayload, PdfPayload, WhatsappPayload, PushPayload, ActivityPayload
 * - Workers: manejo de payload inválido, éxito, retry en fallo, skip sin config
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks globales ─────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));

// Mock de logger para no contaminar stdout
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock de fetch global
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock de push-sender
vi.mock("@/lib/push-sender", () => ({
  sendPushToPhone: vi.fn(),
  broadcastPush: vi.fn(),
}));

// Mock de prisma
const mockCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    activityLog: {
      create: mockCreate,
    },
  },
}));

// ── Importaciones bajo prueba ─────────────────────────────────────────────────

import {
  queue,
  verifyWorkerSecret,
  EmailPayloadSchema,
  PdfPayloadSchema,
  WhatsappPayloadSchema,
  PushPayloadSchema,
  ActivityPayloadSchema,
  JobEnvelopeSchema,
  type JobEnvelope,
} from "@/lib/queue";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeEnvelope(overrides: Partial<JobEnvelope> = {}): JobEnvelope {
  return {
    jobId: "job_test_abc1234",
    type: "send-email",
    payload: {
      tenantId: "tenant-1",
      to: "test@example.com",
      subject: "Prueba",
      html: "<p>Hola</p>",
    },
    attempt: 1,
    maxAttempts: 3,
    enqueuedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── queue.enqueue ─────────────────────────────────────────────────────────────

describe("queue.enqueue", () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    process.env.NEXT_PUBLIC_BASE_URL = "http://localhost:3000";
    process.env.WORKER_SECRET = "test-secret";
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("retorna un jobId único", async () => {
    const id1 = await queue.enqueue("send-email", {
      tenantId: "t1",
      to: "a@b.com",
      subject: "s",
      html: "<p/>",
    });
    const id2 = await queue.enqueue("send-email", {
      tenantId: "t1",
      to: "a@b.com",
      subject: "s",
      html: "<p/>",
    });

    expect(id1).toMatch(/^job_\d+_[a-z0-9]+$/);
    expect(id2).toMatch(/^job_\d+_[a-z0-9]+$/);
    expect(id1).not.toBe(id2);
  });

  it("dispara fetch al endpoint correcto sin bloquear", async () => {
    await queue.enqueue("send-push-notification", {
      tenantId: "t1",
      title: "Alerta",
      body: "Nuevo pedido",
    });

    // fetch se llama de forma fire-and-forget — puede no haberse llamado aún
    // Esperamos al siguiente tick del event loop
    await new Promise((r) => setTimeout(r, 0));

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/workers/send-push-notification",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-worker-secret": "test-secret",
        }),
      }),
    );
  });

  it("no lanza aunque fetch falle", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    await expect(
      queue.enqueue("log-activity", {
        tenantId: "t1",
        action: "CREATE",
        entity: "Product",
        detail: "Producto creado",
      }),
    ).resolves.toMatch(/^job_/);
  });
});

// ── queue.retry ───────────────────────────────────────────────────────────────

describe("queue.retry", () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue({ ok: true });
    process.env.NEXT_PUBLIC_BASE_URL = "http://localhost:3000";
    process.env.WORKER_SECRET = "test-secret";
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("dispatch con attempt incrementado si hay intentos restantes", async () => {
    const envelope = makeEnvelope({ attempt: 1, maxAttempts: 3 });

    await queue.retry(envelope);
    await new Promise((r) => setTimeout(r, 1100)); // esperar backoff de 1s

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/workers/send-email"),
      expect.objectContaining({ method: "POST" }),
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as JobEnvelope;
    expect(body.attempt).toBe(2);
  }, 10_000);

  it("no hace dispatch si se agotaron los intentos (dead-letter)", async () => {
    const envelope = makeEnvelope({ attempt: 3, maxAttempts: 3 });

    await queue.retry(envelope);

    // No debe llamar fetch adicional
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ── verifyWorkerSecret ────────────────────────────────────────────────────────

describe("verifyWorkerSecret", () => {
  beforeEach(() => {
    process.env.WORKER_SECRET = "mi-secret-seguro";
  });

  it("acepta el secret correcto", () => {
    const req = new Request("http://localhost/api/workers/send-email", {
      method: "POST",
      headers: { "x-worker-secret": "mi-secret-seguro" },
    });
    expect(verifyWorkerSecret(req)).toBe(true);
  });

  it("rechaza un secret incorrecto", () => {
    const req = new Request("http://localhost/api/workers/send-email", {
      method: "POST",
      headers: { "x-worker-secret": "otro-secret" },
    });
    expect(verifyWorkerSecret(req)).toBe(false);
  });

  it("rechaza request sin header", () => {
    const req = new Request("http://localhost/api/workers/send-email", {
      method: "POST",
    });
    expect(verifyWorkerSecret(req)).toBe(false);
  });
});

// ── Schemas Zod ───────────────────────────────────────────────────────────────

describe("EmailPayloadSchema", () => {
  it("valida payload correcto", () => {
    const result = EmailPayloadSchema.safeParse({
      tenantId: "t1",
      to: "user@example.com",
      subject: "Hola",
      html: "<p>Contenido</p>",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza email inválido", () => {
    const result = EmailPayloadSchema.safeParse({
      tenantId: "t1",
      to: "no-es-un-email",
      subject: "Hola",
      html: "<p>...</p>",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza si falta tenantId", () => {
    const result = EmailPayloadSchema.safeParse({
      to: "user@example.com",
      subject: "Hola",
      html: "<p>...</p>",
    });
    expect(result.success).toBe(false);
  });
});

describe("PdfPayloadSchema", () => {
  it("valida payload correcto", () => {
    const result = PdfPayloadSchema.safeParse({
      tenantId: "t1",
      pdfType: "invoice",
      data: { invoiceNumber: "001", total: 100 },
    });
    expect(result.success).toBe(true);
  });

  it("acepta sendTo opcional", () => {
    const result = PdfPayloadSchema.safeParse({
      tenantId: "t1",
      pdfType: "stock-report",
      data: { products: [] },
      sendTo: "admin@tienda.com",
    });
    expect(result.success).toBe(true);
  });
});

describe("WhatsappPayloadSchema", () => {
  it("valida payload correcto", () => {
    const result = WhatsappPayloadSchema.safeParse({
      tenantId: "t1",
      phone: "987654321",
      message: "Tu pedido llegó",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza si falta phone", () => {
    const result = WhatsappPayloadSchema.safeParse({
      tenantId: "t1",
      message: "Hola",
    });
    expect(result.success).toBe(false);
  });
});

describe("PushPayloadSchema", () => {
  it("valida broadcast (sin phone)", () => {
    const result = PushPayloadSchema.safeParse({
      tenantId: "t1",
      title: "Promo",
      body: "50% de descuento hoy",
    });
    expect(result.success).toBe(true);
  });

  it("valida push dirigido (con phone)", () => {
    const result = PushPayloadSchema.safeParse({
      tenantId: "t1",
      phone: "987654321",
      title: "Tu pedido",
      body: "Va en camino",
      url: "/pedido/123",
    });
    expect(result.success).toBe(true);
  });
});

describe("ActivityPayloadSchema", () => {
  it("valida payload completo", () => {
    const result = ActivityPayloadSchema.safeParse({
      tenantId: "t1",
      action: "CREATE",
      entity: "Order",
      detail: "Pedido creado",
      entityId: "order-123",
      user: "cajero1",
    });
    expect(result.success).toBe(true);
  });

  it("usa 'system' como user por defecto", () => {
    const result = ActivityPayloadSchema.safeParse({
      tenantId: "t1",
      action: "AUTO",
      entity: "Stock",
      detail: "Reposición automática",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.user).toBe("system");
    }
  });
});

// ── JobEnvelopeSchema ─────────────────────────────────────────────────────────

describe("JobEnvelopeSchema", () => {
  it("valida envelope completo", () => {
    const result = JobEnvelopeSchema.safeParse({
      jobId: "job_123_abc",
      type: "send-email",
      payload: { tenantId: "t1", to: "x@y.com", subject: "s", html: "<p/>" },
      attempt: 1,
      maxAttempts: 3,
      enqueuedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it("rechaza job type desconocido", () => {
    const result = JobEnvelopeSchema.safeParse({
      jobId: "job_123",
      type: "job-tipo-inventado",
      payload: {},
      attempt: 1,
      maxAttempts: 3,
      enqueuedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it("rechaza maxAttempts mayor a 5", () => {
    const result = JobEnvelopeSchema.safeParse({
      jobId: "job_123",
      type: "log-activity",
      payload: {},
      attempt: 1,
      maxAttempts: 10,
      enqueuedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });
});

// ── Worker: send-email ────────────────────────────────────────────────────────

describe("handleSendEmail", () => {
  afterEach(() => vi.clearAllMocks());

  it("sale sin error si SMTP no está configurado", async () => {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;

    const { handleSendEmail } = await import("@/lib/workers/send-email.worker");
    const envelope = makeEnvelope({
      payload: {
        tenantId: "t1",
        to: "test@example.com",
        subject: "S",
        html: "<p/>",
      },
    });

    await expect(handleSendEmail(envelope)).resolves.toBeUndefined();
  });

  it("no reintenta si el payload es inválido", async () => {
    const { handleSendEmail } = await import("@/lib/workers/send-email.worker");
    const envelope = makeEnvelope({
      payload: { tenantId: "t1", to: "no-es-email" }, // falta subject y html
    });

    await handleSendEmail(envelope);

    // fetch no debería llamarse para retry
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ── Worker: log-activity ──────────────────────────────────────────────────────

describe("handleLogActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("crea registro en DB con payload válido", async () => {
    mockCreate.mockResolvedValue({ id: "log-1" });

    const { handleLogActivity } = await import("@/lib/workers/log-activity.worker");
    const envelope = makeEnvelope({
      type: "log-activity",
      payload: {
        tenantId: "t1",
        action: "CREATE",
        entity: "Product",
        detail: "Producto añadido",
        user: "admin",
      },
    });

    await handleLogActivity(envelope);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CREATE",
          entity: "Product",
          detail: "Producto añadido",
          user: "admin",
        }),
      }),
    );
  });

  it("no reintenta en unique constraint error", async () => {
    mockCreate.mockRejectedValue(new Error("Unique constraint failed"));
    mockFetch.mockResolvedValue({ ok: true });

    const { handleLogActivity } = await import("@/lib/workers/log-activity.worker");
    const envelope = makeEnvelope({
      type: "log-activity",
      payload: {
        tenantId: "t1",
        action: "CREATE",
        entity: "Product",
        detail: "Producto",
        user: "admin",
      },
    });

    await handleLogActivity(envelope);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("no procesa payload inválido", async () => {
    const { handleLogActivity } = await import("@/lib/workers/log-activity.worker");
    const envelope = makeEnvelope({
      type: "log-activity",
      payload: { tenantId: "t1" }, // falta action, entity, detail
    });

    await handleLogActivity(envelope);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

// ── Worker: send-whatsapp ─────────────────────────────────────────────────────

describe("handleSendWhatsapp", () => {
  afterEach(() => vi.clearAllMocks());

  it("sale sin error si API no está configurada", async () => {
    delete process.env.WHATSAPP_API_URL;
    delete process.env.WHATSAPP_API_TOKEN;

    const { handleSendWhatsapp } = await import("@/lib/workers/send-whatsapp.worker");
    const envelope = makeEnvelope({
      type: "send-whatsapp",
      payload: { tenantId: "t1", phone: "987654321", message: "Hola" },
    });

    await expect(handleSendWhatsapp(envelope)).resolves.toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("no reintenta en error 4xx del API", async () => {
    process.env.WHATSAPP_API_URL = "https://api.whatsapp.example.com/send";
    process.env.WHATSAPP_API_TOKEN = "token-123";

    // Primer fetch es la llamada al API de WhatsApp (4xx → no retry)
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => "Bad Request",
    });

    const { handleSendWhatsapp } = await import("@/lib/workers/send-whatsapp.worker");
    const envelope = makeEnvelope({
      type: "send-whatsapp",
      payload: { tenantId: "t1", phone: "987654321", message: "Hola" },
    });

    await handleSendWhatsapp(envelope);

    // Solo el fetch al API de WhatsApp, no hay fetch de retry
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ── Worker: send-push-notification ───────────────────────────────────────────

describe("handleSendPushNotification", () => {
  afterEach(() => vi.clearAllMocks());

  it("sale sin error si VAPID no está configurado", async () => {
    delete process.env.VAPID_EMAIL;
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;

    const { handleSendPushNotification } = await import(
      "@/lib/workers/send-push-notification.worker"
    );
    const envelope = makeEnvelope({
      type: "send-push-notification",
      payload: { tenantId: "t1", title: "Test", body: "Mensaje" },
    });

    await expect(handleSendPushNotification(envelope)).resolves.toBeUndefined();
  });

  it("llama sendPushToPhone cuando phone está presente", async () => {
    process.env.VAPID_EMAIL = "push@example.com";
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "pubkey";
    process.env.VAPID_PRIVATE_KEY = "privkey";

    const { sendPushToPhone } = await import("@/lib/push-sender");
    vi.mocked(sendPushToPhone).mockResolvedValue();

    const { handleSendPushNotification } = await import(
      "@/lib/workers/send-push-notification.worker"
    );
    const envelope = makeEnvelope({
      type: "send-push-notification",
      payload: {
        tenantId: "t1",
        phone: "987654321",
        title: "Tu pedido",
        body: "Va en camino",
      },
    });

    await handleSendPushNotification(envelope);

    expect(sendPushToPhone).toHaveBeenCalledWith(
      "987654321",
      expect.objectContaining({ title: "Tu pedido", body: "Va en camino" }),
    );
  });
});
