import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/require-admin", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/db/juntas.db", () => ({
  JuntasDB: { getByCode: vi.fn(), listOrdersForJunta: vi.fn() },
}));

import { GET } from "@/app/api/admin/juntas/[code]/orders/route";
import { requireAdmin } from "@/lib/require-admin";
import { JuntasDB } from "@/lib/db/juntas.db";

const req = {} as never;
const params = (code: string) => ({ params: Promise.resolve({ code }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({ tenantId: "t1" } as never);
});

describe("GET /api/admin/juntas/[code]/orders", () => {
  it("no admin → devuelve la respuesta de requireAdmin (401), no toca la DB", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(
      NextResponse.json({ error: "no" }, { status: 401 }) as never,
    );
    const res = await GET(req, params("BARRIO-AB12"));
    expect(res.status).toBe(401);
    expect(JuntasDB.getByCode).not.toHaveBeenCalled();
  });

  it("junta inexistente → 404", async () => {
    vi.mocked(JuntasDB.getByCode).mockResolvedValue(null);
    const res = await GET(req, params("BARRIO-XXXX"));
    expect(res.status).toBe(404);
  });

  it("OK → 200 con la junta y sus pedidos (tenant del admin)", async () => {
    vi.mocked(JuntasDB.getByCode).mockResolvedValue({
      id: "j1",
      code: "BARRIO-AB12",
    } as never);
    vi.mocked(JuntasDB.listOrdersForJunta).mockResolvedValue([
      { id: "o1" },
    ] as never);
    const res = await GET(req, params("BARRIO-AB12"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.orders).toHaveLength(1);
    expect(JuntasDB.getByCode).toHaveBeenCalledWith("t1", "BARRIO-AB12");
    expect(JuntasDB.listOrdersForJunta).toHaveBeenCalledWith("t1", "j1");
  });
});
