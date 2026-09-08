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

export function useLecturaEnVoz<T extends { id: string }>(opts: OpcionesLectura) {
  const [leyendoId, setLeyendoId] = useState<string | null>(null);
  const [estado, setEstado] = useState<EstadoLectura | null>(null);
  const activaRef = useRef(false);
  const pausaRef = useRef(false);
  const idxRef = useRef(0);
  const pasoRef = useRef<(() => void) | null>(null);
  /* Las opciones se leen por ref para que cambiar la velocidad en Ajustes a
     mitad de una tanda no obligue a rearmar los callbacks. */
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const detener = useCallback(() => {
    activaRef.current = false;
    pausaRef.current = false;
    pasoRef.current = null;
    idxRef.current = 0;
    setLeyendoId(null);
    setEstado(null);
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
  }, []);

  /** Arranca (o corta, si ya estaba leyendo) una secuencia. */
  const leer = useCallback((
    obtenerLista: () => T[],
    texto: (fila: T) => string,
    desde = 0,
  ) => {
    if (activaRef.current) { detener(); return; }
    const inicial = obtenerLista();
    if (!inicial.length) return;
    const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
    if (!synth) { optsRef.current.onError?.("Este navegador no puede leer en voz alta."); return; }
    optsRef.current.onAntesDeArrancar?.();

    activaRef.current = true;
    pausaRef.current = false;
    idxRef.current = Math.max(0, Math.min(desde, inicial.length - 1));

    const paso = () => {
      const lista = obtenerLista();
      if (!activaRef.current || idxRef.current >= lista.length) { detener(); return; }
      if (pausaRef.current) {
        setEstado({ pausada: true, idx: idxRef.current, total: lista.length });
        return;
      }
      const fila = lista[idxRef.current];
      setLeyendoId(fila.id);
      setEstado({ pausada: false, idx: idxRef.current, total: lista.length });
      const idDom = optsRef.current.idDeFila?.(fila.id);
      if (idDom) {
        try { document.getElementById(idDom)?.scrollIntoView({ block: "center", behavior: "auto" }); } catch { /* ignore */ }
      }
      const u = new SpeechSynthesisUtterance(texto(fila));
      u.lang = "es-PE";
      u.rate = Math.min(3, optsRef.current.rate() + 0.3);
      const uri = optsRef.current.voiceURI();
      if (uri) { const v = synth.getVoices().find((x) => x.voiceURI === uri); if (v) u.voice = v; }
      u.onend = () => { if (pausaRef.current || !activaRef.current) return; idxRef.current++; paso(); };
      u.onerror = () => {
        optsRef.current.onError?.("No se pudo leer en voz alta — revisá el motor de voz del navegador.");
        detener();
      };
      synth.cancel();
      setTimeout(() => synth.speak(u), 0);
    };

    pasoRef.current = paso;
    paso();
  }, [detener]);

  /** Arranca desde una fila concreta, buscada por id (no por posición: entre
   *  elegirla y arrancar, la lista pudo cambiar). */
  const leerDesde = useCallback((
    obtenerLista: () => T[],
    texto: (fila: T) => string,
    id: string,
  ) => {
    if (activaRef.current) detener();
    const pos = obtenerLista().findIndex((f) => f.id === id);
    if (pos < 0) return;
    leer(obtenerLista, texto, pos);
  }, [detener, leer]);

  const pausar = useCallback(() => {
    if (!activaRef.current) return;
    pausaRef.current = true;
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    setEstado((v) => (v ? { ...v, pausada: true } : v));
  }, []);

  const reanudar = useCallback(() => {
    if (!activaRef.current || !pasoRef.current) return;
    pausaRef.current = false;
    pasoRef.current();
  }, []);

  const reiniciar = useCallback(() => {
    if (!activaRef.current || !pasoRef.current) return;
    idxRef.current = 0;
    pausaRef.current = false;
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    setTimeout(() => pasoRef.current?.(), 0);
  }, []);

  /** ¿Hay una lectura en curso? Para el toggle del botón que la arranca. */
  const activa = useCallback(() => activaRef.current, []);

  return { leyendoId, estado, leer, leerDesde, pausar, reanudar, reiniciar, detener, activa };
}
