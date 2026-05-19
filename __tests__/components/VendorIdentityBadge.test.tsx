/**
 * Tests — VendorIdentityBadge
 *
 * Audit ref: TD-058 RENIEC/SUNAT scaffold + endpoint.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/csrf-client", () => ({
  csrfHeaders: (h: HeadersInit = {}) => h,
}));

import { VendorIdentityBadge } from "@/components/superadmin/vendor-applications/VendorIdentityBadge";

const fetchMock = vi.fn();

describe("VendorIdentityBadge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("estado idle muestra botón 'Verificar identidad'", () => {
    render(<VendorIdentityBadge ruc="20123456789" />);
    expect(screen.getByText("Verificar identidad")).toBeInTheDocument();
  });

  it("botón disabled si no hay dni ni ruc", () => {
    render(<VendorIdentityBadge />);
    const btn = screen.getByRole("button", { name: /verificar identidad/i });
    expect(btn).toBeDisabled();
  });

  it("RUC verificado ACTIVO+HABIDO → badge verde con razonSocial", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "RUC",
          ok: true,
          invoiceable: true,
          razonSocial: "Bodega Pucallpa SAC",
          estado: "ACTIVO",
          condicion: "HABIDO",
          source: "apisperu",
        }),
        { status: 200 },
      ),
    );
    render(<VendorIdentityBadge ruc="20123456789" />);
    fireEvent.click(screen.getByRole("button", { name: /verificar identidad/i }));

    await waitFor(() => {
      expect(screen.getByTestId("identity-verified")).toBeInTheDocument();
    });
    expect(screen.getByText("Bodega Pucallpa SAC")).toBeInTheDocument();
    expect(screen.getByText(/ACTIVO · HABIDO/)).toBeInTheDocument();
  });

  it("RUC NO HABIDO → badge warning amarillo", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "RUC",
          ok: true,
          invoiceable: false,
          razonSocial: "Mala Bodega SAC",
          estado: "ACTIVO",
          condicion: "NO HABIDO",
          source: "apisperu",
        }),
        { status: 200 },
      ),
    );
    render(<VendorIdentityBadge ruc="20123456789" />);
    fireEvent.click(screen.getByRole("button", { name: /verificar identidad/i }));

    await waitFor(() => {
      expect(screen.getByTestId("identity-warning")).toBeInTheDocument();
    });
    expect(screen.getByText(/no apto para facturar/i)).toBeInTheDocument();
  });

  it("RUC not_found → error rojo", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "RUC",
          ok: false,
          source: "apisperu",
          reason: "not_found",
        }),
        { status: 200 },
      ),
    );
    render(<VendorIdentityBadge ruc="20123456789" />);
    fireEvent.click(screen.getByRole("button", { name: /verificar identidad/i }));

    await waitFor(() => {
      expect(screen.getByTestId("identity-error")).toBeInTheDocument();
    });
    expect(screen.getByText(/no encontrado en sunat/i)).toBeInTheDocument();
  });

  it("DNI verificado con match → badge verde", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "DNI",
          ok: true,
          fullName: "JUAN PEREZ GOMEZ",
          ownerNameMatches: true,
          source: "apisperu",
        }),
        { status: 200 },
      ),
    );
    render(<VendorIdentityBadge dni="12345678" ownerName="Juan Pérez" />);
    fireEvent.click(screen.getByRole("button", { name: /verificar identidad/i }));

    await waitFor(() => {
      expect(screen.getByTestId("identity-verified")).toBeInTheDocument();
    });
    expect(screen.getByText("JUAN PEREZ GOMEZ")).toBeInTheDocument();
    expect(screen.getByText(/match con propietario/i)).toBeInTheDocument();
  });

  it("DNI con name mismatch → warning", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "DNI",
          ok: true,
          fullName: "MARIA LOPEZ",
          ownerNameMatches: false,
          source: "apisperu",
        }),
        { status: 200 },
      ),
    );
    render(<VendorIdentityBadge dni="12345678" ownerName="Juan Pérez" />);
    fireEvent.click(screen.getByRole("button", { name: /verificar identidad/i }));

    await waitFor(() => {
      expect(screen.getByTestId("identity-warning")).toBeInTheDocument();
    });
    expect(screen.getByText(/revisar suplantación/i)).toBeInTheDocument();
  });

  it("HTTP error → muestra error con código", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Sesión inválida" }), { status: 401 }),
    );
    render(<VendorIdentityBadge ruc="20123456789" />);
    fireEvent.click(screen.getByRole("button", { name: /verificar identidad/i }));

    await waitFor(() => {
      expect(screen.getByTestId("identity-error")).toBeInTheDocument();
    });
    expect(screen.getByText("Sesión inválida")).toBeInTheDocument();
  });

  it("onResult callback con true cuando verified", async () => {
    const onResult = vi.fn();
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "RUC",
          ok: true,
          invoiceable: true,
          razonSocial: "X",
          estado: "ACTIVO",
          condicion: "HABIDO",
          source: "apisperu",
        }),
        { status: 200 },
      ),
    );
    render(<VendorIdentityBadge ruc="20123456789" onResult={onResult} />);
    fireEvent.click(screen.getByRole("button", { name: /verificar identidad/i }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
  });

  it("onResult callback con false cuando warning", async () => {
    const onResult = vi.fn();
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "RUC",
          ok: true,
          invoiceable: false,
          razonSocial: "X",
          estado: "ACTIVO",
          condicion: "NO HABIDO",
          source: "apisperu",
        }),
        { status: 200 },
      ),
    );
    render(<VendorIdentityBadge ruc="20123456789" onResult={onResult} />);
    fireEvent.click(screen.getByRole("button", { name: /verificar identidad/i }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  it("network error → error con mensaje", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network down"));
    render(<VendorIdentityBadge ruc="20123456789" />);
    fireEvent.click(screen.getByRole("button", { name: /verificar identidad/i }));

    await waitFor(() => {
      expect(screen.getByTestId("identity-error")).toBeInTheDocument();
    });
    expect(screen.getByText("Network down")).toBeInTheDocument();
  });
});
