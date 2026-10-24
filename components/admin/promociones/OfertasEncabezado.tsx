"use client";

import type { ReactNode } from "react";
import { SectionTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";

/**
 * La fila de cabecera de Ofertas y cupones: título + ⓘ, las secciones (`barra`) y, a la derecha,
 * la acción principal de la sección y «Más». Una sola fila para Ofertas, Cupones y Cupones del marketplace;
 * en el celular las secciones bajan a su propia línea.
 */
export default function OfertasEncabezado({
  barra,
  ayuda,
  children,
}: {
  barra?: ReactNode;
  ayuda: { title: string; what: string; affects: string; example: string };
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2 xl:flex-nowrap">
      <div className="flex shrink-0 items-center gap-2">
        <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Ofertas y cupones</SectionTitle>
        <InfoTip {...ayuda} />
      </div>
      {barra && <div className="order-last w-full min-w-0 sm:order-none sm:w-auto xl:shrink-0">{barra}</div>}
      <div className="ml-auto flex min-w-0 items-center gap-2">{children}</div>
    </div>
  );
}
