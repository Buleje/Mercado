import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useGeolocation,
  buildReferenceSuggestions,
} from "@/components/checkout/hooks/useGeolocation";
import { useCheckoutState } from "@/components/checkout/hooks/useCheckoutState";

const mockFetch = vi.fn();

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  // limpiar mock de geolocation
  delete (globalThis as unknown as { navigator: { geolocation?: unknown } })
    .navigator?.geolocation;
});

function mockGeolocation(coords: { latitude: number; longitude: number }) {
  Object.defineProperty(globalThis.navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn((success: PositionCallback) => {
        success({
          coords: {
            ...coords,
            accuracy: 10,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
            toJSON: () => ({}),
          },
          timestamp: Date.now(),
          toJSON: () => ({}),
        } as GeolocationPosition);
      }),
    },
  });
}

function mockGeolocationError(code: number) {
  Object.defineProperty(globalThis.navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn(
        (_success: PositionCallback, error: PositionErrorCallback) => {
          error({
            code,
            message: "denied",
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          } as GeolocationPositionError);
        }
      ),
    },
  });
}

describe("buildReferenceSuggestions", () => {
  it("genera sugerencias a partir de un address completo", () => {
    const sugs = buildReferenceSuggestions({
      amenity: "Plaza Pucallpa",
      shop: "Wong",
      road: "Av. Centenario",
      house_number: "123",
      neighbourhood: "Centro",
    });
    expect(sugs).toContain("Cerca de Plaza Pucallpa");
    expect(sugs).toContain("Frente a tienda: Wong");
    expect(sugs).toContain("Av. Centenario 123");
    expect(sugs.length).toBeLessThanOrEqual(6);
  });

  it("siempre incluye landmarks genéricos cuando hay espacio", () => {
    const sugs = buildReferenceSuggestions({});
    expect(sugs.some((s) => s.toLowerCase().includes("color"))).toBe(true);
  });

  it("limita a 6 sugerencias", () => {
    const sugs = buildReferenceSuggestions({
      amenity: "x",
      shop: "y",
      building: "z",
      neighbourhood: "n",
      suburb: "s",
      road: "r",
      house_number: "1",
    });
    expect(sugs.length).toBeLessThanOrEqual(6);
  });
});

describe("useGeolocation", () => {
  it("cuando el navegador no soporta GPS, setea geoError", () => {
    delete (globalThis.navigator as unknown as { geolocation?: unknown })
      .geolocation;
    const { result } = renderHook(() => {
      const { state, dispatch } = useCheckoutState();
      const geo = useGeolocation({ dispatch });
      return { state, geo };
    });

    act(() => result.current.geo.requestGeolocation());
    expect(result.current.state.ui.geoError).toContain("no soporta");
  });

  it("setea coords y address cuando GPS responde con éxito", async () => {
    mockGeolocation({ latitude: -8.4, longitude: -74.55 });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        address: {
          road: "Jr. Ucayali",
          house_number: "450",
          suburb: "Centro",
          amenity: "Mercado",
        },
      }),
    });

    const { result } = renderHook(() => {
      const { state, dispatch } = useCheckoutState();
      const geo = useGeolocation({ dispatch });
      return { state, geo };
    });

    await act(async () => {
      result.current.geo.requestGeolocation();
    });

    await waitFor(() => {
      expect(result.current.state.address.location).toContain("GPS:");
    });
    expect(result.current.state.address.mapLat).toBeCloseTo(-8.4, 4);
    expect(result.current.state.ui.loadingGeo).toBe(false);
    expect(result.current.state.address.reference.length).toBeGreaterThan(0);
  });

  it("muestra mensaje de permiso denegado cuando code=1", async () => {
    mockGeolocationError(1);

    const { result } = renderHook(() => {
      const { state, dispatch } = useCheckoutState();
      const geo = useGeolocation({ dispatch });
      return { state, geo };
    });

    await act(async () => {
      result.current.geo.requestGeolocation();
    });

    expect(result.current.state.ui.geoError).toContain("Permiso denegado");
    expect(result.current.state.ui.loadingGeo).toBe(false);
  });

  it("muestra mensaje de timeout cuando code=3", async () => {
    mockGeolocationError(3);

    const { result } = renderHook(() => {
      const { state, dispatch } = useCheckoutState();
      const geo = useGeolocation({ dispatch });
      return { state, geo };
    });

    await act(async () => {
      result.current.geo.requestGeolocation();
    });

    expect(result.current.state.ui.geoError).toContain("tardó demasiado");
  });

  it("cuando el reverse geocode falla, deja location con solo GPS", async () => {
    mockGeolocation({ latitude: -8.4, longitude: -74.55 });
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    });

    const { result } = renderHook(() => {
      const { state, dispatch } = useCheckoutState();
      const geo = useGeolocation({ dispatch });
      return { state, geo };
    });

    await act(async () => {
      result.current.geo.requestGeolocation();
    });

    await waitFor(() => {
      expect(result.current.state.address.location).toMatch(/^GPS:/);
    });
  });
});
