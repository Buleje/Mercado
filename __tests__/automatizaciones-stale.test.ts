import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regla «Tienda dormida» (stale-30d): sin operaciones REALES en 30 días, no sólo sin pedidos.
 * Un aserradero (Blas) trabaja con el libro CTP y casi no tiene pedidos: no puede salir «dormido».
 */

const dbMock = vi.hoisted(() => ({
  tiendasActivas: vi.fn(),
  pedidosDesde: vi.fn(),
  senalesDeUsoDe: vi.fn(),
}));

vi.mock("@/lib/db/automatizaciones.db", () => ({ AutomatizacionesDB: dbMock }));
// computeMatches importa PlatformSettingsDB para el estado; esta prueba no lo usa.
vi.mock("@/lib/db/platform-settings.db", () => ({ PlatformSettingsDB: {} }));

import { estaDormida, tiendasDormidas } from "@/lib/superadmin/tienda-dormida";
import { computeMatches } from "@/lib/superadmin/automations";

const sinNada = { operaciones30d: 0 };
const aserraderoConLibro = { operaciones30d: 42 }; // libro CTP + trozas, 0 pedidos

describe("estaDormida / tiendasDormidas (lógica pura)", () => {
  it("aserradero con libro y sin pedidos NO está dormido", () => {
    expect(estaDormida(aserraderoConLibro)).toBe(false);
  });

  it("bodega sin ninguna operación SÍ está dormida", () => {
    expect(estaDormida(sinNada)).toBe(true);
  });

  it("una sola operación en 30 días basta para no estar dormida", () => {
    expect(estaDormida({ operaciones30d: 1 })).toBe(false);
  });

  it("sin lectura de señales (null/undefined) NO se marca: mejor no avisar que avisar mal", () => {
    expect(estaDormida(null)).toBe(false);
    expect(estaDormida(undefined)).toBe(false);
  });

  it("filtra por id y respeta el tipo de la fila", () => {
    const activas = [
      { id: "blas", slug: "blas", name: "Blas" },
      { id: "bodega", slug: "bodega", name: "Bodega" },
      { id: "roto", slug: "roto", name: "Sin lectura" },
    ];
    const senales = new Map<string, { operaciones30d: number } | null>([
      ["blas", aserraderoConLibro],
      ["bodega", sinNada],
      ["roto", null],
    ]);
    expect(tiendasDormidas(activas, senales).map((t) => t.slug)).toEqual(["bodega"]);
  });

  it("un negocio sin entrada en el mapa no entra", () => {
    expect(tiendasDormidas([{ id: "x" }], new Map())).toEqual([]);
  });
});

describe("computeMatches('stale-30d')", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.tiendasActivas.mockResolvedValue([
      { id: "blas", slug: "blas", name: "Blas" },
      { id: "bodega", slug: "bodega", name: "Bodega" },
      { id: "pizza", slug: "pizza", name: "Pizza" },
      { id: "roto", slug: "roto", name: "Sin lectura" },
    ]);
    dbMock.pedidosDesde.mockResolvedValue(new Map([["pizza", 3]]));
    dbMock.senalesDeUsoDe.mockImplementation(async (ids: string[]) =>
      new Map(ids.map((id) => [id, id === "blas" ? aserraderoConLibro : id === "roto" ? null : sinNada])),
    );
  });

  it("deja afuera al aserradero con libro, al que tiene pedidos y al que no se pudo medir", async () => {
    const r = await computeMatches("stale-30d");
    expect(r.map((t) => t.slug)).toEqual(["bodega"]);
  });

  it("sólo mide las señales de quien no tiene pedidos (atajo barato)", async () => {
    await computeMatches("stale-30d");
    const [ids] = dbMock.senalesDeUsoDe.mock.calls[0];
    expect(ids).toEqual(["blas", "bodega", "roto"]);
  });

  it("devuelve la forma {id, slug, name} que esperan la ruta y el cron", async () => {
    const [t] = await computeMatches("stale-30d");
    expect(Object.keys(t).sort()).toEqual(["id", "name", "slug"]);
  });
});
