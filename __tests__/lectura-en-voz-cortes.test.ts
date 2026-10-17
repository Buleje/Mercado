/**
 * __tests__/lectura-en-voz-cortes.test.ts
 *
 * Cortes que NO vienen de la lectura (revisor 2026-09-23). Con la fila siguiente
 * encolada en el motor, un `cancel()` de otra voz del cubicador —la
 * confirmación de una pieza a mano, «Probar voz»— dejaba la lectura muda para
 * siempre o, si el motor mandaba el `onend` tarde, se saltaba la encolada. Y
 * cerrar el cubicador con la lectura sonando la dejaba leyendo la tabla entera.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLecturaEnVoz } from "@/hooks/use-lectura-en-voz";

type U = { text: string; onstart?: (() => void) | null; onend?: (() => void) | null; onerror?: ((e: unknown) => void) | null };
let dichos: string[] = [];
let sonando: U | null = null;
let enEspera: U[] = [];
let fantasmas: U[] = [];
/** "error": cancel() sólo dispara onerror (Chrome actual). "end": además onend de TODAS (motor que avisa fin). */
let modoCancel: "error" | "end" = "error";

class UtteranceFalsa {
  text: string; lang = ""; rate = 1; pitch = 1; volume = 1; voice: unknown = null;
  onstart: (() => void) | null = null; onend: (() => void) | null = null; onerror: ((e: unknown) => void) | null = null;
  constructor(t: string) { this.text = t; }
}
function avanzarMotor() {
  if (sonando) return;
  const u = enEspera.shift();
  if (!u) return;
  sonando = u; dichos.push(u.text); u.onstart?.();
}

beforeEach(() => {
  vi.useFakeTimers();
  dichos = []; sonando = null; enEspera = []; fantasmas = []; modoCancel = "error";
  vi.stubGlobal("SpeechSynthesisUtterance", UtteranceFalsa);
  vi.stubGlobal("speechSynthesis", {
    speak: (u: U) => { enEspera.push(u); avanzarMotor(); },
    cancel: () => {
      const u = sonando; const pend = enEspera;
      sonando = null; enEspera = [];
      pend.forEach((p) => { p.onerror?.({ error: "canceled" }); if (modoCancel === "end") p.onend?.(); });
      if (!u) return;
      u.onerror?.({ error: "interrupted" });
      if (modoCancel === "end") u.onend?.();
      fantasmas.push(u);
    },
    getVoices: () => [],
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const ticks = () => act(() => { vi.runAllTimers(); });
function terminarFila() {
  const u = sonando; if (!u) throw new Error("no hay fila sonando");
  act(() => { sonando = null; u.onend?.(); avanzarMotor(); });
  ticks();
}
const soltarFantasmas = () => act(() => { const f = fantasmas; fantasmas = []; f.forEach((u) => u.onend?.()); });
const ids = (...xs: string[]) => xs.map((id) => ({ id }));

const montar = () => renderHook(() => useLecturaEnVoz<{ id: string }>({ rate: () => 1, voiceURI: () => undefined }));

describe("un corte ajeno pausa en la fila cortada", () => {
  it("con onend tardío de la cortada: no se salta la encolada y retomar la repite entera", () => {
    const lista = ids("a", "b", "c", "d");
    const { result } = montar();
    act(() => { result.current.leer(() => lista, (f) => f.id); });
    ticks();
    act(() => { window.speechSynthesis.cancel(); }); // lo que hace decir()
    soltarFantasmas();
    ticks();
    expect(sonando).toBeNull();
    expect(result.current.estado?.pausada).toBe(true);
    expect(result.current.estado?.idx).toBe(0);
    act(() => { result.current.reanudar(); });
    ticks();
    while (sonando) terminarFila();
    expect(dichos).toEqual(["a", "a", "b", "c", "d"]);
  });

  it("sin onend (sólo onerror interrupted): no queda «leyendo» en silencio", () => {
    const lista = ids("a", "b", "c");
    const { result } = montar();
    act(() => { result.current.leer(() => lista, (f) => f.id); });
    ticks();
    act(() => { window.speechSynthesis.cancel(); });
    ticks();
    expect(result.current.estado?.pausada).toBe(true);
    expect(result.current.estado?.terminada).toBe(false);
  });

  it("los cortes propios siguen sin pausar: saltar sigue leyendo desde ahí", () => {
    modoCancel = "end";
    const lista = ids("a", "b", "c", "d", "e");
    const { result } = montar();
    act(() => { result.current.leer(() => lista, (f) => f.id); });
    ticks();
    act(() => { result.current.irAFila(4); });
    ticks();
    expect(result.current.estado?.pausada).toBe(false);
    while (sonando) terminarFila();
    expect(dichos).toEqual(["a", "d", "e"]);
  });
});

it("desmontar con la lectura sonando la calla", () => {
  const lista = ids("a", "b", "c");
  const { result, unmount } = montar();
  act(() => { result.current.leer(() => lista, (f) => f.id); });
  ticks();
  unmount();
  expect(sonando).toBeNull();
  expect(enEspera).toEqual([]);
  expect(dichos).toEqual(["a"]);
});
