/**
 * Préstamos es plata del negocio: sólo gestión (11-10). Antes TODAS las rutas
 * `/api/prestamos/*` llamaban `requireAdmin(req)` sin roles y el cajero y el
 * almacenero listaban, veían el resumen y exportaban. Cada handler tiene que
 * pasarle `ROLES_PRESTAMOS` a `requireAdmin` y cortar ahí si responde 403.
 */
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const rolesPedidos: unknown[] = [];
const mockDb = vi.fn();

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: (_req: unknown, roles?: unknown) => {
    rolesPedidos.push(roles);
    return Promise.resolve(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  },
}));
vi.mock("@/lib/db/prestamos.db", () => ({
  PrestamosDB: new Proxy({}, { get: () => (...a: unknown[]) => mockDb(...a) }),
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: () => Promise.resolve() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { ROLES_PRESTAMOS } from "@/lib/prestamos/roles";
import * as lista from "@/app/api/prestamos/route";
import * as uno from "@/app/api/prestamos/[id]/route";
import * as refinanciar from "@/app/api/prestamos/[id]/refinanciar/route";
import * as pagar from "@/app/api/prestamos/[id]/pagar/route";
import * as documentos from "@/app/api/prestamos/[id]/documentos/route";
import * as exportar from "@/app/api/prestamos/exportar/route";
import * as resumen from "@/app/api/prestamos/resumen/route";
import * as cobros from "@/app/api/prestamos/cobros/route";

type Handler = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
const RUTAS: Record<string, Record<string, unknown>> = {
  "/api/prestamos": lista,
  "/api/prestamos/[id]": uno,
  "/api/prestamos/[id]/refinanciar": refinanciar,
  "/api/prestamos/[id]/pagar": pagar,
  "/api/prestamos/[id]/documentos": documentos,
  "/api/prestamos/exportar": exportar,
  "/api/prestamos/resumen": resumen,
  "/api/prestamos/cobros": cobros,
};
const METODOS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

const casos = Object.entries(RUTAS).flatMap(([ruta, mod]) =>
  METODOS.filter((m) => typeof mod[m] === "function").map((m) => [`${m} ${ruta}`, mod[m] as Handler] as const),
);

beforeEach(() => {
  rolesPedidos.length = 0;
  mockDb.mockReset();
});

describe("Préstamos — sólo admin, dueño y encargado", () => {
  it("los roles son los de gestión: ni cajero ni almacenero", () => {
    expect([...ROLES_PRESTAMOS]).toEqual(["admin", "owner", "manager"]);
    expect(ROLES_PRESTAMOS).not.toContain("cajero");
    expect(ROLES_PRESTAMOS).not.toContain("almacenero");
  });

  it("están todos los handlers (12)", () => {
    expect(casos.map(([n]) => n)).toHaveLength(12);
  });

  it.each(casos)("%s pide ROLES_PRESTAMOS y corta con el 403 sin tocar la base", async (_n, handler) => {
    const req = new NextRequest("http://localhost/api/prestamos/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const res = await handler(req, { params: Promise.resolve({ id: "x" }) });
    expect(res.status).toBe(403);
    expect(rolesPedidos).toEqual([ROLES_PRESTAMOS]);
    expect(mockDb).not.toHaveBeenCalled();
  });
});
