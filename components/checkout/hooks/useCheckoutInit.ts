import { useEffect } from "react";
import type { Customer, SavedLocation } from "@/contexts/customer-context";
import { coordsFromLocation } from "@/lib/geo-utils";
import {
  INITIAL_CHECKOUT_STATE,
} from "./useCheckoutState";
import type { UsePhoneSearchResult } from "./usePhoneSearch";
import type { CheckoutState } from "../types";

/**
 * useCheckoutInit — re-inicializa el state del checkout cada vez que
 * el modal se abre. Hidrata datos del cliente persistido y selecciona
 * la primera dirección guardada como activa.
 *
 * Aislado para poder testearlo y para mantener `CheckoutModal.tsx`
 * por debajo de 250 líneas.
 */

type Args = {
  open: boolean;
  customer: Customer | null;
  locations: SavedLocation[];
  storeLat: number;
  storeLon: number;
  reset: (next: CheckoutState) => void;
  phoneSearch: UsePhoneSearchResult;
  setEditingCustomerData: (v: boolean) => void;
  setSkippedAccount: (v: boolean) => void;
  fetchLoyaltyPoints: (phone: string) => Promise<void>;
};

export function useCheckoutInit({
  open,
  customer,
  locations,
  storeLat,
  storeLon,
  reset,
  phoneSearch,
  setEditingCustomerData,
  setSkippedAccount,
  fetchLoyaltyPoints,
}: Args) {
  useEffect(() => {
    if (!open) return;

    const initialCoords = customer?.location
      ? coordsFromLocation(customer.location, storeLat, storeLon)
      : { lat: storeLat, lon: storeLon };

    let initialSelectedLocId: string | null = null;
    let initialLocation = customer?.location ?? "";
    let initialReference = customer?.reference ?? "";
    if (locations.length > 0) {
      const activeId =
        customer?.activeLocationId ?? locations[0]?.id ?? "default";
      const activeLoc =
        locations.find((l) => l.id === activeId) ?? locations[0];
      initialSelectedLocId = activeId;
      initialLocation = activeLoc.location;
      initialReference = activeLoc.reference;
    }

    // UX 2026-05-05: si el cliente ya está autenticado (tiene phone+name
    // persistidos del context), saltamos la pantalla "¿Cómo quieres
    // continuar?" y vamos directo a "Datos" con la card verificada del
    // cliente. Desde ahí puede confirmar con sus datos guardados o usar
    // el botón "Volver" para regresar al selector de cuenta y entrar con
    // otro teléfono / Google.
    const isAuthed = Boolean(customer?.phone && customer?.name);

    reset({
      ...INITIAL_CHECKOUT_STATE,
      step: isAuthed ? "datos" : "cuenta",
      customer: {
        dni: customer?.dni ?? "",
        name: customer?.name ?? "",
        phone: customer?.phone ?? "",
      },
      address: {
        ...INITIAL_CHECKOUT_STATE.address,
        location: initialLocation,
        reference: initialReference,
        selectedLocId: initialSelectedLocId,
        mapLat: initialCoords.lat,
        mapLon: initialCoords.lon,
      },
    });

    phoneSearch.reset();
    setEditingCustomerData(false);
    setSkippedAccount(false);

    if (customer?.phone) {
      fetchLoyaltyPoints(customer.phone);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
