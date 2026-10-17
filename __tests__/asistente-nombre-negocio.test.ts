/**
 * El bot tiene que decir EN QUÉ negocio anotó.
 *
 * Nació de un susto real (2026-09-05): Brandon dictó un gasto por Telegram, el
 * bot contestó «se anota en Mi Plata › Reportes › Activos», fue a buscarlo y no
 * estaba. El gasto SÍ se había guardado —se verificó en la base— pero en otro
 * negocio: su chat estaba vinculado a la bodega y él miraba el panel del
 * forestal. El mensaje no era falso, era incompleto.
 *
 * Dos propiedades que este helper no puede perder:
 *  · **Nunca lanza.** Un bot que se cae porque no pudo adornar un texto es peor
 *    que un texto sin adorno.
 *  · **Cachea.** El nombre entra en cada tarjeta y en cada confirmación.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockGetBasic } = vi.hoisted(() => ({ mockGetBasic: vi.fn() }));
vi.mock("@/lib/db/tenants.db", () => ({ TenantsDB: { getBasicById: mockGetBasic } }));

const { nombreDelNegocio } = await import("@/lib/asistente/negocio");

beforeEach(() => vi.clearAllMocks());

describe("devuelve el nombre para mostrarlo", () => {
  it("el nombre del negocio", async () => {
    mockGetBasic.mockResolvedValue({ id: "t1", slug: "main", name: "Buleje" });
    expect(await nombreDelNegocio("t1")).toBe("Buleje");
  });

  it("si no hay nombre, cae al slug — algo es mejor que nada", async () => {
    mockGetBasic.mockResolvedValue({ id: "t2", slug: "blas-sac", name: "   " });
    expect(await nombreDelNegocio("t2")).toBe("blas-sac");
  });
});

describe("nunca rompe el bot", () => {
  it("un negocio inexistente devuelve null, no lanza", async () => {
    mockGetBasic.mockResolvedValue(null);
    await expect(nombreDelNegocio("t3")).resolves.toBeNull();
  });

  it("si la base falla, devuelve null en vez de tirar", async () => {
    mockGetBasic.mockRejectedValue(new Error("db caída"));
    await expect(nombreDelNegocio("t4")).resolves.toBeNull();
  });

  it("un fallo NO se cachea: el próximo mensaje vuelve a intentar", async () => {
    mockGetBasic.mockRejectedValueOnce(new Error("db caída"));
    expect(await nombreDelNegocio("t5")).toBeNull();

    mockGetBasic.mockResolvedValue({ id: "t5", slug: "s", name: "Ya volvió" });
    expect(await nombreDelNegocio("t5")).toBe("Ya volvió");
  });
});

describe("cachea: el nombre va en cada mensaje", () => {
  it("dos llamadas seguidas consultan la base UNA vez", async () => {
    mockGetBasic.mockResolvedValue({ id: "t6", slug: "s", name: "Buleje" });
    await nombreDelNegocio("t6");
    await nombreDelNegocio("t6");
    expect(mockGetBasic).toHaveBeenCalledTimes(1);
  });

  it("negocios distintos no se pisan entre sí", async () => {
    mockGetBasic.mockResolvedValueOnce({ id: "a", slug: "a", name: "Buleje" });
    mockGetBasic.mockResolvedValueOnce({ id: "b", slug: "b", name: "Blas SAC" });
    expect(await nombreDelNegocio("a")).toBe("Buleje");
    expect(await nombreDelNegocio("b")).toBe("Blas SAC");
  });
});
