/**
 * `TenantsDB.contactoDelDueno` (B1, revisión 25-10): las tablas forestales
 * guardan el `tenantId` mixto (cuid o slug). Busca primero por id y, sólo si
 * no hay ninguno, por slug; antes un `OR` en `findFirst` podía traer a otro
 * negocio cuyo slug fuera el id buscado, sin orden que decida.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  filas: [] as { id: string; slug: string; name: string; ownerPhone: string | null; ownerEmail: string | null }[],
  llamadas: [] as Record<string, string>[],
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: {
      findUnique: async ({ where }: { where: Record<string, string> }) => {
        H.llamadas.push(where);
        const f = H.filas.find((t) => (where.id != null ? t.id === where.id : t.slug === where.slug));
        return f ? { id: f.id, name: f.name, ownerPhone: f.ownerPhone, ownerEmail: f.ownerEmail } : null;
      },
    },
  },
}));
vi.mock("@/lib/cache", () => ({ getOrSet: vi.fn(), invalidateByPrefix: vi.fn() }));

import { TenantsDB } from "@/lib/db/tenants.db";

beforeEach(() => {
  H.llamadas = [];
  H.filas = [
    { id: "cuid-blas", slug: "blas", name: "Blas", ownerPhone: "+51 987 654 675", ownerEmail: null },
    // Un negocio cuyo SLUG es el id de Blas: con el OR podía ganar este.
    { id: "cuid-otro", slug: "cuid-blas", name: "Otro", ownerPhone: "+51 900 000 000", ownerEmail: null },
    { id: "cuid-main", slug: "main", name: "Main", ownerPhone: null, ownerEmail: "dueno@ejemplo.pe" },
  ];
});

describe("TenantsDB.contactoDelDueno", () => {
  it("por id gana al slug igual de otro negocio, y no busca por slug", async () => {
    const t = await TenantsDB.contactoDelDueno("cuid-blas");
    expect(t?.name).toBe("Blas");
    expect(H.llamadas).toEqual([{ id: "cuid-blas" }]);
  });

  it("si el id no existe, lo busca por slug", async () => {
    const t = await TenantsDB.contactoDelDueno("main");
    expect(t).toEqual({ id: "cuid-main", name: "Main", ownerPhone: null, ownerEmail: "dueno@ejemplo.pe" });
    expect(H.llamadas).toEqual([{ id: "main" }, { slug: "main" }]);
  });

  it("vacío o desconocido → null", async () => {
    expect(await TenantsDB.contactoDelDueno("")).toBeNull();
    expect(H.llamadas).toEqual([]);
    expect(await TenantsDB.contactoDelDueno("nadie")).toBeNull();
  });
});
