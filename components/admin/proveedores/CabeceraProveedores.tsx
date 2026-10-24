"use client";

import type { ReactNode } from "react";
import { SectionTitle } from "@buleje/design-system";
import { BarraDeSecciones, idPestanaDeSeccion } from "@/components/admin/shared/BarraDeSecciones";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";

type SeccionProveedores = "lista" | "comparar";
export const ID_PANEL_PROVEEDORES = "panel-proveedores";
export { idPestanaDeSeccion };

const SECCIONES = [
  { clave: "lista", rotulo: "Lista" },
  { clave: "comparar", rotulo: "Comparar" },
] as const;

export interface BarraProveedores {
  activa: SeccionProveedores;
  onCambiar: (s: SeccionProveedores) => void;
}

/**
 * Una fila: título · secciones (lista / comparar) · lo de la vista a la derecha
 * (`children`: Indicadores, «Nuevo proveedor», «Más»). A 400 px las secciones
 * bajan a su propia fila.
 */
export default function CabeceraProveedores({ barra, children }: { barra?: BarraProveedores; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2 xl:flex-nowrap">
      <div className="flex shrink-0 items-center gap-2">
        <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Proveedores</SectionTitle>
        <InfoTip
          title="Proveedores"
          what="A quién le compras: sus datos, cuánto les debes y cómo te entregan. «Comparar» pone a tus proveedores lado a lado por puntaje, precio por producto y precios del mercado."
          affects="Los días de entrega de la ficha fijan el punto de reorden de Sugerencias. Lo que les debes se paga en Por pagar."
          example="Distribuidora Ucayali entrega en 3 días y le debes S/ 140: en la lista sale con su deuda; en Comparar ves si otro te cobra menos."
        />
      </div>
      {barra && (
        <div className="order-last w-full min-w-0 sm:order-none sm:w-auto xl:shrink-0">
          <BarraDeSecciones secciones={SECCIONES} activa={barra.activa} onCambiar={barra.onCambiar} etiqueta="Secciones de Proveedores" idPanel={ID_PANEL_PROVEEDORES} />
        </div>
      )}
      {children && <div className="ml-auto flex min-w-0 items-center gap-2">{children}</div>}
    </div>
  );
}

