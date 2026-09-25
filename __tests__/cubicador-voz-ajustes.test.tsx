/**
 * __tests__/cubicador-voz-ajustes.test.tsx
 *
 * Voz del cubicador (Brandon, 2026-09-23): «más opciones de personalización,
 * más velocidad, y un tip al guardar cuando Repite: no».
 *
 *  - La config nueva no cambia la de nadie: quien tenía 3× sigue en 3×.
 *  - La velocidad en Windows no es un multiplicador (`velocidadEnWindows`).
 *  - El tip: un oscilador corto, un solo `AudioContext`, y nada si no hay audio.
 *  - El panel de Ajustes: ordenado por pregunta, interruptores de verdad y un
 *    «Restablecer» que devuelve TODO.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  aplicarAjustesDeVoz, CONFIG_DEFAULT, esVozDeWindows, loadConfig, velocidadEnWindows,
  type CubicadorConfig,
} from "@/lib/forestal/cubicador-config";
import { pitido, prepararPitido, reiniciarPitidoParaTests } from "@/lib/forestal/pitido";
import AjustesDeVoz from "@/components/admin/forestal/cubicador-ajustes-voz";

describe("config de la voz", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("active-tenant-slug", "qa");
  });

  it("una config guardada antes de estos ajustes conserva su velocidad y toma los nuevos de fábrica", () => {
    localStorage.setItem("buleje-cubicador-config-qa", JSON.stringify({ voiceRate: 3, voiceURI: "Microsoft Pablo - Spanish (Spain)", speak: false }));
    const cfg = loadConfig();
    expect(cfg.voiceRate).toBe(3);
    expect(cfg.voiceURI).toBe("Microsoft Pablo - Spanish (Spain)");
    expect(cfg.speak).toBe(false);
    expect(cfg).toMatchObject({ voicePitch: 1, voiceVolume: 1, largoFijoAlLeer: true, pitidoAlGuardar: true });
  });

  it("acepta velocidades hasta 10 y acota lo que se sale del rango", () => {
    localStorage.setItem("buleje-cubicador-config-qa", JSON.stringify({ voiceRate: 9.5, voicePitch: 7, voiceVolume: -1 }));
    const cfg = loadConfig();
    expect(cfg.voiceRate).toBe(9.5);
    expect(cfg.voicePitch).toBe(2);
    expect(cfg.voiceVolume).toBe(0.1);
  });

  it("en Windows, 3× suena a ~1,55× y el tope real (3×) llega en 10×", () => {
    expect(velocidadEnWindows(1)).toBe(1);
    expect(velocidadEnWindows(3)).toBeCloseTo(Math.pow(3, 0.4), 5); // escalón 4 de 10
    expect(velocidadEnWindows(3)).toBeCloseTo(1.552, 3);
    expect(velocidadEnWindows(2.3)).toBeCloseTo(Math.pow(3, 0.3), 5); // la lectura a 2 + 0,3
    expect(velocidadEnWindows(10)).toBeCloseTo(3, 5);
    expect(velocidadEnWindows(0.6)).toBeCloseTo(Math.pow(3, -0.2), 5); // se trunca hacia el cero
  });

  it("reconoce la voz del motor de Windows (no las Online ni las de Google)", () => {
    expect(esVozDeWindows({ name: "Microsoft Pablo - Spanish (Spain)", localService: true }, "")).toBe(true);
    expect(esVozDeWindows({ name: "Microsoft Pablo Online (Natural) - Spanish (Spain)", localService: false }, "")).toBe(false);
    expect(esVozDeWindows({ name: "Google español", localService: false }, "Windows NT 10.0")).toBe(false);
    expect(esVozDeWindows(undefined, "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(true);
    expect(esVozDeWindows(undefined, "Mozilla/5.0 (Linux; Android 14)")).toBe(false);
  });

  it("la utterance lleva velocidad, tono, volumen y voz de los ajustes", () => {
    const u = { lang: "", rate: 1, pitch: 1, volume: 1, voice: null } as unknown as SpeechSynthesisUtterance;
    const voz = { voiceURI: "x", name: "X" } as SpeechSynthesisVoice;
    aplicarAjustesDeVoz(u, { voiceRate: 10, voiceURI: "x", voicePitch: 0.8, voiceVolume: 0.5 }, [voz]);
    expect(u).toMatchObject({ lang: "es-PE", rate: 10, pitch: 0.8, volume: 0.5, voice: voz });
  });
});

describe("pitido", () => {
  const creados: { freq: number[]; start: number[] }[] = [];
  let contextos = 0;
  class ContextoFalso {
    state = "running";
    currentTime = 1;
    destination = {};
    constructor() { contextos++; }
    resume = vi.fn(() => Promise.resolve());
    createOscillator() {
      const reg = { freq: [] as number[], start: [] as number[] };
      creados.push(reg);
      return {
        type: "",
        frequency: { setValueAtTime: (v: number) => { reg.freq.push(v); } },
        connect: vi.fn(),
        start: (t: number) => { reg.start.push(t); },
        stop: vi.fn(),
      };
    }
    createGain() {
      return { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() };
    }
  }

  beforeEach(() => {
    reiniciarPitidoParaTests();
    creados.length = 0;
    contextos = 0;
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("suena un tip agudo; varias piezas en una frase = varios tips (tope 3); raras = grave", () => {
    vi.stubGlobal("AudioContext", ContextoFalso);
    expect(pitido()).toBe(true);
    expect(creados).toHaveLength(1);
    expect(creados[0].freq).toEqual([1320]);

    pitido({ veces: 5 });
    expect(creados).toHaveLength(4); // 1 + 3
    pitido({ tono: "revisa" });
    expect(creados[creados.length - 1].freq).toEqual([440]);
    /* Un solo contexto para todos los tips. */
    expect(contextos).toBe(1);
  });

  it("sin Web Audio no revienta ni reintenta en cada pieza", () => {
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("webkitAudioContext", undefined);
    expect(pitido()).toBe(false);
    expect(() => prepararPitido()).not.toThrow();
    expect(pitido()).toBe(false);
  });

  it("un contexto suspendido se despierta al preparar (el gesto de tocar el micrófono)", () => {
    const resumidos: string[] = [];
    class Suspendido extends ContextoFalso {
      state = "suspended";
      resume = vi.fn(() => { resumidos.push("resume"); return Promise.resolve(); });
    }
    vi.stubGlobal("AudioContext", Suspendido);
    prepararPitido();
    expect(resumidos).toEqual(["resume"]);
    expect(pitido()).toBe(true);
    expect(contextos).toBe(1);
  });
});

