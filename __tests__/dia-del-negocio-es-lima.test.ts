/**
 * «Hoy» es el día de Lima, no el de UTC.
 *
 * El negocio abre en Pucallpa (UTC−5), así que entre las 19:00 y la medianoche
 * peruana `new Date().toISOString()` ya avanzó de día. Todo lo que compare una
 * fecha contra «hoy» con `toISOString().slice(0,10)` cuenta esas cinco horas
 * como del día siguiente.
 *
 * Encontrado 2026-09-06 revisando el tenant demo. De 140 archivos que arman un
 * «hoy» en UTC, sólo 5 lo COMPARAN contra la fecha de un registro (el resto son
 * defaults de <input type="date"> o nombres de archivo, inofensivos). El más
 * consecuente: el dedupe de recordatorios de cobranza —un aviso a las 18:00 y
 * otro a las 20:00 caían en «días» distintos y a la persona le llegaban los dos.
 *
 * El otro extremo del mismo problema, que es fácil introducir al arreglar esto:
 * un string date-only YA viene en el día del negocio, y convertirlo lo corre un
 * día para atrás.
 */

import { describe, it, expect } from "vitest";
import { limaDateKey } from "@/lib/utils";

describe("limaDateKey — el día del negocio", () => {
  it("las 20:00 de Lima siguen siendo el mismo día, aunque en UTC ya sea otro", () => {
    // 2026-09-07T01:00Z = 6-sep 20:00 en Lima
    const nocheEnLima = "2026-09-07T01:00:00.000Z";
    expect(new Date(nocheEnLima).toISOString().slice(0, 10)).toBe("2026-09-07"); // lo que decía antes
    expect(limaDateKey(nocheEnLima)).toBe("2026-09-06"); // lo que vive el dueño
  });

  it("las 23:58 de Lima tampoco saltan de día", () => {
    expect(limaDateKey("2026-09-07T04:58:00.000Z")).toBe("2026-09-06");
  });

  it("pasada la medianoche de Lima sí cambia", () => {
    expect(limaDateKey("2026-09-07T05:01:00.000Z")).toBe("2026-09-07");
  });

  it("dos recordatorios de la misma tarde caen en el mismo día", () => {
    const seisDeLaTarde = "2026-09-06T23:00:00.000Z"; // 18:00 Lima
    const ochoDeLaNoche = "2026-09-07T01:00:00.000Z"; // 20:00 Lima
    // Con UTC daban días distintos -> el segundo aviso pasaba el filtro.
    expect(new Date(seisDeLaTarde).toISOString().slice(0, 10))
      .not.toBe(new Date(ochoDeLaNoche).toISOString().slice(0, 10));
    // Con el día de Lima son el mismo -> no se manda dos veces.
    expect(limaDateKey(seisDeLaTarde)).toBe(limaDateKey(ochoDeLaNoche));
  });

  it("una fecha inválida no explota", () => {
    expect(limaDateKey("no-es-fecha")).toBe("");
  });
});

describe("date-only: el error opuesto", () => {
  /** Misma guarda que usa ResumenSection. */
  const claveDelDia = (s: string) => (s.length <= 10 ? s.slice(0, 10) : limaDateKey(s));

  it("un date-only NO se corre un día al convertirlo", () => {
    // Pasado por conversión de zona, "2026-09-06" se leería como 5-sep.
    expect(limaDateKey("2026-09-06")).toBe("2026-09-05"); // el error a evitar
    expect(claveDelDia("2026-09-06")).toBe("2026-09-06"); // la guarda lo evita
  });

  it("un timestamp completo sí se convierte", () => {
    expect(claveDelDia("2026-09-07T01:00:00.000Z")).toBe("2026-09-06");
  });
});
