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
 *
 * **Sin huecos entre filas (Brandon, 2026-09-23: «demora mucho y es lento»).**
 * Antes cada fila era `cancel()` + un tick + `speak()` recién cuando la
 * anterior terminaba: en Windows `cancel()` puede quedarse colgado y cada
 * utterance arrancaba en frío, así que entre fila y fila había un silencio
 * que ningún ajuste de velocidad achicaba. Ahora la fila SIGUIENTE se encola
 * mientras suena la actual (el motor la empalma solo) y `cancel()` se llama
 * únicamente al arrancar, saltar, pausar o cortar — nunca entre filas.
 * Consecuencia aceptada: si la tabla cambia con una fila ya encolada, esa una
 * se lee con el texto de antes. Nunca se salta ni se repite una fila.
 */

import { useCallback, useEffect, useRef, useState } from "react";

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
  /** Tono (`pitch`, 0–2). Sin esto, el de la voz. */
  pitch?: () => number;
  /** Volumen (0–1). Sin esto, el máximo. */
  volume?: () => number;
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


/** La lectura suma esto a la velocidad de Ajustes para no arrastrarse. */
const EXTRA_DE_LECTURA = 0.3;
/** Tope de `rate` en la Web Speech API. */
const RATE_MAXIMO = 10;
/**
 * Cuántas utterances de la tanda viven a la vez en el motor: la que suena y la
 * siguiente. Con una sola había hueco; con más, un cambio en la tabla tardaría
 * más filas en oírse.
 */
const EN_EL_MOTOR = 2;

/** Una fila ya entregada al motor. */
interface Encolada {
  id: string;
  /** Posición que tenía al encolarla (para saber después si se movió). */
  idx: number;
  /** La que venía detrás al encolarla, para seguir por id si la tabla se reordena. */
  siguienteId: string | undefined;
  u: SpeechSynthesisUtterance;
}

