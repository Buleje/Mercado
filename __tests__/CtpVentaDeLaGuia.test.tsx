/**
 * La plata de la guía que acaba de salir (ADR-322 + ADR-410).
 *
 * Estos tests existen porque la pantalla NO se pudo probar a mano: para verla
 * hay que tener producto disponible, armar una guía con precio y registrarla, y
 * en el tenant QA no hubo forma de dejar stock aserrado disponible. El endpoint
 * sí se verificó por API (dos movimientos, saldo y 409 al repetir); lo que
 * cubren estos casos es la pieza: cuándo se dibuja, qué total dice, y qué manda.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CtpVentaDeLaGuia from "@/components/admin/forestal/CtpVentaDeLaGuia";
import { gtfDatosVacio } from "@/lib/forestal/ctp-gtf-datos";
import type { FilaDespacho } from "@/lib/forestal/despacho-lista";

const PARTE = {
  id: "parte-1",
  nombre: "Maderera del Sur",
  roles: ["destinatario"],
  docTipo: "RUC",
  docNumero: "20123456789",
};

const mockFetch = vi.fn();

/** Una fila de la lista de despacho, con lo que la pieza mira. */
function fila(over: Partial<FilaDespacho> = {}): FilaDespacho {
  return {
    uid: Math.random().toString(36).slice(2),
    especie: "Tornillo",
    producto: "MADERA ASERRADA (COMERCIAL)",
    cantidad: 10,
    unidad: "m3",
    volumen: 2,
    valorVenta: 1500,
    ...over,
  } as FilaDespacho;
}

/** Los datos de la guía con el destinatario puesto. */
function datosCon(nombre: string, docNumero = "20123456789") {
  const d = gtfDatosVacio();
  return { ...d, destinatario: { ...d.destinatario, nombre, docNumero } };
}

beforeEach(() => {
  mockFetch.mockReset();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  /* El directorio: la pieza lo consulta para encontrar al cliente. */
  mockFetch.mockImplementation((url: string) => {
    if (String(url).includes("/directorio")) {
      return Promise.resolve({ ok: true, json: async () => ({ partes: [PARTE], vehiculos: [] }) });
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({ saldoDeLaGuia: 1000, movimientos: [] }),
    });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const props = {
  filas: [fila(), fila({ valorVenta: 1000 })],
  datos: datosCon("Maderera del Sur"),
  gtfNumber: "0001234",
  fecha: "2026-09-11",
};

describe("cuándo aparece", () => {
  it("no se dibuja si la lista salió sin precio: no inventa el total", () => {
    const { container } = render(
      <CtpVentaDeLaGuia {...props} filas={[fila({ valorVenta: null }), fila({ valorVenta: null })]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("no se dibuja sin destinatario: una cuenta corriente necesita de QUIÉN", () => {
    const { container } = render(<CtpVentaDeLaGuia {...props} datos={datosCon("")} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("suma el total de la guía y lo dice con el cliente", async () => {
    render(<CtpVentaDeLaGuia {...props} />);
    expect(await screen.findByText(/S\/ 2,500\.00 · Maderera del Sur/)).toBeTruthy();
  });

  it("avisa cuándo el total está incompleto en vez de callarlo", async () => {
    render(<CtpVentaDeLaGuia {...props} filas={[fila(), fila({ valorVenta: null })]} />);
    expect(await screen.findByText(/1 producto de la guía salió sin precio/)).toBeTruthy();
  });
});

describe("qué manda al servidor", () => {
  it("a cuenta: el total como deuda y nada cobrado", async () => {
    const user = userEvent.setup();
    render(<CtpVentaDeLaGuia {...props} />);
    await user.click(await screen.findByRole("button", { name: /Anotar en su cuenta/ }));

    await waitFor(() => {
      const cuenta = mockFetch.mock.calls.find((c) => String(c[0]).includes("/cuenta"));
      expect(cuenta).toBeTruthy();
      const body = JSON.parse((cuenta![1] as RequestInit).body as string);
      expect(body).toMatchObject({
        accion: "venta_guia",
        parteId: "parte-1",
        gtfNumber: "0001234",
        total: 2500,
        cobrado: 0,
      });
    });
  });

  it("pagó todo: lo cobrado iguala al total", async () => {
    const user = userEvent.setup();
    render(<CtpVentaDeLaGuia {...props} />);
    await user.click(await screen.findByRole("button", { name: "Pagó todo" }));
    await user.click(screen.getByRole("button", { name: /Anotar en su cuenta/ }));

    await waitFor(() => {
      const cuenta = mockFetch.mock.calls.find((c) => String(c[0]).includes("/cuenta"));
      const body = JSON.parse((cuenta![1] as RequestInit).body as string);
      expect(body.cobrado).toBe(2500);
    });
  });

  it("una parte: manda lo entregado y anuncia el saldo", async () => {
    const user = userEvent.setup();
    render(<CtpVentaDeLaGuia {...props} />);
    await user.click(await screen.findByRole("button", { name: "Pagó una parte" }));
    await user.type(screen.getByLabelText("Cuánto entregó"), "1000");
    expect(screen.getByText(/S\/ 1,500\.00/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Anotar en su cuenta/ }));
    await waitFor(() => {
      const cuenta = mockFetch.mock.calls.find((c) => String(c[0]).includes("/cuenta"));
      const body = JSON.parse((cuenta![1] as RequestInit).body as string);
      expect(body.cobrado).toBe(1000);
    });
  });

  it("si el cliente no está en el directorio, lo da de alta con lo que la guía dice", async () => {
    const user = userEvent.setup();
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).includes("/directorio") && init?.method === "POST") {
        return Promise.resolve({ ok: true, json: async () => ({ parte: { ...PARTE, id: "nueva", nombre: "Aserradero Nuevo" } }) });
      }
      if (String(url).includes("/directorio")) {
        return Promise.resolve({ ok: true, json: async () => ({ partes: [], vehiculos: [] }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ saldoDeLaGuia: 2500 }) });
    });

    render(<CtpVentaDeLaGuia {...props} datos={datosCon("Aserradero Nuevo", "20555555555")} />);
    expect(await screen.findByText(/nuevo en el directorio/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Anotar en su cuenta/ }));

    await waitFor(() => {
      const alta = mockFetch.mock.calls.find(
        (c) => String(c[0]).includes("/directorio") && (c[1] as RequestInit)?.method === "POST",
      );
      expect(alta).toBeTruthy();
      const cuenta = mockFetch.mock.calls.find((c) => String(c[0]).includes("/cuenta"));
      expect(JSON.parse((cuenta![1] as RequestInit).body as string).parteId).toBe("nueva");
    });
  });

  it("el 409 de «ya está anotada» se muestra tal cual, no se traga", async () => {
    const user = userEvent.setup();
    mockFetch.mockImplementation((url: string) => {
      if (String(url).includes("/directorio")) {
        return Promise.resolve({ ok: true, json: async () => ({ partes: [PARTE], vehiculos: [] }) });
      }
      return Promise.resolve({
        ok: false,
        status: 409,
        json: async () => ({ error: "guia_ya_anotada", message: "La guía 0001234 ya está anotada en la cuenta de Maderera del Sur." }),
      });
    });

    render(<CtpVentaDeLaGuia {...props} />);
    await user.click(await screen.findByRole("button", { name: /Anotar en su cuenta/ }));
    expect(await screen.findByText(/ya está anotada en la cuenta/)).toBeTruthy();
  });
});
