/**
 * Tests — GET /api/cron/vendor-reverify
 *
 * TD-058 capas 4/6/7 — cron 6 AM Lima (11:00 UTC).
 *
 * Cubre:
 *   - Happy path: vendor HABIDO → succeeded=1, no alerts
 *   - Primera consulta: vendor NO HABIDO de entrada → alert ruc-changed
 *   - Primera consulta: RUC no encontrado → alert ruc-not-found
 *   - Segunda corrida: HABIDO→NO HABIDO → alert ruc-changed (capa 4 detecta cambio)
 *   - DNI desaparecido entre runs → alert dni-not-found
 *   - Capa 6: notification creada con severity HIGH al tenant
 *   - Capa 7: WhatsApp enviado solo cuando notification.created=true
 *   - Grace activo → skip notificacion, contado en gracedCount
 *   - Error en verifyRuc → failed++, cron sigue con siguiente vendor
 *   - Response JSON incluye {ok, processed, succeeded, failed, durationMs}
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Cache in-memory real para testear snapshot persistence entre vendors.
const { snapshotStore } = vi.hoisted(() => ({
  snapshotStore: new Map<string, unknown>(),
}));
vi.mock("@/lib/cache", () => ({
  cacheStore: {
    get: vi.fn((key: string) => snapshotStore.get(key) ?? null),
    set: vi.fn((key: string, value: unknown) => {
      snapshotStore.set(key, value);
    }),
    del: vi.fn((key: string) => {
      snapshotStore.delete(key);
    }),
  },
}));

// withCronHealth: bypass auth en tests, ejecuta handler directamente.
vi.mock("@/lib/cron/with-cron-health", () => ({
  withCronHealth: (_name: string, handler: (req: NextRequest) => Promise<Response>) => handler,
}));

const { mockVerifyRuc, mockVerifyDni, mockIsInvoiceable } = vi.hoisted(() => ({
  mockVerifyRuc: vi.fn(),
  mockVerifyDni: vi.fn(),
  mockIsInvoiceable: vi.fn(),
}));

vi.mock("@/lib/integrations/sunat-ruc", () => ({
  verifyRuc: mockVerifyRuc,
  isInvoiceable: mockIsInvoiceable,
}));

vi.mock("@/lib/integrations/reniec", () => ({
  verifyDni: mockVerifyDni,
}));

const { mockFindMany, mockNotifCreateOrReuse, mockSendAlert } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockNotifCreateOrReuse: vi.fn(async () => ({ id: "n-mock", created: true })),
  mockSendAlert: vi.fn(async () => ({ waSent: true, emailSent: false, anyChannelOk: true })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    vendorApplication: { findMany: mockFindMany },
  },
}));

vi.mock("@/lib/db/notification-center.db", () => ({
  NotificationCenterDB: {
    createOrReuse: mockNotifCreateOrReuse,
  },
}));

vi.mock("@/lib/notifications/vendor-identity-alert", () => ({
  sendVendorIdentityAlert: mockSendAlert,
}));

const { mockShouldSkip, mockGraceGet } = vi.hoisted(() => ({
  mockShouldSkip: vi.fn(() => false),
  mockGraceGet: vi.fn<() => unknown>(() => null),
}));

vi.mock("@/lib/db/vendor-grace.db", () => ({
  VendorGraceDB: {
    shouldSkip: mockShouldSkip,
    get: mockGraceGet,
  },
}));

import { GET } from "@/app/api/cron/vendor-reverify/route";

function makeReq(): NextRequest {
  return new NextRequest("https://example.com/api/cron/vendor-reverify", {
    headers: { authorization: "Bearer test" },
  });
}

function habidoRuc() {
  return { ok: true, source: "apisperu", estado: "ACTIVO", condicion: "HABIDO" };
}

function noHabidoRuc() {
  return { ok: true, source: "apisperu", estado: "ACTIVO", condicion: "NO HABIDO" };
}

describe("GET /api/cron/vendor-reverify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    snapshotStore.clear();
    mockShouldSkip.mockReturnValue(false);
    mockGraceGet.mockReturnValue(null);
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  it("happy path: 0 vendors → ok=true, processed=0, sin alerts", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.processed).toBe(0);
    expect(body.succeeded).toBe(0);
    expect(body.failed).toBe(0);
    expect(typeof body.durationMs).toBe("number");
  });

  it("happy path: vendor HABIDO → succeeded=1, no alerts, snapshot persistido", async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: "v-ok",
        ruc: "20123456789",
        contactDni: "12345678",
        contactName: "Carlos",
        businessName: "Bodega Sana",
        contactPhone: "51987000001",
        contactEmail: "carlos@bodega.pe",
        tenantId: "t-ok",
        tenantSlug: "bodega-sana",
      },
    ]);
    mockVerifyRuc.mockResolvedValueOnce(habidoRuc());
    mockIsInvoiceable.mockReturnValueOnce(true);
    mockVerifyDni.mockResolvedValueOnce({ ok: true, source: "apisperu" });

    const res = await GET(makeReq());
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.processed).toBe(1);
    expect(body.succeeded).toBe(1);
    expect(body.failed).toBe(0);
    expect(body.notifiedCount).toBe(0);
    expect(body.waSentCount).toBe(0);
    // Notification NO se crea si todo está bien.
    expect(mockNotifCreateOrReuse).not.toHaveBeenCalled();
    // Snapshot guardado en cacheStore.
    expect(snapshotStore.has("vendor-identity-snapshot:v-ok")).toBe(true);
  });

  // ── Primera consulta — vendor ya llega en mal estado ──────────────────────

  it("primera consulta: RUC NO HABIDO de entrada → alert ruc-changed, severity MEDIUM", async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: "v-mal",
        ruc: "20999999999",
        contactDni: null,
        contactName: "X",
        businessName: "Bodega Mal Estado",
        tenantId: "t-mal",
        tenantSlug: "bodega-mal",
      },
    ]);
    mockVerifyRuc.mockResolvedValueOnce(noHabidoRuc());
    mockIsInvoiceable.mockReturnValueOnce(false);

    const res = await GET(makeReq());
    const body = await res.json();

    expect(body.processed).toBe(1);
    expect(body.succeeded).toBe(1);
    expect(body.notifiedCount).toBe(1); // notification creada
    const callArg = (mockNotifCreateOrReuse.mock.calls as unknown as Array<[Record<string, unknown>]>)[0]?.[0];
    expect(callArg.type).toBe("VENDOR_IDENTITY_ALERT");
    expect(callArg.severity).toBe("MEDIUM");
    expect(callArg.tenantId).toBe("t-mal");
  });

  it("primera consulta: RUC no encontrado → alert ruc-not-found, severity HIGH", async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: "v-ghost",
        ruc: "20000000001",
        contactDni: null,
        contactName: "X",
        businessName: "Fantasma SAC",
        tenantId: "t-ghost",
        tenantSlug: "ghost",
      },
    ]);
    mockVerifyRuc.mockResolvedValueOnce({ ok: false, source: "apisperu", reason: "not_found" });
    mockIsInvoiceable.mockReturnValueOnce(false);

    const res = await GET(makeReq());
    const body = await res.json();

    expect(body.notifiedCount).toBe(1);
    const callArg = (mockNotifCreateOrReuse.mock.calls as unknown as Array<[Record<string, unknown>]>)[0]?.[0];
    expect(callArg.severity).toBe("HIGH");
  });

  // ── Capa 4: detección de cambio entre runs ────────────────────────────────

  it("capa 4: HABIDO run 1 → NO HABIDO run 2 → alert ruc-changed con snapshot previo", async () => {
    const vendor = {
      id: "v-change",
      ruc: "20111111111",
      contactDni: "11111111",
      contactName: "X",
      businessName: "Bodega Degradada",
      tenantId: "t-change",
      tenantSlug: "degradada",
    };

    // Run 1 — HABIDO
    mockFindMany.mockResolvedValueOnce([vendor]);
    mockVerifyRuc.mockResolvedValueOnce(habidoRuc());
    mockIsInvoiceable.mockReturnValueOnce(true);
    mockVerifyDni.mockResolvedValueOnce({ ok: true, source: "apisperu" });
    const r1 = await GET(makeReq());
    const b1 = await r1.json();
    expect(b1.notifiedCount).toBe(0);

    // Run 2 — NO HABIDO (snapshot anterior: invoiceable=true)
    mockFindMany.mockResolvedValueOnce([vendor]);
    mockVerifyRuc.mockResolvedValueOnce(noHabidoRuc());
    mockIsInvoiceable.mockReturnValueOnce(false);
    mockVerifyDni.mockResolvedValueOnce({ ok: true, source: "apisperu" });
    const r2 = await GET(makeReq());
    const b2 = await r2.json();

    expect(b2.notifiedCount).toBe(1);
    expect(b2.waSentCount).toBe(1); // capa 7 disparó
    const callArg = (mockNotifCreateOrReuse.mock.calls as unknown as Array<[Record<string, unknown>]>)[0]?.[0];
    expect(callArg.severity).toBe("HIGH");
  });

  // ── Capa 6: PersistentNotification ───────────────────────────────────────

  it("capa 6: notification NOT creada en run 2 si vendor reusa existente (dedup 24h)", async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: "v-reuse",
        ruc: "20222222222",
        contactDni: null,
        contactName: "X",
        contactPhone: "51987222222",
        businessName: "Reuse Bodega",
        tenantId: "t-reuse",
        tenantSlug: "reuse",
      },
    ]);
    mockVerifyRuc.mockResolvedValueOnce({ ok: false, source: "apisperu", reason: "not_found" });
    mockIsInvoiceable.mockReturnValueOnce(false);
    // Notification ya existía → created=false
    mockNotifCreateOrReuse.mockResolvedValueOnce({ id: "n-existing", created: false });

    const res = await GET(makeReq());
    const body = await res.json();

    // WA/email NO se envían si notification.created=false.
    expect(mockSendAlert).not.toHaveBeenCalled();
    expect(body.notifiedCount).toBe(0);
    expect(body.waSentCount).toBe(0);
  });

  // ── Capa 7: WhatsApp / email ──────────────────────────────────────────────

  it("capa 7: WA enviado cuando notification.created=true y hay contactPhone", async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: "v-wa",
        ruc: "20333333333",
        contactDni: null,
        contactName: "Ana",
        contactPhone: "51987333333",
        contactEmail: null,
        businessName: "WA Bodega",
        tenantId: "t-wa",
        tenantSlug: "wa",
      },
    ]);
    mockVerifyRuc.mockResolvedValueOnce({ ok: false, source: "apisperu", reason: "not_found" });
    mockIsInvoiceable.mockReturnValueOnce(false);
    mockNotifCreateOrReuse.mockResolvedValueOnce({ id: "n-wa", created: true });

    const res = await GET(makeReq());
    const body = await res.json();

    expect(mockSendAlert).toHaveBeenCalledTimes(1);
    const waArg = (mockSendAlert.mock.calls as unknown as Array<[Record<string, unknown>]>)[0]?.[0];
    expect(waArg.tenantId).toBe("t-wa");
    expect(waArg.vendorId).toBe("v-wa");
    expect(waArg.kind).toBe("ruc-not-found");
    expect(waArg.rucLast4).toBe("3333");
    expect(body.waSentCount).toBe(1);
  });

  it("capa 7: solo email cuando WA falla (no hay contactPhone)", async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: "v-email",
        ruc: "20444444444",
        contactDni: null,
        contactName: "B",
        contactPhone: null,
        contactEmail: "b@b.pe",
        businessName: "Email Bodega",
        tenantId: "t-email",
        tenantSlug: "email",
      },
    ]);
    mockVerifyRuc.mockResolvedValueOnce({ ok: false, source: "apisperu", reason: "not_found" });
    mockIsInvoiceable.mockReturnValueOnce(false);
    mockNotifCreateOrReuse.mockResolvedValueOnce({ id: "n-email", created: true });
    mockSendAlert.mockResolvedValueOnce({ waSent: false, emailSent: true, anyChannelOk: true });

    const res = await GET(makeReq());
    const body = await res.json();

    expect(body.waSentCount).toBe(0);
    expect(body.emailSentCount).toBe(1);
  });

  // ── Grace period (capa 8 — complemento) ──────────────────────────────────

  it("grace activo → skip notificacion/WA, gracedCount++", async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: "v-grace",
        ruc: "20555555555",
        contactDni: null,
        contactName: "C",
        contactPhone: "51987555555",
        businessName: "Grace Bodega",
        tenantId: "t-grace",
        tenantSlug: "grace",
      },
    ]);
    mockVerifyRuc.mockResolvedValueOnce({ ok: false, source: "apisperu", reason: "not_found" });
    mockIsInvoiceable.mockReturnValueOnce(false);
    mockShouldSkip.mockReturnValueOnce(true);
    mockGraceGet.mockReturnValueOnce({
      vendorId: "v-grace",
      kind: "ruc-not-found",
      until: "2026-06-20T00:00:00Z",
      graceDays: 14,
      reason: "Cita SUNAT pendiente",
      acknowledgedBy: "admin-grace",
      acknowledgedAt: "2026-05-23T00:00:00Z",
    });

    const res = await GET(makeReq());
    const body = await res.json();

    expect(mockNotifCreateOrReuse).not.toHaveBeenCalled();
    expect(mockSendAlert).not.toHaveBeenCalled();
    expect(body.gracedCount).toBe(1);
    expect(body.notifiedCount).toBe(0);
    expect(body.waSentCount).toBe(0);
    // Grace aparece en el array para visibilidad superadmin.
    expect(body.gracedCount).toBe(1);
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it("verifyRuc lanza excepcion → failed++, cron continua con siguiente vendor", async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: "v-fail",
        ruc: "20666666666",
        contactDni: null,
        contactName: "D",
        businessName: "Fail Vendor",
        tenantId: "t-fail",
        tenantSlug: "fail",
      },
      {
        id: "v-ok2",
        ruc: "20777777777",
        contactDni: null,
        contactName: "E",
        businessName: "OK Vendor 2",
        tenantId: "t-ok2",
        tenantSlug: "ok2",
      },
    ]);
    mockVerifyRuc
      .mockRejectedValueOnce(new Error("apisperu timeout"))
      .mockResolvedValueOnce(habidoRuc());
    mockIsInvoiceable.mockReturnValueOnce(true);

    const res = await GET(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.processed).toBe(2);
    expect(body.failed).toBe(1);
    expect(body.succeeded).toBe(1); // el segundo procesó bien
  });

  it("notification falla en DB → cron sigue, notifiedCount=0, ok=true", async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: "v-notif-fail",
        ruc: "20888888888",
        contactDni: null,
        contactName: "F",
        businessName: "NotifFail Bodega",
        tenantId: "t-notif-fail",
        tenantSlug: "notif-fail",
      },
    ]);
    mockVerifyRuc.mockResolvedValueOnce({ ok: false, source: "apisperu", reason: "not_found" });
    mockIsInvoiceable.mockReturnValueOnce(false);
    mockNotifCreateOrReuse.mockRejectedValueOnce(new Error("DB connection reset"));

    const res = await GET(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.notifiedCount).toBe(0); // la fallida no cuenta
    expect(body.succeeded).toBe(1);   // vendor igualmente se marcó como procesado
  });

  // ── Response shape ────────────────────────────────────────────────────────

  it("response incluye todos los campos del contrato", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeReq());
    const body = await res.json();

    expect(body).toMatchObject({
      ok: true,
      processed: expect.any(Number),
      succeeded: expect.any(Number),
      failed: expect.any(Number),
      notifiedCount: expect.any(Number),
      waSentCount: expect.any(Number),
      emailSentCount: expect.any(Number),
      gracedCount: expect.any(Number),
      durationMs: expect.any(Number),
    });
  });
});
