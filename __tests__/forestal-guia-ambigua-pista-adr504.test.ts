/**
 * ADR-504 — editar el permiso de una guía, completarlo o guardarle fotos cuando
 * su N° de GTF vive en DOS permisos.
 *
 * Se prueba por el camino de la pantalla: el PATCH real de
 * `/api/admin/forestal/wood-entries` con el `WoodEntriesDB` real y una base en
 * memoria. Lo que se mira es QUÉ filas se escriben:
 *   · sin pista → 409 GUIA_AMBIGUA con las candidatas (permiso + titular);
 *   · `lineaId` → el permiso de la madera que ESA corrida consumió;
 *   · `ingresoId` → el permiso de ESE ingreso;
 *   · `contratoId` u `ingresoId` de otro tenant → no toca nada;
 *   · fotos con `ingresoId` → sólo las filas de ese permiso.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Fila = {
  id: string;
  tenantId: string;
  gtfNumber: string;
  contratoId: string | null;
  originCode: string | null;
  providerName: string | null;
  speciesScientificName: string | null;
  speciesCommonName: string;
  status: string;
  entryDate: Date;
  deletedAt: Date | null;
  photos: unknown;
};

const H = vi.hoisted(() => ({
  filas: [] as Fila[],
  consumos: [] as { tenantId: string; ctpEntryId: string; woodEntryId: string }[],
  escritas: [] as string[],
  auth: { tenantId: "t1", username: "qa", role: "admin" } as { tenantId: string; username: string; role: string },
}));

/** El `where` que usan estas acciones: igualdad, `null`, `{ in }`. */
function cumple(f: Record<string, unknown>, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === "object" && !Array.isArray(v) && "in" in v) return (v.in as unknown[]).includes(f[k]);
    return f[k] === v;
  });
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    woodEntry: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => H.filas.filter((f) => cumple(f, where))),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => H.filas.find((f) => cumple(f, where)) ?? null),
      update: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const f = H.filas.find((x) => cumple(x, where));
        if (!f) throw new Error("no existe");
        Object.assign(f, data);
        H.escritas.push(f.id);
        return f;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const tocadas = H.filas.filter((f) => cumple(f, where));
        for (const f of tocadas) {
          Object.assign(f, data);
          H.escritas.push(f.id);
        }
        return { count: tocadas.length };
      }),
    },
    forestCtpConsumo: {
      findMany: vi.fn(
        async ({ where }: { where: { tenantId: string; ctpEntryId: string; woodEntry: Record<string, unknown> } }) =>
          H.consumos
            .filter((c) => c.tenantId === where.tenantId && c.ctpEntryId === where.ctpEntryId)
            .map((c) => H.filas.find((f) => f.id === c.woodEntryId))
            .filter((f): f is Fila => !!f && cumple(f, where.woodEntry))
            .map((f) => ({ woodEntry: { contratoId: f.contratoId } })),
      ),
    },
    $queryRaw: vi.fn(async () => []),
  },
}));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: vi.fn(async () => H.auth) }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: async () => true }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/lib/forestal/ctp-audit", async (real) => ({
  ...(await real<typeof import("@/lib/forestal/ctp-audit")>()),
  auditCtp: vi.fn(),
}));
vi.mock("@/lib/db/forest-ctp-cierre.db", () => ({ ForestCtpCierreDB: { closedPeriodOf: async () => null } }));

const { PATCH } = await import("@/app/api/admin/forestal/wood-entries/route");

const GTF = "019-001-0000004";
const fila = (id: string, tenantId: string, contratoId: string | null, titular: string): Fila => ({
  id,
  tenantId,
  gtfNumber: GTF,
  contratoId,
  originCode: null,
  providerName: titular,
  speciesScientificName: null,
  speciesCommonName: "Capirona",
  status: "validado",
  entryDate: new Date("2026-10-10T00:00:00Z"),
  deletedAt: null,
  photos: [`https://x.test/${id}.jpg`],
});

