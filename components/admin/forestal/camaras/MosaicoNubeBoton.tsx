"use client";

/**
 * «Ver todas en vivo» (ADR-471): aparece con la cuenta de Hik-Connect for
 * Teams vinculada y DOS o más cámaras enlazadas (con una, alcanza su «En vivo»).
 */

import { LayoutGrid } from "@buleje/design-system/icons";
import { BTN } from "./camaras-ui";
import { useVisorNubeContexto } from "./VisorNubeContexto";

interface Props {
  camaras: readonly { id: string; nombre: string }[];
}

export default function MosaicoNubeBoton({ camaras }: Props) {
  const nube = useVisorNubeContexto();
  if (!nube) return null;
  const enlazadas = camaras.filter((c) => nube.enlazada(c.id));
  if (enlazadas.length < 2) return null;
  return (
    <button
      type="button"
      onClick={() => nube.abrirMosaico(enlazadas.map(({ id, nombre }) => ({ id, nombre })))}
      className={`${BTN} ml-auto`}
      title="Todas las cámaras de Hik-Connect a la vez en una ventana"
      data-mosaico-boton
    >
      <LayoutGrid className="h-4 w-4" aria-hidden /> Ver todas en vivo
    </button>
  );
}
