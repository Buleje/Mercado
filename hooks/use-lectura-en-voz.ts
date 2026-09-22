"use client";

/**
 * Leer una tabla en voz alta, fila por fila, con control real.
 *
 * Nació en el cubicador de madera y se sacó acá para que el de trozas no
 * tuviera una segunda lectura con otras reglas. Lo que aporta sobre un
 * `speechSynthesis.speak()` suelto:
 *
 *  - **El índice vive en una ref, no en el closure.** Ésa es la diferencia
 *    entre poder pausar y no poder: con el índice como variable local, lo único
 *    que se podía hacer era cortar y volver a empezar por la primera fila.
 *  - **La lista se relee en cada paso** (`obtenerLista()`, no una foto): una
 *    fila borrada mientras lee desaparece sola, y una agregada entra.
 *  - **Pausar retoma la fila cortada, no la siguiente.** Si el audio se cortó a
 *    la mitad, al seguir hay que escucharla entera.
 *  - **Un fallo del motor corta la tanda entera**, en vez de dejar la bandera
 *    trabada en «leyendo» y matar todos los botones de lectura hasta recargar.
 *  - **Se lee en los dos sentidos** (`{ haciaAtras: true }`): de la última fila
 *    hacia la primera. Cotejar contra la pila física se hace destapándola desde
 *    arriba, y arriba está lo ÚLTIMO que se cargó — leer desde la primera
 *    obliga a contar al revés en la cabeza.
 *
 * Sobre `cancel()` en Chrome hay dos trampas, las dos contempladas: dispara
 * `onend` (por eso el guard antes de avanzar) y se come un `speak()` inmediato
 * (por eso el tick de por medio).
 */

import { useCallback, useRef, useState } from "react";

export interface EstadoLectura {
  pausada: boolean;
  /** Posición 0-based de la fila que suena. */
  idx: number;
  total: number;
  /**
   * Llegó al final. El control NO se cierra solo por esto: se queda con el
   * «leer de nuevo» a mano. Un panel que desaparece justo cuando terminás de
   * anotar la última fila te deja sin saber si leyó todo o se cortó.
   */
  terminada: boolean;
  /**
   * Va de la última fila hacia la primera. Lo mira el panel de control: sin
   * decirlo, «fila 12 de 15» bajando parece que la lectura se está colgando.
   */
  haciaAtras: boolean;
}

/**
 * Lo que el texto de una fila puede mirar además de la fila: dónde está, con
 * qué vecinas y si es la primera que suena. Lo usa la lectura por tramos de
 * especie (`textoPorTramos`), que anuncia la especie al ENTRAR a un tramo y
 * tiene que saber cuál es la fila de antes en el sentido de la lectura.
 */
export interface ContextoLectura<T> {
  /** Posición 0-based en la lista (la fila real de la tabla, también al revés). */
  indice: number;
  lista: readonly T[];
  haciaAtras: boolean;
  /**
   * Primera fila que suena desde que se arrancó, se saltó a una fila o se
   * retomó una pausa: quien escucha no oyó lo que venía antes.
   */
  primera: boolean;
}

/** El texto que se dice de cada fila. Las que no miran el contexto lo ignoran. */
export type TextoDeFila<T> = (fila: T, ctx: ContextoLectura<T>) => string;

/** Sentido de una tanda. Sin esto, se lee de la primera a la última. */
export interface SentidoLectura {
  /** Arranca por la última fila y baja hasta la primera. */
  haciaAtras?: boolean;
}

export interface OpcionesLectura {
  /** Velocidad base; la lectura suma un poco para no arrastrarse. */
  rate: () => number;
  /** Voz elegida en los ajustes, si hay. */
  voiceURI: () => string | undefined;
  /** Corre antes de arrancar: cortar la escucha, salir del modo edición. */
  onAntesDeArrancar?: () => void;
  onError?: (mensaje: string) => void;
  /** Id del `<tr>` para seguir la fila con la vista. */
  idDeFila?: (id: string) => string;
}

/**
 * A qué fila seguir cuando termina la que sonaba.
 *
 * Si la fila no se movió, es la de al lado, como siempre (una agregada o
 * borrada más adelante entra o sale sola). Si SE MOVIÓ —con la tabla agrupada
 * por especie, cambiarle la especie la manda a otro bloque— o se borró, se
 * sigue por la que venía después, buscada por id: por posición se saltaba una
 * fila (medido por el revisor: P1, P2, P2, T1 — la P3 nunca sonó).
 */
