"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Columna de la derecha del panel (Brandon 24-10: «la barra lateral de detalles
 * de Esenciales, que abarque hasta el header con su espacio, para que el header
 * se adapte y ocupe su espacio» + «una sola columna derecha»). Es la hermana de
 * la barra lateral izquierda: fija, de arriba hasta abajo. Vacía no se dibuja;
 * cuando un módulo manda algo adentro (por portal), el shell define
 * `--columna-derecha` con `:has` y el encabezado y el contenido se corren ese
 * ancho (`app/admin/page.tsx`).
 *
 * Tiene dos huecos que se apilan, cada uno con su scroll:
 * - `arriba`: el aviso de la agenda (`PanelLateralAviso`), con ancho que se arrastra.
 * - `el` (abajo): el panel de la carpeta de Esenciales, 26rem.
 * Con los dos abiertos, la columna toma el mayor de los dos anchos: nada se tapa.
 *
 * `anchoLibre` = lo que mide la pantalla sin la barra izquierda. No cambia al
 * abrir la columna (el contenido se achica, la cuenta no), así que sirve para
 * decidir si va la columna o un cajón encima.
 */
export type HuecoColumna = "arriba" | "abajo";

interface ColumnaDerecha {
  /** Hueco de abajo (Esenciales). */
  el: HTMLElement | null;
  /** Hueco de arriba (el aviso de la agenda). */
  arriba: HTMLElement | null;
  anchoLibre: number;
  /** El ancho que pide quien ocupa un hueco, en px (`null` = el de fábrica, 26rem). */
  fijarAncho: (hueco: HuecoColumna, px: number | null) => void;
}

const Contexto = createContext<ColumnaDerecha | null>(null);

const DE_FABRICA = "26rem";
const ARRIBA = "[data-columna-arriba]:not(:empty)";
const ABAJO = "[data-columna-abajo]:not(:empty)";
const ABIERTA = `:root:has(${ARRIBA},${ABAJO})`;

/**
 * Desde md (antes no hay columna): el ancho del hueco ocupado (o el mayor de los
 * dos), la columna se dibuja y el botón «+» se corre a su izquierda. La raya
 * entre los dos huecos va sólo cuando están los dos.
 */
function reglas(anchos: Record<HuecoColumna, number | null>): string {
  const ancho = (h: HuecoColumna) => (anchos[h] === null ? DE_FABRICA : `${anchos[h]}px`);
  return [
    "@media (min-width:768px){",
    `:root:has(${ARRIBA}){--columna-derecha:${ancho("arriba")}}`,
    `:root:has(${ABAJO}){--columna-derecha:${ancho("abajo")}}`,
    `:root:has(${ARRIBA}):has(${ABAJO}){--columna-derecha:max(${ancho("arriba")},${ancho("abajo")})}`,
    `${ABIERTA} [data-columna-derecha]{display:flex}`,
    `${ABIERTA} [data-fab-rapido]{right:calc(var(--columna-derecha) + 24px)!important}`,
    "}",
    `${ARRIBA}+${ABAJO}{border-top:1px solid var(--rule-base)}`,
  ].join("");
}

/** `null` = no hay columna (fuera del panel, o un módulo montado en otra parte). */
export function useColumnaDerecha(): ColumnaDerecha | null {
  return useContext(Contexto);
}

/** Va en el shell: `[data-admin-contenido]` es la columna del medio (encabezado + contenido). */
function useAnchoLibre(columna: HTMLElement | null): number {
  const [ancho, setAncho] = useState(0);
  useEffect(() => {
    const contenido = columna?.parentElement?.querySelector<HTMLElement>("[data-admin-contenido]");
    if (!contenido) return undefined;
    const medir = () => setAncho(Math.round(window.innerWidth - contenido.getBoundingClientRect().left));
    medir();
    // La barra izquierda se compacta con una transición del margen: el observador ve el final.
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(medir);
    ro?.observe(contenido);
    window.addEventListener("resize", medir);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", medir);
    };
  }, [columna]);
  return ancho;
}

const SIN_PEDIDOS: Record<HuecoColumna, number | null> = { arriba: null, abajo: null };
const HUECO = "flex min-h-0 flex-1 basis-0 flex-col empty:hidden";

export function ProveedorColumnaDerecha({ children }: { children: ReactNode }) {
  const [columna, setColumna] = useState<HTMLElement | null>(null);
  const [arriba, setArriba] = useState<HTMLElement | null>(null);
  const [abajo, setAbajo] = useState<HTMLElement | null>(null);
  const [anchos, setAnchos] = useState(SIN_PEDIDOS);
  const anchoLibre = useAnchoLibre(columna);
  /* Estable: arrastrar el aviso cambia `anchos` (sólo el <style>), no a quien lee la columna. */
  const fijarAncho = useMemo(
    () => (hueco: HuecoColumna, px: number | null) =>
      setAnchos((a) => (a[hueco] === px ? a : { ...a, [hueco]: px })),
    [],
  );
  const valor = useMemo(() => ({ el: abajo, arriba, anchoLibre, fijarAncho }), [abajo, arriba, anchoLibre, fijarAncho]);
  return (
    <Contexto.Provider value={valor}>
      {/* En `:root` y no en el shell: el botón «+» (QuickActionsFab) va por portal a <body>
          y también se corre. `<style>` propio y no globals.css (memoria
          `globals-css-no-recompila-tras-reinicio`). */}
      <style>{reglas(anchos)}</style>
      {/* El ancho sale del mismo `--columna-derecha` que corre al contenido: no pueden desincronizarse.
          `hidden` hasta que algo entra (la regla de arriba la pasa a flex desde md). */}
      <div
        ref={setColumna}
        data-columna-derecha=""
        data-qa="columna-derecha"
        className="fixed inset-y-0 right-0 z-30 hidden w-[var(--columna-derecha,26rem)] flex-col"
      >
        <div ref={setArriba} data-columna-arriba="" className={HUECO} />
        <div ref={setAbajo} data-columna-abajo="" className={HUECO} />
      </div>
      {children}
    </Contexto.Provider>
  );
}
