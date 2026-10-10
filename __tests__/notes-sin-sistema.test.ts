/**
 * Equipo › Notas no muestra las notas «de sistema» (título que empieza con «__»).
 *
 * El presupuesto mensual se guarda como nota `__PRESUPUESTO_MENSUAL__`. Sin el
 * filtro aparecía en la lista de Notas con su JSON adentro, y borrarla desde
 * ahí borraba el presupuesto. El filtro va en la consulta (no en el cliente):
 * así tampoco viaja por `/api/notes`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockFindMany } = vi.hoisted(() => ({ mockFindMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { note: { findMany: mockFindMany } } }));

import { NotesDB, PREFIJO_NOTA_DE_SISTEMA } from "@/lib/db/notes.db";

describe("NotesDB.list sin las notas de sistema", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockFindMany.mockResolvedValue([]);
  });

  it("excluye los títulos con el prefijo de sistema y sigue filtrando por tenant", async () => {
    await NotesDB.list("tenant-a");
    const arg = mockFindMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(arg.where.tenantId).toBe("tenant-a");
    expect(arg.where.NOT).toEqual({ title: { startsWith: PREFIJO_NOTA_DE_SISTEMA } });
  });

  it("el prefijo cubre el presupuesto guardado como nota", () => {
    expect("__PRESUPUESTO_MENSUAL__".startsWith(PREFIJO_NOTA_DE_SISTEMA)).toBe(true);
    expect("Pedir hielo".startsWith(PREFIJO_NOTA_DE_SISTEMA)).toBe(false);
  });

  it("conserva el orden: fijadas primero, después la más reciente", async () => {
    await NotesDB.list("tenant-a");
    const arg = mockFindMany.mock.calls[0]?.[0] as { orderBy: unknown };
    expect(arg.orderBy).toEqual([{ pinned: "desc" }, { updatedAt: "desc" }]);
  });
});
