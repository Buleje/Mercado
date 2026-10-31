import dynamic from "next/dynamic";
import { MapPin } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import type { AjustesEstado } from "@/components/admin/settings/use-ajustes";

const LeafletMap = dynamic(() => import("@/components/LeafletMap"), { ssr: false });

/** Mapa para marcar la ubicación del negocio (ventana movible, ADR-420). */
export function ModalUbicacion({ aj }: { aj: AjustesEstado }) {
  const {
    showMapPicker,
    setShowMapPicker,
    pickerLat,
    setPickerLat,
    pickerLon,
    setPickerLon,
    setBusinessLat,
    setBusinessLon,
    setBusinessAddress,
  } = aj;
  return (
    <>
      <AdminModal
        open={showMapPicker}
        onClose={() => setShowMapPicker(false)}
        title="Ubicación del negocio"
        icon={MapPin}
        size="lg"
        claveVentana="settings-ubicacion-negocio"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setShowMapPicker(false)}
              className={button({ variant: "secondary" })}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => setShowMapPicker(false)}
              className={button({ variant: "primary" })}
            >
              Confirmar
            </button>
          </ModalFooter>
        }
      >
        <div className={`flex flex-col gap-3 ${MODAL_BODY}`}>
          <button
            onClick={() => {
              if (!navigator.geolocation) return;
              navigator.geolocation.getCurrentPosition((pos) => {
                setPickerLat(pos.coords.latitude);
                setPickerLon(pos.coords.longitude);
                setBusinessLat(pos.coords.latitude);
                setBusinessLon(pos.coords.longitude);
              });
            }}
            className="self-start inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-[var(--data-success-700)] dark:text-[var(--data-success-500)] bg-[var(--data-success-500)]/12 hover:bg-primary/10 border border-[var(--data-success-500)]/30"
          >
            <MapPin className="h-4 w-4" /> Usar ubicación actual
          </button>
          <LeafletMap
            lat={pickerLat}
            lon={pickerLon}
            zoom={15}
            height={340}
            onPick={(lat: number, lon: number, address: string) => {
              setPickerLat(lat);
              setPickerLon(lon);
              setBusinessLat(lat);
              setBusinessLon(lon);
              setBusinessAddress(address);
            }}
          />
        </div>
      </AdminModal>
    </>
  );
}
