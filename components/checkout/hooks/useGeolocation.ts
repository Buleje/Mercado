import { useCallback } from "react";
import type { CheckoutDispatch } from "./useCheckoutState";

/**
 * useGeolocation — pide GPS al navegador, hace reverse geocoding contra
 * Nominatim (OpenStreetMap) y vuelca todo (calle, número, sugerencias
 * de referencia, distancia) al state del checkout vía dispatch.
 *
 * Toda la lógica de side effects vive aquí; el componente solo
 * dispara `requestGeolocation()`.
 */

const NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse";

type ReverseAddress = {
  road?: string;
  house_number?: string;
  suburb?: string;
  neighbourhood?: string;
  amenity?: string;
  shop?: string;
  building?: string;
};

type ReverseResponse = {
  address?: ReverseAddress;
};

function detectStreetType(roadName: string): { type: string; name: string } {
  const lower = roadName.toLowerCase();
  if (lower.includes("avenida") || lower.includes("av."))
    return { type: "Avenida", name: roadName.replace(/avenida|av\./gi, "").trim() };
  if (lower.includes("jirón") || lower.includes("jr."))
    return { type: "Jirón", name: roadName.replace(/jirón|jr\./gi, "").trim() };
  if (lower.includes("pasaje") || lower.includes("psje."))
    return { type: "Pasaje", name: roadName.replace(/pasaje|psje\./gi, "").trim() };
  return { type: "Calle", name: roadName };
}

export function buildReferenceSuggestions(addr: ReverseAddress): string[] {
  const suggestions: string[] = [];
  if (addr.amenity) suggestions.push(`Cerca de ${addr.amenity}`);
  if (addr.shop) suggestions.push(`Frente a tienda: ${addr.shop}`);
  if (addr.building) suggestions.push(`Edificio ${addr.building}`);
  if (addr.neighbourhood) suggestions.push(`Barrio ${addr.neighbourhood}`);
  if (addr.suburb) suggestions.push(`Zona ${addr.suburb}`);
  if (addr.road && addr.house_number)
    suggestions.push(`${addr.road} ${addr.house_number}`);

  const landmarks = [
    "Casa de color visible desde la calle",
    "Con reja/portón principal",
    "Esquina de la cuadra",
  ];
  suggestions.push(...landmarks);

  return [...new Set(suggestions)].slice(0, 6);
}

type Args = { dispatch: CheckoutDispatch };

export function useGeolocation({ dispatch }: Args) {
  const requestGeolocation = useCallback(() => {
    if (!navigator.geolocation) {
      dispatch({
        type: "SET_UI",
        patch: {
          geoError:
            "Tu navegador no soporta geolocalización. Ingresa tu dirección manualmente.",
        },
      });
      return;
    }

    dispatch({
      type: "SET_UI",
      patch: { loadingGeo: true, geoError: "", geoSuggested: true },
    });

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        dispatch({ type: "SET_ADDRESS", patch: { mapLat: lat, mapLon: lon } });

        try {
          const url = `${NOMINATIM_REVERSE}?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
          const res = await fetch(url, { headers: { "Accept-Language": "es" } });
          if (!res.ok) throw new Error("reverse failed");
          const data = (await res.json()) as ReverseResponse;
          const addr = data.address;
          if (!addr) throw new Error("no address");

          if (addr.road) {
            const { type, name } = detectStreetType(addr.road);
            dispatch({
              type: "SET_ADDRESS",
              patch: { streetType: type, streetName: name },
            });
          }
          if (addr.house_number) {
            dispatch({
              type: "SET_ADDRESS",
              patch: { streetNumber: addr.house_number },
            });
          }

          const locationParts: string[] = [];
          if (addr.road) locationParts.push(addr.road);
          if (addr.house_number) locationParts.push(addr.house_number);
          if (addr.suburb || addr.neighbourhood)
            locationParts.push((addr.suburb || addr.neighbourhood) as string);
          locationParts.push(`GPS: ${lat.toFixed(5)}, ${lon.toFixed(5)}`);
          dispatch({
            type: "SET_ADDRESS",
            patch: { location: locationParts.join(", "), detailed: false },
          });

          const suggestions = buildReferenceSuggestions(addr);
          dispatch({
            type: "SET_UI",
            patch: { refSuggestions: suggestions, showRefSuggestions: true },
          });
          if (suggestions.length > 0) {
            dispatch({
              type: "SET_ADDRESS",
              patch: { reference: suggestions[0] },
            });
          }
        } catch {
          dispatch({
            type: "SET_ADDRESS",
            patch: { location: `GPS: ${lat.toFixed(5)}, ${lon.toFixed(5)}` },
          });
        }

        dispatch({ type: "SET_UI", patch: { loadingGeo: false } });
      },
      (err) => {
        const msg =
          err.code === 1
            ? "Permiso denegado. Habilita el GPS en tu navegador e intenta de nuevo."
            : err.code === 3
              ? "GPS tardó demasiado. Ingresa tu dirección manualmente."
              : "No se pudo obtener tu ubicación. Ingresa tu dirección manualmente.";
        dispatch({ type: "SET_UI", patch: { loadingGeo: false, geoError: msg } });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, [dispatch]);

  const fetchReferenceSuggestion = useCallback(
    async (lat: number, lon: number) => {
      try {
        const url = `${NOMINATIM_REVERSE}?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
        const res = await fetch(url, { headers: { "Accept-Language": "es" } });
        if (!res.ok) return;
        const data = (await res.json()) as ReverseResponse;
        if (!data.address) return;
        const suggestions = buildReferenceSuggestions(data.address);
        dispatch({
          type: "SET_UI",
          patch: { refSuggestions: suggestions, showRefSuggestions: true },
        });
      } catch {
        /* silenciar */
      }
    },
    [dispatch]
  );

  return { requestGeolocation, fetchReferenceSuggestion };
}
