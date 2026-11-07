/**
 * TituloDeVista — la cabecera de UNA vista de Equipo (ley de Brandon 2026-09-19:
 * «una vista = un título»; la explicación va en ⓘ, no en párrafos).
 *
 * Una sola fila: el `SectionTitle` con su ⓘ a la izquierda y, a la derecha, lo
 * que la vista ofrece arriba (enlaces a otra pestaña o la acción principal).
 * Si no entra, la derecha baja entera, sin partir los botones.
 */

import type { ReactNode } from "react";
import { SectionTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";

export interface AyudaDeVista {
  /** Qué es la vista. */
  what: string;
  /** Qué cambia lo que se hace acá y dónde se ve. */
  affects?: string;
  /** Un caso con nombres y montos. */
  example?: string;
}

export interface TituloDeVistaProps {
  titulo: string;
  ayuda: AyudaDeVista;
  /** Enlaces o la acción principal, alineados a la derecha. */
  children?: ReactNode;
}

export default function TituloDeVista({ titulo, ayuda, children }: TituloDeVistaProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <SectionTitle>{titulo}</SectionTitle>
        <InfoTip title={titulo} what={ayuda.what} affects={ayuda.affects} example={ayuda.example} side="bottom" />
      </div>
      {children ? <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">{children}</div> : null}
    </div>
  );
}
