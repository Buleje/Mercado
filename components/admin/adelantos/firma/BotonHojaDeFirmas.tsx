"use client";

import { useState } from "react";
import { FileText } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { HojaDeFirmasModal } from "./HojaDeFirmasModal";

/** Botón suelto que abre la hoja de firmas (por si el hilo lo pone fuera del menú ⋯). */
export function BotonHojaDeFirmas({ onListo, className }: { onListo?: () => void; className?: string }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAbierta(true)} className={button({ variant: "secondary", className })} data-hoja-de-firmas>
        <FileText className="h-4 w-4" aria-hidden /> Hoja de firmas
      </button>
      <HojaDeFirmasModal open={abierta} onClose={() => setAbierta(false)} onListo={onListo} />
    </>
  );
}
