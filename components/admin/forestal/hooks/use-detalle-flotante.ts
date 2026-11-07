"use client";

/**
 * use-detalle-flotante — cuándo se abre y se cierra el detalle de un día de la
 * tira (`CtpSemanaDeRegistro`).
 *
 * Tres maneras de abrirlo, y cada una decide qué lo cierra:
 *
 *  · **mouse** sobre el casillero, con retardo: pasar de largo por la tira no
 *    puede llenar la pantalla de paneles. Se cierra al salir, también con
 *    retardo, para que ir del casillero al panel no lo haga parpadear.
 *  · **foco de teclado** en el ícono: se cierra cuando el foco sale del
 *    casillero y de su panel.
 *  · **clic o toque** en el ícono: queda fijo hasta otro toque, clic afuera o
 *    Escape. En táctil no hay «pasar el mouse», así que es la única vía.
 *
 * El panel vive en un PORTAL (ver `use-ubicar-flotante`): «es de este día» se
 * pregunta por atributo —`data-casillero` o `data-detalle-de` con la misma
 * clave—, porque `contains` sobre el casillero ya no lo encuentra.
 *
 * Escape se escucha en `window` y en CAPTURA: el modal de abajo escucha en
 * `document` (captura también, `useModalAccesible`) y Radix igual; `window`
 * corre antes que los dos, y el `stopPropagation` evita que Escape, además de
 * cerrar el panel, cierre el modal con el trabajo a medio hacer.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent as KeyboardEventDeReact,
} from "react";

export const RETARDO_ABRIR_MS = 350;
export const RETARDO_CERRAR_MS = 180;

type Modo = "mouse" | "foco" | "fijo";

const ENFOCABLES = 'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** ¿El nodo es del casillero `clave` o de SU panel? */
function esDe(clave: string, nodo: EventTarget | null): boolean {
  if (!(nodo instanceof Element)) return false;
  return (
    nodo.closest("[data-casillero]")?.getAttribute("data-casillero") === clave ||
    nodo.closest("[data-detalle-de]")?.getAttribute("data-detalle-de") === clave
  );
}

/** El elemento con ese atributo y esa clave (sin `CSS.escape`: la clave trae el id de React). */
function porClave(atributo: "data-casillero" | "data-detalle-de", clave: string): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>(`[${atributo}]`)].find(
    (el) => el.getAttribute(atributo) === clave,
  );
}

