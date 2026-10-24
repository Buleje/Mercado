/**
 * use-lupa-papel — la lupa de una hoja «como el papel» (Brandon 16-10: «que la
 * guía tenga tipo lupa y otros para poder ver la guía más en una hoja más
 * amplia y completa»).
 *
 * La hoja se dibuja con su layout real a un ancho fijo y se ESCALA con
 * `transform: scale()` (el texto se vuelve a pintar a la escala: nítido, no una
 * imagen); un «medidor» alrededor ocupa el tamaño escalado, así el scroll del
 * visor sabe cuánto mide. El layout no cambia con la lupa: al acercar, los
 * renglones se cortan igual que a 100 %, como una lupa sobre el papel.
 *
 *   · 100 % = la hoja al ancho del visor, hasta `anchoMax` (el ancho del papel):
 *     a 1280 es lo que se veía antes; en una pantalla más ancha la hoja no se
 *     estira, se agranda con «Ajustar al ancho».
 *   · «ancho» y «completa» son MODOS, no porcentajes: se recalculan si el
 *     visor cambia de tamaño (maximizar, girar la tablet).
 *   · Lo elegido se recuerda por `clave` (localStorage, vía `useLocalStorage`,
 *     que ya trae su try/catch); un valor raro guardado vuelve a `inicial`.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";

/** Los escalones de «−» y «+», en %. */
export const PASOS_LUPA = [50, 67, 75, 90, 100, 110, 125, 150, 175, 200] as const;
const PASO_MIN = PASOS_LUPA[0];
const PASO_MAX = PASOS_LUPA[PASOS_LUPA.length - 1];
/** Los ajustes («ancho», «completa») pueden salirse de los escalones, pero no tanto. */
const AJUSTE_MIN = 0.2;
const AJUSTE_MAX = 3;
/** Rueda acumulada (px) que vale un escalón: una muesca del mouse ≈ 100; el pellizco del touchpad, de a poco. */
const RUEDA_POR_PASO = 50;
/** Ancho de layout más chico que se le da a la hoja (un celular de 320 px). */
const ANCHO_MINIMO = 240;
/** Visor «angosto» = la hoja que entra en él mide menos de 3/4 del papel (a 1280 entra el 97 %: no aplica). */
const PAPEL_ANGOSTO = 0.75;

/** Un % fijo, o un modo que se recalcula con el visor. */
export type ModoLupa = "ancho" | "completa" | number;

interface Medidas {
  anchoVisible: number;
  altoVisible: number;
  anchoHoja: number;
  altoHoja: number;
}

const acotar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Lo guardado en localStorage, saneado: sólo los dos modos o un % dentro de los escalones. */
export function normalizarModo(v: unknown, inicial: ModoLupa): ModoLupa {
  if (v === "ancho" || v === "completa") return v;
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(acotar(v, PASO_MIN, PASO_MAX));
  return inicial;
}

/** La escala de un modo con las medidas del visor (1 = 100 %). «completa» = que entre a lo ancho Y a lo alto. */
export function escalaDelModo(modo: ModoLupa, m: Medidas | null): number {
  if (typeof modo === "number") return modo / 100;
  if (!m || m.anchoHoja <= 0) return 1;
  const ancho = m.anchoVisible / m.anchoHoja;
  const z = modo === "ancho" || m.altoHoja <= 0 ? ancho : Math.min(ancho, m.altoVisible / m.altoHoja);
  return acotar(z, AJUSTE_MIN, AJUSTE_MAX);
}

/** El escalón siguiente hacia arriba (+1) o hacia abajo (−1) desde un %; `null` en la punta. */
export function pasoSiguiente(pct: number, dir: 1 | -1): number | null {
  if (dir > 0) return PASOS_LUPA.find((p) => p > pct + 0.5) ?? null;
  return [...PASOS_LUPA].reverse().find((p) => p < pct - 0.5) ?? null;
}

interface Punto {
  x: number;
  y: number;
}

