/**
 * Tests: Route handlers de sponsored (C5)
 * Cubre: GET + POST /api/marketplace/sponsored
 *        PATCH + DELETE /api/marketplace/sponsored/[id]
 *        POST /api/marketplace/sponsored/[id]/click
 * Auth y ownership checks incluidos.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

// ── Auth mock ────────────────────────────────────────────────────────────────

const { mockRequireAdmin } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
}));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: mockRequireAdmin }));

// ── DB mock ──────────────────────────────────────────────────────────────────

const { mockListByStore, mockCreate, mockPause, mockResume, mockCancel, mockRecordClick } = vi.hoisted(() => ({
  mockListByStore: vi.fn(),
  mockCreate: vi.fn(),
  mockPause: vi.fn(),
  mockResume: vi.fn(),
  mockCancel: vi.fn(),
  mockRecordClick: vi.fn(),
}));

vi.mock("@/lib/db/sponsored-boosts.db", () => ({
  SponsoredBoostsDB: {
    listByStore: mockListByStore,
    create: mockCreate,
    pause: mockPause,
    resume: mockResume,
    cancel: mockCancel,
    recordClick: mockRecordClick,
  },
}));

// ── Importar handlers ────────────────────────────────────────────────────────

import { GET, POST } from "@/app/api/marketplace/sponsored/route";
import { PATCH, DELETE } from "@/app/api/marketplace/sponsored/[id]/route";
import { POST as clickPost } from "@/app/api/marketplace/sponsored/[id]/click/route";

// ── Helpers ──────────────────────────────────────────────────────────────────

const AUTH = { tenantId: "main", role: "tienda_owner", username: "vendedor" };
const UNAUTH = NextResponse.json({ error: "unauthorized" }, { status: 401 });

function makeReq(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    ...(body !== undefined && {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  });
}

const BASE = "http://localhost:3000";

// ── Tests: GET ───────────────────────────────────────────────────────────────

describe("GET /api/marketplace/sponsored", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 401 si no está autenticado", async () => {
    mockRequireAdmin.mockResolvedValueOnce(UNAUTH);

    const res = await GET(makeReq("GET", `${BASE}/api/marketplace/sponsored?storeId=s1`));

    expect(res.status).toBe(401);
  });

  it("retorna 200 con data vacía si falta storeId (graceful degradation para widget admin)", async () => {
    mockRequireAdmin.mockResolvedValueOnce(AUTH);

    const res = await GET(makeReq("GET", `${BASE}/api/marketplace/sponsored`));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual([]);
    expect(json.total).toBe(0);
  });

  it("lista boosts de la store correctamente", async () => {
    mockRequireAdmin.mockResolvedValueOnce(AUTH);
    mockListByStore.mockResolvedValueOnce([
      { id: "b1", storeId: "store-1", status: "active", bidAmount: 10 },
    ]);

    const res = await GET(makeReq("GET", `${BASE}/api/marketplace/sponsored?storeId=store-1`));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(1);
    expect(json.total).toBe(1);
    expect(mockListByStore).toHaveBeenCalledWith("main", "store-1");
  });
});

// ── Tests: POST ──────────────────────────────────────────────────────────────

describe("POST /api/marketplace/sponsored", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 401 si no está autenticado", async () => {
    mockRequireAdmin.mockResolvedValueOnce(UNAUTH);

    const res = await POST(makeReq("POST", `${BASE}/api/marketplace/sponsored`, {}));

    expect(res.status).toBe(401);
  });

  it("retorna 400 con body inválido (faltan campos)", async () => {
    mockRequireAdmin.mockResolvedValueOnce(AUTH);

    const res = await POST(
      makeReq("POST", `${BASE}/api/marketplace/sponsored`, {
        storeId: "s1",
        // faltan productId, bidAmount, startDate, endDate, maxBudgetPen
      }),
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.issues).toBeDefined();
  });

  it("crea un boost con datos válidos y retorna 201", async () => {
    mockRequireAdmin.mockResolvedValueOnce(AUTH);
    const now = new Date();
    const fakeBoost = {
      id: "boost-new",
      tenantId: "main",
      storeId: "store-1",
      productId: 5,
      bidAmount: 15,
      startDate: now.toISOString(),
      endDate: new Date(now.getTime() + 86400000).toISOString(),
      status: "active",
      impressionsCount: 0,
      clicksCount: 0,
      conversionsCount: 0,
      totalSpentPen: 0,
      maxBudgetPen: 200,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    mockCreate.mockResolvedValueOnce(fakeBoost);

    const body = {
      storeId: "store-1",
      productId: 5,
      bidAmount: 15,
      startDate: now.toISOString(),
      endDate: new Date(now.getTime() + 86400000).toISOString(),
      maxBudgetPen: 200,
    };

    const res = await POST(makeReq("POST", `${BASE}/api/marketplace/sponsored`, body));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.id).toBe("boost-new");
    expect(json.data.status).toBe("active");
  });
});

// ── Tests: PATCH ─────────────────────────────────────────────────────────────

describe("PATCH /api/marketplace/sponsored/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 401 sin auth", async () => {
    mockRequireAdmin.mockResolvedValueOnce(UNAUTH);

    const res = await PATCH(
      makeReq("PATCH", `${BASE}/api/marketplace/sponsored/b1`, { action: "pause" }),
      { params: Promise.resolve({ id: "b1" }) },
    );

    expect(res.status).toBe(401);
  });

  it("retorna 400 con action inválida", async () => {
    mockRequireAdmin.mockResolvedValueOnce(AUTH);

    const res = await PATCH(
      makeReq("PATCH", `${BASE}/api/marketplace/sponsored/b1`, { action: "destruir" }),
      { params: Promise.resolve({ id: "b1" }) },
    );

    expect(res.status).toBe(400);
  });

  it("pausa un boost correctamente", async () => {
    mockRequireAdmin.mockResolvedValueOnce(AUTH);
    mockPause.mockResolvedValueOnce({ id: "b1", status: "paused" });

    const res = await PATCH(
      makeReq("PATCH", `${BASE}/api/marketplace/sponsored/b1`, { action: "pause" }),
      { params: Promise.resolve({ id: "b1" }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.status).toBe("paused");
    expect(mockPause).toHaveBeenCalledWith("main", "b1");
  });

  it("reanuda un boost con action=resume", async () => {
    mockRequireAdmin.mockResolvedValueOnce(AUTH);
    mockResume.mockResolvedValueOnce({ id: "b1", status: "active" });

    const res = await PATCH(
      makeReq("PATCH", `${BASE}/api/marketplace/sponsored/b1`, { action: "resume" }),
      { params: Promise.resolve({ id: "b1" }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.status).toBe("active");
  });

  it("cancela un boost con action=cancel", async () => {
    mockRequireAdmin.mockResolvedValueOnce(AUTH);
    mockCancel.mockResolvedValueOnce({ id: "b1", status: "expired" });

    const res = await PATCH(
      makeReq("PATCH", `${BASE}/api/marketplace/sponsored/b1`, { action: "cancel" }),
      { params: Promise.resolve({ id: "b1" }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.status).toBe("expired");
  });
});

// ── Tests: DELETE ─────────────────────────────────────────────────────────────

describe("DELETE /api/marketplace/sponsored/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 401 sin auth", async () => {
    mockRequireAdmin.mockResolvedValueOnce(UNAUTH);

    const res = await DELETE(
      makeReq("DELETE", `${BASE}/api/marketplace/sponsored/b1`),
      { params: Promise.resolve({ id: "b1" }) },
    );

    expect(res.status).toBe(401);
  });

  it("cancela el boost y retorna 204", async () => {
    mockRequireAdmin.mockResolvedValueOnce(AUTH);
    mockCancel.mockResolvedValueOnce({ id: "b1", status: "expired" });

    const res = await DELETE(
      makeReq("DELETE", `${BASE}/api/marketplace/sponsored/b1`),
      { params: Promise.resolve({ id: "b1" }) },
    );

    expect(res.status).toBe(204);
    expect(mockCancel).toHaveBeenCalledWith("main", "b1");
  });
});

// ── Tests: click ──────────────────────────────────────────────────────────────

describe("POST /api/marketplace/sponsored/[id]/click", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecordClick.mockResolvedValue(undefined);
  });

  it("registra click y retorna 204 (endpoint público, sin auth)", async () => {
    const req = new NextRequest(`${BASE}/api/marketplace/sponsored/boost-xyz/click`, {
      method: "POST",
      headers: { "x-tenant-id": "main" },
    });

    const res = await clickPost(req, { params: Promise.resolve({ id: "boost-xyz" }) });

    expect(res.status).toBe(204);
    await new Promise((r) => setTimeout(r, 0));
    expect(mockRecordClick).toHaveBeenCalledWith("main", "boost-xyz");
  });

  it("usa 'main' como tenantId por defecto si no hay header x-tenant-id", async () => {
    const req = new NextRequest(`${BASE}/api/marketplace/sponsored/b2/click`, {
      method: "POST",
    });

    const res = await clickPost(req, { params: Promise.resolve({ id: "b2" }) });

    expect(res.status).toBe(204);
    await new Promise((r) => setTimeout(r, 0));
    expect(mockRecordClick).toHaveBeenCalledWith("main", "b2");
  });
});
