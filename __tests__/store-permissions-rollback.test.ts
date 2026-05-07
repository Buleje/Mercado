/**
 * T5 — store-permissions-rollback.test.ts
 *
 * Test de lógica pura: optimistic update + rollback en togglePermission.
 * El componente DeliveryPartnersModule usa fetch+setState para permisos.
 * Aquí testeamos la lógica de rollback como función pura (no render React).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Modelo de datos ───────────────────────────────────────────────────────────
interface StorePermission {
  id: string;
  permissions: string[];
}

/**
 * Réplica de la lógica togglePermission del componente.
 * Optimistic update: modifica el array localmente, luego PATCH.
 * Si PATCH falla → rollback al estado anterior.
 */
async function togglePermission(
  permissions: StorePermission[],
  permId: string,
  permType: string,
  fetchFn: typeof fetch
): Promise<StorePermission[]> {
  const prev = permissions.map((p) => ({ ...p, permissions: [...p.permissions] }));

  // Optimistic update
  const optimistic = permissions.map((p) => {
    if (p.id !== permId) return p;
    const has = p.permissions.includes(permType);
    return {
      ...p,
      permissions: has
        ? p.permissions.filter((x) => x !== permType)
        : [...p.permissions, permType],
    };
  });

  // PATCH
  const res = await fetchFn(`/api/store-permissions/${permId}`, {
    method: "PATCH",
    body: JSON.stringify({ permType }),
  });

  if (!res.ok) {
    // Rollback
    return prev;
  }

  return optimistic;
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("togglePermission — optimistic update + rollback", () => {
  const initialPerms: StorePermission[] = [
    { id: "p1", permissions: ["view_orders", "edit_status"] },
    { id: "p2", permissions: ["view_prices"] },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rollback al estado anterior cuando PATCH retorna 500", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await togglePermission(
      initialPerms,
      "p1",
      "manage_products",
      mockFetch
    );

    // Después del error → debe volver al estado original
    expect(result[0].permissions).toEqual(["view_orders", "edit_status"]);
    expect(result[0].permissions).not.toContain("manage_products");
  });

  it("aplica el update cuando PATCH retorna ok", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true, status: 200 });

    const result = await togglePermission(
      initialPerms,
      "p1",
      "manage_products",
      mockFetch
    );

    expect(result[0].permissions).toContain("manage_products");
  });

  it("quita el permiso existente cuando PATCH ok (toggle off)", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true, status: 200 });

    const result = await togglePermission(
      initialPerms,
      "p1",
      "view_orders", // ya existe → debe quitarse
      mockFetch
    );

    expect(result[0].permissions).not.toContain("view_orders");
  });

  it("no modifica otros permisos durante rollback", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await togglePermission(initialPerms, "p1", "view_analytics", mockFetch);

    // p2 no fue tocado
    expect(result[1].permissions).toEqual(["view_prices"]);
  });
});
