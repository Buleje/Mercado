import { useRef, useId, useCallback } from "react";
import dynamic from "next/dynamic";
import { X, MapPin } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { m } from "@/components/admin/providers";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import type { AjustesEstado } from "@/components/admin/settings/use-ajustes";

const LeafletMap = dynamic(() => import("@/components/LeafletMap"), { ssr: false });

/** Mapa para marcar la ubicación del negocio (ventana movible, ADR-420). */
export function ModalUbicacion({ aj }: { aj: AjustesEstado }) {
  const { showMapPicker, setShowMapPicker, pickerLat, setPickerLat, pickerLon, setPickerLon, setBusinessLat, setBusinessLon, setBusinessAddress } = aj;
  const mapPickerPanelRef = useRef<HTMLDivElement>(null);
  const mapPickerTitleId = useId();
  const cerrarMapPicker = useCallback(() => setShowMapPicker(false), [setShowMapPicker]);
  useModalAccesible(mapPickerPanelRef, { onCerrar: cerrarMapPicker, activo: showMapPicker });
  /** Ventana: se mueve, se achica y se fija (ADR-420). */
  const ventanaMapPicker = useVentanaDeModal(showMapPicker, {
    ref: mapPickerPanelRef,
    aplicarTranslate: true,
    claveMemoria: "settings-ubicacion-negocio",
  });

  return (
    <>
        {showMapPicker && (
          <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/60" role="presentation" onClick={(e) => { if (e.target === e.currentTarget && !ventanaMapPicker.fijado) setShowMapPicker(false); }}>
            <m.div
              ref={mapPickerPanelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={mapPickerTitleId}
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative bg-[var(--surface-raised)] rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
            >
              <div {...ventanaMapPicker.asaProps} className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
                <CardTitle id={mapPickerTitleId} className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Ubicación del negocio</CardTitle>
                <span className="ml-auto flex items-center gap-1">
                  <ControlesDeVentana ventana={ventanaMapPicker} />
                </span>
                <button aria-label="Cerrar" onClick={() => setShowMapPicker(false)} className="p-1.5 rounded-xl text-[var(--text-tertiary)] hover:bg-[var(--rule-soft)]"><X className="h-5 w-5" /></button>
              </div>
              <div className="p-4 flex flex-col gap-3">
                <button onClick={() => { if (!navigator.geolocation) return; navigator.geolocation.getCurrentPosition(pos => { setPickerLat(pos.coords.latitude); setPickerLon(pos.coords.longitude); setBusinessLat(pos.coords.latitude); setBusinessLon(pos.coords.longitude); }); }} className="self-start inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-[var(--data-success-700)] dark:text-[var(--data-success-500)] bg-[var(--data-success-500)]/12 hover:bg-primary/10 border border-[var(--data-success-500)]/30">
                  <MapPin className="h-4 w-4" /> Usar ubicación actual
                </button>
                <LeafletMap lat={pickerLat} lon={pickerLon} zoom={15} height={340} onPick={(lat: number, lon: number, address: string) => { setPickerLat(lat); setPickerLon(lon); setBusinessLat(lat); setBusinessLon(lon); setBusinessAddress(address); }} />
              </div>
              <div className="flex justify-end gap-3 px-5 py-4 border-t border-[var(--rule-soft)]">
                <button onClick={() => setShowMapPicker(false)} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--rule-soft)]">Cancelar</button>
                <button onClick={() => setShowMapPicker(false)} className="px-4 min-h-11 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary/90">Confirmar</button>
              </div>
              <TiradorDeVentana ventana={ventanaMapPicker} />
            </m.div>
          </div>
        )}
    </>
  );
}
