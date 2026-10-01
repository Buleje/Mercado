/**
 * Tests — AIStatusBanner
 * Cubre: gate de rol (2026-09-14) — almacenero no debe disparar el fetch a
 * /api/ai-assistant/health (requireAdmin sólo deja admin/owner y devolvía 403
 * en cada carga del panel); admin sí lo dispara.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

import AIStatusBanner from "@/components/admin/AIStatusBanner";

function mockFetchOnce(status: "healthy" | "critical") {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ status, errors: 0, checks: [] }),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("AIStatusBanner", () => {
  it("rol almacenero + authReady → NO llama a /api/ai-assistant/health", async () => {
    const fetchMock = mockFetchOnce("critical");
    render(<AIStatusBanner userRole="almacenero" authReady={true} />);

    // Le damos una vuelta de microtasks/timers para que, si el componente
    // fuera a pedir, ya lo hubiera hecho.
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });

  it("rol admin + authReady → SÍ llama a /api/ai-assistant/health", async () => {
    const fetchMock = mockFetchOnce("critical");
    render(<AIStatusBanner userRole="admin" authReady={true} />);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/ai-assistant/health",
        expect.objectContaining({ credentials: "include" }),
      ),
    );
  });

  it("authReady=false (auth en curso) → no pide aunque el rol optimista sea admin", async () => {
    const fetchMock = mockFetchOnce("critical");
    render(<AIStatusBanner userRole="admin" authReady={false} />);

    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });
});
