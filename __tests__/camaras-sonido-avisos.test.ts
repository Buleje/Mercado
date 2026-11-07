/**
 * La regla del sonido de las alarmas de Cámaras (2026-10-15): qué se guarda,
 * cuándo suena y en qué pestaña. El audio real (Web Audio) no se prueba acá.
 */
import { describe, expect, it } from "vitest";
import {
  GANANCIA_MAX,
  PREFERENCIAS_INICIALES,
  SIN_SILENCIO,
  TONOS_ALARMA,
  alarmaConSonidoDe,
  decidirSonido,
  escribirMarcaAlarma,
  gananciaPara,
  leerMarcaAlarma,
  leerPreferenciasDe,
  notasDelTono,
  silenciadoPara,
  silencioDe,
  tocaSonar,
  type MarcaAlarma,
} from "@/lib/camaras/sonido-avisos";

const AHORA = 1_760_000_000_000;

describe("leerPreferenciasDe", () => {
  it("sin nada guardado o JSON roto → lo de fábrica", () => {
    expect(leerPreferenciasDe(null)).toEqual(PREFERENCIAS_INICIALES);
    expect(leerPreferenciasDe("{roto")).toEqual(PREFERENCIAS_INICIALES);
  });
  it("un campo roto vuelve a su valor de fábrica sin perder los demás", () => {
    const p = leerPreferenciasDe(JSON.stringify({ volumen: 3, tono: "sirena", conMovimiento: true, sistema: "si" }));
    expect(p).toEqual({ volumen: PREFERENCIAS_INICIALES.volumen, tono: "sirena", conMovimiento: true, sistema: false });
  });
  it("un tono que no existe → timbre", () => {
    expect(leerPreferenciasDe(JSON.stringify({ tono: "gong" })).tono).toBe("timbre");
  });
});

describe("alarmaConSonidoDe y silencioDe", () => {
  it("la alarma suena salvo que se haya apagado a propósito", () => {
    expect(alarmaConSonidoDe(null)).toBe(true);
    expect(alarmaConSonidoDe("true")).toBe(true);
    expect(alarmaConSonidoDe("false")).toBe(false);
  });
  it("silencio roto o negativo = sin silencio", () => {
    expect(silencioDe(null)).toBe(0);
    expect(silencioDe("abc")).toBe(0);
    expect(silencioDe("-5")).toBe(0);
    expect(silencioDe(String(AHORA))).toBe(AHORA);
  });
});

describe("decidirSonido", () => {
  const base = { prefs: PREFERENCIAS_INICIALES, alarmaConSonido: true, silencios: SIN_SILENCIO, ahora: AHORA };
  const conMovimiento = { ...PREFERENCIAS_INICIALES, conMovimiento: true };
  it("una persona suena con lo de fábrica; el movimiento no", () => {
    expect(decidirSonido({ ...base, tipo: "persona" })).toBe("sonar");
    expect(decidirSonido({ ...base, tipo: "movimiento" })).toBe("apagado");
  });
  it("el movimiento suena si se pidió", () => {
    expect(decidirSonido({ ...base, tipo: "movimiento", prefs: { ...PREFERENCIAS_INICIALES, conMovimiento: true } })).toBe("sonar");
  });
  it("«Silenciar alarmas» calla todo, y vence solo", () => {
    const todo = { todo: AHORA + 1, movimiento: 0 };
    expect(decidirSonido({ ...base, tipo: "persona", silencios: todo })).toBe("silenciado");
    expect(decidirSonido({ ...base, tipo: "movimiento", prefs: conMovimiento, silencios: todo })).toBe("silenciado");
    expect(decidirSonido({ ...base, tipo: "persona", silencios: { todo: AHORA - 1, movimiento: 0 } })).toBe("sonar");
  });
  it("el «Silenciar» del mensaje de movimiento NO calla a las personas (bug del 15-10)", () => {
    const soloMovimiento = { todo: 0, movimiento: AHORA + 60_000 };
    expect(decidirSonido({ ...base, tipo: "persona", silencios: soloMovimiento })).toBe("sonar");
    expect(decidirSonido({ ...base, tipo: "movimiento", prefs: conMovimiento, silencios: soloMovimiento })).toBe("silenciado");
    expect(silenciadoPara("persona", soloMovimiento, AHORA)).toBe(false);
    expect(silenciadoPara("movimiento", soloMovimiento, AHORA)).toBe(true);
  });
  it("volumen 0 o «Alarma con sonido» apagada → apagado (no «sonó» sin oírse)", () => {
    expect(decidirSonido({ ...base, tipo: "persona", prefs: { ...PREFERENCIAS_INICIALES, volumen: 0 } })).toBe("apagado");
    expect(decidirSonido({ ...base, tipo: "persona", alarmaConSonido: false })).toBe("apagado");
  });
});

