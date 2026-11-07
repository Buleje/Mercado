import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hayCargadorDePagina,
  iniciarCargaPagina,
  msDeCarga,
  registrarCargadorDePagina,
  suscribirCargaPagina,
  terminarCargaPagina,
} from "@buleje/design-system/carga-pagina-reloj";

describe("reloj del cargador de página", () => {
  afterEach(() => {
    terminarCargaPagina();
    vi.restoreAllMocks();
  });

  it("sin carga en curso mide 0 (un loading.tsx de carga dura arranca en 1)", () => {
    expect(msDeCarga()).toBe(0);
  });

  it("mide desde el clic: el cargador que monta después sigue la misma curva", () => {
    const ahora = vi.spyOn(performance, "now").mockReturnValue(1_000);
    iniciarCargaPagina();
    ahora.mockReturnValue(1_650);
    expect(msDeCarga()).toBe(650);
    terminarCargaPagina();
    expect(msDeCarga()).toBe(0);
  });

  it("cuenta cargadores y avisa al entrar y al salir; sacar dos veces no descuenta de más", () => {
    const oyente = vi.fn();
    const desuscribir = suscribirCargaPagina(oyente);
    const sacarA = registrarCargadorDePagina();
    const sacarB = registrarCargadorDePagina();
    expect(hayCargadorDePagina()).toBe(true);
    sacarA();
    sacarA();
    expect(hayCargadorDePagina()).toBe(true);
    sacarB();
    expect(hayCargadorDePagina()).toBe(false);
    expect(oyente).toHaveBeenCalledTimes(4);
    desuscribir();
  });
});
