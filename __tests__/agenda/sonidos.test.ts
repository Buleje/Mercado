// @vitest-environment jsdom
/**
 * Sonidos de los avisos — recetas cortas, UN AudioContext reutilizado,
 * volumen en curva y anti-ráfaga (5 avisos juntos suenan una vez).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SONIDOS_AVISO } from "@/lib/agenda/aviso-pantalla";
import { _reiniciarSonidosParaTest, duracionDe, gananciaDeVolumen, probarSonido, RAFAGA_MS, RECETAS, tocarSonido } from "@/lib/agenda/sonidos";

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
  it("cada sonido dura menos de 0,8 s y «ninguno» no tiene notas", () => {
    for (const s of SONIDOS_AVISO) expect(duracionDe(s)).toBeLessThan(0.8);
    expect(duracionDe("ninguno")).toBe(0);
  });
  it("son distintos entre sí y «alerta» insiste con más toques", () => {
    const firmas = Object.values(RECETAS).map((notas) => JSON.stringify(notas));
    expect(new Set(firmas).size).toBe(firmas.length);
    expect(RECETAS.alerta.length).toBeGreaterThanOrEqual(3);
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
    vi.setSystemTime(Date.now() + RAFAGA_MS + 1);
    tocarSonido("doble", 60);
    expect(osciladores).toBe(RECETAS.campanita.length + RECETAS.doble.length);
    expect(creados).toBe(1);
  });
  it("5 avisos juntos suenan una vez", () => {
    for (let i = 0; i < 5; i++) tocarSonido("gota", 80);
    expect(osciladores).toBe(RECETAS.gota.length);
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