describe("panel de Ajustes", () => {
  const props = (config: Partial<CubicadorConfig> = {}) => ({
    id: "aj",
    config: { ...CONFIG_DEFAULT, ...config },
    onUpdateConfig: vi.fn(),
    voices: [] as SpeechSynthesisVoice[],
  });

  it("ordenado por pregunta: cómo suena → qué dice → comandos", () => {
    render(<AjustesDeVoz {...props()} />);
    const grupos = screen.getAllByRole("group").map((g) => g.querySelector("legend")?.textContent);
    expect(grupos).toEqual(["Cómo suena", "Qué dice", "Comandos de voz (separados por coma)"]);
  });

  it("la velocidad llega a 10", () => {
    render(<AjustesDeVoz {...props({ voiceRate: 3 })} />);
    const vel = screen.getByRole("slider", { name: /Velocidad/ });
    expect(vel).toHaveAttribute("max", "10");
    expect(vel).toHaveValue("3");
  });

  it("los tres interruptores dicen su estado y lo cambian", () => {
    const p = props({ largoFijoAlLeer: true, pitidoAlGuardar: false });
    render(<AjustesDeVoz {...p} />);
    const largo = screen.getByRole("switch", { name: "Largo fijo al leer" });
    const tip = screen.getByRole("switch", { name: "Tip al guardar por voz" });
    expect(largo).toHaveAttribute("aria-checked", "true");
    expect(tip).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("switch", { name: "Avisar medidas raras" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(largo);
    fireEvent.click(tip);
    expect(p.onUpdateConfig).toHaveBeenCalledWith({ largoFijoAlLeer: false });
    expect(p.onUpdateConfig).toHaveBeenCalledWith({ pitidoAlGuardar: true });
  });

  it("«Restablecer todo» devuelve también lo nuevo (tono, volumen, largo fijo, tip)", () => {
    const p = props({ voiceRate: 7, voicePitch: 0.6, voiceVolume: 0.3, largoFijoAlLeer: false, pitidoAlGuardar: false, avisarRaras: false });
    render(<AjustesDeVoz {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Restablecer todo" }));
    expect(p.onUpdateConfig).toHaveBeenCalledWith(CONFIG_DEFAULT);
  });

  it("con una voz de Windows explica que el número no es el multiplicador", () => {
    const p = props({ voiceRate: 3, voiceURI: "ms" });
    p.voices = [{ voiceURI: "ms", name: "Microsoft Pablo - Spanish (Spain)", lang: "es-ES", localService: true, default: false } as SpeechSynthesisVoice];
    render(<AjustesDeVoz {...p} />);
    const vel = screen.getByRole("slider", { name: /Velocidad/ }).closest("label");
    expect(within(vel as HTMLElement).getByText(/1\.6 veces/)).toBeInTheDocument();
  });
});
