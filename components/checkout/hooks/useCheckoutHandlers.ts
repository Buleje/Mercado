import { useCallback, type FormEvent } from "react";
import type { Customer, SavedLocation } from "@/contexts/customer-context";
import {
  coordsFromLocation,
  isWithinDeliveryZone,
  MAX_DELIVERY_KM,
} from "@/lib/geo-utils";
import type { CheckoutDispatch } from "./useCheckoutState";
import type { CheckoutState } from "../types";
import type { UsePhoneSearchResult } from "./usePhoneSearch";

/**
 * useCheckoutHandlers — agrupa los handlers de navegación y validación
 * del wizard. Mantiene el orquestador (`CheckoutModal.tsx`) más ligero.
 *
 * No tiene side effects propios — solo combina dispatch + helpers puros.
 */

type Args = {
  state: CheckoutState;
  dispatch: CheckoutDispatch;
  storeLat: number;
  storeLon: number;
  effectiveCustomer: Customer | null;
  phoneSearch: UsePhoneSearchResult;
  setEditingCustomerData: (v: boolean) => void;
  setSkippedAccount: (v: boolean) => void;
  fetchLoyaltyPoints: (phone: string) => Promise<void>;
  fetchReferenceSuggestion: (lat: number, lon: number) => Promise<void>;
  submit: () => Promise<void>;
};

export function useCheckoutHandlers({
  state,
  dispatch,
  storeLat,
  storeLon,
  effectiveCustomer,
  phoneSearch,
  setEditingCustomerData,
  setSkippedAccount,
  fetchLoyaltyPoints,
  fetchReferenceSuggestion,
  submit,
}: Args) {
  const handlePhoneSearchSubmit = useCallback(async () => {
    const found = await phoneSearch.search();
    if (!found) return;

    dispatch({
      type: "SET_CUSTOMER",
      patch: {
        dni: found.dni ?? "",
        name: found.name || "",
        phone: found.phone ?? phoneSearch.query,
      },
    });
    fetchLoyaltyPoints(found.phone ?? phoneSearch.query);

    const foundLocs: SavedLocation[] = found.locations?.length
      ? found.locations
      : found.location
        ? [
            {
              id: "default",
              location: found.location,
              reference: found.reference ?? "",
            },
          ]
        : [];

    if (foundLocs.length > 0) {
      const activeId = found.activeLocationId ?? foundLocs[0].id;
      const activeLoc = foundLocs.find((l) => l.id === activeId) ?? foundLocs[0];
      const coords = coordsFromLocation(
        activeLoc.location ?? "",
        storeLat,
        storeLon
      );
      dispatch({
        type: "SET_ADDRESS",
        patch: {
          selectedLocId: activeId,
          location: activeLoc.location ?? "",
          reference: activeLoc.reference ?? "",
          mapLat: coords.lat,
          mapLon: coords.lon,
        },
      });
    } else {
      const coords = coordsFromLocation(found.location ?? "", storeLat, storeLon);
      dispatch({
        type: "SET_ADDRESS",
        patch: {
          location: found.location ?? "",
          reference: found.reference ?? "",
          mapLat: coords.lat,
          mapLon: coords.lon,
        },
      });
    }
    dispatch({ type: "SET_STEP", step: "datos" });
  }, [phoneSearch, dispatch, storeLat, storeLon, fetchLoyaltyPoints]);

  const handleSkipAccount = useCallback(() => {
    phoneSearch.reset();
    setSkippedAccount(true);
    setEditingCustomerData(false);
    dispatch({ type: "SET_STEP", step: "datos" });
  }, [phoneSearch, setSkippedAccount, setEditingCustomerData, dispatch]);

  const handleSelectLocation = useCallback(
    (loc: SavedLocation) => {
      const coords = coordsFromLocation(loc.location, storeLat, storeLon);
      dispatch({
        type: "SET_ADDRESS",
        patch: {
          selectedLocId: loc.id,
          useNewAddress: false,
          location: loc.location,
          reference: loc.reference,
          mapLat: coords.lat,
          mapLon: coords.lon,
        },
      });
    },
    [dispatch, storeLat, storeLon]
  );

  const handleUseNewAddress = useCallback(() => {
    dispatch({
      type: "SET_ADDRESS",
      patch: {
        useNewAddress: true,
        selectedLocId: null,
        location: "",
        reference: "",
      },
    });
  }, [dispatch]);

  const handleMapPick = useCallback(
    (lat: number, lon: number, addr: string) => {
      dispatch({
        type: "SET_ADDRESS",
        patch: { mapLat: lat, mapLon: lon, location: addr },
      });
      fetchReferenceSuggestion(lat, lon);
    },
    [dispatch, fetchReferenceSuggestion]
  );

  const handleDataSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      dispatch({ type: "SET_UI", patch: { dataError: "" } });

      const effectiveName = (
        state.customer.name || effectiveCustomer?.name || ""
      ).trim();
      const effectiveDni = state.customer.dni.replace(/\D/g, "").slice(0, 8);
      const effectiveLoc = (
        state.address.location || effectiveCustomer?.location || ""
      ).trim();

      if (!effectiveName) {
        dispatch({
          type: "SET_UI",
          patch: { dataError: "Por favor ingresa tu nombre completo." },
        });
        return;
      }
      if (effectiveDni && !/^\d{8}$/.test(effectiveDni)) {
        dispatch({
          type: "SET_UI",
          patch: { dataError: "El DNI debe tener 8 dígitos." },
        });
        return;
      }
      if (!effectiveLoc) {
        dispatch({
          type: "SET_UI",
          patch: { dataError: "Por favor ingresa tu dirección de entrega." },
        });
        return;
      }

      const zone = isWithinDeliveryZone(effectiveLoc, storeLat, storeLon);
      if (zone.distanceKm !== null) {
        dispatch({
          type: "SET_ADDRESS",
          patch: { distanceKm: zone.distanceKm },
        });
      }
      if (!zone.inZone && zone.distanceKm !== null) {
        dispatch({
          type: "SET_UI",
          patch: {
            dataError: `Tu ubicación está a ${zone.distanceKm.toFixed(1)} km. Solo entregamos hasta ${MAX_DELIVERY_KM} km.`,
          },
        });
        return;
      }

      if (
        !effectiveLoc.includes("GPS:") &&
        !state.ui.geoSuggested &&
        typeof navigator !== "undefined" &&
        navigator.geolocation
      ) {
        dispatch({
          type: "SET_UI",
          patch: {
            geoSuggested: true,
            dataError:
              'Tip: Usa "Ubicación GPS" para confirmar que estás en zona de entrega. O continúa si tu dirección es correcta.',
          },
        });
        return;
      }

      dispatch({ type: "SET_STEP", step: "pago" });
    },
    [state, effectiveCustomer, storeLat, storeLon, dispatch]
  );

  const canConfirm =
    state.payment.method === "efectivo" ||
    (state.payment.method === "yape" &&
      /^\d{6,20}$/.test(state.payment.yapeOpNumber.trim()));

  const handlePaymentSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (!canConfirm) {
        dispatch({ type: "SET_PAYMENT", patch: { showHint: true } });
        return;
      }
      submit();
    },
    [canConfirm, dispatch, submit]
  );

  return {
    handlePhoneSearchSubmit,
    handleSkipAccount,
    handleSelectLocation,
    handleUseNewAddress,
    handleMapPick,
    handleDataSubmit,
    handlePaymentSubmit,
    canConfirm,
  };
}
