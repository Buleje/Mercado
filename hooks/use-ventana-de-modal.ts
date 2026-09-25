"use client";

/**
 * Un modal que se comporta como una VENTANA: se arrastra, se estira y se fija.
 *
 * Pedido de Brandon (2026-09-15): «que los modales en general en todos tengan
 * estas funciones: que se puedan mover como una ventana arrastrable, achicarlos
 * y agrandarlos como ventana, también opción de fijarlos para trabajar sin el
 * problema que se oculta al presionar fuera del modal».
 *
 * Lo que conviene saber antes de tocar esto:
 *
 *  · **El desplazamiento viaja en dos custom properties** (`--ventana-x` /
 *    `--ventana-y`), NO en un `translate` armado acá. Medido en el navegador
 *    sobre el modal «Apartar madera»: las variantes centradas de `AdminModal`
 *    ya se posicionan con `translate: -50% -50%` (propiedad `translate`, no
 *    `transform`). El hook no sabe qué variante es; el modal sí, así que él
 *    suma: `translate-x-[calc(-50%_+_var(--ventana-x,0px))]`. Un modal escrito
 *    a mano, centrado por flex, no tiene ese -50%: para esos está
 *    `aplicarTranslate`, que escribe la propiedad entera.
 *  · **Pointer Events con captura**, nunca `mousemove` en `document`: al soltar
 *    el botón fuera de la ventana del navegador, el modal se quedaba pegado al
 *    cursor. Con `setPointerCapture` el `pointerup` llega igual.
 *  · **Durante el arrastre NO se renderiza React**: se escribe la custom
 *    property directamente sobre el elemento y recién al soltar se guarda en el
 *    estado. Un modal con una tabla adentro re-renderizando a 60 fps se siente
 *    como lo que Brandon llama «se lagea».
 *  · **No se pierde de vista**: al soltar —y cuando cambia el tamaño de la
 *    ventana del navegador— se corrige la posición para que queden 48 px de la
 *    barra del título dentro de la pantalla. Un modal arrastrado afuera es un
 *    modal que no se puede cerrar.
 *  · **Fijar no encierra a nadie**: apaga el cierre por clic afuera, pero
 *    Escape y la X siguen cerrando siempre.
 *
 * Debajo de 640 px (el `sm` de Tailwind) las variantes centradas son
 * bottom-sheet: mover y estirar no tiene sentido ahí, así que el hook se apaga
 * entero (`activa` en false, `estilo` vacío, controles que no se dibujan).
 *
 * Dos formas de usarlo:
 *
 *  1. **Con `estilo`** (así lo usa `AdminModal`): el llamador reparte
 *     `estilo` / `asaProps` / `redimensionProps` en su markup.
 *  2. **Con `ref`** (para los modales escritos a mano, que ya le pasan el
 *     contenedor a `useModalAccesible`): el hook escribe la posición y el
 *     tamaño sobre ese elemento, y con `asaAutomatica` engancha solo el asa —
 *     el `<header>` o el hijo directo que tenga el título. Si no encuentra un
 *     asa razonable no hace nada: el modal queda quieto, no roto.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type RefObject,
} from "react";

export interface OpcionesVentana {
  /** Persiste posición y tamaño por modal. Sin clave, no se recuerda nada. */
  claveMemoria?: string;
  /** Apagar del todo (un modal que no debe moverse). */
  habilitado?: boolean;
  /** Ancho mínimo en px al achicar (default 320). */
  anchoMinimo?: number;
  /** Alto mínimo en px al achicar (default 200). */
  altoMinimo?: number;
  /**
   * El contenedor del diálogo. Con él, el hook puede medir (para no dejar el
   * modal fuera de pantalla) y aplicar posición/tamaño sobre el elemento, sin
   * que el llamador reparta `estilo`.
   */
  ref?: RefObject<HTMLElement | null>;
  /**
   * Busca el asa sola dentro de `ref` y le engancha el arrastre: el primer
   * `<header>`, o el hijo directo que contenga el título. Para los modales a
   * mano, que no tienen dónde poner `asaProps` sin editarlos uno por uno.
   */
  asaAutomatica?: boolean;
  /**
   * El hook escribe también la propiedad `translate` sobre `ref`. Va en los
   * modales centrados por flex (los escritos a mano). `AdminModal` NO la usa:
   * él suma `--ventana-x/y` dentro de su propia clase de posición, porque su
   * centrado ya vive en un `translate: -50% -50%` que no hay que pisar.
   */
  aplicarTranslate?: boolean;
}

