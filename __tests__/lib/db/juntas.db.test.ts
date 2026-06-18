import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    junta: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
    juntaMember: { create: vi.fn() },
  },
}));
vi.mock("@/lib/junta/reward", () => ({ issueJuntaCoupon: vi.fn() }));

import { JuntasDB } from "@/lib/db/juntas.db";
import { prisma } from "@/lib/prisma";
import { issueJuntaCoupon } from "@/lib/junta/reward";

const T = "tenant-1";
const future = new Date(Date.now() + 24 * 3600 * 1000);
const past = new Date(Date.now() - 24 * 3600 * 1000);

function juntaRow(over: Record<string, unknown> = {}) {
  return {
    id: "j1",
    code: "BARRIO-AB12",
    tenantId: T,
    initiatorId: "+51999",
    productLabel: null,
    zoneLabel: "Centro",
    windowEnd: future,
    targetMembers: 4,
    status: "OPEN",
    createdAt: new Date("2026-06-18T00:00:00Z"),
    _count: { members: 1 },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("JuntasDB.create", () => {
  it("crea la junta con el iniciador como primer miembro y devuelve el code", async () => {
    vi.mocked(prisma.junta.create).mockResolvedValue(juntaRow() as never);
    const r = await JuntasDB.create(T, {
      initiatorId: "+51999",
      zoneLabel: "Centro",
      windowEnd: future,
    });
    expect(r.code).toMatch(/^BARRIO-/);
    expect(r.memberCount).toBe(1);
    expect(r.status).toBe("OPEN");
    const arg = vi.mocked(prisma.junta.create).mock.calls[0][0] as never as {
      data: { tenantId: string; members: { create: { customerId: string } } };
    };
    expect(arg.data.tenantId).toBe(T);
    expect(arg.data.members.create.customerId).toBe("+51999");
  });
});

describe("JuntasDB.getByCode", () => {
  it("null si no existe", async () => {
    vi.mocked(prisma.junta.findUnique).mockResolvedValue(null as never);
    expect(await JuntasDB.getByCode(T, "BARRIO-XXXX")).toBeNull();
  });

  it("computa EXPIRED si la ventana venció y no llegó a la meta", async () => {
    vi.mocked(prisma.junta.findUnique).mockResolvedValue(
      juntaRow({ windowEnd: past, _count: { members: 2 } }) as never,
    );
    const r = await JuntasDB.getByCode(T, "BARRIO-AB12");
    expect(r?.status).toBe("EXPIRED");
  });
});

describe("JuntasDB.join", () => {
  it("rechaza si la junta venció", async () => {
    vi.mocked(prisma.junta.findUnique).mockResolvedValue(
      juntaRow({ windowEnd: past, _count: { members: 2 } }) as never,
    );
    await expect(JuntasDB.join(T, "BARRIO-AB12", "+51888")).rejects.toThrow(/venció/i);
    expect(prisma.juntaMember.create).not.toHaveBeenCalled();
  });

  it("es idempotente: traga la colisión unique (ya es miembro)", async () => {
    vi.mocked(prisma.junta.findUnique)
      .mockResolvedValueOnce(juntaRow() as never)
      .mockResolvedValueOnce(juntaRow() as never);
    vi.mocked(prisma.juntaMember.create).mockRejectedValue({ code: "P2002" } as never);
    const r = await JuntasDB.join(T, "BARRIO-AB12", "+51999");
    expect(r.memberCount).toBe(1);
    expect(prisma.junta.update).not.toHaveBeenCalled();
  });

  it("marca COMPLETE y emite cupón cuando alcanza la meta", async () => {
    vi.mocked(prisma.junta.findUnique)
      .mockResolvedValueOnce(juntaRow({ _count: { members: 3 } }) as never)
      .mockResolvedValueOnce(juntaRow({ _count: { members: 4 } }) as never)
      .mockResolvedValueOnce(
        juntaRow({
          _count: { members: 4 },
          status: "COMPLETE",
          couponCode: "BARRIO-AB12",
        }) as never,
      );
    vi.mocked(prisma.juntaMember.create).mockResolvedValue({} as never);
    vi.mocked(prisma.junta.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.junta.update).mockResolvedValue({} as never);
    vi.mocked(issueJuntaCoupon).mockResolvedValue("BARRIO-AB12");
    const r = await JuntasDB.join(T, "BARRIO-AB12", "+51777");
    expect(prisma.junta.updateMany).toHaveBeenCalledWith({
      where: { id: "j1", tenantId: T, status: "OPEN" },
      data: { status: "COMPLETE" },
    });
    expect(issueJuntaCoupon).toHaveBeenCalledWith(T, {
      code: "BARRIO-AB12",
      targetMembers: 4,
    });
    expect(r.status).toBe("COMPLETE");
    expect(r.couponCode).toBe("BARRIO-AB12");
  });
});

describe("JuntasDB.expireStale", () => {
  it("marca EXPIRED las OPEN vencidas y devuelve el count", async () => {
    vi.mocked(prisma.junta.updateMany).mockResolvedValue({ count: 2 } as never);
    const n = await JuntasDB.expireStale(new Date("2026-06-18T00:00:00Z"));
    expect(n).toBe(2);
    const arg = vi.mocked(prisma.junta.updateMany).mock.calls[0][0] as never as {
      where: { status: string; windowEnd: { lte: Date } };
    };
    expect(arg.where.status).toBe("OPEN");
    expect(arg.where.windowEnd.lte).toBeInstanceOf(Date);
  });
});
