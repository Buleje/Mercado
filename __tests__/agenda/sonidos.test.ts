// @vitest-environment jsdom
/**
 * Sonidos de los avisos — recetas cortas, UN AudioContext reutilizado,
 * volumen en curva y anti-ráfaga (5 avisos juntos suenan una vez).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SONIDOS_AVISO } from "@/lib/agenda/aviso-pantalla";
import { _reiniciarSonidosParaTest, duracionDe, gananciaDeVolumen, probarSonido, RAFAGA_MS, RECETAS, SONIDOS_UI, tocarSonido, ventanaDe } from "@/lib/agenda/sonidos";

const param = () => ({
  value: 0,
  setValueAtTime: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
  setTargetAtTime: vi.fn(),
  cancelScheduledValues: vi.fn(),
});

let creados = 0;
let osciladores = 0;
let estado: AudioContextState = "running";

class AudioContextFalso {
  currentTime = 0;
  destination = {};
  get state() {
    return estado;
  }
  constructor() {
    creados += 1;
  }
  resume = vi.fn(async () => {
    estado = "running";
  });
  createGain() {
    return { gain: param(), connect: vi.fn(), disconnect: vi.fn() };
  }
  createOscillator() {
    osciladores += 1;
    return { type: "sine", frequency: param(), connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null };
  }
}

beforeEach(() => {
  creados = 0;
  osciladores = 0;
  estado = "running";
  _reiniciarSonidosParaTest();
  vi.stubGlobal("AudioContext", AudioContextFalso);
  vi.useFakeTimers({ toFake: ["Date", "setTimeout"] });
  vi.setSystemTime(Date.parse("2026-10-20T15:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("recetas", () => {
  it("cada sonido dura entre 1,2 y 3 s (largos, pero no una sirena) y «ninguno» no tiene notas", () => {
    for (const s of SONIDOS_AVISO.filter((x) => x !== "ninguno")) {
      expect(duracionDe(s)).toBeGreaterThanOrEqual(1.2);
      expect(duracionDe(s)).toBeLessThanOrEqual(3);
    }
    expect(duracionDe("ninguno")).toBe(0);
  });
  it("hay variedad: 12 sonidos, todos con receta y con nombre", () => {
    const sonidos = SONIDOS_AVISO.filter((x) => x !== "ninguno");
    expect(sonidos.length).toBeGreaterThanOrEqual(12);
    for (const s of SONIDOS_AVISO) expect(SONIDOS_UI[s]).toBeTruthy();
    for (const s of sonidos) expect(RECETAS[s].length).toBeGreaterThan(0);
  });
  it("al 100 % ninguno suma tanto como para saturar (la envolvente real, cada 10 ms, < 1,5)", () => {
    const nivel = (n: (typeof RECETAS)["campanita"][number], t: number) => {
      const ataque = n.ataque ?? 0.01;
      if (t < n.t || t > n.t + n.d) return 0;
      if (t < n.t + ataque) return n.g * ((t - n.t) / ataque);
      /* Baja exponencial hasta 0,0001 al final, como la rampa del audio. */
      return n.g * Math.pow(0.0001 / n.g, (t - n.t - ataque) / (n.d - ataque));
    };
    for (const [id, notas] of Object.entries(RECETAS)) {
      let mayor = 0;
      for (let t = 0; t < 3.2; t += 0.01) mayor = Math.max(mayor, notas.reduce((suma, n) => suma + nivel(n, t), 0));
      expect(mayor, id).toBeLessThan(1.5);
    }
  });
});

describe("volumen", () => {
  it("0 calla, 100 es el tope y la curva es suave (50 % < mitad del tope)", () => {
    expect(gananciaDeVolumen(0)).toBe(0);
    expect(gananciaDeVolumen(100)).toBeGreaterThan(gananciaDeVolumen(50));
    expect(gananciaDeVolumen(50)).toBeLessThan(gananciaDeVolumen(100) / 2);
    expect(gananciaDeVolumen(150)).toBe(gananciaDeVolumen(100));
    expect(gananciaDeVolumen(Number.NaN)).toBe(0);
  });
});

describe("tocarSonido", () => {
  it("crea los osciladores de la receta en UN AudioContext reutilizado", () => {
    tocarSonido("campanita", 60);
    expect(osciladores).toBe(RECETAS.campanita.length);
    vi.setSystemTime(Date.now() + ventanaDe("campanita") + 1);
    tocarSonido("doble", 60);
    expect(osciladores).toBe(RECETAS.campanita.length + RECETAS.doble.length);
    expect(creados).toBe(1);
  });
  it("5 avisos juntos suenan una vez", () => {
    for (let i = 0; i < 5; i++) tocarSonido("gota", 80);
    expect(osciladores).toBe(RECETAS.gota.length);
  });
  it("con un sonido largo, otro aviso que llega mientras suena no lo corta", () => {
    tocarSonido("acorde", 80);
    vi.setSystemTime(Date.now() + RAFAGA_MS + 200);
    tocarSonido("gota", 80);
    expect(osciladores).toBe(RECETAS.acorde.length);
    vi.setSystemTime(Date.now() + ventanaDe("acorde"));
    tocarSonido("gota", 80);
    expect(osciladores).toBe(RECETAS.acorde.length + RECETAS.gota.length);
  });
  it("«Escuchar» no mira la ráfaga: elegir otro suena ya", () => {
    tocarSonido("gota", 80);
    probarSonido("alerta", 80);
    expect(osciladores).toBe(RECETAS.gota.length + RECETAS.alerta.length);
  });
  it("«ninguno» o volumen 0 no crean nada", () => {
    tocarSonido("ninguno", 80);
    tocarSonido("campanita", 0);
    expect(osciladores).toBe(0);
  });
  it("con el audio dormido lo despierta y suena", async () => {
    estado = "suspended";
    tocarSonido("suave", 50);
    expect(osciladores).toBe(0);
    await vi.waitFor(() => expect(osciladores).toBe(RECETAS.suave.length));
  });
  it("si el navegador no deja crear audio, no rompe", () => {
    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          throw new Error("NotAllowedError");
        }
      },
    );
    expect(() => tocarSonido("campanita", 60)).not.toThrow();
  });
});
