"use client";

/**
 * El modo patio se carga en cliente y aparte del bundle del panel.
 *
 * Va con `ssr: false` porque la pantalla depende de IndexedDB y de
 * `navigator.onLine` (la cola de `patio-cola`): renderizarla en el servidor
 * daría un HTML que dice "con señal" y "0 por subir" y después parpadea a la
 * verdad — justo en la pantalla que se abre para saber si hay señal.
 */

import dynamic from "next/dynamic";
import { Loader2 } from "@buleje/design-system/icons";

const PatioModo = dynamic(() => import("@/components/admin/forestal/PatioModo"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-dvh items-center justify-center gap-2 bg-[var(--surface-canvas)] text-base text-[var(--text-secondary)]">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Abriendo el patio…
    </div>
  ),
});

export default function PatioLoader() {
  return <PatioModo />;
}
