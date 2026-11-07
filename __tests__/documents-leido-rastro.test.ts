// @vitest-environment node
/**
 * Leer el texto de un papel deja rastro (Ley 29733, revisión de seguridad 24-10).
 *
 * `GET /api/admin/documents/[id]/leido` devuelve lo que el sistema leyó del
 * papel (texto + datos clave: el DNI, el contrato). No anota «view» a propósito
 * —inflaría «Lo que más abres»—, pero hasta el 24-10 no anotaba NADA: nadie
 * sabía quién había leído el texto de un DNI. Ahora anota `read_text`:
 * - una fila por persona y papel cada 10 minutos (ir y volver no llena el historial);
 * - sólo si hubo algo que leer, y nunca si el rol no ve el papel o no hay sesión;
 * - `vistasPorDocumento` (lo que alimenta «Lo que más abres») sigue contando sólo `view`.
 */
import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

const H = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  /** El audit log en memoria: `groupBy` filtra como la base (acción exacta, tenant, fecha). */
  audit: [] as { documentId: string; tenantId: string; action: string; createdAt: Date }[],
  docs: [] as { id: string; tenantId: string; folderId: string | null; allowedRoles: string[]; deletedAt: null }[],
}));

vi.mock("@/lib/require-admin", () => ({ requireAdmin: H.requireAdmin }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    documentAuditLog: {
      groupBy: async ({ where }: { where: { tenantId: string; action: string; createdAt: { gte: Date } } }) => {
        const filas = H.audit.filter((a) => a.tenantId === where.tenantId && a.action === where.action && a.createdAt >= where.createdAt.gte);
        const porDoc = new Map<string, Date[]>();
        for (const f of filas) porDoc.set(f.documentId, [...(porDoc.get(f.documentId) ?? []), f.createdAt]);
        return [...porDoc.entries()].map(([documentId, fechas]) => ({
          documentId,
          _count: { _all: fechas.length },
          _max: { createdAt: new Date(Math.max(...fechas.map((d) => d.getTime()))) },
        }));
      },
    },
    document: {
      findMany: async ({ where }: { where: { tenantId: string; id: { in: string[] } } }) =>
        H.docs.filter((d) => d.tenantId === where.tenantId && where.id.in.includes(d.id)),
    },
    documentFolder: { findMany: async () => [] },
  },
}));

const { DocumentsDB } = await import("@/lib/db/documents.db");
const { GET } = await import("@/app/api/admin/documents/[id]/leido/route");

const AUTH = { tenantId: "t-a", username: "karla", role: "admin" };
const DNI = {
  id: "doc-dni",
  name: "DNI Juan.jpg",
  ocrText: "REPÚBLICA DEL PERÚ · DNI 12345678 · JUAN PÉREZ",
  ocrMetadata: { keyFacts: ["Titular: Juan Pérez", "Caduca: 2030-01-01"] },
};

const pedir = (id = DNI.id) => GET(new NextRequest(`http://localhost/api/admin/documents/${id}/leido`), { params: Promise.resolve({ id }) });

let getById: MockInstance<typeof DocumentsDB.getById>;
let log: MockInstance<typeof DocumentsDB.log>;
/** Cada test con su reloj: el rastro recuerda la última lectura por instancia. */
let ahora = Date.UTC(2026, 9, 24, 15, 0, 0);

beforeEach(() => {
  vi.restoreAllMocks();
  ahora += 60 * 60 * 1000;
  vi.spyOn(Date, "now").mockImplementation(() => ahora);
  H.requireAdmin.mockReset().mockResolvedValue(AUTH);
  H.audit.length = 0;
  H.docs.length = 0;
  getById = vi.spyOn(DocumentsDB, "getById").mockResolvedValue(DNI as never);
  log = vi.spyOn(DocumentsDB, "log").mockResolvedValue(undefined);
});

describe("GET …/leido anota que se leyó el texto", () => {
  it("anota `read_text` a nombre de quien lee, con cuánto se mostró (sin el texto)", async () => {
    const res = await pedir();
    expect(res.status).toBe(200);
    expect(getById).toHaveBeenCalledWith("t-a", "doc-dni", "admin");
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("t-a", {
      documentId: "doc-dni",
      actorId: "karla",
      action: "read_text",
      metadata: { caracteres: DNI.ocrText.length, datos: 2 },
    });
    // El rastro no copia el dato personal al audit log.
    expect(JSON.stringify(log.mock.calls)).not.toContain("12345678");
  });

  it("nunca como «view»: no cuenta como apertura", async () => {
    await pedir();
    expect(log.mock.calls.map((c) => c[1].action)).not.toContain("view");
  });

  it("una fila por persona y papel cada 10 minutos; otra persona, su propia fila", async () => {
    await pedir();
    ahora += 5 * 60 * 1000;
    await pedir();
    expect(log).toHaveBeenCalledTimes(1);

    H.requireAdmin.mockResolvedValue({ ...AUTH, username: "brandon" });
    await pedir();
    expect(log).toHaveBeenCalledTimes(2);

    H.requireAdmin.mockResolvedValue(AUTH);
    ahora += 6 * 60 * 1000;
    await pedir();
    expect(log).toHaveBeenCalledTimes(3);
  });

  it("un papel sin texto ni datos no anota «leyó el texto»", async () => {
    getById.mockResolvedValue({ ...DNI, id: "doc-vacio", ocrText: null, ocrMetadata: null } as never);
    const res = await pedir("doc-vacio");
    expect(await res.json()).toMatchObject({ texto: null, datos: [] });
    expect(log).not.toHaveBeenCalled();
  });

  it("papel que el rol no ve (o de otro negocio) → 404 y nada anotado", async () => {
    getById.mockResolvedValue(null as never);
    const res = await pedir("doc-ajeno");
    expect(res.status).toBe(404);
    expect(log).not.toHaveBeenCalled();
  });

  it("sin sesión → 401 y nada anotado", async () => {
    H.requireAdmin.mockResolvedValue(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
    const res = await pedir();
    expect(res.status).toBe(401);
    expect(getById).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });
});

describe("«Lo que más abres» sigue contando sólo aperturas", () => {
  it("vistasPorDocumento ignora `read_text`", async () => {
    const hace = (min: number) => new Date(ahora - min * 60 * 1000);
    H.docs.push({ id: "doc-dni", tenantId: "t-a", folderId: null, allowedRoles: [], deletedAt: null });
    H.audit.push(
      { documentId: "doc-dni", tenantId: "t-a", action: "view", createdAt: hace(30) },
      { documentId: "doc-dni", tenantId: "t-a", action: "read_text", createdAt: hace(20) },
      { documentId: "doc-dni", tenantId: "t-a", action: "read_text", createdAt: hace(5) },
    );
    const uso = await DocumentsDB.vistasPorDocumento("t-a", 90, "admin");
    expect(uso["doc-dni"]).toEqual({ vistas: 1, ultima: hace(30).toISOString(), folderId: null });
  });

  it("sólo con lecturas de texto, el papel ni aparece", async () => {
    H.docs.push({ id: "doc-dni", tenantId: "t-a", folderId: null, allowedRoles: [], deletedAt: null });
    H.audit.push({ documentId: "doc-dni", tenantId: "t-a", action: "read_text", createdAt: new Date(ahora - 60_000) });
    expect(await DocumentsDB.vistasPorDocumento("t-a", 90, "admin")).toEqual({});
  });
});
