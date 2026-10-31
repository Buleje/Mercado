import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/juntas.db", () => ({ JuntasDB: { expireStale: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

import { GET } from "@/app/api/cron/juntas-resolve/route";
import { JuntasDB } from "@/lib/db/juntas.db";

function req(auth?: string) {
  return {
    headers: { get: (k: string) => (k === "authorization" ? (auth ?? null) : null) },
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-secret";
});

describe("GET /api/cron/juntas-resolve", () => {
  it("sin auth → 401, no toca la DB", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(JuntasDB.expireStale).not.toHaveBeenCalled();
  });

  it("auth incorrecta → 401", async () => {
    const res = await GET(req("Bearer wrong"));
    expect(res.status).toBe(401);
  });

  it("auth correcta → expira juntas y devuelve el count", async () => {
    vi.mocked(JuntasDB.expireStale).mockResolvedValue(3);
    const res = await GET(req("Bearer test-secret"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.expired).toBe(3);
  });
});