export function useLupaPapel({ clave, anchoMax, inicial = "ancho" }: { clave: string; anchoMax: number; inicial?: ModoLupa }) {
  const [guardado, setGuardado] = useLocalStorage<unknown>(clave, inicial);
  const modo = normalizarModo(guardado, inicial);
  const visorRef = useRef<HTMLDivElement>(null);
  const medidorRef = useRef<HTMLDivElement>(null);
  const hojaRef = useRef<HTMLDivElement>(null);
  const [visor, setVisor] = useState<{ ancho: number; alto: number } | null>(null);
  const [altoHoja, setAltoHoja] = useState(0);
  const comoPapelRef = useRef(false);

  /* El visor reserva el carril de la barra de scroll (`scrollbar-gutter`): su
     ancho útil no cambia cuando la hoja pasa a necesitar scroll, y el ajuste
     no se pone a oscilar. `contentRect` ya descuenta padding y barras. */
  useLayoutEffect(() => {
    const v = visorRef.current;
    const h = hojaRef.current;
    if (!v || !h) return;
    const medirVisor = () => {
      const cs = getComputedStyle(v);
      const ancho = v.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const alto = v.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      setVisor((p) => (p && Math.abs(p.ancho - ancho) < 1 && Math.abs(p.alto - alto) < 1 ? p : { ancho, alto }));
    };
    /* `offsetHeight` es el alto de layout: el `transform` no lo toca. */
    const medirHoja = () => setAltoHoja(h.offsetHeight);
    medirVisor();
    medirHoja();
    /* Sin ResizeObserver (jsdom de los tests, un navegador viejo): queda la medida del montaje. */
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entradas) => {
      for (const e of entradas) (e.target === v ? medirVisor : medirHoja)();
    });
    ro.observe(v);
    ro.observe(h);
    return () => ro.disconnect();
  }, []);

  /* Un px menos que el visor: el redondeo nunca asoma una barra horizontal, y
     a 100 % la escala es 1 exacto (sin `transform`: el texto, tal cual). */
  const util = visor ? Math.floor(visor.ancho) - 1 : 0;
  const reflujo = visor ? Math.floor(acotar(util, ANCHO_MINIMO, anchoMax)) : null;
  /* «Hoja completa» en un visor angosto (celular, tablet parada): la hoja se arma
     a su ancho de papel y se achica ENTERA, como el papel de un vistazo. Con la
     columna del celular salía una tira (medido 16-10 a 400 px: 62 × 642 px, 20 %,
     y ni así entraba en los 579 px visibles). */
  const comoPapel = modo === "completa" && reflujo != null && reflujo < anchoMax * PAPEL_ANGOSTO;
  const anchoHoja = comoPapel ? anchoMax : reflujo;
  useLayoutEffect(() => {
    comoPapelRef.current = comoPapel;
    /* Cambió el armado: el alto nuevo antes de pintar (sin un cuadro con la escala vieja). */
    if (hojaRef.current) setAltoHoja(hojaRef.current.offsetHeight);
  }, [comoPapel]);
  const medidas: Medidas | null =
    visor && anchoHoja ? { anchoVisible: util, altoVisible: Math.floor(visor.alto) - 1, anchoHoja, altoHoja } : null;
  const escala = escalaDelModo(modo, medidas);
  const pct = Math.round(escala * 100);

  /* Acercar deja quieto el punto de la hoja que está bajo el mouse (rueda) o
     en el centro del visor (botones, teclado), como una lupa de verdad. */
  const anclaRef = useRef<{ ax: number; ay: number; cx: number; cy: number } | null>(null);
  const escalaRef = useRef(escala);
  const fijarAncla = useCallback((punto?: Punto) => {
    const v = visorRef.current;
    const s = medidorRef.current;
    if (!v || !s) return;
    const ax = punto?.x ?? v.clientWidth / 2;
    const ay = punto?.y ?? v.clientHeight / 2;
    const z = escalaRef.current || 1;
    anclaRef.current = { ax, ay, cx: (v.scrollLeft + ax - s.offsetLeft) / z, cy: (v.scrollTop + ay - s.offsetTop) / z };
  }, []);
  useLayoutEffect(() => {
    escalaRef.current = escala;
    const a = anclaRef.current;
    const v = visorRef.current;
    const s = medidorRef.current;
    if (!a || !v || !s) return;
    anclaRef.current = null;
    v.scrollLeft = a.cx * escala + s.offsetLeft - a.ax;
    v.scrollTop = a.cy * escala + s.offsetTop - a.ay;
  }, [escala]);

  const elegir = useCallback(
    (nuevo: ModoLupa, punto?: Punto) => {
      fijarAncla(punto);
      setGuardado(nuevo);
    },
    [fijarAncla, setGuardado],
  );
  const paso = useCallback(
    (dir: 1 | -1, punto?: Punto) => {
      /* Desde el papel entero del celular, «+» va a la hoja legible (no a la columna al 50 %, una tira). */
      if (comoPapelRef.current) {
        if (dir > 0) setGuardado("ancho");
        return;
      }
      const siguiente = pasoSiguiente(Math.round(escalaRef.current * 100), dir);
      if (siguiente != null) elegir(siguiente, punto);
    },
    [elegir, setGuardado],
  );

  /* Ctrl/⌘ + rueda sobre la hoja: la lupa, no el zoom del navegador. React
     registra la rueda como pasiva (no se puede frenar): va a mano. */
  useEffect(() => {
    const v = visorRef.current;
    if (!v) return;
    let acumulado = 0;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      acumulado += e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      if (Math.abs(acumulado) < RUEDA_POR_PASO) return;
      const dir = acumulado < 0 ? 1 : -1;
      acumulado = 0;
      const r = v.getBoundingClientRect();
      paso(dir, { x: e.clientX - r.left - v.clientLeft, y: e.clientY - r.top - v.clientTop });
    };
    v.addEventListener("wheel", onWheel, { passive: false });
    return () => v.removeEventListener("wheel", onWheel);
  }, [paso]);

  /** Ctrl/⌘ + «+», «−» y «0» sobre la hoja o su barra (el «=» es el «+» sin Shift del teclado inglés). */
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.key === "+" || e.key === "=") paso(1);
      else if (e.key === "-" || e.key === "_") paso(-1);
      else if (e.key === "0") elegir(100);
      else return;
      e.preventDefault();
    },
    [elegir, paso],
  );

  return {
    visorRef,
    medidorRef,
    hojaRef,
    modo,
    escala,
    pct,
    /** Ancho de layout de la hoja (px sin escalar); `null` hasta la primera medida. */
    anchoHoja,
    altoHoja,
    puedeAlejar: !comoPapel && pasoSiguiente(pct, -1) != null,
    puedeAcercar: pasoSiguiente(pct, 1) != null,
    alejar: () => paso(-1),
    acercar: () => paso(1),
    normal: () => elegir(100),
    ajustarAncho: () => elegir("ancho"),
    hojaCompleta: () => elegir("completa"),
    onKeyDown,
  };
}

export type LupaPapel = ReturnType<typeof useLupaPapel>;
