"use client";

/**
 * La cabecera de una vista del Libro CTP que explica con un ⓘ completo
 * (qué es / qué cambia / ejemplo) — `VistaHeader` sólo acepta una frase.
 *
 * Brandon (2026-10-17): «los botones que están en la página… se pondrán al
 * lado de las pestañas en la esquina para ocupar menos espacio». Dentro del
 * libro el riel ya dice en qué vista estás: el título se calla, el ⓘ va
 * primero en el riel y las acciones detrás. Fuera del libro (o dentro de una
 * ventana) se pinta la fila de siempre: título, ⓘ y acciones a la derecha.
 */

import type { ReactNode } from "react";
import { SectionTitle } from "@buleje/design-system";
import { AccionesDeLaVista, ORDEN_ACCION } from "@/components/admin/shared/libro-acciones-vista";
import { button } from "@/components/ui-system/button-variants";

/**
 * Botón con rótulo del riel (`TextoDeAccion` adentro): entero con 80rem de
 * riel o más; debajo, cuadrado de 48 px con el ícono solo.
 */
export const BTN_ACCION_RIEL = button({
  variant: "secondary",
  className: "shrink-0 rounded-xl @max-[80rem]/riel:w-12 @max-[80rem]/riel:px-0",
});

export function CabeceraDeVista({
  titulo,
  info,
  children,
}: {
  titulo: string;
  /** El `InfoTip` de la vista. */
  info?: ReactNode;
  /** Acciones de la vista: en el riel dentro del libro, a la derecha fuera. */
  children?: ReactNode;
}) {
  const completa = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="mr-1 flex min-w-0 items-center gap-1.5">
        <SectionTitle as="h2">{titulo}</SectionTitle>
        {info}
      </div>
      {children && <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{children}</div>}
    </div>
  );
  return (
    <>
      <AccionesDeLaVista orden={ORDEN_ACCION.info} fueraDelLibro={completa}>
        {info}
      </AccionesDeLaVista>
      <AccionesDeLaVista fueraDelLibro={null}>{children}</AccionesDeLaVista>
    </>
  );
}
