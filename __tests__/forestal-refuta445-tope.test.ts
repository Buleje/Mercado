/**
 * Refutación del reviewer sobre ADR-445 (defecto D, confirmado 27-09): con las
 * otras 300 cubicaciones ligadas, `recortarAlTope` descartaba la RECIÉN
 * guardada y el POST igual respondía 201. La nueva (índice 0) no se toca.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/platform-settings.db", () => ({ PlatformSettingsDB: {} }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: () => {} }));

import { recortarAlTope } from "@/lib/db/forest-cubicaciones.db";
import type { CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";

const r = (id: string, updatedAt: string, ids?: string[]) =>
  ({ id, updatedAt, ctpEntryIds: ids, piezas: [] }) as unknown as CubicacionRegistro;

describe("refuta445 · D — el tope nunca descarta la recién guardada", () => {
  it("con 3 ligadas en el tope 3, la nueva suelta se queda y la lista supera el tope", () => {
    const nueva = r("nueva", "2026-09-27T23:00:00Z");
    const lista = [nueva, r("a", "2026-09-01T00:00:00Z", ["c1"]), r("b", "2026-08-01T00:00:00Z", ["c2"]), r("c", "2026-07-01T00:00:00Z", ["c3"])];
    expect(recortarAlTope(lista, 3).map((c) => c.id)).toEqual(["nueva", "a", "b", "c"]);
  });

  it("aunque su reloj diga que es la más vieja, la nueva no sale: sale la suelta más vieja del resto", () => {
    const nueva = r("nueva", "2020-01-01T00:00:00Z");
    const lista = [nueva, r("a", "2026-09-01T00:00:00Z"), r("b", "2026-08-01T00:00:00Z", ["c2"])];
    expect(recortarAlTope(lista, 2).map((c) => c.id)).toEqual(["nueva", "b"]);
  });
});
