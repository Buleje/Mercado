/**
 * El día del negocio en Perú, no el de Greenwich.
 *
 * Dos pantallas cayeron en lo mismo el 2026-08-12: el filtro «Hoy» del kardex
 * (que mostraba 34 movimientos de ayer) y el Flujo de Caja Semanal (que corría
 * los cierres de la noche al día siguiente). Los dos usaban
 * `toISOString().slice(0, 10)`, que da el día en UTC.
 *
 * Los tests fijan la hora del sistema para que el resultado no dependa de
 * cuándo se corran.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { diaLocal, inicioDeHoy, ultimosDiasLocales } from "@/lib/fechas/dia-local";

describe("diaLocal", () => {
  it("una venta de las 20:30 pertenece a ESE día, no al siguiente", () => {
    // 11 de agosto, 20:30 en la hora del negocio.
    const anoche = new Date(2026, 7, 11, 20, 30, 0);
    expect(diaLocal(anoche)).toBe("2026-08-11");

    // La demostración del bug sólo aplica al oeste de Greenwich (Perú incluido),
    // que es donde ese instante ya es "mañana" en UTC. En otra zona el test no
    // afirma nada falso: simplemente no hay corrimiento que mostrar.
    if (anoche.getTimezoneOffset() > 0 && anoche.toISOString().slice(0, 10) !== "2026-08-11") {
      expect(anoche.toISOString().slice(0, 10)).toBe("2026-08-12");
      expect(diaLocal(anoche)).not.toBe(anoche.toISOString().slice(0, 10));
    }
  });

  it("acepta Date y string, y no rompe con basura", () => {
    const d = new Date(2026, 7, 12, 10, 0, 0);
    expect(diaLocal(d)).toBe("2026-08-12");
    expect(diaLocal("no es fecha")).toBe("");
  });

  it("rellena mes y día a dos dígitos", () => {
    expect(diaLocal(new Date(2026, 0, 5, 12))).toBe("2026-01-05");
  });
});

describe("inicioDeHoy", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 12 de agosto de 2026, 08:15 de la mañana, hora local.
    vi.setSystemTime(new Date(2026, 7, 12, 8, 15, 0));
  });
  afterEach(() => vi.useRealTimers());

  it("es la medianoche local, no la de UTC", () => {
    const inicio = new Date(inicioDeHoy());
    expect(inicio.getHours()).toBe(0);
    expect(inicio.getMinutes()).toBe(0);
    expect(diaLocal(inicio)).toBe("2026-08-12");
  });

  it("lo de anoche a las 22:00 queda FUERA de hoy", () => {
    const anoche = new Date(2026, 7, 11, 22, 0, 0).getTime();
    expect(anoche < inicioDeHoy()).toBe(true);
  });

  it("lo de esta madrugada a las 00:30 queda ADENTRO", () => {
    const madrugada = new Date(2026, 7, 12, 0, 30, 0).getTime();
    expect(madrugada >= inicioDeHoy()).toBe(true);
  });
});

describe("ultimosDiasLocales", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 12, 8, 15, 0));
  });
  afterEach(() => vi.useRealTimers());

  it("devuelve 7 días terminando hoy, del más viejo al más nuevo", () => {
    const dias = ultimosDiasLocales(7);
    expect(dias).toHaveLength(7);
    expect(dias[0]).toBe("2026-08-06");
    expect(dias.at(-1)).toBe("2026-08-12");
  });

  it("cruza el cambio de mes sin saltarse días", () => {
    vi.setSystemTime(new Date(2026, 8, 2, 10, 0, 0)); // 2 de septiembre
    expect(ultimosDiasLocales(4)).toEqual(["2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02"]);
  });
});
