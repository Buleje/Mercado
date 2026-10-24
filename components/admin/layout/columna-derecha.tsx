"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Columna de la derecha del panel (Brandon 24-10: «la barra lateral de detalles
 * de Esenciales, que abarque hasta el header con su espacio, para que el header
 * se adapte y ocupe su espacio»). Es la hermana de la barra lateral izquierda:
 * fija, de arriba hasta abajo. Vacía no se dibuja; cuando un módulo manda algo
 * adentro (por portal), el shell define `--columna-derecha` con `:has` y el
 * encabezado y el contenido se corren ese ancho (`app/admin/page.tsx`).
 *
 * `anchoLibre` = lo que mide la pantalla sin la barra izquierda. No cambia al
 * abrir la columna (el contenido se achica, la cuenta no), así que sirve para
 * decidir si va la columna o un cajón encima.
 */
interface ColumnaDerecha {
  el: HTMLElement | null;
  anchoLibre: number;
}

const Contexto = createContext<ColumnaDerecha | null>(null);

const ABIERTA = ":root:has([data-columna-derecha]:not(:empty))";
/** Desde md (antes no hay columna): el ancho para todos y el botón «+» se corre a su izquierda. */
const REGLAS = `@media (min-width:768px){${ABIERTA}{--columna-derecha:26rem}${ABIERTA} [data-fab-rapido]{right:calc(26rem + 24px)!important}}`;

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

export function ProveedorColumnaDerecha({ children }: { children: ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const anchoLibre = useAnchoLibre(el);
  const valor = useMemo(() => ({ el, anchoLibre }), [el, anchoLibre]);
  return (
    <Contexto.Provider value={valor}>
      {/* En `:root` y no en el shell: el botón «+» (QuickActionsFab) va por portal a <body>
          y también se corre. `<style>` propio y no globals.css (memoria
          `globals-css-no-recompila-tras-reinicio`). */}
      <style>{REGLAS}</style>
      {/* El ancho sale del mismo `--columna-derecha` que corre al contenido: no pueden desincronizarse. */}
      <div
        ref={setEl}
        data-columna-derecha=""
        data-qa="columna-derecha"
        className="fixed inset-y-0 right-0 z-30 hidden w-[var(--columna-derecha,26rem)] md:block md:empty:hidden"
      />
      {children}
    </Contexto.Provider>
  );
}