export function useLecturaEnVoz<T extends { id: string }>(opts: OpcionesLectura) {
  const [leyendoId, setLeyendoId] = useState<string | null>(null);
  const [estado, setEstado] = useState<EstadoLectura | null>(null);
  const activaRef = useRef(false);
  const pausaRef = useRef(false);
  /** Posición 0-based de la fila que SUENA (o donde retomar). */
  const idxRef = useRef(0);
  /** Id de la fila que suena: al retomar se la busca por id, no por posición. */
  const sonandoIdRef = useRef<string | null>(null);
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
   * Número de cadena. Cada arranque, salto o reanudación estrena uno y las
   * utterances lo llevan en el closure.
   *
   * 🚨 Un `onend` de una cadena VIEJA le mueve el índice a la que está
   * sonando. Pasa al cambiar de sentido sin cortar: el `cancel()` dispara el
   * `onend` de la fila que se estaba leyendo, y si llega tarde —cuando la
   * tanda nueva ya arrancó— la bandera «activa» no lo distingue de un final
   * legítimo. Medido en el navegador el 2026-09-15: «Leer al revés» mientras
   * sonaba la lectura al derecho leía UNA pieza y se apagaba sola. Con la
   * siguiente fila ya encolada, además, las dos utterances viejas disparan
   * eventos al cortarse: por eso también saltar y retomar estrenan número.
   */
  const tandaRef = useRef(0);
  /** La próxima fila que se encole es la primera tras arrancar, saltar o retomar. */
  const primeraRef = useRef(false);
  /** Arranca una cadena desde una posición 0-based, en el sentido de la tanda. */
  const empezarRef = useRef<((desde: number) => void) | null>(null);
  /** `pausar`, para el `onerror` de una utterance: se define más abajo. */
  const pausarRef = useRef<(() => void) | null>(null);
  /**
   * Las utterances de la cadena en curso. En una ref a propósito: Chrome
   * puede recolectar una utterance a la que JavaScript ya no apunta, y
   * entonces su `onend` nunca llega y la lectura se queda muda a mitad.
   */
  const colaRef = useRef<Encolada[]>([]);
  /* Las opciones se leen por ref para que cambiar la velocidad en Ajustes a
     mitad de una tanda no obligue a rearmar los callbacks. */
  const optsRef = useRef(opts);
  optsRef.current = opts;

  /** Corta la voz sin tocar el panel. */
  const callar = useCallback(() => {
    tandaRef.current++;
    activaRef.current = false;
    pausaRef.current = false;
    colaRef.current = [];
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
    empezarRef.current = null;
    idxRef.current = 0;
    sonandoIdRef.current = null;
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
    const paso = atras ? -1 : 1;
    haciaAtrasRef.current = atras;
    obtenerListaRef.current = obtenerLista;
    sonandoIdRef.current = null;

    /** Posición válida en la lista de AHORA, o `null` si ahí se termina.
     *  Hacia atrás se ACOTA: si borran la última mientras suena, el índice
     *  quedaría fuera de la tabla. Hacia adelante no: pasarse es el fin. */
    const acotar = (lista: readonly T[], i: number): number | null => {
      const j = atras && i > lista.length - 1 ? lista.length - 1 : i;
      return (atras ? j < 0 : j >= lista.length) ? null : j;
    };

    /** Terminó: se calla, pero el panel SE QUEDA marcando el final. */
    const terminar = () => {
      const lista = obtenerLista();
      activaRef.current = false;
      pausaRef.current = false;
      colaRef.current = [];
      setLeyendoId(null);
      setEstado({
        pausada: false,
        idx: atras ? 0 : Math.max(0, lista.length - 1),
        total: lista.length,
        terminada: true,
        haciaAtras: atras,
      });
    };

    const empezar = (desdeIdx: number) => {
      const miTanda = ++tandaRef.current;
      activaRef.current = true;
      pausaRef.current = false;
      primeraRef.current = true;
      const lista0 = obtenerLista();
      const i0 = acotar(lista0, Math.max(0, desdeIdx));
      if (i0 === null) { terminar(); return; }

      const cola: Encolada[] = [];
      colaRef.current = cola;
      /** Las que ya se entregaron al motor en esta cadena: ninguna se repite. */
      const entregadas = new Set<string>();
      let ultima: Encolada | null = null;
      let marcadaId: string | null = null;
      const vigente = () => miTanda === tandaRef.current && activaRef.current && !pausaRef.current;

      /** La fila que SUENA: se resalta, se sigue con la vista y es la de «fila N de M». */
      const marcar = (id: string, idxAlEncolar: number) => {
        if (marcadaId === id) return;
        marcadaId = id;
        const lista = obtenerLista();
        const pos = lista.findIndex((f) => f.id === id);
        const idx = pos >= 0 ? pos : idxAlEncolar;
        idxRef.current = idx;
        sonandoIdRef.current = id;
        setLeyendoId(id);
        setEstado({ pausada: false, idx, total: lista.length, terminada: false, haciaAtras: atras });
        const idDom = optsRef.current.idDeFila?.(id);
        if (idDom) {
          try { document.getElementById(idDom)?.scrollIntoView({ block: "center", behavior: "auto" }); } catch { /* ignore */ }
        }
      };

      const encolar = (i: number, lista: T[]) => {
        const fila = lista[i];
        entregadas.add(fila.id);
        const ctx: ContextoLectura<T> = { indice: i, lista, haciaAtras: atras, primera: primeraRef.current };
        primeraRef.current = false;
        const u = new SpeechSynthesisUtterance(texto(fila, ctx));
        u.lang = "es-PE";
        u.rate = Math.min(RATE_MAXIMO, Math.max(0.1, optsRef.current.rate() + EXTRA_DE_LECTURA));
        const pitch = optsRef.current.pitch?.();
        if (pitch !== undefined && Number.isFinite(pitch)) u.pitch = Math.min(2, Math.max(0, pitch));
        const volume = optsRef.current.volume?.();
        if (volume !== undefined && Number.isFinite(volume)) u.volume = Math.min(1, Math.max(0, volume));
        const uri = optsRef.current.voiceURI();
        if (uri) { const v = synth.getVoices().find((x) => x.voiceURI === uri); if (v) u.voice = v; }
        /* La que venía detrás, por id: si mientras suena ésta la tabla se
           reordena, se sigue por ella y no por una posición que ya es otra. */
        const item: Encolada = { id: fila.id, idx: i, siguienteId: lista[i + paso]?.id, u };
        /* Se resalta cuando EMPIEZA a sonar, no cuando se encola: la
           encolada es la de después y resaltarla adelantaría la vista. */
        u.onstart = () => { if (vigente()) marcar(item.id, item.idx); };
        u.onend = () => {
          if (!vigente()) return;
          const pos = cola.indexOf(item);
          if (pos >= 0) cola.splice(0, pos + 1);
          /* La siguiente ya está sonando: se marca también acá por si el
             motor no dispara `onstart` (el de la primera sí se marcó a mano). */
          if (cola.length > 0) marcar(cola[0].id, cola[0].idx);
          /* Se completa la cola. Si quedó vacía y no hay más filas, es el
             final; una fila agregada al final mientras sonaba la última entra. */
          if (!rellenar() && cola.length === 0) terminar();
        };
        /**
         * 🚨 `cancel()` NO es un fallo del motor.
         *
         * Chrome dispara `onerror` con `canceled`/`interrupted` sobre la
         * utterance en curso —y sobre las encoladas— cada vez que se llama
         * `cancel()`: al PAUSAR, al SALTAR y al arrancar. Tratarlo como fallo
         * cerraba el panel y mostraba «no se pudo leer» apenas se tocaba
         * Pausar: el botón de pausa se comportaba como el de cerrar.
         *
         * Se ignora por dos vías, porque el código de error no está garantizado
         * en todos los motores: por nombre, y por estado (si la cadena ya no es
         * la vigente, ese error es nuestro).
         */
        u.onerror = (e: SpeechSynthesisErrorEvent) => {
          const propio = e?.error === "canceled" || e?.error === "interrupted";
          if (!vigente()) return;
          /* Un corte con la cadena VIGENTE no es nuestro: los cortes propios
             (pausar, saltar, arrancar, cerrar) invalidan la cadena ANTES del
             `cancel()`. Es otra voz del cubicador —la confirmación de una
             pieza a mano, «Probar voz»— que se quedó con el motor. Se pausa
             en la fila cortada: seguir esperando su `onend` dejaba la lectura
             muda para siempre, y un `onend` tardío se saltaba la encolada. */
          if (propio) { pausarRef.current?.(); return; }
          optsRef.current.onError?.("No se pudo leer en voz alta — revisa el motor de voz del navegador.");
          detener();
        };
        cola.push(item);
        ultima = item;
        synth.speak(u);
      };

      /** Deja en el motor la fila que sigue a la última entregada. `false` si no hay. */
      const rellenar = (): boolean => {
        if (cola.length >= EN_EL_MOTOR) return true;
        if (!ultima) return false;
        const lista = obtenerLista();
        let j = acotar(lista, siguienteIndice(lista, ultima.id, ultima.siguienteId, ultima.idx, atras));
        /* Una fila que ya sonó y se mudó más adelante (le cambiaron la
           especie con la tabla agrupada) no se vuelve a leer. */
        while (j !== null && entregadas.has(lista[j].id)) j = acotar(lista, j + paso);
        if (j === null) return false;
        encolar(j, lista);
        return true;
      };

      /* La que va a sonar se marca YA: el panel no espera al motor. */
      marcar(lista0[i0].id, i0);
      /* `cancel()` sólo al empezar una cadena —algo más puede estar hablando:
         la voz que repite, la tanda anterior— y nunca entre filas. El
         `speak()` va un tick después: Chrome se come el inmediato. */
      try { synth.cancel(); } catch { /* ignore */ }
      setTimeout(() => {
        if (!vigente()) return;
        const lista = obtenerLista();
        const i = acotar(lista, i0);
        if (i === null) { terminar(); return; }
        encolar(i, lista);
        rellenar();
      }, 0);
    };

    empezarRef.current = empezar;
    empezar(desde ?? (atras ? inicial.length - 1 : 0));
  }, [detener]);

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

  /** Pausa: corta el audio (la que suena y la encolada) y recuerda cuál sonaba. */
  const pausar = useCallback(() => {
    if (!activaRef.current) return;
    pausaRef.current = true;
    colaRef.current = [];
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    setEstado((v) => (v ? { ...v, pausada: true } : v));
  }, []);
  pausarRef.current = pausar;

  /* Cerrar el cubicador con la lectura sonando la dejaba leyendo la tabla
     entera sin panel para cortarla. Se calla al desmontar. */
  useEffect(() => () => {
    if (!activaRef.current) return;
    tandaRef.current++;
    activaRef.current = false;
    colaRef.current = [];
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
  }, []);

  /** Retoma la fila CORTADA, entera: si el audio se cortó a la mitad, hay que escucharla. */
  const reanudar = useCallback(() => {
    if (!activaRef.current || !empezarRef.current) return;
    const lista = obtenerListaRef.current?.() ?? [];
    const pos = sonandoIdRef.current ? lista.findIndex((f) => f.id === sonandoIdRef.current) : -1;
    empezarRef.current(pos >= 0 ? pos : idxRef.current);
  }, []);

  /**
   * Salta a una posición 0-based y sigue desde ahí, en el sentido de la tanda.
   * Sirve leyendo, en pausa y TERMINADA — ahí es el «leer de nuevo». Estrena
   * cadena: los `onend`/`onerror` que dispara el `cancel()` sobre las dos
   * utterances viejas caen en el guard y no mueven nada.
   */
  const saltarA = useCallback((posicion0: number) => {
    empezarRef.current?.(Math.max(0, posicion0));
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
