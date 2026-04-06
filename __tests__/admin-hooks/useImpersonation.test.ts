import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useImpersonation } from "@/app/admin/_hooks/useImpersonation";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
  writable: true,
});

const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof global.fetch;

function jsonResponse(data: unknown, ok = true): Response {
  return {
    ok,
    json: async () => data,
    status: ok ? 200 : 404,
    statusText: ok ? "OK" : "Not Found",
    headers: new Headers(),
    redirected: false,
    type: "default",
    url: "",
    clone: () => jsonResponse(data, ok),
    body: null,
    bodyUsed: false,
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob(),
    formData: async () => new FormData(),
    text: async () => JSON.stringify(data),
    bytes: async () => new Uint8Array(),
  } as Response;
}

const originalLocation = window.location;

describe("useImpersonation", () => {
  beforeEach(() => {
    localStorageMock.clear();
    fetchMock.mockReset();
    // Default seguro: cualquier fetch no mockeado retorna {} para no romper hooks
    fetchMock.mockResolvedValue(jsonResponse({}));
    // Mock window.location.href setter
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, href: "http://localhost:3000/admin" },
      writable: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("inicializa sin impersonation cuando no hay flags en localStorage", () => {
    const { result } = renderHook(() => useImpersonation());

    expect(result.current.isSuperAdminImpersonating).toBe(false);
    expect(result.current.activeTenantName).toBe(null);
    expect(result.current.activeTenantSlug).toBe(null);
    expect(result.current.activeTenantType).toBe("tienda");
    expect(result.current.activeTenantLogo).toBe(null);
  });

  it("detecta impersonation cuando 'superadmin-impersonate-tenant' está seteado", async () => {
    localStorageMock.setItem("superadmin-impersonate-tenant", "tienda-demo");
    fetchMock.mockResolvedValue(
      jsonResponse({
        businessName: "Tienda Demo",
        logoUrl: "https://example.com/logo.png",
        storeType: "tienda",
      })
    );

    const { result } = renderHook(() => useImpersonation());

    await waitFor(() => expect(result.current.activeTenantName).toBe("Tienda Demo"));

    expect(result.current.isSuperAdminImpersonating).toBe(true);
    expect(result.current.activeTenantSlug).toBe("tienda-demo");
    expect(result.current.activeTenantLogo).toBe("https://example.com/logo.png");
    expect(result.current.activeTenantType).toBe("tienda");
  });

  it("usa active-tenant-slug si no hay impersonation", async () => {
    localStorageMock.setItem("active-tenant-slug", "mi-bodega");
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ businessName: "Mi Bodega" }))
    );

    const { result } = renderHook(() => useImpersonation());

    await waitFor(() => expect(result.current.activeTenantName).toBe("Mi Bodega"));
    expect(result.current.activeTenantSlug).toBe("mi-bodega");
    expect(result.current.isSuperAdminImpersonating).toBe(false);
  });

  it("salta el fetch si el slug es 'main'", async () => {
    localStorageMock.setItem("active-tenant-slug", "main");
    const { result } = renderHook(() => useImpersonation());

    // Esperar un tick para asegurar que el effect corrió
    await new Promise((r) => setTimeout(r, 50));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.activeTenantSlug).toBe(null);
  });

  it("detecta tenant tipo proveedor desde storeType", async () => {
    localStorageMock.setItem("active-tenant-slug", "prov-1");
    fetchMock.mockResolvedValue(
      jsonResponse({ businessName: "Proveedor SA", storeType: "proveedor" })
    );

    const { result } = renderHook(() => useImpersonation());

    await waitFor(() => expect(result.current.activeTenantType).toBe("proveedor"));
  });

  it("detecta tenant tipo delivery desde mode", async () => {
    localStorageMock.setItem("active-tenant-slug", "del-1");
    fetchMock.mockResolvedValue(
      jsonResponse({ businessName: "Delivery Lima", mode: "delivery" })
    );

    const { result } = renderHook(() => useImpersonation());

    await waitFor(() => expect(result.current.activeTenantType).toBe("delivery"));
  });

  it("default a 'tienda' si no hay storeType ni mode", async () => {
    localStorageMock.setItem("active-tenant-slug", "x");
    fetchMock.mockResolvedValue(jsonResponse({ businessName: "Bar X" }));

    const { result } = renderHook(() => useImpersonation());

    await waitFor(() => expect(result.current.activeTenantName).toBe("Bar X"));
    expect(result.current.activeTenantType).toBe("tienda");
  });

  it("handleExit limpia localStorage y redirige a /superadmin", () => {
    localStorageMock.setItem("superadmin-impersonate-tenant", "x");
    localStorageMock.setItem("active-tenant-slug", "y");

    const { result } = renderHook(() => useImpersonation());

    act(() => {
      result.current.handleExit();
    });

    expect(localStorageMock.getItem("superadmin-impersonate-tenant")).toBe(null);
    expect(localStorageMock.getItem("active-tenant-slug")).toBe(null);
    expect(result.current.isSuperAdminImpersonating).toBe(false);
    expect(window.location.href).toBe("/superadmin");
  });

  it("ignora errores del fetch silenciosamente", async () => {
    localStorageMock.setItem("active-tenant-slug", "x");
    fetchMock.mockRejectedValue(new Error("Network down"));

    const { result } = renderHook(() => useImpersonation());

    await new Promise((r) => setTimeout(r, 50));

    // No throw, mantiene defaults
    expect(result.current.activeTenantName).toBe(null);
    expect(result.current.activeTenantSlug).toBe("x");
  });
});
