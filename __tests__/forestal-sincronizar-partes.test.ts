import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * La sincronización toca la base, así que la DB se sustituye: lo que se prueba
 * es la REGLA —a quién se guarda, con qué rol y a quién NO— que es donde estaba
 * el riesgo de llenar la libreta de filas repetidas.
 */
type ParteGuardada = { roles: string[]; nombre: string; licencia?: string };
const guardarParte = vi.fn<(tenantId: string, input: ParteGuardada, usuario: string) => Promise<unknown>>(
  async () => ({}),
);
vi.mock("@/lib/db/forest-directorio.db", () => ({
  ForestDirectorioDB: { guardarParte: (t: string, i: ParteGuardada, u: string) => guardarParte(t, i, u) },
}));

const { sincronizarPartesDeGuia } = await import("@/lib/forestal/ctp-sincronizar-partes");

beforeEach(() => guardarParte.mockClear());

const guia = (over: Record<string, unknown> = {}) => ({
  propietario: { nombre: "ASERRADERO X", docTipo: "RUC", docNumero: "20512345678" },
  destinatario: { nombre: "Distribuidora Callao SAC", docTipo: "RUC", docNumero: "20601234567", direccion: "Av. Argentina 4500" },
  vehiculo: { conductor: "JULIO PAREDES", conductorDni: "44120987", licencia: "Q44120987" },
  ...over,
});

describe("sincronizarPartesDeGuia — la guía llena la libreta", () => {
  it("guarda destinatario, propietario y conductor con su rol", async () => {
    const n = await sincronizarPartesDeGuia("t1", guia(), "qa");
    expect(n).toBe(3);
    const roles = guardarParte.mock.calls.map((c) => c[1].roles[0]);
    expect(roles.sort()).toEqual(["conductor", "destinatario", "proveedor"]);
  });

  it("al conductor le lleva la licencia: es lo que pide el puesto de control", async () => {
    await sincronizarPartesDeGuia("t1", guia(), "qa");
    const conductor = guardarParte.mock.calls.map((c) => c[1]).find((p) => p.roles[0] === "conductor");
    expect(conductor?.licencia).toBe("Q44120987");
  });

  it("SIN documento no crea nada: cada NULL sería una fila nueva del mismo cliente", async () => {
    const n = await sincronizarPartesDeGuia(
      "t1",
      { destinatario: { nombre: "Cliente de Prueba SAC" }, vehiculo: { conductor: "Sin DNI" } },
      "qa",
    );
    expect(n).toBe(0);
    expect(guardarParte).not.toHaveBeenCalled();
  });

  it("un tipo de documento que no existe se ignora en vez de guardarse mal", async () => {
    await sincronizarPartesDeGuia(
      "t1",
      { destinatario: { nombre: "X", docTipo: "LIBRETA", docNumero: "123" } },
      "qa",
    );
    expect(guardarParte).not.toHaveBeenCalled();
  });

  it("si la libreta falla, la guía NO se cae: se cuenta lo que sí entró", async () => {
    guardarParte.mockRejectedValueOnce(new Error("base ocupada"));
    const n = await sincronizarPartesDeGuia("t1", guia(), "qa");
    expect(n).toBe(2);
  });

  it("una guía sin partes nombradas no llama a la base", async () => {
    expect(await sincronizarPartesDeGuia("t1", {}, "qa")).toBe(0);
    expect(guardarParte).not.toHaveBeenCalled();
  });
});
