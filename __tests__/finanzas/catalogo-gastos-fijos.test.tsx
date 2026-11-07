/**
 * __tests__/finanzas/catalogo-gastos-fijos.test.tsx
 *
 * Mi Plata › Gastos y presupuesto monta el catálogo de gastos fijos debajo de
 * la lista de gastos, y la lista se relee cuando el catálogo avisa un cambio.
 *
 * El bug (revisión de la ola 3, 2026-10-10): el aviso salía de comparar una
 * firma «pagos:catálogo», pero los pagos hechos llegan por OTRO fetch. Si
 * volvían después del catálogo, la firma cambiaba sin que nadie tocara nada y
 * la lista de arriba se remontaba: se perdían las fechas, la categoría y el
 * formulario abierto. El aviso tiene que salir sólo de lo que hizo alguien.
 *
 * Cada GET de gastos y cada DELETE quedan pendientes hasta que el test los
 * resuelve: el orden de llegada lo decide el test, no la red.
 */
import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/csrf-client", () => ({ csrfHeaders: (h: Record<string, string> = {}) => h }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
const ding = vi.fn();
vi.mock("@/components/admin/pos/usePOSSound", () => ({ usePOSSound: () => ({ playDing: ding }) }));

// Los modales con `next/dynamic` no importan acá. El único con `onCreated`
// (el alta de un fijo) deja un botón para simular que se creó uno.
vi.mock("next/dynamic", async () => {
  const { createElement } = await import("react");
  return {
    default: () =>
      function Dinamico(props: { onCreated?: () => void }) {
        return props.onCreated
          ? createElement("button", { type: "button", onClick: props.onCreated }, "Simular gasto creado")
          : null;
      },
  };
});

import CatalogoDeGastosFijos from "@/components/admin/unified/finanzas/gastos/CatalogoDeGastosFijos";
import { ConfirmDialogProvider } from "@/components/admin/shared/ConfirmDialog";

const CATALOGO = "/api/expenses?recurring=true";
const PAGOS = "/api/expenses";
const ALQUILER = { id: "g1", category: "Alquiler", description: "Alquiler del local", amount: 850, recurring: true };
const PAGO_DEL_ALQUILER = { description: "Alquiler del local", amount: 850, date: "2026-10-01", recurring: false, templateId: "g1" };

type Pendiente = { metodo: string; url: string; resuelto: boolean; resolver: (cuerpo: unknown) => void };
let pendientes: Pendiente[] = [];

beforeEach(() => {
  pendientes = [];
  ding.mockClear();
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const metodo = init?.method ?? "GET";
      if (url === CATALOGO || url === PAGOS || metodo === "DELETE") {
        return new Promise((resolve) => {
          const p: Pendiente = {
            metodo,
            url,
            resuelto: false,
            resolver: (cuerpo) => {
              p.resuelto = true;
              resolve({ ok: true, status: 200, json: async () => cuerpo });
            },
          };
          pendientes.push(p);
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const sinResolver = (metodo: string, url: string) => pendientes.filter((p) => !p.resuelto && p.metodo === metodo && p.url === url);

/** Resuelve TODO lo pendiente de esa dirección (el doble montaje lanza dos). */
async function resolverTodos(url: string, cuerpo: unknown, metodo = "GET") {
  const lote = sinResolver(metodo, url);
  if (lote.length === 0) throw new Error(`no hay pedidos pendientes a ${url}`);
  await act(async () => {
    for (const p of lote) p.resolver(cuerpo);
  });
}

function montar(onCambio: () => void) {
  render(
    <StrictMode>
      <ConfirmDialogProvider>
        <CatalogoDeGastosFijos onCambio={onCambio} />
      </ConfirmDialogProvider>
    </StrictMode>,
  );
}

/** Carga el catálogo y, DESPUÉS, los pagos ya hechos: el orden del bug. */
async function cargarCatalogoYDespuesPagos() {
  await waitFor(() => expect(sinResolver("GET", CATALOGO).length).toBeGreaterThan(0));
  await resolverTodos(CATALOGO, [ALQUILER]);
  expect(await screen.findByText("Alquiler del local")).toBeTruthy();
  await waitFor(() => expect(sinResolver("GET", PAGOS).length).toBeGreaterThan(0));
  await resolverTodos(PAGOS, [PAGO_DEL_ALQUILER]);
}

describe("Catálogo de gastos fijos en Mi Plata — avisa sólo lo que hizo alguien", () => {
  it("los pagos que llegan después del catálogo no disparan el aviso (la lista de arriba no se remonta)", async () => {
    const onCambio = vi.fn();
    montar(onCambio);
    await cargarCatalogoYDespuesPagos();
    // Un respiro más por si algún efecto tardío dispara el aviso.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(onCambio).toHaveBeenCalledTimes(0);
  });

  it("quitar un fijo del catálogo avisa una sola vez, y suena", async () => {
    const onCambio = vi.fn();
    montar(onCambio);
    await cargarCatalogoYDespuesPagos();

    await act(async () => {
      fireEvent.click(screen.getByLabelText("Eliminar Alquiler del local del catálogo"));
    });
    fireEvent.click(await screen.findByRole("button", { name: "Sí, eliminar" }));
    await waitFor(() => expect(sinResolver("DELETE", "/api/expenses/g1")).toHaveLength(1));
    await resolverTodos("/api/expenses/g1", { ok: true }, "DELETE");

    await waitFor(() => expect(onCambio).toHaveBeenCalledTimes(1));
    expect(ding).toHaveBeenCalledTimes(1);
  });

  it("agregar un fijo nuevo avisa una sola vez", async () => {
    const onCambio = vi.fn();
    montar(onCambio);
    await cargarCatalogoYDespuesPagos();
    expect(onCambio).toHaveBeenCalledTimes(0);

    await act(async () => {
      fireEvent.click(await screen.findByText("Simular gasto creado"));
    });
    expect(onCambio).toHaveBeenCalledTimes(1);
  });
});
