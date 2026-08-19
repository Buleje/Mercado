"use client";

/**
 * La cuenta de lo que se está eligiendo, fija al pie.
 *
 * El patio tiene doscientas trozas y el operador tilda de a una bajando la
 * tabla: el total vivía en el encabezado de la sección, o sea a doscientas filas
 * de scroll de donde está el ojo. Elegir por m³ —que es como decide un
 * aserradero: «cargo hasta doce metros»— obligaba a subir, mirar y volver.
 *
 * Es `fixed` y no `sticky` a propósito: la tabla vive dentro de contenedores con
 * `overflow` y un `sticky` ahí adentro no pega (lección de la barra de celdas del
 * cubicador, que resolvió lo mismo). Reserva su alto en el flujo para no tapar el
 * final de la página, y sube los toasts con `--pila-toasts-bottom` para no
 * pisarlos.
 */

import { useEffect } from "react";
import { X, type LucideIcon } from "@buleje/design-system/icons";

export interface CifraSeleccion {
  /** Qué se cuenta: «trozas», «m³», «pie tablar». */
  label: string;
  valor: string;
  /** La cifra que manda: se dibuja más grande. */
  fuerte?: boolean;
}

export default function CtpBarraSeleccion({
  cifras,
  onLimpiar,
  accionLabel,
  accionIcon: AccionIcon,
  accionDisabled,
  onAccion,
  aviso,
}: {
  cifras: CifraSeleccion[];
  onLimpiar: () => void;
  accionLabel: string;
  accionIcon: LucideIcon;
  /** Hay algo que impide seguir (una guía descuadrada, por ejemplo). */
  accionDisabled?: boolean;
  onAccion: () => void;
  /** Por qué no se puede seguir. Sin esto, el botón apagado no explica nada. */
  aviso?: string | null;
}) {
  /* Los toasts del módulo se apoyan en esta variable para no quedar debajo de
     la barra. Se limpia al desmontar: si quedara puesta, los toasts flotarían
     64px arriba del pie para siempre. */
  useEffect(() => {
    const raiz = document.documentElement;
    /* Los toasts suben por encima de la barra. En móvil la barra ya está
       levantada sobre la navegación, así que el corrimiento es mayor. */
    raiz.style.setProperty("--pila-toasts-bottom", window.innerWidth < 640 ? "11rem" : "5rem");
    return () => {
      raiz.style.removeProperty("--pila-toasts-bottom");
    };
  }, []);

  return (
    <>
      {/* Reserva el alto en el flujo: al ser `fixed`, sin esto tapa el final de
          la pantalla y no hay forma de llegar a lo que quedó abajo. */}
      <div aria-hidden className="h-20 max-sm:h-36" />
      {/* En móvil se apoya ARRIBA de la barra de navegación del admin en vez de
          taparla: elegir veinte trozas no puede dejar al operador sin cómo
          salir de la pantalla. En sm+ esa barra no existe y va al pie. */}
      <div
        role="status"
        aria-live="polite"
        data-barra-seleccion
        className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-40 border-t-2 border-[var(--accent)] bg-[var(--surface-raised)] px-4 py-2 shadow-[var(--shadow-lg)] sm:bottom-0 sm:pb-[calc(env(safe-area-inset-bottom)+0.5rem)]"
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2">
          {cifras.map((c) => (
            <span key={c.label} className="whitespace-nowrap text-sm text-[var(--text-secondary)]">
              {c.label}{" "}
              <span
                className={`font-mono tabular-nums text-[var(--text-primary)] ${
                  c.fuerte ? "text-base font-extrabold" : "font-bold"
                }`}
              >
                {c.valor}
              </span>
            </span>
          ))}

          {aviso && (
            <span className="text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
              {aviso}
            </span>
          )}

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onLimpiar}
              className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
            >
              <X className="h-4 w-4" aria-hidden /> <span className="max-sm:sr-only">Limpiar</span>
            </button>
            <button
              type="button"
              disabled={accionDisabled}
              onClick={onAccion}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-linear-to-br from-[var(--accent)] to-[var(--accent-dark)] px-4 text-sm font-bold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
            >
              <AccionIcon className="h-4 w-4" aria-hidden /> {accionLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
