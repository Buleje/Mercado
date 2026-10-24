/**
 * ADR-464, fases 3 y 4, por la ruta de distribuciones: lo que el bloque
 * escribió en el Libro (`jornadasLibro`, `complementos`) sobrevive al guardado.
 * El schema es una whitelist: sin declararlos, Zod los borraba en silencio y al
 * reabrir la distribución los botones volvían a ofrecer registrar lo ya escrito.
 * Multi-tenant: lo guardado por un negocio no aparece en otro.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({ requireAdmin: vi.fn(), kv: new Map<string, unknown>() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: H.requireAdmin }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: vi.fn(async () => true) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: () => {}, auditCtpEsperando: async () => {} }));
vi.mock("@/lib/db/platform-settings.db", () => ({
  PlatformSettingsDB: {
    get: async (k: string) => H.kv.get(k) ?? null,
    set: async (k: string, v: unknown) => void H.kv.set(k, JSON.parse(JSON.stringify(v))),
  },
}));

import * as distribuciones from "@/app/api/admin/forestal/distribuciones/route";

const sesion = (tenantId: string | null) =>
  H.requireAdmin.mockImplementation(async () =>
    tenantId ? { tenantId, username: "qaadmin", role: "admin" } : NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  );
const req = (method = "GET", body?: unknown) =>
  new NextRequest("https://host/api/admin/forestal/distribuciones", {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const ctx = { params: Promise.resolve({}) };

const bloque = {
  id: "b1", etiqueta: "Guía 019-11", especie: "Tornillo", m3: 4, origen: "trozas", loteId: "L1",
  trozaIds: ["t1", "t2"], corridaIds: ["c1", "c2"],
  jornadasLibro: [{ dia: 1, corridaId: "c1", lineNo: 41, estado: "declarada", fecha: "2026-10-01" }],
  complementos: [{ linea: "LPC", corridaId: "c2", lineNo: 42, claves: ["tipo|comercial"], m3: 0.4, fecha: "2026-10-03" }],
};

beforeEach(() => {
  H.kv.clear();
  sesion("t-qa");
});

describe("/distribuciones — lo escrito en el Libro se guarda", () => {
  it("POST → GET conserva jornadasLibro y complementos", async () => {
    const post = await distribuciones.POST(req("POST", { nombre: "Guías", bloques: [bloque] }), ctx);
    expect(post.status).toBe(201);
    const { distribuciones: lista } = (await (await distribuciones.GET(req(), ctx)).json()) as { distribuciones: { bloques: Record<string, unknown>[] }[] };
    expect(lista[0]!.bloques[0]).toMatchObject({ jornadasLibro: bloque.jornadasLibro, complementos: bloque.complementos });
  });

  it("una jornada con estado inventado se rechaza con 400", async () => {
    const malo = { ...bloque, jornadasLibro: [{ ...bloque.jornadasLibro[0], estado: "medio-hecha" }] };
    const post = await distribuciones.POST(req("POST", { nombre: "Mala", bloques: [malo] }), ctx);
    expect(post.status).toBe(400);
  });

  it("sin sesión → 401; otro negocio no ve lo guardado", async () => {
    await distribuciones.POST(req("POST", { nombre: "Guías", bloques: [bloque] }), ctx);
    sesion(null);
    expect((await distribuciones.GET(req(), ctx)).status).toBe(401);
    sesion("t-otro");
    const { distribuciones: ajenas } = (await (await distribuciones.GET(req(), ctx)).json()) as { distribuciones: unknown[] };
    expect(ajenas).toHaveLength(0);
  });
});
