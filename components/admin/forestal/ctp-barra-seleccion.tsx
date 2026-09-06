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

/**
 * Una cifra de lo elegido, con su nombre encima y el número en grande.
 *
 * Nace de una fricción concreta (Brandon, 2026-09-03): al lado de «Declarar
 * producción» la cuenta era un `12 pza · 8.43 m³` en mono chico, sin el pie
 * tablar y sin decir sobre cuántas. Se declara producción MIRANDO ese número —es
 * lo que va a quedar escrito en el libro— así que tiene que leerse de un vistazo
 * y decir de qué habla.
 *
 * Vive acá, con la barra del pie, porque las dos cuentan lo mismo: lo tildado.
 */
export function CifraSeleccion({ label, valor, sufijo, fuerte }: {
  label: string;
  valor: string;
  /** Unidad o contexto («m³», «pt», «de 20»): más chico, nunca compite con el número. */
  sufijo?: string;
  fuerte?: boolean;
}) {
  return (
    <span className="flex flex-col justify-center leading-tight">
      <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        {label}
      </span>
      <span className="whitespace-nowrap font-mono tabular-nums text-[var(--text-primary)]">
        <b className={fuerte ? "text-lg font-extrabold" : "text-base font-bold"}>{valor}</b>
        {sufijo && <span className="ml-1 text-sm font-normal text-[var(--text-secondary)]">{sufijo}</span>}
      </span>
    </span>
  );
}

export interface AccionSeleccion {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
}

export default function CtpBarraSeleccion({
  cifras,
  onLimpiar,
  accionLabel,
  accionIcon: AccionIcon,
  accionDisabled,
  onAccion,
  aviso,
  /**
   * Otras cosas que se pueden hacer con lo tildado, antes de la acción
   * principal. Botón secundario (borde, no relleno) para que la acción
   * principal siga siendo la que más pesa visualmente.
   */
  accionesSecundarias,
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
  accionesSecundarias?: AccionSeleccion[];
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
            {accionesSecundarias?.map((a) => (
              <button
                key={a.label}
                type="button"
                disabled={a.disabled}
                onClick={a.onClick}
                className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-[var(--accent)] px-3 text-sm font-bold text-[var(--accent-ink)] transition-colors hover:bg-primary/10 disabled:opacity-50 dark:text-[var(--accent)]"
              >
                <a.icon className="h-4 w-4" aria-hidden /> {a.label}
              </button>
            ))}
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