export interface VentanaDeModal {
  /** Si esta pantalla admite ventana (>= 640 px y habilitado). */
  activa: boolean;
  /** `style` para el contenedor del modal (custom properties + width/height). */
  estilo: CSSProperties;
  /** Se ponen en el HEADER: lo vuelven asa de arrastre. */
  asaProps: HTMLAttributes<HTMLElement>;
  /** Se ponen en el tirador de la esquina inferior derecha. */
  redimensionProps: HTMLAttributes<HTMLElement>;
  fijado: boolean;
  alternarFijado: () => void;
  maximizado: boolean;
  alternarMaximizado: () => void;
  /** Se movió o se redimensionó: habilita «Restaurar». */
  modificada: boolean;
  restaurar: () => void;
  /** Para Radix: con el modal fijado, el clic fuera NO cierra. */
  onInteractOutside: (e: { preventDefault: () => void }) => void;
}

interface Posicion {
  x: number;
  y: number;
}
interface Tamano {
  ancho: number;
  alto: number;
}
interface Memoria {
  x: number;
  y: number;
  ancho: number | null;
  alto: number | null;
  fijado: boolean;
}

/** Lo mínimo del hook que también entienden los eventos nativos (modales a mano). */
interface PunteroLike {
  pointerId: number;
  button: number;
  clientX: number;
  clientY: number;
  target: EventTarget | null;
  currentTarget: EventTarget | null;
}
interface TeclaLike {
  key: string;
  shiftKey: boolean;
  preventDefault: () => void;
  target: EventTarget | null;
  currentTarget: EventTarget | null;
}

/** Lo que oye quien llega al asa con el teclado: qué es y qué puede hacer. */
const ETIQUETA_ASA =
  "Barra del modal. Arrástrala para mover la ventana; con las flechas la mueves de a 16 px, y de a 1 px con Shift.";

const ANCHO_MINIMO = 320;
const ALTO_MINIMO = 200;
/** Cuánto del modal queda SIEMPRE dentro de la pantalla, en los cuatro lados. */
const MARGEN_VISIBLE = 48;

/** Lo que se deja ver del borde inferior: el tirador mide 16 px y hay que poder
 *  agarrarlo con el dedo, no con el píxel justo. */
const MARGEN_ESQUINA = 24;
const PASO_TECLADO = 16;
const PASO_TECLADO_FINO = 1;
/** El mismo umbral que el `sm:` de Tailwind — abajo de ahí el modal es bottom-sheet. */
const PANTALLA_ANCHA = 640;
const PREFIJO_MEMORIA = "buleje:ventana-modal:";

/**
 * Lo que NO arranca un arrastre. El header lleva la X y, en varios modales, un
 * par de botones más: arrastrar no puede robarles el clic.
 */
const CONTROLES =
  'button, input, select, textarea, a[href], [role="button"], [role="tab"], [contenteditable="true"], [data-sin-arrastre]';

/** Cómo se reconoce al contenedor del diálogo cuando no llega por `ref`. */
const CONTENEDOR = '[data-ventana], [role="dialog"], [role="alertdialog"]';

function leerMemoria(clave: string | undefined): Memoria | null {
  if (!clave || typeof window === "undefined") return null;
  try {
    const crudo = window.localStorage.getItem(PREFIJO_MEMORIA + clave);
    if (!crudo) return null;
    const dato: unknown = JSON.parse(crudo);
    if (!dato || typeof dato !== "object") return null;
    const m = dato as Record<string, unknown>;
    const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
    let ancho = num(m.ancho);
    let alto = num(m.alto);
    /* Un tamaño guardado en el monitor de la oficina no se aplica en la laptop:
       un modal más grande que la pantalla no se puede ni cerrar. Se descarta. */
    if (ancho !== null && (ancho < ANCHO_MINIMO || ancho > window.innerWidth)) ancho = null;
    if (alto !== null && (alto < ALTO_MINIMO || alto > window.innerHeight)) alto = null;
    return { x: num(m.x) ?? 0, y: num(m.y) ?? 0, ancho, alto, fijado: m.fijado === true };
  } catch {
    /* Ventana privada (localStorage tira) o JSON roto: se arranca de cero. */
    return null;
  }
}

