/**
 * __tests__/lectura-en-voz-hacia-atras.test.ts
 *
 * Leer la tabla AL REVÉS (Brandon, 2026-09-15): de la última pieza hacia la
 * primera. Es para cotejar contra la pila física —se destapa desde arriba, y
 * arriba está lo último que se cargó—, así que lo único que importa acá es el
 * ORDEN real en que salen las medidas por el parlante: no alcanza con que el
 * botón exista, hay que ver la secuencia.
 *
 * Se intercepta `speechSynthesis.speak` y se guarda el texto de cada
 * utterance. El motor de voz no existe en jsdom; el que corta la tanda de
 * verdad es el navegador (verificado aparte en «Producir sin lote»).
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLecturaEnVoz } from "@/hooks/use-lectura-en-voz";

interface Fila { id: string }

/** Lo que dijo el parlante, en orden. */
let dichos: string[] = [];
type UtteranceLike = { text: string; onend?: (() => void) | null; onerror?: ((e: unknown) => void) | null };
/** La utterance que está sonando: terminarla dispara el paso siguiente. */
let sonando: UtteranceLike | null = null;
/**
 * Chrome dispara `onend` sobre la utterance cortada por `cancel()`, y puede
 * llegar tarde — cuando la lectura nueva ya arrancó. Acá se guarda para poder
 * soltarlo cuando el test quiera: es el fantasma que mataba la tanda.
 */
let fantasmas: UtteranceLike[] = [];

class UtteranceFalsa {
  text: string;
  lang = "";
  rate = 1;
  voice: unknown = null;
  onend: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor(text: string) { this.text = text; }
}

