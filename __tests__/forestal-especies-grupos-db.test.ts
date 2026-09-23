/**
 * Los grupos de especies (ADR-430) viven en el catálogo del KV. Lo que se
 * prueba es lo que se rompía en silencio: `agregarEspecie` y compañía arman el
 * catálogo nuevo SIN `...catalogo`, así que dar de alta una especie borraba los
 * grupos —y con ellos los precios por grupo de la planta y de cada cliente—.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({ kv: new Map<string, unknown>(), audit: vi.fn() }));

vi.mock("@/lib/db/platform-settings.db", () => ({
  PlatformSettingsDB: {
    get: async (k: string) => H.kv.get(k) ?? null,
    set: async (k: string, v: unknown) => void H.kv.set(k, JSON.parse(JSON.stringify(v))),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/cache", () => ({ getOrSet: vi.fn(), invalidate: vi.fn(), invalidateByPrefix: vi.fn() }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: H.audit }));

import { ForestEspeciesDB } from "@/lib/db/forest-especies.db";

const T = "tenant-qa";

beforeEach(() => {
  H.kv.clear();
  H.audit.mockClear();
});

describe("ForestEspeciesDB — grupos de especies", () => {
  it("guarda los grupos con claves normalizadas y lo dice en el rastro", async () => {
    const r = await ForestEspeciesDB.guardarGrupos(T, [{ id: "g1", nombre: "Duras", especies: ["Anacaspi", " ANACASPI", "Shihuahuaco"] }], "qa");
    expect(r.catalogo.grupos).toEqual([{ id: "g1", nombre: "Duras", claves: ["anacaspi", "shihuahuaco"] }]);
    expect((await ForestEspeciesDB.get(T)).grupos).toEqual(r.catalogo.grupos);
    expect(H.audit.mock.calls[0][0].detail).toBe("Guardó 1 grupo(s) de especies: Duras (2)");
  });

  it("agregar, quitar o restaurar una especie NO borra los grupos", async () => {
    await ForestEspeciesDB.guardarGrupos(T, [{ id: "g1", nombre: "Duras", especies: ["Anacaspi"] }], "qa");
    await ForestEspeciesDB.agregar(T, { nombre: "Quinilla colorada" }, "qa");
    expect((await ForestEspeciesDB.get(T)).grupos).toEqual([{ id: "g1", nombre: "Duras", claves: ["anacaspi"] }]);
    await ForestEspeciesDB.quitar(T, "Quinilla colorada", "qa");
    await ForestEspeciesDB.agregarVarias(T, [{ nombre: "Pumaquiro" }], "qa");
    expect((await ForestEspeciesDB.get(T)).grupos).toHaveLength(1);
  });

  it("renombrar una especie la mueve dentro de su grupo", async () => {
    await ForestEspeciesDB.agregar(T, { nombre: "Anacaspi" }, "qa");
    await ForestEspeciesDB.guardarGrupos(T, [{ id: "g1", nombre: "Duras", especies: ["Anacaspi"] }], "qa");
    await ForestEspeciesDB.editar(T, "anacaspi", { nombre: "Anacaspi negro" }, "qa");
    expect((await ForestEspeciesDB.get(T)).grupos?.[0].claves).toEqual(["anacaspi negro"]);
  });

  it("guardar una lista vacía quita los grupos y avisa qué precios dejan de aplicarse", async () => {
    await ForestEspeciesDB.guardarGrupos(T, [{ id: "g1", nombre: "Duras", especies: ["Anacaspi"] }], "qa");
    const r = await ForestEspeciesDB.guardarGrupos(T, [], "qa");
    expect(r.catalogo).not.toHaveProperty("grupos");
    expect(r.mensaje).toMatch(/Se quitó «Duras»: los precios por ese grupo dejan de aplicarse/);
  });
});
