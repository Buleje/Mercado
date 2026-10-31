"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Camera, ScanBarcode } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { button } from "@/components/ui-system/button-variants";
import PanelLector from "@/components/admin/inventario/PanelLector";
import type { ListaParaVender } from "@/components/admin/inventario/hooks/use-lista-para-vender";

const BarcodeScanner = dynamic(() => import("@/components/admin/BarcodeScanner"), { ssr: false });

/**
 * «Pasar el lector por la góndola»: la ventana se queda abierta entre producto
 * y producto. El lector USB escribe en la casilla (dígitos + Enter); la cámara
 * lee de corrido y deja el resultado bajo el video.
 */
export default function LectorGondola({ lista }: { lista: ListaParaVender }) {
  const { abierto, setAbierto, camara, setCamara, leer, lectura } = lista;
  const [texto, setTexto] = useState("");
  const casilla = useRef<HTMLInputElement>(null);

  // Tras cada lectura (o al volver de la cámara) la casilla queda lista para el siguiente.
  useEffect(() => {
    if (abierto && !camara && !lectura) casilla.current?.focus();
  }, [abierto, camara, lectura]);

  const enviar = () => { leer(texto); setTexto(""); };

  return (
    <>
      <AdminModal open={abierto && !camara} onClose={() => setAbierto(false)} title="Lista para vender" icon={ScanBarcode} size="md">
        <div className={`${MODAL_BODY} space-y-4`}>
          <div className="flex gap-2">
            <label htmlFor="lector-codigo" className="sr-only">Código de barras</label>
            <input
              id="lector-codigo" ref={casilla} inputMode="numeric" autoComplete="off" value={texto} placeholder="Pasa el lector o escribe el código"
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); enviar(); } }}
              className="h-12 w-full min-w-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-base text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            />
            <button type="button" onClick={() => setCamara(true)} aria-label="Leer con la cámara" title="Leer con la cámara" className={button({ variant: "secondary", size: "icon", className: "shrink-0 rounded-xl" })}>
              <Camera className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <PanelLector lista={lista} />
        </div>
      </AdminModal>
      {abierto && camara && (
        <BarcodeScanner continuo onDetected={leer} onClose={() => setCamara(false)} pie={<PanelLector lista={lista} />} />
      )}
    </>
  );
}
