import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * GET /api/admin/documents/esenciales/resumen (tarjeta «Esenciales» del Inicio,
 * 24-10): sólo la gestión; cuenta lo que el rol ve (cadena de carpetas +
 * candado de dueño + roles del papel); totales sin contar dos veces una
 * esencial dentro de otra; lo vencido primero y, dentro, «Mi orden».
 */

const h = vi.hoisted(() => ({ rol: "owner" as string, orden: undefined as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
// Igual que `lib/require-admin.ts`: la gestión (admin/owner/manager) pasa siempre; el resto, sólo si está en la lista.
vi.mock("@/lib/require-admin", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireAdmin: vi.fn(async (_req: unknown, roles?: readonly string[]) => {
      const gestion = ["admin", "owner", "manager"];
      if (roles && !gestion.includes(h.rol) && !roles.includes(h.rol)) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
      return { tenantId: "t1", username: "qa", role: h.rol };
    }),
  };
});
vi.mock("@/lib/db/admin-preferences.db", () => ({
  AdminPreferencesDB: { read: vi.fn(async () => (h.orden === undefined ? {} : { esencialesOrden: h.orden })) },
}));

const DIA = 86_400_000;
const en = (dias: number) => new Date(Date.now() + dias * DIA);
const CANDADO = "candado:solo-duenos";
const carpeta = (id: string, name: string, parentId: string | null, extra: { tags?: string[]; allowedRoles?: string[] } = {}) => ({
  id, name, parentId, tags: extra.tags ?? [], allowedRoles: extra.allowedRoles ?? [], icon: null, color: null, emoji: null,
});
const ESENCIAL = { tags: ["marca:esencial"] };

const CARPETAS = [
  carpeta("E1", "Prueba demo", null, ESENCIAL),
  carpeta("S1", "Licencias", "E1", ESENCIAL), // esencial DENTRO de otra esencial
  carpeta("S2", "Sueldos", "E1", { allowedRoles: [CANDADO] }),
  carpeta("E2", "Nómina secreta", null, { ...ESENCIAL, allowedRoles: [CANDADO] }),
  carpeta("X", "Otra", null),
];
const doc = (id: string, folderId: string, expiresAt: Date | null, allowedRoles: string[] = []) => ({
  id, folderId, allowedRoles, expiresAt, uploadedAt: en(-100),
});
const DOCS = [
  doc("d1", "E1", en(-2)), // vencido
  doc("d2", "S1", en(10)), // por vencer
  doc("d3", "S2", en(-1)), // vencido, en subcarpeta con candado
  doc("d4", "E1", en(5), [CANDADO]), // por vencer, el papel con candado
  doc("d5", "E2", en(-3)), // vencido, esencial con candado
  doc("d6", "E1", null),
  doc("d7", "E1", en(60)), // vence lejos: no cuenta
  doc("d8", "X", en(-9)), // fuera de las esenciales
];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    documentFolder: { findMany: vi.fn() },
    document: { findMany: vi.fn() },
  },
}));

import { GET } from "@/app/api/admin/documents/esenciales/resumen/route";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

const fm = prisma.documentFolder.findMany as unknown as ReturnType<typeof vi.fn>;
const dm = prisma.document.findMany as unknown as ReturnType<typeof vi.fn>;

interface Respuesta {
  carpetas: { id: string; nombre: string; papeles: number; vencidos: number; porVencer: number; ruta: string[] }[];
  total: { carpetas: number; papeles: number; vencidos: number; porVencer: number };
  hayCarpetas: boolean;
}
const pedir = () => GET(new NextRequest("http://localhost/api/admin/documents/esenciales/resumen"));

beforeEach(() => {
  vi.clearAllMocks();
  h.rol = "owner";
  h.orden = undefined;
  fm.mockImplementation(async () => CARPETAS);
  dm.mockImplementation(async ({ where }: { where: { folderId: { in: string[] } } }) =>
    DOCS.filter((d) => where.folderId.in.includes(d.folderId)),
  );
});

