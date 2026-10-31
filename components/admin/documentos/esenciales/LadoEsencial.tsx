"use client";

import { useLayoutEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BordeDeAncho } from "@/components/admin/layout/BordeDeAncho";
import { useColumnaDerecha } from "@/components/admin/layout/columna-derecha";
import CajonLateral from "./CajonLateral";
import { ANCHO_ESENCIAL, type MedidaPanelEsencial } from "./use-ancho-panel-esencial";

/**
 * Dónde se dibuja el panel de Esenciales fuera de la vista: en la columna de la
 * derecha del panel (`hueco`, de arriba hasta abajo, con su borde arrastrable)
 * o, si la pantalla no da, en un cajón encima. En la columna pide su ancho con
 * `fijarAncho("abajo")`: el encabezado, las tarjetas y el «+» se corren solos.
 */
export default function LadoEsencial({ hueco, etiqueta, medida, onCerrar, children }: {
  /** El hueco de abajo de la columna derecha; `null` = cajón. */
  hueco: HTMLElement | null;
  etiqueta: string;
  medida: MedidaPanelEsencial;
  onCerrar: () => void;
  children: ReactNode;
}) {
  const fijarAncho = useColumnaDerecha()?.fijarAncho;
  const { visible } = medida;
  // Antes de pintar: si no, la columna se dibuja un cuadro en 26rem y salta al ancho guardado.
  useLayoutEffect(() => {
    if (!hueco || !fijarAncho) return undefined;
    fijarAncho("abajo", visible);
    return () => fijarAncho("abajo", null);
  }, [hueco, fijarAncho, visible]);

  if (!hueco) {
    return <CajonLateral etiqueta={etiqueta} amplio={medida.amplio} onCerrar={onCerrar}>{children}</CajonLateral>;
  }
  return createPortal(
    // Pegada al borde, de arriba hasta abajo; con el aviso de la agenda abierto, él va arriba y esto abajo.
    <aside
      className="relative flex min-h-0 flex-1 flex-col border-l border-[var(--rule-base)] bg-[var(--surface-raised)]"
      aria-label={etiqueta}
      data-qa="esencial-columna"
      data-ancho={visible}
    >
      <BordeDeAncho
        valor={visible}
        min={Math.min(ANCHO_ESENCIAL.min, medida.tope)}
        max={medida.tope}
        acotar={medida.acotar}
        onArrastre={medida.setArrastre}
        onAncho={medida.guardar}
        etiqueta="Ancho del panel: arrastra o usa las flechas"
        dataQa="esencial-borde"
      />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4" data-qa="esencial-columna-scroll">
        {children}
      </div>
    </aside>,
    hueco,
  );
}