function guardarMemoria(clave: string, datos: Memoria): void {
  try {
    window.localStorage.setItem(PREFIJO_MEMORIA + clave, JSON.stringify(datos));
  } catch {
    /* Sin memoria se puede vivir; sin modal no. */
  }
}

function olvidarMemoria(clave: string): void {
  try {
    window.localStorage.removeItem(PREFIJO_MEMORIA + clave);
  } catch {
    /* idem */
  }
}

/** El `<header>` o el hijo directo que tiene el título: eso es el asa. */
function buscarAsa(caja: HTMLElement): HTMLElement | null {
  const header = caja.querySelector<HTMLElement>("header");
  if (header) return header;
  const titulo = caja.querySelector<HTMLElement>("h1, h2, h3, h4, [data-titulo-modal]");
  if (!titulo) return null;
  let nodo: HTMLElement | null = titulo;
  while (nodo && nodo.parentElement !== caja) nodo = nodo.parentElement;
  return nodo;
}

export function useVentanaDeModal(abierto: boolean, opts: OpcionesVentana = {}): VentanaDeModal {
  const {
    claveMemoria,
    habilitado = true,
    anchoMinimo = ANCHO_MINIMO,
    altoMinimo = ALTO_MINIMO,
    ref,
    asaAutomatica = false,
    aplicarTranslate = false,
  } = opts;

  const [memoria] = useState(() => leerMemoria(claveMemoria));
  const [pos, setPos] = useState<Posicion>({ x: memoria?.x ?? 0, y: memoria?.y ?? 0 });
  const [tam, setTam] = useState<Tamano | null>(
    memoria?.ancho != null && memoria.alto != null ? { ancho: memoria.ancho, alto: memoria.alto } : null,
  );
  const [fijado, setFijado] = useState(memoria?.fijado ?? false);
  const [maximizado, setMaximizado] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  /* Arranca en false y no en `innerWidth >= 640` para que el primer render del
     cliente sea igual al del servidor (hidratación). Con `--ventana-x` en 0 la
     clase compuesta da exactamente el mismo `-50%`, así que no se ve el salto. */
  const [pantallaAncha, setPantallaAncha] = useState(false);

  const activa = habilitado && pantallaAncha;

  /* Espejos para los manejadores imperativos, que corren fuera del render. */
  const posRef = useRef(pos);
  posRef.current = pos;
  const tamRef = useRef(tam);
  tamRef.current = tam;
  const activaRef = useRef(activa);
  activaRef.current = activa;
  const maximizadoRef = useRef(maximizado);
  maximizadoRef.current = maximizado;
  const fijadoRef = useRef(fijado);
  fijadoRef.current = fijado;

  const contenedorRef = useRef<HTMLElement | null>(null);
  const arrastreRef = useRef<{
    id: number;
    x0: number;
    y0: number;
    base: Posicion;
    ultima: Posicion;
    el: HTMLElement;
    asa: HTMLElement;
  } | null>(null);
  const redimRef = useRef<{
    id: number;
    x0: number;
    y0: number;
    ancho0: number;
    alto0: number;
    izq0: number;
    arr0: number;
    pos: Posicion;
    tam: Tamano;
    el: HTMLElement;
    tirador: HTMLElement;
  } | null>(null);
  const cuadroRef = useRef<number | null>(null);

  /** El contenedor: el `ref` del llamador o el diálogo más cercano al asa. */
  const contenedor = useCallback(
    (desde?: EventTarget | null): HTMLElement | null => {
      if (ref?.current) return ref.current;
      if (desde instanceof Element) {
        const hallado = desde.closest<HTMLElement>(CONTENEDOR);
        if (hallado) contenedorRef.current = hallado;
      }
      return contenedorRef.current;
    },
    [ref],
  );

  const escribirPosicion = useCallback((el: HTMLElement, p: Posicion) => {
    el.style.setProperty("--ventana-x", `${p.x}px`);
    el.style.setProperty("--ventana-y", `${p.y}px`);
  }, []);

  /**
   * Devuelve la posición corregida para que el modal no se escape de la
   * pantalla. Se mide el rectángulo REAL (ya con el desplazamiento aplicado),
   * así sirve igual para una variante centrada con `translate` que para un
   * modal a mano centrado por flex.
   */
  const acomodar = useCallback((el: HTMLElement, p: Posicion): Posicion => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return p; // todavía no está pintado
    const anchoVista = window.innerWidth;
    const altoVista = window.innerHeight;
    let dx = 0;
    let dy = 0;
    if (r.right < MARGEN_VISIBLE) dx = MARGEN_VISIBLE - r.right;
    else if (r.left > anchoVista - MARGEN_VISIBLE) dx = anchoVista - MARGEN_VISIBLE - r.left;
    /* Arriba el margen es cero: si la barra del título se va por encima del
       borde no hay de dónde agarrar el modal para traerlo de vuelta. */
    if (r.top < 0) dy = -r.top;
    else if (r.top > altoVista - MARGEN_VISIBLE) dy = altoVista - MARGEN_VISIBLE - r.top;
    /**
     * Y el borde de ABAJO también tiene que verse, cuando el modal entra en la
     * pantalla: el tirador de redimensión vive en esa esquina.
     *
     * Medido el 2026-09-15 en «Producir sin lote» (912 px de alto en una
     * pantalla de 950): arrastrarlo 60 px hacia abajo dejaba el tirador en
     * y = 968, fuera de la vista, y el modal se volvía imposible de achicar
     * justo cuando más falta hacía. Se corrige sólo si el modal CABE: uno más
     * alto que la pantalla no tiene forma de mostrar sus dos puntas, y ahí el
     * camino es «Restaurar» o maximizar, no pelearle al tope.
     */
    if (dy === 0 && r.height <= altoVista && r.bottom > altoVista - MARGEN_ESQUINA) {
      dy = altoVista - MARGEN_ESQUINA - r.bottom;
    }
    if (dx === 0 && dy === 0) return p;
    return { x: Math.round(p.x + dx), y: Math.round(p.y + dy) };
  }, []);

  // ── Pantalla: ancho y reacomodo ───────────────────────────────────────────
  useEffect(() => {
    const medir = () => {
      setPantallaAncha(window.innerWidth >= PANTALLA_ANCHA);
      if (!activaRef.current) return;
      /* El tamaño guardado puede no entrar en la pantalla nueva. */
      const t = tamRef.current;
      if (t && (t.ancho > window.innerWidth || t.alto > window.innerHeight)) {
        setTam({ ancho: Math.min(t.ancho, window.innerWidth), alto: Math.min(t.alto, window.innerHeight) });
      }
      const el = contenedor();
      if (!el?.isConnected) return;
      const p = acomodar(el, posRef.current);
      if (p !== posRef.current) {
        escribirPosicion(el, p);
        setPos(p);
      }
    };
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [acomodar, contenedor, escribirPosicion]);

  /* Al abrir, el modal puede venir de una memoria hecha en otra pantalla. */
  useEffect(() => {
    if (!abierto || !activa) return;
    const id = requestAnimationFrame(() => {
      const el = contenedor();
      if (!el?.isConnected) return;
      const p = acomodar(el, posRef.current);
      if (p !== posRef.current) {
        escribirPosicion(el, p);
        setPos(p);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [abierto, activa, acomodar, contenedor, escribirPosicion]);

  // ── Memoria ───────────────────────────────────────────────────────────────
  const claveAnterior = useRef(claveMemoria);
  useEffect(() => {
    if (claveAnterior.current === claveMemoria) return;
    claveAnterior.current = claveMemoria;
    const m = leerMemoria(claveMemoria);
    setPos({ x: m?.x ?? 0, y: m?.y ?? 0 });
    setTam(m?.ancho != null && m.alto != null ? { ancho: m.ancho, alto: m.alto } : null);
    setFijado(m?.fijado ?? false);
    setMaximizado(false);
  }, [claveMemoria]);

  const modificada = pos.x !== 0 || pos.y !== 0 || tam !== null;

  useEffect(() => {
    if (!claveMemoria) return;
    /* Un modal que nadie movió no ensucia el localStorage de los 167. */
    if (!modificada && !fijado) {
      olvidarMemoria(claveMemoria);
      return;
    }
    guardarMemoria(claveMemoria, {
      x: pos.x,
      y: pos.y,
      ancho: tam?.ancho ?? null,
      alto: tam?.alto ?? null,
      fijado,
    });
  }, [claveMemoria, pos, tam, fijado, modificada]);

  // ── Estilo ────────────────────────────────────────────────────────────────
  const estilo = useMemo<CSSProperties>(() => {
    if (!activa) return {};
    const v: Record<string, string> = {};
    if (maximizado) {
      /* Toda la pantalla, sin meterse debajo del notch ni de la barra de gestos.
         Como el modal está centrado, el desplazamiento sólo compensa lo
         asimétrico de los insets. */
      v["--ventana-x"] = "calc((env(safe-area-inset-left) - env(safe-area-inset-right)) / 2)";
      v["--ventana-y"] = "calc((env(safe-area-inset-top) - env(safe-area-inset-bottom)) / 2)";
      v.width = "calc(100vw - env(safe-area-inset-left) - env(safe-area-inset-right))";
      v.height = "calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom))";
    } else {
      v["--ventana-x"] = `${pos.x}px`;
      v["--ventana-y"] = `${pos.y}px`;
      if (tam) {
        v.width = `${tam.ancho}px`;
        v.height = `${tam.alto}px`;
      }
    }
    /* Sin esto el `max-w-[32rem]` de la variante le gana al ancho inline y
       estirar el modal no hace nada (medido: maxWidth computado 512px). */
    if (v.width) v.maxWidth = "none";
    if (v.height) v.maxHeight = "none";
    if (aplicarTranslate) v.translate = "var(--ventana-x, 0px) var(--ventana-y, 0px)";
    return v as CSSProperties;
  }, [activa, maximizado, pos, tam, aplicarTranslate]);

  /* Modo `ref`: el hook aplica el estilo él mismo. Escribe lo MISMO que
     `estilo`, así un llamador que además lo reparte (AdminModal) no pelea.
     Sólo limpia lo que ESTE hook escribió antes: un modal a mano puede traer
     su propio `width` inline y no es asunto nuestro borrárselo. */
  const escritasRef = useRef<string[]>([]);
  useEffect(() => {
    const el = ref?.current;
    if (!el) return;
    const valores = estilo as Record<string, string | undefined>;
    const ahora: string[] = [];
    for (const nombre of ["--ventana-x", "--ventana-y", "width", "height", "maxWidth", "maxHeight", "translate"]) {
      const valor = valores[nombre];
      if (!valor) continue;
      ahora.push(nombre);
      if (nombre.startsWith("--")) el.style.setProperty(nombre, valor);
      else el.style[nombre as "width"] = valor;
    }
    for (const nombre of escritasRef.current) {
      if (ahora.includes(nombre)) continue;
      if (nombre.startsWith("--")) el.style.removeProperty(nombre);
      else el.style[nombre as "width"] = "";
    }
    escritasRef.current = ahora;
  }, [ref, estilo, abierto]);

  // ── Arrastre ──────────────────────────────────────────────────────────────
  const terminarArrastre = useCallback(
    (cancelado: boolean) => {
      const a = arrastreRef.current;
      if (!a) return;
      arrastreRef.current = null;
      setArrastrando(false);
      try {
        if (a.asa.hasPointerCapture?.(a.id)) a.asa.releasePointerCapture(a.id);
      } catch {
        /* jsdom y navegadores viejos no implementan la captura de puntero. */
      }
      const destino = cancelado ? a.base : acomodar(a.el, a.ultima);
      escribirPosicion(a.el, destino);
      setPos(destino);
    },
    [acomodar, escribirPosicion],
  );

  const alBajarEnAsa = useCallback(
    (e: PunteroLike) => {
      if (!activaRef.current || maximizadoRef.current) return;
      if (e.button !== 0) return; // sólo el botón primario
      const asa = e.currentTarget;
      if (!(asa instanceof HTMLElement)) return;
      if (e.target instanceof Element && e.target.closest(CONTROLES)) return;
      const el = contenedor(asa);
      if (!el) return;
      arrastreRef.current = {
        id: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        base: { ...posRef.current },
        ultima: { ...posRef.current },
        el,
        asa,
      };
      try {
        asa.setPointerCapture?.(e.pointerId);
      } catch {
        /* sin captura igual se puede arrastrar dentro de la ventana */
      }
      setArrastrando(true);
    },
    [contenedor],
  );

  const alMoverEnAsa = useCallback(
    (e: PunteroLike) => {
      const a = arrastreRef.current;
      if (!a || a.id !== e.pointerId) return;
      a.ultima = { x: Math.round(a.base.x + e.clientX - a.x0), y: Math.round(a.base.y + e.clientY - a.y0) };
      escribirPosicion(a.el, a.ultima);
    },
    [escribirPosicion],
  );

  const alSoltarEnAsa = useCallback(() => terminarArrastre(false), [terminarArrastre]);

  const alTeclaEnAsa = useCallback(
    (e: TeclaLike) => {
      if (!activaRef.current || maximizadoRef.current) return;
      /* Sólo el asa en sí. Varios headers llevan un buscador o un selector
         adentro: una flecha tecleada ahí mueve el cursor del campo, no la
         ventana (el evento burbujea hasta acá igual). */
      if (e.target !== e.currentTarget) return;
      const paso = e.shiftKey ? PASO_TECLADO_FINO : PASO_TECLADO;
      let dx = 0;
      let dy = 0;
      if (e.key === "ArrowLeft") dx = -paso;
      else if (e.key === "ArrowRight") dx = paso;
      else if (e.key === "ArrowUp") dy = -paso;
      else if (e.key === "ArrowDown") dy = paso;
      else return;
      const el = contenedor(e.currentTarget);
      if (!el) return;
      e.preventDefault();
      const tentativa = { x: posRef.current.x + dx, y: posRef.current.y + dy };
      escribirPosicion(el, tentativa);
      const destino = acomodar(el, tentativa);
      if (destino !== tentativa) escribirPosicion(el, destino);
      setPos(destino);
    },
    [acomodar, contenedor, escribirPosicion],
  );

  /* Escape MIENTRAS se arrastra cancela el movimiento, no cierra el modal.
     Radix escucha Escape en `document` en fase de captura; `window` en captura
     va antes que `document`, así que cortar acá le gana (mismo truco que el
     popover del cubicador). */
  useEffect(() => {
    if (!arrastrando) return;
    const alTeclado = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      ev.preventDefault();
      ev.stopPropagation();
      terminarArrastre(true);
    };
    window.addEventListener("keydown", alTeclado, true);
    return () => window.removeEventListener("keydown", alTeclado, true);
  }, [arrastrando, terminarArrastre]);

  // ── Redimensión ───────────────────────────────────────────────────────────
  const alBajarEnTirador = useCallback(
    (e: PunteroLike) => {
      if (!activaRef.current || maximizadoRef.current) return;
      if (e.button !== 0) return;
      const tirador = e.currentTarget;
      if (!(tirador instanceof HTMLElement)) return;
      const el = contenedor(tirador);
      if (!el) return;
      const r = el.getBoundingClientRect();
      redimRef.current = {
        id: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        ancho0: r.width,
        alto0: r.height,
        izq0: r.left,
        arr0: r.top,
        pos: { ...posRef.current },
        tam: { ancho: r.width, alto: r.height },
        el,
        tirador,
      };
      try {
        tirador.setPointerCapture?.(e.pointerId);
      } catch {
        /* idem arrastre */
      }
    },
    [contenedor],
  );

  const alMoverEnTirador = useCallback(
    (e: PunteroLike) => {
      const r = redimRef.current;
      if (!r || r.id !== e.pointerId) return;
      const x = e.clientX;
      const y = e.clientY;
      if (cuadroRef.current !== null) return; // un solo trabajo por cuadro
      cuadroRef.current = requestAnimationFrame(() => {
        cuadroRef.current = null;
        const act = redimRef.current;
        if (!act) return;
        const ancho = Math.round(Math.min(Math.max(act.ancho0 + x - act.x0, anchoMinimo), window.innerWidth));
        const alto = Math.round(Math.min(Math.max(act.alto0 + y - act.y0, altoMinimo), window.innerHeight));
        act.el.style.maxWidth = "none";
        act.el.style.maxHeight = "none";
        act.el.style.width = `${ancho}px`;
        act.el.style.height = `${alto}px`;
        act.tam = { ancho, alto };
        /* Un modal centrado crece para los dos lados: sin compensar, la esquina
           se escapa del cursor a mitad de velocidad. Se corrige contra el borde
           superior-izquierdo original, así no acumula deriva. */
        const r2 = act.el.getBoundingClientRect();
        const p = {
          x: Math.round(act.pos.x + (act.izq0 - r2.left)),
          y: Math.round(act.pos.y + (act.arr0 - r2.top)),
        };
        act.pos = p;
        escribirPosicion(act.el, p);
      });
    },
    [altoMinimo, anchoMinimo, escribirPosicion],
  );

  const alSoltarEnTirador = useCallback(() => {
    const r = redimRef.current;
    if (!r) return;
    redimRef.current = null;
    if (cuadroRef.current !== null) {
      cancelAnimationFrame(cuadroRef.current);
      cuadroRef.current = null;
    }
    try {
      if (r.tirador.hasPointerCapture?.(r.id)) r.tirador.releasePointerCapture(r.id);
    } catch {
      /* idem */
    }
    const destino = acomodar(r.el, r.pos);
    escribirPosicion(r.el, destino);
    setPos(destino);
    setTam(r.tam);
  }, [acomodar, escribirPosicion]);

  // ── Fijar ─────────────────────────────────────────────────────────────────
  const onInteractOutside = useCallback((e: { preventDefault: () => void }) => {
    if (fijadoRef.current) e.preventDefault();
  }, []);

  /**
   * Fijado = «quiero seguir usando la pantalla de atrás».
   *
   * Radix apaga los clics de TODA la página mientras hay un diálogo modal
   * (`DismissableLayer` pone `body { pointer-events: none }` una sola vez, al
   * montar) y su trampa de foco devuelve el foco al diálogo escuchando
   * `focusin` en `document`. Mientras dure el fijado le devolvemos las dos
   * cosas al usuario, y al desfijar queda como estaba.
   */
  useEffect(() => {
    if (!abierto || !fijado || typeof document === "undefined") return;
    const body = document.body;
    const previo = body.style.pointerEvents;
    if (previo === "none") body.style.pointerEvents = "auto";

    /**
     * Y el VELO propio, en los modales escritos a mano.
     *
     * Los 103 modales a mano del panel no usan el overlay de Radix: pintan su
     * propio `div.modal-backdrop fixed inset-0`, que sigue tapando la pantalla
     * aunque Radix ya no estorbe. Medido el 2026-09-15 en «Producir sin lote»:
     * fijado y achicado, `elementFromPoint` sobre la tabla de atrás devolvía el
     * velo — o sea, «fijar para seguir trabajando» dejaba mirar pero no tocar,
     * que es justo la mitad del pedido.
     *
     * El velo se apaga para el puntero y el diálogo se enciende: sin lo
     * segundo, el propio modal heredaría el `none` del padre.
     */
    const caja = contenedor();
    const velo = caja?.closest<HTMLElement>(".modal-backdrop") ?? null;
    const previoVelo = velo?.style.pointerEvents ?? null;
    const previoCaja = caja?.style.pointerEvents ?? null;
    if (velo && velo !== caja) {
      velo.style.pointerEvents = "none";
      if (caja) caja.style.pointerEvents = "auto";
    }

    const alEnfocar = (ev: FocusEvent) => {
      const el = contenedor();
      if (el && ev.target instanceof Node && !el.contains(ev.target)) ev.stopPropagation();
    };
    window.addEventListener("focusin", alEnfocar, true);
    return () => {
      body.style.pointerEvents = previo;
      if (velo && previoVelo !== null) velo.style.pointerEvents = previoVelo;
      if (caja && previoCaja !== null) caja.style.pointerEvents = previoCaja;
      window.removeEventListener("focusin", alEnfocar, true);
    };
  }, [abierto, fijado, contenedor]);

  const alternarFijado = useCallback(() => setFijado((f) => !f), []);

  /* Maximizar no pisa `pos`/`tam`: por eso volver del maximizado devuelve el
     tamaño anterior y no el del default. */
  const alternarMaximizado = useCallback(() => setMaximizado((m) => !m), []);

  const restaurar = useCallback(() => {
    setPos({ x: 0, y: 0 });
    setTam(null);
    setMaximizado(false);
  }, []);

  // ── Asa automática (modales escritos a mano) ──────────────────────────────
  useEffect(() => {
    if (!asaAutomatica || !activa || !abierto) return;
    const caja = ref?.current;
    if (!caja) return;
    const asa = buscarAsa(caja);
    if (!asa) return; // sin asa razonable: el modal se queda quieto, no roto
    const previo = {
      tabIndex: asa.getAttribute("tabindex"),
      label: asa.getAttribute("aria-label"),
      role: asa.getAttribute("role"),
      cursor: asa.style.cursor,
      touchAction: asa.style.touchAction,
      userSelect: asa.style.userSelect,
    };
    asa.setAttribute("tabindex", "0");
    if (!previo.role) asa.setAttribute("role", "group");
    asa.setAttribute("aria-label", ETIQUETA_ASA);
    asa.style.cursor = "move";
    asa.style.touchAction = "none";
    asa.style.userSelect = "none";
    asa.addEventListener("pointerdown", alBajarEnAsa);
    asa.addEventListener("pointermove", alMoverEnAsa);
    asa.addEventListener("pointerup", alSoltarEnAsa);
    asa.addEventListener("pointercancel", alSoltarEnAsa);
    asa.addEventListener("lostpointercapture", alSoltarEnAsa);
    asa.addEventListener("keydown", alTeclaEnAsa);
    return () => {
      if (previo.tabIndex === null) asa.removeAttribute("tabindex");
      else asa.setAttribute("tabindex", previo.tabIndex);
      if (previo.label === null) asa.removeAttribute("aria-label");
      else asa.setAttribute("aria-label", previo.label);
      if (previo.role === null) asa.removeAttribute("role");
      asa.style.cursor = previo.cursor;
      asa.style.touchAction = previo.touchAction;
      asa.style.userSelect = previo.userSelect;
      asa.removeEventListener("pointerdown", alBajarEnAsa);
      asa.removeEventListener("pointermove", alMoverEnAsa);
      asa.removeEventListener("pointerup", alSoltarEnAsa);
      asa.removeEventListener("pointercancel", alSoltarEnAsa);
      asa.removeEventListener("lostpointercapture", alSoltarEnAsa);
      asa.removeEventListener("keydown", alTeclaEnAsa);
    };
  }, [asaAutomatica, activa, abierto, ref, alBajarEnAsa, alMoverEnAsa, alSoltarEnAsa, alTeclaEnAsa]);

  const asaProps = useMemo<HTMLAttributes<HTMLElement>>(() => {
    if (!activa) return {};
    return {
      role: "group",
      tabIndex: 0,
      "aria-label": ETIQUETA_ASA,
      onPointerDown: alBajarEnAsa,
      onPointerMove: alMoverEnAsa,
      onPointerUp: alSoltarEnAsa,
      onPointerCancel: alSoltarEnAsa,
      onLostPointerCapture: alSoltarEnAsa,
      onKeyDown: alTeclaEnAsa,
      style: {
        cursor: maximizado ? "default" : "move",
        touchAction: "none",
        /* Arrastrar por el header no debería ir seleccionando el título. */
        userSelect: "none",
      },
    };
  }, [activa, maximizado, alBajarEnAsa, alMoverEnAsa, alSoltarEnAsa, alTeclaEnAsa]);

  const redimensionProps = useMemo<HTMLAttributes<HTMLElement>>(() => {
    if (!activa || maximizado) return {};
    return {
      onPointerDown: alBajarEnTirador,
      onPointerMove: alMoverEnTirador,
      onPointerUp: alSoltarEnTirador,
      onPointerCancel: alSoltarEnTirador,
      onLostPointerCapture: alSoltarEnTirador,
      style: { touchAction: "none", cursor: "nwse-resize" },
    };
  }, [activa, maximizado, alBajarEnTirador, alMoverEnTirador, alSoltarEnTirador]);

  return {
    activa,
    estilo,
    asaProps,
    redimensionProps,
    fijado,
    alternarFijado,
    maximizado,
    alternarMaximizado,
    modificada,
    restaurar,
    onInteractOutside,
  };
}