export function useDetalleFlotante(
  idTira: string,
  /** Los días A LA VISTA que traen detalle. */
  diasConDetalle: readonly string[],
) {
  const [abierto, setAbierto] = useState<{ dia: string; modo: Modo } | null>(null);
  /* El día abierto dejó de estar a la vista (se cambió de semana con las
     flechas, la recarga ya no lo trae): se suelta en este mismo render. Si
     quedara, los oyentes de `window` seguirían tragándose el Escape del modal
     sin ningún panel en pantalla. Es el patrón de React de ajustar estado
     durante el render, con condición: no hay bucle. */
  if (abierto && !diasConDetalle.includes(abierto.dia)) setAbierto(null);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* El foco que llega por un clic (o el que devolvemos al cerrar) no abre: el
     clic ya decide con `alternar`, y abrir en el foco lo cerraría en el clic. */
  const ignorarFoco = useRef(false);

  /** La clave del casillero: con el id de la tira, dos tiras no se confunden. */
  const clave = useCallback((dia: string) => `${idTira}|${dia}`, [idTira]);

  const detener = useCallback(() => {
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = null;
  }, []);

  const cerrar = useCallback(() => {
    detener();
    setAbierto(null);
  }, [detener]);

  /** Lleva el foco al ícono del día. `cerrando`: ese foco no lo vuelve a abrir. */
  const enfocarAncla = useCallback(
    (dia: string, cerrando: boolean) => {
      const ancla = porClave("data-casillero", clave(dia))?.querySelector<HTMLElement>("[data-detalle-ancla]");
      if (!ancla || ancla === document.activeElement) return;
      if (cerrando) ignorarFoco.current = true;
      ancla.focus();
    },
    [clave],
  );

  useEffect(() => detener, [detener]);

  useEffect(() => {
    if (!abierto) return;
    const propia = clave(abierto.dia);

    const onTecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      /* Si el foco estaba en el panel, vuelve al ícono: se desmonta el panel y
         quien navega con teclado no puede quedar en el `body`. */
      if (esDe(propia, document.activeElement)) enfocarAncla(abierto.dia, true);
      cerrar();
    };
    const onPuntero = (e: PointerEvent) => {
      if (!esDe(propia, e.target)) cerrar();
    };

    window.addEventListener("keydown", onTecla, true);
    document.addEventListener("pointerdown", onPuntero, true);
    return () => {
      window.removeEventListener("keydown", onTecla, true);
      document.removeEventListener("pointerdown", onPuntero, true);
    };
  }, [abierto, clave, cerrar, enfocarAncla]);

  /** El mouse entró al casillero o a su panel. */
  const entrar = (dia: string) => {
    detener();
    if (abierto?.dia === dia) return;
    /* Uno abierto a propósito (clic o teclado) no se lo lleva el mouse. */
    if (abierto && abierto.modo !== "mouse") return;
    reloj.current = setTimeout(() => {
      reloj.current = null;
      setAbierto({ dia, modo: "mouse" });
    }, RETARDO_ABRIR_MS);
  };

  /** El mouse salió del casillero o de su panel. */
  const salir = () => {
    detener();
    if (abierto?.modo !== "mouse") return;
    reloj.current = setTimeout(() => {
      reloj.current = null;
      setAbierto((prev) => (prev?.modo === "mouse" ? null : prev));
    }, RETARDO_CERRAR_MS);
  };

  /** Clic o toque en el ícono: lo fija, y si ya estaba fijo lo cierra. */
  const alternar = (dia: string) => {
    detener();
    ignorarFoco.current = false;
    setAbierto((prev) => (prev?.dia === dia && prev.modo === "fijo" ? null : { dia, modo: "fijo" }));
  };

  const alPresionarAncla = () => {
    ignorarFoco.current = true;
  };

  const alEnfocarAncla = (dia: string) => {
    if (ignorarFoco.current) {
      ignorarFoco.current = false;
      return;
    }
    detener();
    setAbierto((prev) => (prev?.dia === dia ? prev : { dia, modo: "foco" }));
  };

  /**
   * Tab desde el ícono entra al panel. El portal queda al final del diálogo:
   * sin esto, Tab saltaría al día siguiente y el panel se cerraría antes de
   * poder llegar a «Ver qué salió ese día».
   */
  const alTeclaEnAncla = (e: KeyboardEventDeReact<HTMLElement>, dia: string) => {
    if (e.key !== "Tab" || e.shiftKey || abierto?.dia !== dia) return;
    const primero = porClave("data-detalle-de", clave(dia))?.querySelector<HTMLElement>(ENFOCABLES);
    if (!primero) return;
    e.preventDefault();
    primero.focus();
  };

  /**
   * El foco salió del casillero abierto (el `onBlur` de React sube desde el
   * portal hasta el casillero).
   *
   * Sólo con un destino REAL afuera del casillero y de su panel: un
   * `relatedTarget` nulo es el foco yendo al `body` (Safari no enfoca botones
   * al hacer clic, cambiar de ventana) y cerrar ahí se comería el clic en «Ver
   * qué salió ese día». El clic afuera ya lo cierra el `pointerdown`.
   */
  const alPerderFoco = (e: FocusEvent<HTMLElement>) => {
    if (!abierto) return;
    const propia = clave(abierto.dia);
    if (e.currentTarget.getAttribute("data-casillero") !== propia) return;
    const destino = e.relatedTarget;
    if (destino instanceof Node && !esDe(propia, destino)) cerrar();
  };

  /** Cerrar desde el propio panel (su «×» o Tab al final): el foco vuelve al ícono. */
  const cerrarDesdePanel = () => {
    if (abierto) enfocarAncla(abierto.dia, true);
    cerrar();
  };

  /** Shift+Tab en el primer control del panel: al ícono, sin cerrar. */
  const volverAlAncla = () => {
    if (abierto) enfocarAncla(abierto.dia, false);
  };

  return {
    abierto: abierto?.dia ?? null,
    clave,
    entrar,
    salir,
    alternar,
    alPresionarAncla,
    alEnfocarAncla,
    alTeclaEnAncla,
    alPerderFoco,
    cerrar,
    cerrarDesdePanel,
    volverAlAncla,
  };
}
