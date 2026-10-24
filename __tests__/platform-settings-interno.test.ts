/**
 * PlatformSettingsDB — claves `interno:` (29-09-2026).
 *
 * La caché de placas y el contador de consultas pagas se escriben en cada
 * búsqueda. No pueden invalidar `__all__` (lo lee el layout de la plataforma)
 * ni viajar dentro de `getAll()`. Las claves de configuración siguen igual.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => {
  const invalidate = vi.fn();
  const findMany = vi.fn(async () => []);
  const upsert = vi.fn(async () => ({}));
  const tx = {
    $executeRaw: vi.fn(async () => 1),
    $queryRaw: vi.fn(async () => [{ ok: true }]),
    platformSetting: { findUnique: vi.fn(async () => null), upsert },
  };
  return { invalidate, findMany, upsert, tx };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    platformSetting: { findMany: H.findMany, upsert: H.upsert, findUnique: vi.fn(), delete: vi.fn(async () => ({})) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(H.tx),
  },
}));
vi.mock("@/lib/cache", () => ({
  getOrSet: vi.fn(async (_k: string, _t: number, fn: () => Promise<unknown>) => fn()),
  invalidate: H.invalidate,
  invalidateByPrefix: vi.fn(),
  revalidateTenantTag: vi.fn(),
}));

import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";

beforeEach(() => {
  H.invalidate.mockClear();
  H.findMany.mockClear();
});

describe("PlatformSettingsDB — claves interno:", () => {
  it("getAll() no trae las claves interno:", async () => {
    await PlatformSettingsDB.getAll();
    expect(H.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { NOT: { key: { startsWith: "interno:" } } } }));
  });

  it("set de una clave interna invalida sólo su clave, no __all__", async () => {
    await PlatformSettingsDB.set("interno:placa-externa-cache", { entradas: {} });
    expect(H.invalidate).toHaveBeenCalledWith("platform-settings:interno:placa-externa-cache");
    expect(H.invalidate).not.toHaveBeenCalledWith("platform-settings:__all__");
  });

  it("actualizar de una clave interna tampoco invalida __all__", async () => {
    await PlatformSettingsDB.actualizar("interno:placa-externa-uso:t1", () => ({ valor: { enDia: 1 }, resultado: null }));
    expect(H.invalidate).toHaveBeenCalledWith("platform-settings:interno:placa-externa-uso:t1");
    expect(H.invalidate).not.toHaveBeenCalledWith("platform-settings:__all__");
  });

  it("una clave de configuración sigue invalidando __all__", async () => {
    await PlatformSettingsDB.set("plan-prices", { pro: 89 });
    await PlatformSettingsDB.actualizar("ctp-cubicaciones:t1", () => ({ valor: [], resultado: null }));
    expect(H.invalidate.mock.calls.filter(([k]) => k === "platform-settings:__all__")).toHaveLength(2);
  });
});