describe("marca de la última alarma", () => {
  it("ida y vuelta", () => {
    const m: MarcaAlarma = { pestana: "abc123", at: AHORA, tipo: "movimiento" };
    expect(leerMarcaAlarma(escribirMarcaAlarma(m))).toEqual(m);
  });
  it("la marca de antes (sólo la hora) cuenta como persona de otra pestaña", () => {
    expect(leerMarcaAlarma(String(AHORA))).toEqual({ pestana: "", at: AHORA, tipo: "persona" });
  });
  it("vacía o rota → sin marca", () => {
    expect(leerMarcaAlarma(null)).toBeNull();
    expect(leerMarcaAlarma("basura")).toBeNull();
    expect(leerMarcaAlarma("x|-5|persona")).toBeNull();
  });
});

describe("tocaSonar (una sola pestaña suena)", () => {
  const yo = { pestana: "esta", tipo: "persona" as const };
  const otra = (hace: number, tipo: MarcaAlarma["tipo"] = "persona"): MarcaAlarma => ({ pestana: "otra", at: AHORA - hace, tipo });
  it("sin marca suena", () => {
    expect(tocaSonar(null, yo, AHORA)).toBe(true);
  });
  it("otra pestaña sonó hace 2 s → esta calla; hace 6 s → suena", () => {
    expect(tocaSonar(otra(2_000), yo, AHORA, 6_000)).toBe(false);
    expect(tocaSonar(otra(6_000), yo, AHORA, 6_000)).toBe(true);
  });
  it("la marca de esta misma pestaña nunca la calla", () => {
    expect(tocaSonar({ pestana: "esta", at: AHORA - 1_000, tipo: "movimiento" }, yo, AHORA, 6_000)).toBe(true);
  });
  it("una persona suena aunque otra pestaña acabe de sonar por movimiento; un movimiento no", () => {
    expect(tocaSonar(otra(1_000, "movimiento"), yo, AHORA, 6_000)).toBe(true);
    expect(tocaSonar(otra(1_000, "movimiento"), { pestana: "esta", tipo: "movimiento" }, AHORA, 6_000)).toBe(false);
  });
  it("una marca del futuro lejano (otro reloj) no calla para siempre", () => {
    expect(tocaSonar(otra(-60_000), yo, AHORA, 6_000)).toBe(true);
  });
});

describe("tonos y volumen", () => {
  it("cada tono tiene notas audibles y dura menos de 1 s", () => {
    for (const t of TONOS_ALARMA) {
      const notas = notasDelTono(t);
      expect(notas.length).toBeGreaterThan(1);
      const fin = Math.max(...notas.map((x) => x.desde + x.dura));
      expect(fin).toBeLessThan(1);
      for (const x of notas) expect(x.hz).toBeGreaterThan(200);
    }
  });
  it("la ganancia va de 0 al tope y no se sale", () => {
    expect(gananciaPara(0)).toBe(0);
    expect(gananciaPara(1)).toBe(GANANCIA_MAX);
    expect(gananciaPara(5)).toBe(GANANCIA_MAX);
    expect(gananciaPara(-1)).toBe(0);
    expect(gananciaPara(Number.NaN)).toBe(0);
  });
});
