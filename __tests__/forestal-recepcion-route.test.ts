/**
 * /api/admin/forestal/wood-entries/recepcion (ADR-434) — quién entra. La DB
 * class va simulada: lo que escribe se prueba en `forest-recepcion-db.test.ts`.
 *
 * Corregir la fecha declarada de una guía YA validada es de admin y dueño,
 * como validar y anular (`wood-entries/[id]`): el almacenero recibe, pero no
 * reescribe lo que otro ya dio por bueno. Leer el contexto sí puede.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  contexto: vi.fn(),
  corregir: vi.fn(),
  csrf: vi.fn((): unknown => null),
  spec: vi.fn(async () => true),
}));

vi.mock("@/lib/require-admin", () => ({ requireAdmin: H.requireAdmin }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: H.csrf }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: H.spec }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/db/forest-recepcion.db", () => ({
  MAX_GUIAS_CONTEXTO: 60,
  ForestRecepcionDB: { contexto: H.contexto, corregir: H.corregir },
}));

import { GET, PATCH } from "@/app/api/admin/forestal/wood-entries/recepcion/route";

/* `requireAdmin` real: 401 sin sesión, 403 si el rol no está en la lista. */
function sesion(role: string | null, tenantId = "tenant-qa") {
  H.requireAdmin.mockImplementation(async (_req: NextRequest, roles: readonly string[]) =>
    role == null
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : roles.includes(role)
        ? { tenantId, username: `qa-${role}`, role }
        : NextResponse.json({ error: "forbidden" }, { status: 403 }),
  );
}

const URL_API = "https://host/api/admin/forestal/wood-entries/recepcion";
const get = () => GET(new NextRequest(`${URL_API}?gtf=010-001-0000006`));
const patch = (body: unknown) =>
  PATCH(
    new NextRequest(URL_API, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
const CUERPO = { action: "corregir_recepcion", gtfNumber: "010-001-0000006", fecha: "2026-09-02", motivo: "recibida en bloque" };

beforeEach(() => {
  vi.clearAllMocks();
  H.csrf.mockImplementation(() => null);
  H.spec.mockImplementation(async () => true);
  H.contexto.mockResolvedValue([]);
  H.corregir.mockResolvedValue({ gtfNumber: "010-001-0000006", antes: "2026-09-23", despues: "2026-09-02", asientos: 4, trozas: 6, avisos: [] });
});

describe("corregir (PATCH): sólo admin y dueño", () => {
  it("el almacenero → 403, y la base ni se toca", async () => {
    sesion("almacenero");
    expect((await patch(CUERPO)).status).toBe(403);
    expect(H.corregir).not.toHaveBeenCalled();
  });

  it("sin sesión → 401", async () => {
    sesion(null);
    expect((await patch(CUERPO)).status).toBe(401);
  });

  it.each(["admin", "owner"])("%s corrige, con el tenant de la sesión y su nombre", async (rol) => {
    sesion(rol, "tenant-blas");
    const r = await patch(CUERPO);
    expect(r.status).toBe(200);
    expect(H.corregir).toHaveBeenCalledWith(
      "tenant-blas",
      { gtfNumber: "010-001-0000006", fecha: "2026-09-02", motivo: "recibida en bloque" },
      `qa-${rol}`,
    );
  });

  it("la guía de otro tenant no existe acá → 404", async () => {
    sesion("admin");
    H.corregir.mockResolvedValue(null);
    expect((await patch(CUERPO)).status).toBe(404);
  });

  it("sin motivo → 400 antes de tocar la base", async () => {
    sesion("admin");
    expect((await patch({ ...CUERPO, motivo: " " })).status).toBe(400);
    expect(H.corregir).not.toHaveBeenCalled();
  });
});

describe("leer el contexto (GET): también quien recibe", () => {
  it("el almacenero lo lee para ver los avisos", async () => {
    sesion("almacenero");
    expect((await get()).status).toBe(200);
    expect(H.contexto).toHaveBeenCalledWith("tenant-qa", ["010-001-0000006"]);
  });

  it("sin sesión → 401", async () => {
    sesion(null);
    expect((await get()).status).toBe(401);
  });
});