const patch = async (body: Record<string, unknown>) => {
  const res = await PATCH(
    new NextRequest("http://localhost/api/admin/forestal/wood-entries", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({}) },
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
};
const completar = (pista: Record<string, unknown>) =>
  patch({ action: "completar_guia", gtfNumber: GTF, campos: { originCode: "19-SEC/REG-PLT-2021-017" }, ...pista });

beforeEach(() => {
  H.filas = [
    fila("we_a1", "t1", "ctr_A", "Titular A"),
    fila("we_b1", "t1", "ctr_B", "Titular B"),
    fila("we_x", "t2", "ctr_X", "Ajeno"),
  ];
  /* La corrida lin_1 consumió madera de la guía del permiso B. */
  H.consumos = [{ tenantId: "t1", ctpEntryId: "lin_1", woodEntryId: "we_b1" }];
  H.escritas = [];
});

describe("ADR-504 · acciones de la guía con el N° en dos permisos", () => {
  it("sin pista → 409 GUIA_AMBIGUA con permiso y titular de cada candidata; no escribe nada", async () => {
    const r = await completar({});
    expect(r.status).toBe(409);
    expect(r.json.error).toBe("GUIA_AMBIGUA");
    const candidatas = r.json.candidatas as { contratoId: string; titular: string }[];
    expect(candidatas.map((c) => [c.contratoId, c.titular]).sort()).toEqual([
      ["ctr_A", "Titular A"],
      ["ctr_B", "Titular B"],
    ]);
    expect(H.escritas).toEqual([]);
  });

  it("con lineaId: completa sólo la guía del permiso que la corrida consumió", async () => {
    const r = await completar({ lineaId: "lin_1" });
    expect(r.status).toBe(200);
    expect(H.escritas).toEqual(["we_b1"]);
    expect(H.filas.find((f) => f.id === "we_a1")?.originCode).toBeNull();
  });

  it("con lineaId de una corrida que no consumió esa guía → sigue ambigua (409)", async () => {
    const r = await completar({ lineaId: "lin_otra" });
    expect(r.status).toBe(409);
    expect(H.escritas).toEqual([]);
  });

  it("corregir con ingresoId: sólo la guía de ESE ingreso", async () => {
    H.filas[0]!.originCode = "VIEJO";
    H.filas[1]!.originCode = "VIEJO";
    const r = await patch({ action: "corregir_guia", gtfNumber: GTF, campos: { originCode: "NUEVO" }, ingresoId: "we_a1" });
    expect(r.status).toBe(200);
    expect(H.escritas).toEqual(["we_a1"]);
    expect(H.filas.find((f) => f.id === "we_b1")?.originCode).toBe("VIEJO");
  });

  it("contratoId de otro tenant → no encuentra nada y no toca nada", async () => {
    const r = await completar({ contratoId: "ctr_X" });
    expect(r.status).toBe(422);
    expect(H.escritas).toEqual([]);
    expect(H.filas.find((f) => f.id === "we_x")?.originCode).toBeNull();
  });

  it("ingresoId de otro tenant → 422 y no cae a «cualquiera con ese N°»", async () => {
    const r = await completar({ ingresoId: "we_x" });
    expect(r.status).toBe(422);
    expect(H.escritas).toEqual([]);
  });

  it("contratoId elegido (el reintento del modal) → sólo ese permiso", async () => {
    const r = await completar({ contratoId: "ctr_A" });
    expect(r.status).toBe(200);
    expect(H.escritas).toEqual(["we_a1"]);
  });
});

describe("ADR-504 · fotos de la guía con ingresoId", () => {
  it("escribe sólo en las filas del permiso de ese ingreso, no en la guía gemela", async () => {
    const r = await patch({ action: "fotos_guia", gtfNumber: GTF, fotos: [], ingresoId: "we_b1" });
    expect(r.status).toBe(200);
    expect(H.escritas).toEqual(["we_b1"]);
    expect(H.filas.find((f) => f.id === "we_a1")?.photos).toEqual(["https://x.test/we_a1.jpg"]);
  });

  it("sin pista → 409 y no escribe", async () => {
    const r = await patch({ action: "fotos_guia", gtfNumber: GTF, fotos: [] });
    expect(r.status).toBe(409);
    expect(H.escritas).toEqual([]);
  });
});
