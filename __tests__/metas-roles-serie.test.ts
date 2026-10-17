// @vitest-environment node
/**
 * Metas y logros (ADR-488): las tres rutas que dicen plata del negocio piden
 * los MISMOS roles. Antes `/serie` y `/logros` llamaban `requireAdmin(req)` sin
 * roles: el cajero, al que `/avance` le daba 403, veía por `/serie` lo vendido
 * por hora y por `/logros` el récord en S/, los fiados y los m³.
 */
import { describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({ roles: [] as unknown[] }));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: async (_req: unknown, roles?: unknown) => {
    H.roles.push(roles);
    return NextResponse.json({ error: "Tu rol no puede ver esto." }, { status: 403 });
  },
}));

import { ROLES_AVANCE } from "@/lib/metas/roles";

const RUTAS = [
  ["avance", () => import("@/app/api/goals/avance/route"), "/api/goals/avance"],
  ["serie", () => import("@/app/api/goals/serie/route"), "/api/goals/serie?por=hora"],
  ["logros", () => import("@/app/api/goals/logros/route"), "/api/goals/logros"],
] as const;

describe("roles de las rutas de Metas y logros", () => {
  it("cajero y almacenero fuera; admin, dueño, encargado y analista dentro", () => {
    expect([...ROLES_AVANCE].sort()).toEqual(["admin", "analista", "manager", "owner"]);
    expect(ROLES_AVANCE).not.toContain("cajero");
    expect(ROLES_AVANCE).not.toContain("almacenero");
  });

  it.each(RUTAS)("/api/goals/%s pide ROLES_AVANCE y corta con 403", async (_n, cargar, url) => {
    H.roles.length = 0;
    const { GET } = await cargar();
    const res = await GET(new NextRequest(`http://localhost${url}`));
    expect(res.status).toBe(403);
    expect(H.roles).toEqual([ROLES_AVANCE]);
    // La misma constante, no una copia que pueda abrirse sola.
    expect(H.roles[0]).toBe(ROLES_AVANCE);
  });
});
