/**
 * Ubicación de la tienda (09-10): nada en la app escribía Store.lat, así que
 * «Lista para publicar» quedaba en ámbar para siempre. Al guardar la tienda se
 * copia el punto de Ajustes › Negocio, sin pisar uno ya puesto.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const findSettings = vi.fn();
const updateMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    settings: { findUnique: (...a: unknown[]) => findSettings(...a) },
    store: { updateMany: (...a: unknown[]) => updateMany(...a) },
  },
}));

import { TiendaListaPublicarDB } from "@/lib/db/tienda-lista-publicar.db";

describe("TiendaListaPublicarDB.copiarUbicacionDeAjustes", () => {
  beforeEach(() => {
    findSettings.mockReset();
    updateMany.mockReset();
  });

  it("copia el punto de Ajustes solo a la tienda de ese negocio y solo si está vacía", async () => {
    findSettings.mockResolvedValue({ businessLat: -8.38, businessLon: -74.55 });
    updateMany.mockResolvedValue({ count: 1 });
    await expect(TiendaListaPublicarDB.copiarUbicacionDeAjustes("t1", "s1")).resolves.toBe(true);
    expect(findSettings.mock.calls[0][0]).toMatchObject({ where: { tenantId: "t1" } });
    expect(updateMany.mock.calls[0][0]).toEqual({
      where: { id: "s1", tenantId: "t1", OR: [{ lat: null }, { lng: null }] },
      data: { lat: -8.38, lng: -74.55 },
    });
  });

  it("sin punto en Ajustes no escribe nada", async () => {
    findSettings.mockResolvedValue({ businessLat: -8.38, businessLon: null });
    await expect(TiendaListaPublicarDB.copiarUbicacionDeAjustes("t1", "s1")).resolves.toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("si la tienda ya tenía punto propio no lo pisa (0 filas)", async () => {
    findSettings.mockResolvedValue({ businessLat: 1, businessLon: 2 });
    updateMany.mockResolvedValue({ count: 0 });
    await expect(TiendaListaPublicarDB.copiarUbicacionDeAjustes("t1", "s1")).resolves.toBe(false);
  });
});