export function siguienteIndice<T extends { id: string }>(
  lista: readonly T[],
  actualId: string,
  siguienteId: string | undefined,
  idx: number,
  haciaAtras: boolean,
): number {
  const paso = haciaAtras ? -1 : 1;
  const ahora = lista.findIndex((f) => f.id === actualId);
  if (ahora === idx) return idx + paso;
  if (siguienteId !== undefined) {
    const j = lista.findIndex((f) => f.id === siguienteId);
    if (j >= 0) return j;
  }
  if (ahora >= 0) return ahora + paso;
  /* Se borró y no había otra detrás: hacia adelante la que ocupa su lugar es
     la siguiente; hacia atrás, la de arriba. */
  return haciaAtras ? idx - 1 : idx;
}

export function useLecturaEnVoz<T extends { id: string }>(opts: OpcionesLectura) {
  const [leyendoId, setLeyendoId] = useState<string | null>(null);
  const [estado, setEstado] = useState<EstadoLectura | null>(null);
  const activaRef = useRef(false);
  const pausaRef = useRef(false);
  const idxRef = useRef(0);
  /**
   * Sentido de la tanda en curso. Vive en una ref porque lo necesitan el
   * «de nuevo» y el panel, que se disparan mucho después del `leer()`.
   *
   * 🚨 El índice SIGUE SIENDO la posición real en la lista, también hacia
   * atrás: se arranca en `length - 1` y se resta. Invertir la lista sería una
   * línea menos acá y una mentira en toda la pantalla — «fila 12 de 15»
   * nombraría la cuarta empezando por abajo, `irAFila(12)` saltaría a otra, y
   * el `<tr>` que se resalta no sería el que suena.
   */
  const haciaAtrasRef = useRef(false);
  /** El getter de la tanda en curso, para que «de nuevo» sepa cuál es la última. */
  const obtenerListaRef = useRef<(() => T[]) | null>(null);
  /**
   * Número de tanda. Cada arranque estrena uno y las utterances lo llevan en el
   * closure.
   *
   * 🚨 Un `onend` de una tanda VIEJA le mueve el índice a la que está sonando.
   * Pasa al cambiar de sentido sin cortar: el `cancel()` dispara el `onend` de
   * la fila que se estaba leyendo, y si llega tarde —cuando la tanda nueva ya
   * arrancó— la bandera «activa» no lo distingue de un final legítimo. Medido
   * en el navegador el 2026-09-15: «Leer al revés» mientras sonaba la lectura
   * al derecho leía UNA pieza y se apagaba sola.
   */
  const tandaRef = useRef(0);
  /** La próxima fila que suene es la primera tras arrancar, saltar o retomar. */
  const primeraRef = useRef(false);
  const pasoRef = useRef<(() => void) | null>(null);
  /* Las opciones se leen por ref para que cambiar la velocidad en Ajustes a
     mitad de una tanda no obligue a rearmar los callbacks. */
  const optsRef = useRef(opts);
  optsRef.current = opts;

  /** Corta la voz sin tocar el panel. */
  const callar = useCallback(() => {
    activaRef.current = false;
    pausaRef.current = false;
    setLeyendoId(null);
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
  }, []);

  /**
   * Corta Y cierra el panel. Es lo que hace la «X», y lo que corre cuando algo
   * externo tiene que quedarse con el audio (prender el micrófono, editar una
   * fila por voz).
   */
  const detener = useCallback(() => {
    callar();
    pasoRef.current = null;
    idxRef.current = 0;
    haciaAtrasRef.current = false;
    obtenerListaRef.current = null;
    setEstado(null);
  }, [callar]);

  /**
   * El arranque de verdad. No pregunta si hay algo sonando: eso lo decide quien
   * llama (`leer` corta o cambia de sentido, `leerDesde` siempre arranca).
   *
   * `desde` es 0-based; sin él, cada sentido arranca por su punta (la primera
   * hacia adelante, la última hacia atrás).
   */
  const arrancar = useCallback((
    obtenerLista: () => T[],
    texto: TextoDeFila<T>,
    desde?: number,
    opciones?: SentidoLectura,
  ) => {
    const inicial = obtenerLista();
    if (!inicial.length) return;
    const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
    if (!synth) { optsRef.current.onError?.("Este navegador no puede leer en voz alta."); return; }
    optsRef.current.onAntesDeArrancar?.();

    /* El sentido se fija acá y no cambia en toda la tanda: `paso` lo lee de
       este closure, no de la ref, para que tocar «Leer al revés» a mitad no
       parta una lectura en dos mitades con sentidos distintos. */
    const atras = opciones?.haciaAtras === true;
    const miTanda = ++tandaRef.current;
    activaRef.current = true;
    pausaRef.current = false;
    primeraRef.current = true;
    haciaAtrasRef.current = atras;
    obtenerListaRef.current = obtenerLista;
    idxRef.current = Math.max(0, Math.min(desde ?? (atras ? inicial.length - 1 : 0), inicial.length - 1));

    const paso = () => {
      const lista = obtenerLista();
      if (!activaRef.current) { detener(); return; }
      /* Hacia atrás el índice se ACOTA a la lista de ahora en cada paso: la
         lista se relee, y si borran la última mientras suena, el índice queda
         apuntando fuera de la tabla — `lista[idx]` sería `undefined` y la
         tanda reventaría en vez de seguir por la que ahora es la última.
         Hacia adelante NO se acota: pasarse del final es justamente el fin. */
      if (atras && idxRef.current > lista.length - 1) idxRef.current = lista.length - 1;
      /* Terminó: se calla, pero el panel SE QUEDA marcando el final. Cada
         sentido termina en su punta — hacia atrás, al cruzar la primera. */
      if (atras ? idxRef.current < 0 : idxRef.current >= lista.length) {
        callar();
        setEstado({
          pausada: false,
          idx: atras ? 0 : Math.max(0, lista.length - 1),
          total: lista.length,
          terminada: true,
          haciaAtras: atras,
        });
        return;
      }
      if (pausaRef.current) {
        setEstado({ pausada: true, idx: idxRef.current, total: lista.length, terminada: false, haciaAtras: atras });
        return;
      }
      const fila = lista[idxRef.current];
      setLeyendoId(fila.id);
      setEstado({ pausada: false, idx: idxRef.current, total: lista.length, terminada: false, haciaAtras: atras });
      const idDom = optsRef.current.idDeFila?.(fila.id);
      if (idDom) {
        try { document.getElementById(idDom)?.scrollIntoView({ block: "center", behavior: "auto" }); } catch { /* ignore */ }
      }
      const ctx: ContextoLectura<T> = { indice: idxRef.current, lista, haciaAtras: atras, primera: primeraRef.current };
      primeraRef.current = false;
      /* La que viene después, por id: si mientras suena ésta la tabla se
         reordena, se sigue por ella y no por una posición que ya es otra. */
      const siguienteId = lista[idxRef.current + (atras ? -1 : 1)]?.id;
      const u = new SpeechSynthesisUtterance(texto(fila, ctx));
      u.lang = "es-PE";
      u.rate = Math.min(3, optsRef.current.rate() + 0.3);
      const uri = optsRef.current.voiceURI();
      if (uri) { const v = synth.getVoices().find((x) => x.voiceURI === uri); if (v) u.voice = v; }
      u.onend = () => {
        if (miTanda !== tandaRef.current || pausaRef.current || !activaRef.current) return;
        idxRef.current = siguienteIndice(obtenerLista(), fila.id, siguienteId, idxRef.current, atras);
        paso();
      };
      /**
       * 🚨 `cancel()` NO es un fallo del motor.
       *
       * Chrome dispara `onerror` con `canceled`/`interrupted` sobre la
       * utterance en curso cada vez que se llama `cancel()` — y acá se llama
       * al PAUSAR, al REINICIAR y antes de cada `speak()`. Tratarlo como fallo
       * cerraba el panel y mostraba «no se pudo leer» apenas se tocaba Pausar:
       * el botón de pausa se comportaba como el de cerrar.
       *
       * Se ignora por dos vías, porque el código de error no está garantizado
       * en todos los motores: por nombre, y por estado (si estamos en pausa o
       * la lectura ya no está activa, ese error es nuestro).
       */
      u.onerror = (e: SpeechSynthesisErrorEvent) => {
        const propio = e?.error === "canceled" || e?.error === "interrupted";
        if (propio || miTanda !== tandaRef.current || pausaRef.current || !activaRef.current) return;
        optsRef.current.onError?.("No se pudo leer en voz alta — revisa el motor de voz del navegador.");
        detener();
      };
      synth.cancel();
      setTimeout(() => synth.speak(u), 0);
    };

    pasoRef.current = paso;
    paso();
  }, [callar, detener]);

  /**
   * El botón de lectura: arranca, corta o cambia de sentido.
   *
   * Tocar el sentido que YA suena corta — es el mismo botón que la arrancó.
   * Pedir el OTRO sentido cambia en el aire, sin obligar a cortar primero: con
   * las manos en la pila, dos toques para una sola intención se sienten como
   * que el primero no funcionó.
   */
  const leer = useCallback((
    obtenerLista: () => T[],
    texto: TextoDeFila<T>,
    desde?: number,
    opciones?: SentidoLectura,
  ) => {
    if (activaRef.current) {
      /* El sentido de lo que suena se mira ANTES de cortar: `detener()` lo
         vuelve a dejar en «al derecho». */
      const mismoSentido = haciaAtrasRef.current === (opciones?.haciaAtras === true);
      detener();
      if (mismoSentido) return;
    }
    arrancar(obtenerLista, texto, desde, opciones);
  }, [arrancar, detener]);

  /** Arranca desde una fila concreta, buscada por id (no por posición: entre
   *  elegirla y arrancar, la lista pudo cambiar). Siempre arranca: se eligió
   *  una fila, no se tocó el botón de encender y apagar. */
  const leerDesde = useCallback((
    obtenerLista: () => T[],
    texto: TextoDeFila<T>,
    id: string,
    opciones?: SentidoLectura,
  ) => {
    if (activaRef.current) detener();
    const pos = obtenerLista().findIndex((f) => f.id === id);
    if (pos < 0) return;
    arrancar(obtenerLista, texto, pos, opciones);
  }, [arrancar, detener]);

  const pausar = useCallback(() => {
    if (!activaRef.current) return;
    pausaRef.current = true;
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    setEstado((v) => (v ? { ...v, pausada: true } : v));
  }, []);

  const reanudar = useCallback(() => {
    if (!activaRef.current || !pasoRef.current) return;
    pausaRef.current = false;
    primeraRef.current = true;
    pasoRef.current();
  }, []);

  /**
   * Salta a una posición 0-based y sigue desde ahí, en el sentido de la tanda.
   * Sirve leyendo, en pausa y TERMINADA — ahí es el «leer de nuevo».
   */
  const saltarA = useCallback((posicion0: number) => {
    if (!pasoRef.current) return;
    idxRef.current = Math.max(0, posicion0);
    /* Se cancela con `activa` en false a propósito: el `onerror` que dispara
       ese `cancel()` sobre la utterance vieja tiene que caer en el guard, no
       leerse como un fallo del motor. Se reactiva justo antes de seguir. */
    activaRef.current = false;
    pausaRef.current = false;
    primeraRef.current = true;
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    setTimeout(() => {
      activaRef.current = true;
      pasoRef.current?.();
    }, 0);
  }, []);

  /**
   * Salta a una fila y sigue desde ahí. `posicion` es 1-based, que es como se
   * numeran las filas en pantalla: pedir «la 120» y que arranque en la 121
   * sería una trampa para quien está mirando la tabla. Vale para los dos
   * sentidos, porque el índice es siempre la fila real de la tabla.
   */
  const irAFila = useCallback((posicion: number) => saltarA(Math.round(posicion) - 1), [saltarA]);

  /**
   * «De nuevo»: vuelve a la punta por la que arrancó la tanda. Hacia adelante
   * es la primera; hacia atrás es la ÚLTIMA — «de nuevo» significa repetir lo
   * que acabas de escuchar, no leer la tabla al derecho.
   *
   * El largo se toma de la lista de AHORA, no del arranque: si borraron filas
   * mientras leía, la última es otra.
   */
  const reiniciar = useCallback(() => {
    if (!haciaAtrasRef.current) { saltarA(0); return; }
    saltarA((obtenerListaRef.current?.().length ?? 1) - 1);
  }, [saltarA]);

  /** ¿Hay una lectura en curso? Para el toggle del botón que la arranca. */
  const activa = useCallback(() => activaRef.current, []);

  return { leyendoId, estado, leer, leerDesde, pausar, reanudar, reiniciar, irAFila, detener, activa };
}
