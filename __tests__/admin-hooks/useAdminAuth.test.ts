import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// ── Mock cachedJson ANTES de importar el hook ────────────────────────────────
// El hook usa `cachedJson` (lib/client-cache-fetch) que tiene estado global
// (cache + inflight Maps) compartido entre tests. Sin este mock, la respuesta
// del primer test queda cacheada y los tests siguientes nunca invocan el
// fetchMock — authReady nunca llega a true → timeout 1 000 ms × 5 tests.
//
// Solución: reemplazar cachedJson por una función transparente que delega
// directo a `fetch` (sin cache ni dedup). Así cada test controla 100% qué
// devuelve su fetchMock sin interferencia de tests anteriores.
vi.mock("@/lib/client-cache-fetch", () => ({
  cachedJson: async <T>(url: string, _ttl?: number, init?: RequestInit): Promise<T | null> => {
    const r = await fetch(url, { credentials: "include", ...init });
    if (!r.ok) return null;
    return r.json() as Promise<T>;
  },
  invalidateCachedJson: vi.fn(),
}));

import { useAdminAuth } from "@/app/admin/_hooks/useAdminAuth";

// Mock global fetch
const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof global.fetch;

function jsonResponse(data: unknown, ok = true): Response {
  return {
    ok,
    json: async () => data,
    status: ok ? 200 : 401,
    statusText: ok ? "OK" : "Unauthorized",
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

describe("useAdminAuth", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    // Default seguro para evitar undefined.then en hooks que usan fetch
    fetchMock.mockResolvedValue(jsonResponse({}));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("inicializa con valores por defecto antes del fetch", () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    const onUnauth = vi.fn();
    const { result } = renderHook(() => useAdminAuth(onUnauth));

    expect(result.current.userRole).toBe("admin");
    expect(result.current.userName).toBe("Admin");
    expect(result.current.authReady).toBe(false);
    expect(result.current.savedRolePerms).toBe(null);
    expect(result.current.storeMode).toBe("whatsapp");
  });

  it("setea storeMode y rolePermissions desde /api/settings", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/settings") {
        return Promise.resolve(
          jsonResponse({
            mode: "delivery",
            rolePermissions: { cajero: ["ventas", "caja"] },
          })
        );
      }
      if (url === "/api/auth/me") {
        return Promise.resolve(
          jsonResponse({ role: "admin", username: "brandon" })
        );
      }
      return Promise.resolve(jsonResponse({}));
    });

    const onUnauth = vi.fn();
    const { result } = renderHook(() => useAdminAuth(onUnauth));

    await waitFor(() => expect(result.current.authReady).toBe(true));

    expect(result.current.storeMode).toBe("delivery");
    expect(result.current.savedRolePerms).toEqual({ cajero: ["ventas", "caja"] });
    expect(result.current.userRole).toBe("admin");
    expect(result.current.userName).toBe("brandon");
  });

  it("autentica via /api/auth/me y setea authReady=true", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/settings") return Promise.resolve(jsonResponse({}));
      if (url === "/api/auth/me") {
        return Promise.resolve(jsonResponse({ role: "cajero", username: "ana" }));
      }
      return Promise.resolve(jsonResponse({}));
    });

    const onUnauth = vi.fn();
    const { result } = renderHook(() => useAdminAuth(onUnauth));

    await waitFor(() => expect(result.current.authReady).toBe(true));

    expect(result.current.userRole).toBe("cajero");
    expect(result.current.userName).toBe("ana");
    expect(onUnauth).not.toHaveBeenCalled();
  });

  it("usa fallback de username='admin' si /api/auth/me no manda username", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/settings") return Promise.resolve(jsonResponse({}));
      if (url === "/api/auth/me") return Promise.resolve(jsonResponse({ role: "admin" }));
      return Promise.resolve(jsonResponse({}));
    });

    const onUnauth = vi.fn();
    const { result } = renderHook(() => useAdminAuth(onUnauth));

    await waitFor(() => expect(result.current.authReady).toBe(true));
    expect(result.current.userName).toBe("admin");
  });

  it("intenta bypass admin si /api/auth/me retorna 401 y bypass está habilitado", async () => {
    let settingsCallCount = 0;
    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (url === "/api/settings") {
        settingsCallCount++;
        // Primera llamada (carga inicial): sin bypass
        // Segunda llamada (en el catch): con bypass
        return Promise.resolve(
          jsonResponse({ adminBypassLogin: settingsCallCount >= 2 })
        );
      }
      if (url === "/api/auth/me") {
        return Promise.resolve(jsonResponse({}, false));
      }
      if (url === "/api/auth/bypass" && opts?.method === "POST") {
        return Promise.resolve(
          jsonResponse({ role: "almacenero", name: "guest" })
        );
      }
      return Promise.resolve(jsonResponse({}));
    });

    const onUnauth = vi.fn();
    const { result } = renderHook(() => useAdminAuth(onUnauth));

    await waitFor(() => expect(result.current.authReady).toBe(true));

    expect(result.current.userRole).toBe("almacenero");
    expect(result.current.userName).toBe("guest");
    expect(onUnauth).not.toHaveBeenCalled();
  });

  it("ejecuta onUnauth si auth/me falla y bypass NO está habilitado", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/settings") {
        return Promise.resolve(jsonResponse({ adminBypassLogin: false }));
      }
      if (url === "/api/auth/me") {
        return Promise.resolve(jsonResponse({}, false));
      }
      return Promise.resolve(jsonResponse({}));
    });

    const onUnauth = vi.fn();
    renderHook(() => useAdminAuth(onUnauth));

    await waitFor(() => expect(onUnauth).toHaveBeenCalledTimes(1));
  });

  it("ejecuta onUnauth si bypass también falla", async () => {
    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (url === "/api/settings") {
        return Promise.resolve(jsonResponse({ adminBypassLogin: true }));
      }
      if (url === "/api/auth/me") {
        return Promise.resolve(jsonResponse({}, false));
      }
      if (url === "/api/auth/bypass" && opts?.method === "POST") {
        return Promise.resolve(jsonResponse({}, false));
      }
      return Promise.resolve(jsonResponse({}));
    });

    const onUnauth = vi.fn();
    renderHook(() => useAdminAuth(onUnauth));

    await waitFor(() => expect(onUnauth).toHaveBeenCalledTimes(1));
  });

  it("setStoreModeState permite mutar el storeMode externamente", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/settings") return Promise.resolve(jsonResponse({}));
      if (url === "/api/auth/me") {
        return Promise.resolve(jsonResponse({ role: "admin", username: "x" }));
      }
      return Promise.resolve(jsonResponse({}));
    });

    const onUnauth = vi.fn();
    const { result } = renderHook(() => useAdminAuth(onUnauth));

    await waitFor(() => expect(result.current.authReady).toBe(true));
    expect(result.current.storeMode).toBe("whatsapp");

    // El setter está expuesto para que SettingsModule pueda cambiarlo en vivo
    expect(typeof result.current.setStoreModeState).toBe("function");
  });
});