beforeEach(() => {
  vi.useFakeTimers();
  dichos = [];
  sonando = null;
  fantasmas = [];
  vi.stubGlobal("SpeechSynthesisUtterance", UtteranceFalsa);
  vi.stubGlobal("speechSynthesis", {
    speak: (u: UtteranceFalsa) => { dichos.push(u.text); sonando = u; },
    /* Chrome dispara `onerror: canceled` sobre la utterance en curso cada vez
       que se llama `cancel()` — el hook lo trata como propio, no como fallo. */
    cancel: () => {
      const u = sonando;
      sonando = null;
      if (!u) return;
      u.onerror?.({ error: "canceled" });
      fantasmas.push(u);
    },
    getVoices: () => [],
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function montar() {
  return renderHook(() => useLecturaEnVoz<Fila>({ rate: () => 1, voiceURI: () => undefined })).result;
}

/**
 * El `speak()` va un tick después del `cancel()` (Chrome se come el inmediato),
 * y saltar de fila encadena dos ticks: uno para reactivar la tanda y otro para
 * hablar. Por eso `runAllTimers` y no `runOnlyPendingTimers`.
 */
function correrTicks() {
  act(() => { vi.runAllTimers(); });
}

/** Termina la fila que suena: es lo que encadena la siguiente. */
function terminarFila() {
  const u = sonando;
  if (!u) throw new Error("no hay ninguna fila sonando");
  act(() => { u.onend?.(); });
  correrTicks();
}

/** Suelta los `onend` que Chrome dispara por cada `cancel()`, con retraso. */
function soltarFantasmas() {
  const pendientes = fantasmas;
  fantasmas = [];
  act(() => { pendientes.forEach((u) => u.onend?.()); });
  correrTicks();
}

const filas = (...ids: string[]): Fila[] => ids.map((id) => ({ id }));

describe("useLecturaEnVoz · sentido de la lectura", () => {
  it("hacia atrás arranca por la ÚLTIMA y baja hasta la primera", () => {
    const lista = filas("a", "b", "c");
    const r = montar();

    act(() => { r.current.leer(() => lista, (f) => f.id, undefined, { haciaAtras: true }); });
    correrTicks();
    expect(dichos).toEqual(["c"]);
    /* El índice es la POSICIÓN REAL en la tabla, no la de una lista dada
       vuelta: la fila que suena es la 3 de 3, y así la nombra el panel. */
    expect(r.current.estado).toMatchObject({ idx: 2, total: 3, haciaAtras: true, terminada: false });
    expect(r.current.leyendoId).toBe("c");

    terminarFila();
    expect(dichos).toEqual(["c", "b"]);
    expect(r.current.estado?.idx).toBe(1);

    terminarFila();
    expect(dichos).toEqual(["c", "b", "a"]);
    expect(r.current.estado?.idx).toBe(0);
  });

  it("termina al cruzar la primera fila y deja el panel marcando el final", () => {
    const lista = filas("a", "b");
    const r = montar();

    act(() => { r.current.leer(() => lista, (f) => f.id, undefined, { haciaAtras: true }); });
    correrTicks();
    terminarFila(); // suena "a", la primera
    expect(dichos).toEqual(["b", "a"]);

    terminarFila(); // cruza el 0
    expect(dichos).toEqual(["b", "a"]);
    expect(r.current.estado).toMatchObject({ terminada: true, idx: 0, total: 2, haciaAtras: true });
    expect(r.current.leyendoId).toBeNull();
    expect(r.current.activa()).toBe(false);
  });

  it("«de nuevo» hacia atrás vuelve a la ÚLTIMA, no a la primera", () => {
    const lista = filas("a", "b", "c");
    const r = montar();

    act(() => { r.current.leer(() => lista, (f) => f.id, undefined, { haciaAtras: true }); });
    correrTicks();
    terminarFila();
    terminarFila();
    terminarFila(); // terminada
    expect(dichos).toEqual(["c", "b", "a"]);

    act(() => { r.current.reiniciar(); });
    correrTicks();
    expect(dichos).toEqual(["c", "b", "a", "c"]);
    expect(r.current.estado).toMatchObject({ idx: 2, terminada: false, haciaAtras: true });
  });

  it("pausar y seguir retoman la MISMA fila, no la siguiente", () => {
    const lista = filas("a", "b", "c");
    const r = montar();

    act(() => { r.current.leer(() => lista, (f) => f.id, undefined, { haciaAtras: true }); });
    correrTicks();
    terminarFila(); // suena "b"
    expect(dichos).toEqual(["c", "b"]);

    act(() => { r.current.pausar(); });
    expect(r.current.estado?.pausada).toBe(true);

    act(() => { r.current.reanudar(); });
    correrTicks();
    expect(dichos).toEqual(["c", "b", "b"]);
    expect(r.current.estado).toMatchObject({ idx: 1, pausada: false, haciaAtras: true });
  });

  it("salta a una fila concreta y sigue bajando desde ahí", () => {
    const lista = filas("a", "b", "c", "d");
    const r = montar();

    act(() => { r.current.leer(() => lista, (f) => f.id, undefined, { haciaAtras: true }); });
    correrTicks();
    expect(dichos).toEqual(["d"]);

    act(() => { r.current.irAFila(2); }); // 1-based, como se numeran en pantalla
    correrTicks();
    expect(dichos).toEqual(["d", "b"]);
    terminarFila();
    expect(dichos).toEqual(["d", "b", "a"]);
  });

  it("borrar filas mientras lee no rompe el índice: sigue por la que ahora es la última", () => {
    const lista = filas("a", "b", "c");
    const r = montar();

    act(() => { r.current.leer(() => lista, (f) => f.id, undefined, { haciaAtras: true }); });
    correrTicks();
    expect(dichos).toEqual(["c"]);

    act(() => { r.current.pausar(); });
    lista.splice(1, 2); // se borran "b" y "c": el índice 2 quedó fuera de la tabla
    act(() => { r.current.reanudar(); });
    correrTicks();

    expect(dichos).toEqual(["c", "a"]);
    expect(r.current.estado).toMatchObject({ idx: 0, total: 1, haciaAtras: true });
  });

  it("al derecho se comporta exactamente como antes", () => {
    const lista = filas("a", "b", "c");
    const r = montar();

    act(() => { r.current.leer(() => lista, (f) => f.id); });
    correrTicks();
    expect(dichos).toEqual(["a"]);
    expect(r.current.estado).toMatchObject({ idx: 0, total: 3, haciaAtras: false });

    terminarFila();
    terminarFila();
    expect(dichos).toEqual(["a", "b", "c"]);

    terminarFila(); // cruza el final
    expect(r.current.estado).toMatchObject({ terminada: true, idx: 2, haciaAtras: false });

    act(() => { r.current.reiniciar(); }); // al derecho, «de nuevo» es la primera
    correrTicks();
    expect(dichos).toEqual(["a", "b", "c", "a"]);
    expect(r.current.estado?.idx).toBe(0);
  });

  it("pedir el OTRO sentido mientras suena cambia en el aire, sin cortar", () => {
    const lista = filas("a", "b", "c");
    const r = montar();

    act(() => { r.current.leer(() => lista, (f) => f.id); });
    correrTicks();
    expect(dichos).toEqual(["a"]);

    act(() => { r.current.leer(() => lista, (f) => f.id, undefined, { haciaAtras: true }); });
    correrTicks();
    expect(dichos).toEqual(["a", "c"]);
    expect(r.current.estado).toMatchObject({ idx: 2, haciaAtras: true });

    terminarFila();
    expect(dichos).toEqual(["a", "c", "b"]);
  });

  it("pedir el MISMO sentido mientras suena corta, como el botón que la arrancó", () => {
    const lista = filas("a", "b", "c");
    const r = montar();

    act(() => { r.current.leer(() => lista, (f) => f.id, undefined, { haciaAtras: true }); });
    correrTicks();
    expect(dichos).toEqual(["c"]);

    act(() => { r.current.leer(() => lista, (f) => f.id, undefined, { haciaAtras: true }); });
    correrTicks();
    expect(dichos).toEqual(["c"]);
    expect(r.current.estado).toBeNull();
    expect(r.current.activa()).toBe(false);
  });

  it("el `onend` tardío de la lectura cortada no mata la que arrancó después", () => {
    const lista = filas("a", "b", "c");
    const r = montar();

    act(() => { r.current.leer(() => lista, (f) => f.id); });
    correrTicks();
    act(() => { r.current.leer(() => lista, (f) => f.id, undefined, { haciaAtras: true }); });
    correrTicks();
    expect(dichos).toEqual(["a", "c"]);

    /* El fantasma del `cancel()` llega ahora, con la tanda nueva ya sonando.
       Sin número de tanda movía ESTE índice: en el navegador la lectura al
       revés decía una pieza y se apagaba sola. */
    soltarFantasmas();
    expect(dichos).toEqual(["a", "c"]);
    expect(r.current.estado).toMatchObject({ idx: 2, haciaAtras: true, terminada: false });

    terminarFila();
    expect(dichos).toEqual(["a", "c", "b"]);
  });

  it("«leer desde esta fila» también acepta el sentido inverso", () => {
    const lista = filas("a", "b", "c", "d");
    const r = montar();

    act(() => { r.current.leerDesde(() => lista, (f) => f.id, "c", { haciaAtras: true }); });
    correrTicks();
    terminarFila();
    expect(dichos).toEqual(["c", "b"]);
  });
});
