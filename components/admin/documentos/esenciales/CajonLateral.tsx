"use client";

import { useRef } from "react";
import { useModalAccesible } from "@/hooks/use-modal-accesible";

/**
 * El panel de Esenciales cuando no entra al costado (celular o pantalla
 * angosta): se abre encima, desde la derecha, sobre el velo de los modales
 * (tocarlo cierra) y con Escape. Cede el teclado si se abre otra ventana
 * encima (la vista previa de un papel).
 */
export default function CajonLateral({ etiqueta, onCerrar, children }: {
  etiqueta: string;
  onCerrar: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useModalAccesible(ref, { onCerrar });
  return (
    <div
      className="modal-backdrop !items-stretch !justify-end"
      onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}
      data-qa="esencial-cajon"
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={etiqueta}
        tabIndex={-1}
        className="h-full w-full max-w-[28rem] overflow-y-auto bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-xl)] outline-none"
      >
        {children}
      </div>
    </div>
  );
}
