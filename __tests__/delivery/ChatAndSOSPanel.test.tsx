/**
 * Tests — ChatAndSOSPanel
 *
 * Cubre:
 *  1. Sin pedido activo (currentOrderId=null): NO muestra CustomerContactCard
 *  2. Con pedido activo: muestra CustomerContactCard con datos del cliente
 *  3. Nombre/teléfono opcionales: fallback a "Cliente" y sin acciones
 *  4. WhatsApp link: href correcto con número limpio
 *  5. Call link: href tel: correcto
 *  6. SOS: botón visible siempre (con o sin currentOrderId)
 *  7. SOS expand/collapse: aria-expanded toggle
 *  8. SOS confirm: POST a /api/delivery/me/sos con coords
 *  9. SOS geo denied: fallback 0/0, el POST sigue enviándose
 * 10. SOS toast: aparece después de confirmar
 * 11. Avatar inicial: primera letra del nombre en mayúscula
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";
import ChatAndSOSPanel from "@/components/delivery/ChatAndSOSPanel";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@buleje/design-system/icons", () => ({
  AlertOctagon: () => <svg data-testid="icon-alert-octagon" />,
  Phone: () => <svg data-testid="icon-phone" />,
  MapPin: () => <svg data-testid="icon-map-pin" />,
  ShieldAlert: () => <svg data-testid="icon-shield-alert" />,
}));

vi.mock("@/components/delivery/icons", () => ({
  PhoneRing: () => <svg data-testid="icon-phone-ring" />,
  WhatsAppIcon: () => <svg data-testid="icon-whatsapp" />,
  PinIcon: () => <svg data-testid="icon-pin" />,
}));

// Helper: mock geolocation exitoso
function mockGeoSuccess(lat = -8.379, lng = -74.553) {
  const mockGetCurrentPosition = vi.fn().mockImplementation((onSuccess) => {
    onSuccess({
      coords: { latitude: lat, longitude: lng, accuracy: 10 },
    } as GeolocationPosition);
  });

  Object.defineProperty(navigator, "geolocation", {
    value: { getCurrentPosition: mockGetCurrentPosition },
    writable: true,
    configurable: true,
  });

  return mockGetCurrentPosition;
}

// Helper: mock geolocation denegado
function mockGeoDenied() {
  const mockGetCurrentPosition = vi.fn().mockImplementation(
    (_onSuccess, onError) => {
      onError(new GeolocationPositionError());
    },
  );

  Object.defineProperty(navigator, "geolocation", {
    value: { getCurrentPosition: mockGetCurrentPosition },
    writable: true,
    configurable: true,
  });
}

// Helper: mock fetch SOS
function mockFetchSosOk() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    }),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mockFetchSosOk();

  // CSRF cookie mock
  Object.defineProperty(document, "cookie", {
    value: "csrf-token=test-csrf-token",
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ── Tests: CustomerContactCard ────────────────────────────────────────────────

describe("ChatAndSOSPanel — sin pedido activo", () => {
  it("NO muestra 'Contactar cliente' cuando currentOrderId=null", () => {
    render(<ChatAndSOSPanel currentOrderId={null} />);
    expect(screen.queryByText(/Contactar cliente/i)).toBeNull();
  });

  it("SOS siempre visible aunque no haya pedido activo", () => {
    render(<ChatAndSOSPanel currentOrderId={null} />);
    expect(screen.getByText("Emergencia")).toBeDefined();
  });
});

describe("ChatAndSOSPanel — con pedido activo", () => {
  it("muestra 'Contactar cliente' cuando currentOrderId != null", () => {
    render(
      <ChatAndSOSPanel
        currentOrderId="order-123"
        customerName="Maria García"
        customerPhone="999888777"
      />,
    );
    expect(screen.getByText(/Contactar cliente/i)).toBeDefined();
  });

  it("muestra el nombre del cliente", () => {
    render(
      <ChatAndSOSPanel
        currentOrderId="order-123"
        customerName="Maria García"
        customerPhone="999888777"
      />,
    );
    expect(screen.getByText("Maria García")).toBeDefined();
  });

  it("muestra la ubicación del cliente", () => {
    render(
      <ChatAndSOSPanel
        currentOrderId="order-123"
        customerName="Juan"
        customerLocation="Jr. Lima 123, Pucallpa"
      />,
    );
    expect(screen.getByText("Jr. Lima 123, Pucallpa")).toBeDefined();
  });

  it("fallback 'Sin dirección' cuando no se pasa customerLocation", () => {
    render(
      <ChatAndSOSPanel
        currentOrderId="order-123"
        customerName="Juan"
      />,
    );
    expect(screen.getByText("Sin dirección")).toBeDefined();
  });

  it("fallback 'Cliente' cuando no se pasa customerName", () => {
    render(<ChatAndSOSPanel currentOrderId="order-123" />);
    // El nombre "Cliente" aparece como fallback
    expect(screen.getByText("Cliente")).toBeDefined();
  });
});

describe("ChatAndSOSPanel — avatar inicial", () => {
  it("muestra la primera letra del nombre en el avatar", () => {
    render(
      <ChatAndSOSPanel
        currentOrderId="order-123"
        customerName="Rodrigo"
      />,
    );
    // El avatar muestra la inicial "R"
    expect(screen.getByText("R")).toBeDefined();
  });

  it("muestra 'C' (inicial de 'Cliente') como fallback cuando no hay nombre", () => {
    // El componente usa displayName = customerName ?? "Cliente"
    // getInitial("Cliente") = "C"
    render(<ChatAndSOSPanel currentOrderId="order-123" />);
    // El avatar tiene aria-hidden="true", buscamos por el texto en el div del avatar
    const avatar = document.querySelector(
      '[aria-hidden="true"].h-14.w-14',
    ) as HTMLElement | null;
    expect(avatar?.textContent?.trim()).toBe("C");
  });

  it("inicial del nombre con espacios se toma del primer caracter no-espacio", () => {
    render(
      <ChatAndSOSPanel
        currentOrderId="order-123"
        customerName="  Ana"
      />,
    );
    expect(screen.getByText("A")).toBeDefined();
  });
});

describe("ChatAndSOSPanel — links de contacto", () => {
  it("WhatsApp href tiene número limpio (sin caracteres no-numéricos)", () => {
    render(
      <ChatAndSOSPanel
        currentOrderId="order-123"
        customerName="Juan"
        customerPhone="999-888-777"
      />,
    );

    const waLink = screen.getByRole("link", { name: /WhatsApp a Juan/i });
    expect(waLink.getAttribute("href")).toBe("https://wa.me/999888777");
  });

  it("Call link tiene formato tel:", () => {
    render(
      <ChatAndSOSPanel
        currentOrderId="order-123"
        customerName="Juan"
        customerPhone="999888777"
      />,
    );

    const callLink = screen.getByRole("link", { name: /Llamar a Juan/i });
    expect(callLink.getAttribute("href")).toBe("tel:999888777");
  });

  it("links deshabilitados (href='#') cuando no hay teléfono", () => {
    render(
      <ChatAndSOSPanel
        currentOrderId="order-123"
        customerName="Juan"
      />,
    );

    const callLink = screen.getByRole("link", { name: /Llamar a Juan/i });
    const waLink = screen.getByRole("link", { name: /WhatsApp a Juan/i });

    expect(callLink.getAttribute("href")).toBe("#");
    expect(waLink.getAttribute("href")).toBe("#");
  });
});

describe("ChatAndSOSPanel — SOS expand/collapse", () => {
  it("SOS button tiene aria-expanded=false inicialmente", () => {
    render(<ChatAndSOSPanel currentOrderId={null} />);

    const sosBtn = screen.getByRole("button", { name: /Emergencia/i });
    expect(sosBtn.getAttribute("aria-expanded")).toBe("false");
  });

  it("SOS expand: aria-expanded=true después del click", () => {
    render(<ChatAndSOSPanel currentOrderId={null} />);

    const sosBtn = screen.getByRole("button", { name: /Emergencia/i });
    fireEvent.click(sosBtn);

    expect(sosBtn.getAttribute("aria-expanded")).toBe("true");
  });

  it("SOS collapse: aria-expanded=false al hacer click de nuevo", () => {
    render(<ChatAndSOSPanel currentOrderId={null} />);

    const sosBtn = screen.getByRole("button", { name: /Emergencia/i });
    fireEvent.click(sosBtn); // expand
    fireEvent.click(sosBtn); // collapse

    expect(sosBtn.getAttribute("aria-expanded")).toBe("false");
  });

  it("muestra las 3 opciones de emergencia cuando SOS está expandido", () => {
    render(<ChatAndSOSPanel currentOrderId={null} />);

    const sosBtn = screen.getByRole("button", { name: /Emergencia/i });
    fireEvent.click(sosBtn);

    expect(screen.getByText("Llamar a Buleje 24/7")).toBeDefined();
    expect(screen.getByText("Compartir mi ubicación")).toBeDefined();
    expect(screen.getByText("Llamar policía 105")).toBeDefined();
  });

  it("panel tiene aria-controls='sos-options-panel'", () => {
    render(<ChatAndSOSPanel currentOrderId={null} />);

    const sosBtn = screen.getByRole("button", { name: /Emergencia/i });
    expect(sosBtn.getAttribute("aria-controls")).toBe("sos-options-panel");
  });
});

describe("ChatAndSOSPanel — SOS confirmar con geo exitoso", () => {
  it("hace POST a /api/delivery/me/sos con las coordenadas reales", async () => {
    mockGeoSuccess(-8.379, -74.553);
    render(<ChatAndSOSPanel currentOrderId="order-123" />);

    const sosBtn = screen.getByRole("button", { name: /Emergencia/i });
    fireEvent.click(sosBtn);

    const shareBtn = screen.getByRole("button", {
      name: /Compartir mi ubicación/i,
    });
    fireEvent.click(shareBtn);

    // Fire-and-forget: dejamos que las promesas pendientes resuelvan
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const fetchMock = vi.mocked(global.fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/delivery/me/sos",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ lat: -8.379, lng: -74.553 }),
      }),
    );
  });

  it("muestra el toast de confirmación después de confirmar SOS", async () => {
    mockGeoSuccess();
    render(<ChatAndSOSPanel currentOrderId={null} />);

    const sosBtn = screen.getByRole("button", { name: /Emergencia/i });
    fireEvent.click(sosBtn);

    const shareBtn = screen.getByRole("button", {
      name: /Compartir mi ubicación/i,
    });
    fireEvent.click(shareBtn);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // El toast de confirmación debe ser visible
    expect(
      screen.getByText(/Buleje notificado · ubicación compartida/),
    ).toBeDefined();
  });

  it("colapsa el panel SOS después de confirmar", async () => {
    mockGeoSuccess();
    render(<ChatAndSOSPanel currentOrderId={null} />);

    const sosBtn = screen.getByRole("button", { name: /Emergencia/i });
    fireEvent.click(sosBtn); // expand

    const shareBtn = screen.getByRole("button", {
      name: /Compartir mi ubicación/i,
    });
    fireEvent.click(shareBtn);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(sosBtn.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("ChatAndSOSPanel — SOS con geo denegada", () => {
  it("envía SOS con lat=0, lng=0 cuando geo es denegada", async () => {
    mockGeoDenied();
    render(<ChatAndSOSPanel currentOrderId={null} />);

    const sosBtn = screen.getByRole("button", { name: /Emergencia/i });
    fireEvent.click(sosBtn);

    const shareBtn = screen.getByRole("button", {
      name: /Compartir mi ubicación/i,
    });
    fireEvent.click(shareBtn);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const fetchMock = vi.mocked(global.fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/delivery/me/sos",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ lat: 0, lng: 0 }),
      }),
    );
  });

  it("no crashea cuando geo es denegada — UX no se rompe", async () => {
    mockGeoDenied();

    expect(() => {
      render(<ChatAndSOSPanel currentOrderId={null} />);
    }).not.toThrow();

    const sosBtn = screen.getByRole("button", { name: /Emergencia/i });
    fireEvent.click(sosBtn);

    const shareBtn = screen.getByRole("button", {
      name: /Compartir mi ubicación/i,
    });

    expect(() => {
      fireEvent.click(shareBtn);
    }).not.toThrow();

    await act(async () => {
      await vi.runAllTimersAsync();
    });
  });

  it("muestra el toast aunque geo sea denegada (best-effort UX)", async () => {
    mockGeoDenied();
    render(<ChatAndSOSPanel currentOrderId={null} />);

    const sosBtn = screen.getByRole("button", { name: /Emergencia/i });
    fireEvent.click(sosBtn);

    const shareBtn = screen.getByRole("button", {
      name: /Compartir mi ubicación/i,
    });
    fireEvent.click(shareBtn);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(
      screen.getByText(/Buleje notificado · ubicación compartida/),
    ).toBeDefined();
  });
});

describe("ChatAndSOSPanel — links de emergencia", () => {
  it("'Llamar a Buleje 24/7' tiene href tel:", () => {
    render(<ChatAndSOSPanel currentOrderId={null} />);

    const sosBtn = screen.getByRole("button", { name: /Emergencia/i });
    fireEvent.click(sosBtn);

    const bulejeTel = screen.getByText("Llamar a Buleje 24/7").closest("a");
    expect(bulejeTel?.getAttribute("href")).toMatch(/^tel:/);
  });

  it("'Llamar policía 105' tiene href='tel:105'", () => {
    render(<ChatAndSOSPanel currentOrderId={null} />);

    const sosBtn = screen.getByRole("button", { name: /Emergencia/i });
    fireEvent.click(sosBtn);

    const policiaLink = screen.getByText("Llamar policía 105").closest("a");
    expect(policiaLink?.getAttribute("href")).toBe("tel:105");
  });
});

describe("ChatAndSOSPanel — accesibilidad sección", () => {
  it("tiene aria-label 'Contacto y emergencias' en la sección", () => {
    render(<ChatAndSOSPanel currentOrderId={null} />);

    const section = screen.getByRole("region", {
      name: /contacto y emergencias/i,
    });
    expect(section).toBeDefined();
  });

  it("panel de opciones SOS tiene aria-label 'Opciones de emergencia'", () => {
    render(<ChatAndSOSPanel currentOrderId={null} />);

    const panel = screen.getByRole("region", {
      name: /opciones de emergencia/i,
    });
    expect(panel).toBeDefined();
  });
});
