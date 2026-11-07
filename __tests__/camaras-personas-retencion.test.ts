import { describe, expect, it } from "vitest";
import {
  corteRetencionPersonas,
  diasRetencionDe,
  diasRetencionValidos,
  fotoVencida,
  fotosVencidas,
} from "@/lib/camaras/personas-retencion";

// Lima = UTC-5 sin horario de verano: 00:00 Lima = 05:00 UTC.
const AHORA = new Date("2026-10-08T15:00:00-05:00"); // 8 de octubre, 15:00 Lima

describe("corteRetencionPersonas (días de Lima)", () => {
  it("30 días desde el 8 de octubre = 00:00 Lima del 8 de septiembre", () => {
    expect(corteRetencionPersonas(AHORA, 30).toISOString()).toBe("2026-09-08T05:00:00.000Z");
  });

  it("a las 20:00 de Lima el UTC ya es «mañana» y el corte no se mueve de día", () => {
    const tarde = new Date("2026-10-08T23:30:00-05:00"); // 04:30 UTC del 9
    expect(corteRetencionPersonas(tarde, 30).toISOString()).toBe("2026-09-08T05:00:00.000Z");
  });

  it("recién pasada la medianoche de Lima ya cuenta el día nuevo", () => {
    const apenas = new Date("2026-10-09T00:00:01-05:00");
    expect(corteRetencionPersonas(apenas, 30).toISOString()).toBe("2026-09-09T05:00:00.000Z");
  });
});

describe("fotoVencida: el borde del día", () => {
  it("23:59:59 Lima del día anterior al corte ya venció", () => {
    expect(fotoVencida(new Date("2026-09-07T23:59:59-05:00"), AHORA, 30)).toBe(true);
  });
  it("00:00:00 Lima del día del corte se conserva (estrictamente antes vence)", () => {
    expect(fotoVencida(new Date("2026-09-08T00:00:00-05:00"), AHORA, 30)).toBe(false);
  });
  it("una foto de hoy nunca vence", () => {
    expect(fotoVencida(AHORA, AHORA, 1)).toBe(false);
  });
  it("con 1 día se conserva ayer y vence anteayer", () => {
    expect(fotoVencida(new Date("2026-10-07T00:00:00-05:00"), AHORA, 1)).toBe(false);
    expect(fotoVencida(new Date("2026-10-06T23:59:59-05:00"), AHORA, 1)).toBe(true);
  });
  it("acepta ISO como texto", () => {
    expect(fotoVencida("2026-08-01T12:00:00.000Z", AHORA, 30)).toBe(true);
  });
});

describe("fotosVencidas", () => {
  it("separa lo vencido de lo vigente sin tocar el resto de la fila", () => {
    const fotos = [
      { id: "a", uploadedAt: "2026-09-07T23:59:59-05:00" },
      { id: "b", uploadedAt: "2026-09-08T00:00:00-05:00" },
      { id: "c", uploadedAt: new Date("2026-10-08T10:00:00-05:00") },
      { id: "d", uploadedAt: "2026-01-01T00:00:00Z" },
    ];
    expect(fotosVencidas(fotos, AHORA, 30).map((f) => f.id)).toEqual(["a", "d"]);
  });
  it("lista vacía = nada", () => {
    expect(fotosVencidas([], AHORA, 30)).toEqual([]);
  });
});

describe("días de retención", () => {
  it("valida enteros 1-60 (Ley 29733)", () => {
    expect(diasRetencionValidos(30)).toBe(30);
    expect(diasRetencionValidos("45")).toBe(45);
    expect(diasRetencionValidos(1)).toBe(1);
    expect(diasRetencionValidos(60)).toBe(60);
    for (const malo of [0, 61, 365, -3, 2.5, "", "abc", null, undefined, NaN]) {
      expect(diasRetencionValidos(malo)).toBeNull();
    }
  });
  it("lo guardado raro cae al default de 30", () => {
    expect(diasRetencionDe({ dias: 7 })).toBe(7);
    expect(diasRetencionDe({ dias: 365 })).toBe(60); // guardado con el tope viejo → el tope nuevo
    for (const raro of [null, undefined, {}, [], { dias: 0 }, { dias: "x" }, 12, "a"]) {
      expect(diasRetencionDe(raro)).toBe(30);
    }
  });
});
