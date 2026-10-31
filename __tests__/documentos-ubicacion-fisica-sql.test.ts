// @vitest-environment node
/**
 * ADR-526 — el SQL de `DocumentsDB` que escribe la ubicación del original
 * (sin base: un `prisma` falso que guarda el texto y los parámetros).
 *
 * - Marcar registrado copia la ubicación de la carpeta SÓLO si el papel no tiene
 *   una propia, y la carpeta se busca dentro del MISMO negocio del papel.
 * - Deshacer suelta la heredada (igual a la de la carpeta), nunca una propia.
 * - Todo va por parámetros ($1, $2…), con el negocio en el WHERE.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const P = vi.hoisted(() => ({
  llamadas: [] as { sql: string; valores: unknown[] }[],
  filas: [] as unknown[],
  n: 1,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(async (partes: TemplateStringsArray, ...valores: unknown[]) => {
      P.llamadas.push({ sql: partes.join("?"), valores });
      return P.filas;
    }),
    $executeRaw: vi.fn(async (partes: TemplateStringsArray, ...valores: unknown[]) => {
      P.llamadas.push({ sql: partes.join("?"), valores });
      return P.n;
    }),
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const { DocumentsDB } = await import("@/lib/db/documents.db");

const plano = (s: string) => s.replace(/\s+/g, " ");

beforeEach(() => {
  P.llamadas.length = 0;
  P.filas = [];
  P.n = 1;
});

describe("marcarCodigoFisico", () => {
  it("sin ids no va a la base", async () => {
    expect(await DocumentsDB.marcarCodigoFisico("t-a", [], true, "karla")).toEqual([]);
    expect(P.llamadas).toHaveLength(0);
  });

  it("hereda la de la carpeta sólo si no tiene una propia, dentro del mismo negocio", async () => {
    P.filas = [{ id: "d1", codigo: 7, ubicacionFisica: "Archivador A" }];
    const r = await DocumentsDB.marcarCodigoFisico("t-a", ["d1"], true, "karla");
    expect(r).toEqual([{ id: "d1", codigo: 7, ubicacionFisica: "Archivador A" }]);

    const { sql, valores } = P.llamadas[0];
    const s = plano(sql);
    // La propia primero; vacía cuenta como «no tiene».
    expect(s).toContain(`COALESCE( NULLIF(btrim(d."ubicacionFisica"), ''),`);
    // La carpeta, de la del papel y del MISMO negocio (no una de otro tenant con el mismo id).
    expect(s).toContain(`f."id" = d."folderId" AND f."tenantId" = d."tenantId"`);
    // El negocio en el WHERE y por parámetro, nunca pegado al texto.
    expect(s).toContain(`WHERE d."tenantId" = ?`);
    expect(valores).toContain("t-a");
    expect(sql).not.toContain("t-a");
    expect(s).toContain(`RETURNING d."id", d."codigo", d."ubicacionFisica"`);
  });

  it("deshacer suelta sólo la heredada (igual a la de la carpeta), no una propia", async () => {
    await DocumentsDB.marcarCodigoFisico("t-a", ["d1"], false, "karla");
    const s = plano(P.llamadas[0].sql);
    expect(s).toMatch(/WHEN d\."ubicacionFisica" = \(SELECT f\."ubicacionFisica" FROM "DocumentFolder" f WHERE f\."id" = d\."folderId" AND f\."tenantId" = d\."tenantId"\) THEN NULL ELSE d\."ubicacionFisica"/);
  });
});

describe("ponerUbicacionFisica", () => {
  it("UPDATE con negocio e id por parámetro, sin tocar updatedAt", async () => {
    expect(await DocumentsDB.ponerUbicacionFisica("t-a", "d1", "Caja 3")).toBe(true);
    const { sql, valores } = P.llamadas[0];
    expect(valores).toEqual(["Caja 3", "t-a", "d1"]);
    expect(plano(sql)).toContain(`WHERE "tenantId" = ? AND "id" = ? AND "deletedAt" IS NULL`);
    expect(sql).not.toContain("updatedAt");
  });

  it("un papel de otro negocio no cambia nada → false", async () => {
    P.n = 0;
    expect(await DocumentsDB.ponerUbicacionFisica("t-b", "d1", null)).toBe(false);
  });
});