describe("GET /api/admin/documents/esenciales/resumen", () => {
  it("cajero y almacenero → 403 sin tocar la base; la ruta pide los roles de gestión", async () => {
    for (const rol of ["cajero", "almacenero"]) {
      h.rol = rol;
      const r = await pedir();
      expect(r.status).toBe(403);
    }
    expect(requireAdmin).toHaveBeenCalledWith(expect.anything(), ["admin", "owner", "manager"]);
    expect(fm).not.toHaveBeenCalled();
    expect(dm).not.toHaveBeenCalled();
  });

  it("dueño: ve todo, totales sin contar dos veces la esencial anidada", async () => {
    const r = await pedir();
    expect(r.status).toBe(200);
    const j = (await r.json()) as Respuesta;
    const por = Object.fromEntries(j.carpetas.map((c) => [c.id, c]));
    expect(por.E1).toMatchObject({ papeles: 6, vencidos: 2, porVencer: 2 });
    expect(por.S1).toMatchObject({ papeles: 1, vencidos: 0, porVencer: 1, ruta: ["Prueba demo"] });
    expect(por.E2).toMatchObject({ papeles: 1, vencidos: 1, porVencer: 0 });
    expect(j.total).toEqual({ carpetas: 3, papeles: 7, vencidos: 3, porVencer: 2 });
    expect(j.hayCarpetas).toBe(true);
  });

  it("encargado (manager): no cuenta lo que tiene candado de dueño ni nombra la carpeta cerrada", async () => {
    h.rol = "manager";
    const r = await pedir();
    expect(r.status).toBe(200);
    const texto = await r.text();
    expect(texto).not.toContain("Nómina secreta");
    expect(texto).not.toContain("Sueldos");
    const j = JSON.parse(texto) as Respuesta;
    expect(j.carpetas.map((c) => c.id).sort()).toEqual(["E1", "S1"]);
    // E1 sin d3 (subcarpeta con candado) ni d4 (papel con candado).
    expect(j.carpetas.find((c) => c.id === "E1")).toMatchObject({ papeles: 4, vencidos: 1, porVencer: 1 });
    expect(j.total).toEqual({ carpetas: 2, papeles: 4, vencidos: 1, porVencer: 1 });
  });

  it("lo vencido primero y, dentro, «Mi orden» del negocio", async () => {
    h.orden = ["S1", "E2", "E1"];
    const j = (await (await pedir()).json()) as Respuesta;
    expect(j.carpetas.map((c) => c.id)).toEqual(["E2", "E1", "S1"]);
  });

  it("todo por tenant del JWT y sólo los papeles de las esenciales y sus subcarpetas", async () => {
    await pedir();
    expect(fm.mock.calls[0][0].where).toEqual({ tenantId: "t1" });
    const where = dm.mock.calls[0][0].where;
    expect(where).toMatchObject({ tenantId: "t1", deletedAt: null });
    expect([...where.folderId.in].sort()).toEqual(["E1", "E2", "S1", "S2"]);
  });

  it("sin carpetas marcadas: lista vacía, una sola ida a la base y dice si el Archivo tiene carpetas", async () => {
    fm.mockImplementation(async () => [carpeta("X", "Otra", null)]);
    const j = (await (await pedir()).json()) as Respuesta;
    expect(j).toEqual({ carpetas: [], total: { carpetas: 0, papeles: 0, vencidos: 0, porVencer: 0 }, hayCarpetas: true });
    expect(dm).not.toHaveBeenCalled();
    // Sin ninguna carpeta (o ninguna que el rol vea): la tarjeta no se ofrece.
    fm.mockImplementation(async () => [carpeta("C", "Cerrada", null, { allowedRoles: [CANDADO] })]);
    h.rol = "manager";
    expect(((await (await pedir()).json()) as Respuesta).hayCarpetas).toBe(false);
  });
});
