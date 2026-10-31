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
import { siguienteIndice, useLecturaEnVoz } from "@/hooks/use-lectura-en-voz";

interface Fila { id: string }

/** Lo que dijo el parlante, en orden: se anota cuando la utterance EMPIEZA a sonar. */
let dichos: string[] = [];
type UtteranceLike = {
  text: string;
  onstart?: (() => void) | null;
  onend?: (() => void) | null;
  onerror?: ((e: unknown) => void) | null;
};
/** La utterance que está sonando: terminarla hace sonar la encolada. */
let sonando: UtteranceLike | null = null;
/** Las que esperan en el motor, en orden (el motor las empalma solo). */
let enEspera: UtteranceLike[] = [];
/** Cuántas veces se llamó `cancel()`: entre filas de una tanda no debe llamarse. */
let cancelaciones = 0;
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
  pitch = 1;
  volume = 1;
  voice: unknown = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor(text: string) { this.text = text; }
}

/** El motor: si no suena nada, empieza la primera que espera (como Chrome). */
function avanzarMotor() {
  if (sonando) return;
  const u = enEspera.shift();
  if (!u) return;
  sonando = u;
  dichos.push(u.text);
  u.onstart?.();
}

/** Todo lo que se le entregó al motor, en orden (la que suena y las que esperan). */
let entregadas: UtteranceFalsa[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  dichos = [];
  sonando = null;
  enEspera = [];
  entregadas = [];
  cancelaciones = 0;
  fantasmas = [];
  vi.stubGlobal("SpeechSynthesisUtterance", UtteranceFalsa);
  vi.stubGlobal("speechSynthesis", {
    speak: (u: UtteranceFalsa) => { entregadas.push(u); enEspera.push(u); avanzarMotor(); },
    /* Chrome dispara `onerror: canceled` sobre la utterance en curso —y sobre
       las encoladas— cada vez que se llama `cancel()`: el hook lo trata como
       propio, no como fallo. */
    cancel: () => {
      cancelaciones++;
      const u = sonando;
      const pendientes = enEspera;
      sonando = null;
      enEspera = [];
      pendientes.forEach((p) => p.onerror?.({ error: "canceled" }));
      if (!u) return;
      u.onerror?.({ error: "interrupted" });
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

/** Termina la fila que suena: el motor empalma la encolada, sin esperar a nadie. */
function terminarFila() {
  const u = sonando;
  if (!u) throw new Error("no hay ninguna fila sonando");
  act(() => {
    sonando = null;
    u.onend?.();
    avanzarMotor();
  });
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

/**
 * Leer por tramos de especie (Brandon, 2026-09-22): el texto de cada fila
 * necesita saber dónde está, con qué vecinas y si es la primera que suena —
 * para decir «Continúa con panguana» al ENTRAR a un tramo, y otra vez al
 * arrancar o retomar a mitad de uno.
 */
describe("useLecturaEnVoz · contexto de cada fila", () => {
  interface ConEspecie { id: string; especie?: string }
  const texto = (f: ConEspecie, ctx: { indice: number; primera: boolean; haciaAtras: boolean; lista: readonly ConEspecie[] }) =>
    `${f.id}@${ctx.indice}${ctx.primera ? "*" : ""}${ctx.haciaAtras ? "<" : ""}/${ctx.lista.length}`;
  function montarEspecies() {
    return renderHook(() => useLecturaEnVoz<ConEspecie>({ rate: () => 1, voiceURI: () => undefined })).result;
  }

  it("la primera fila de la tanda llega marcada; las siguientes no", () => {
    const lista: ConEspecie[] = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const r = montarEspecies();
    act(() => { r.current.leer(() => lista, texto); });
    correrTicks();
    terminarFila();
    terminarFila();
    expect(dichos).toEqual(["a@0*/3", "b@1/3", "c@2/3"]);
  });

  it("al revés el índice es la fila real y el sentido llega en el contexto", () => {
    const lista: ConEspecie[] = [{ id: "a" }, { id: "b" }];
    const r = montarEspecies();
    act(() => { r.current.leer(() => lista, texto, undefined, { haciaAtras: true }); });
    correrTicks();
    terminarFila();
    expect(dichos).toEqual(["b@1*</2", "a@0</2"]);
  });

  it("saltar a una fila y retomar una pausa vuelven a marcar la primera", () => {
    const lista: ConEspecie[] = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    const r = montarEspecies();
    act(() => { r.current.leer(() => lista, texto); });
    correrTicks();
    act(() => { r.current.irAFila(3); });
    correrTicks();
    act(() => { r.current.pausar(); });
    act(() => { r.current.reanudar(); });
    correrTicks();
    terminarFila();
    expect(dichos).toEqual(["a@0*/4", "c@2*/4", "c@2*/4", "d@3/4"]);
  });
});

/**
 * Con la tabla agrupada por especie, cambiarle la especie a la fila que suena
 * la manda a otro bloque. Avanzando por posición se saltaba una fila (lo midió
 * el revisor: P1, P2, P2, T1 — la P3 nunca sonó). Ahora se sigue por la que
 * venía después, buscada por id.
 */
describe("useLecturaEnVoz · la tabla se reordena mientras lee", () => {
  const ids = (...xs: string[]) => xs.map((id) => ({ id }));

  it("siguienteIndice: sin moverse, la de al lado; movida o borrada, la que venía", () => {
    expect(siguienteIndice(ids("a", "b", "c"), "a", "b", 0, false)).toBe(1);
    expect(siguienteIndice(ids("a", "c", "b"), "b", "c", 1, false)).toBe(1);
    expect(siguienteIndice(ids("a", "c"), "b", "c", 1, false)).toBe(1);
    expect(siguienteIndice(ids("a"), "b", undefined, 1, false)).toBe(1);
    expect(siguienteIndice(ids("b", "c"), "c", "b", 2, true)).toBe(0);
    expect(siguienteIndice(ids("x", "a", "b", "c"), "b", "c", 1, false)).toBe(3);
  });

  it("la fila que suena se va a otro bloque: se lee la que venía y no se salta ni se repite ninguna", () => {
    let lista = ids("p1", "p2", "p3", "t1");
    const r = montar();
    act(() => { r.current.leer(() => lista, (f) => f.id); });
    correrTicks();
    terminarFila(); // p1 → suena p2
    lista = ids("p1", "p3", "p2", "t1"); // a p2 le cambiaron la especie mientras sonaba
    terminarFila();
    terminarFila();
    terminarFila();
    /* Antes de la cola sonaba «p1, p2, p3, p2, t1»: la p2 dos veces. */
    expect(dichos).toEqual(["p1", "p2", "p3", "t1"]);
  });

  it("una fila que ya sonó y se muda al final no se vuelve a leer", () => {
    let lista = ids("a", "b", "c", "d");
    const r = montar();
    act(() => { r.current.leer(() => lista, (f) => f.id); });
    correrTicks();
    terminarFila(); // suena b, c encolada
    lista = ids("a", "c", "d", "b"); // b se fue al último bloque
    terminarFila();
    terminarFila();
    terminarFila();
    expect(dichos).toEqual(["a", "b", "c", "d"]);
    expect(r.current.estado?.terminada).toBe(true);
  });

  it("borrar la fila que suena sigue por la que ocupa su lugar, sin saltarla", () => {
    let lista = ids("a", "b", "c");
    const r = montar();
    act(() => { r.current.leer(() => lista, (f) => f.id); });
    correrTicks();
    terminarFila(); // suena b
    lista = ids("a", "c");
    terminarFila();
    expect(dichos).toEqual(["a", "b", "c"]);
  });
});

/**
 * Sin huecos entre filas (Brandon, 2026-09-23: «demora mucho y es lento»).
 * La siguiente fila se entrega al motor mientras suena la actual, y `cancel()`
 * no se llama entre filas: en Windows se cuelga y cada utterance arrancaba en
 * frío. Lo que se mira acá es lo que el motor recibe y cuándo.
 */
describe("useLecturaEnVoz · la siguiente fila ya está encolada", () => {
  const ids = (...xs: string[]) => xs.map((id) => ({ id }));

  it("al arrancar entrega la que suena y la siguiente; al terminar una, encola otra", () => {
    const lista = ids("a", "b", "c", "d");
    const r = montar();
    act(() => { r.current.leer(() => lista, (f) => f.id); });
    correrTicks();
    expect(entregadas.map((u) => u.text)).toEqual(["a", "b"]);
    expect(dichos).toEqual(["a"]);

    terminarFila();
    expect(entregadas.map((u) => u.text)).toEqual(["a", "b", "c"]);
    expect(dichos).toEqual(["a", "b"]);
  });

  it("no llama `cancel()` entre filas: sólo una vez, al arrancar", () => {
    const lista = ids("a", "b", "c", "d");
    const r = montar();
    act(() => { r.current.leer(() => lista, (f) => f.id); });
    correrTicks();
    terminarFila();
    terminarFila();
    terminarFila();
    expect(dichos).toEqual(["a", "b", "c", "d"]);
    expect(cancelaciones).toBe(1);
  });

  it("resalta la fila que SUENA, no la encolada", () => {
    const lista = ids("a", "b", "c");
    const r = montar();
    act(() => { r.current.leer(() => lista, (f) => f.id); });
    correrTicks();
    expect(r.current.leyendoId).toBe("a"); // b ya está en el motor, pero no suena
    expect(r.current.estado?.idx).toBe(0);
    terminarFila();
    expect(r.current.leyendoId).toBe("b");
    expect(r.current.estado?.idx).toBe(1);
  });

  it("borrar la fila ENCOLADA: suena con el texto de antes, y sigue por la de después sin saltarla", () => {
    let lista = ids("a", "b", "c", "d");
    const r = montar();
    act(() => { r.current.leer(() => lista, (f) => f.id); });
    correrTicks(); // suena a, b encolada
    lista = ids("a", "c", "d");
    terminarFila();
    terminarFila();
    terminarFila();
    expect(dichos).toEqual(["a", "b", "c", "d"]);
  });

  it("una fila agregada mientras suena la última entra en la lectura", () => {
    let lista = ids("a", "b");
    const r = montar();
    act(() => { r.current.leer(() => lista, (f) => f.id); });
    correrTicks();
    terminarFila(); // suena b, no hay nada detrás
    lista = ids("a", "b", "c");
    terminarFila();
    expect(dichos).toEqual(["a", "b", "c"]);
    terminarFila();
    expect(r.current.estado?.terminada).toBe(true);
  });

  it("pausar corta también la encolada; seguir retoma la que sonaba y vuelve a encolar", () => {
    const lista = ids("a", "b", "c");
    const r = montar();
    act(() => { r.current.leer(() => lista, (f) => f.id); });
    correrTicks();
    act(() => { r.current.pausar(); });
    expect(sonando).toBeNull();
    expect(enEspera).toEqual([]);
    /* El `onend` tardío de la cortada no mueve nada en pausa. */
    soltarFantasmas();
    expect(dichos).toEqual(["a"]);

    act(() => { r.current.reanudar(); });
    correrTicks();
    expect(dichos).toEqual(["a", "a"]);
    terminarFila();
    terminarFila();
    expect(dichos).toEqual(["a", "a", "b", "c"]);
  });

  it("en pausa se insertan filas antes de la que sonaba: al seguir, retoma ESA (por id)", () => {
    let lista = ids("a", "b", "c");
    const r = montar();
    act(() => { r.current.leer(() => lista, (f) => f.id); });
    correrTicks();
    terminarFila(); // suena b
    act(() => { r.current.pausar(); });
    lista = ids("x", "a", "b", "c");
    act(() => { r.current.reanudar(); });
    correrTicks();
    expect(dichos).toEqual(["a", "b", "b"]);
    expect(r.current.estado?.idx).toBe(2);
  });

  it("cambiar de sentido con una fila encolada: los eventos de las dos viejas no mueven la tanda nueva", () => {
    const lista = ids("a", "b", "c", "d");
    const r = montar();
    act(() => { r.current.leer(() => lista, (f) => f.id); });
    correrTicks(); // suena a, b encolada
    act(() => { r.current.leer(() => lista, (f) => f.id, undefined, { haciaAtras: true }); });
    correrTicks();
    soltarFantasmas();
    terminarFila();
    terminarFila();
    expect(dichos).toEqual(["a", "d", "c", "b"]);
  });

  it("la velocidad pasa de 3: el tope es el de la Web Speech API (10)", () => {
    const lista = ids("a");
    const r = renderHook(() => useLecturaEnVoz<{ id: string }>({
      rate: () => 9, voiceURI: () => undefined, pitch: () => 0.8, volume: () => 0.5,
    })).result;
    act(() => { r.current.leer(() => lista, (f) => f.id); });
    correrTicks();
    expect(entregadas[0]).toMatchObject({ rate: 9.3, pitch: 0.8, volume: 0.5 });

    const r2 = renderHook(() => useLecturaEnVoz<{ id: string }>({ rate: () => 10, voiceURI: () => undefined })).result;
    act(() => { r2.current.leer(() => lista, (f) => f.id); });
    correrTicks();
    expect(entregadas[entregadas.length - 1].rate).toBe(10);
  });
});
