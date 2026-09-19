/**
 * __tests__/carga-vieja-punto-compra-view.test.tsx
 *
 * El mismo bug que se midió en Tareas el 2026-09-14, en los gastos fijos del
 * Punto de Compra: el doble montaje de React lanza dos GET del catálogo y, si
 * el viejo volvía después de eliminar una plantilla, la tarjeta reaparecía con
 * su botón «Pagar» aunque ya no estaba en la base.
 *
 * Además, `ExpensesDB.getAll` usa "use cache" y el borrado invalida con
 * `revalidateTag(tag, "max")`: la carga siguiente puede traer la copia vieja.
 * Lo borrado no puede volver ni por ese camino.
 *
 * Cada pedido del catálogo y cada DELETE quedan pendientes hasta que el test
 * los resuelve: el orden de llegada lo decide el test, no la red.
 */
import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/csrf-client", () => ({ csrfHeaders: (h: Record<string, string> = {}) => h }));

// Los modales cargados con `next/dynamic` no importan acá. El único con
// `onCreated` (RecurringExpenseModal) deja un botón para simular un alta.
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

import PuntoCompraView from "@/components/admin/pos/PuntoCompraView";
import { ConfirmDialogProvider } from "@/components/admin/shared/ConfirmDialog";

const CATALOGO = "/api/expenses?recurring=true";
const ALQUILER = { id: "g1", category: "Alquiler", description: "Alquiler del local", amount: 850, recurring: true };
const LUZ = { id: "g2", category: "Servicios", description: "Recibo de la luz", amount: 120, recurring: true };
const AGUA = { id: "g3", category: "Servicios", description: "Recibo del agua", amount: 45, recurring: true };

type Pendiente = { metodo: string; url: string; resolver: (cuerpo: unknown) => void };
let pendientes: Pendiente[] = [];

beforeEach(() => {
  pendientes = [];
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const metodo = init?.method ?? "GET";
      if (url === CATALOGO || metodo === "DELETE") {
        return new Promise((resolve) => {
          pendientes.push({
            metodo,
            url,
            resolver: (cuerpo) => resolve({ ok: true, status: 200, json: async () => cuerpo }),
          });
        });
      }
      // Productos, proveedores, promociones, compras y pagos hechos: vacíos al toque.
      return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const cargas = () => pendientes.filter((p) => p.metodo === "GET" && p.url === CATALOGO);
const pedido = (metodo: string, url: string) => pendientes.find((p) => p.metodo === metodo && p.url === url);

async function resolver(p: Pendiente | undefined, cuerpo: unknown) {
  if (!p) throw new Error("el pedido todavía no salió");
  await act(async () => {
    p.resolver(cuerpo);
  });
}

function montar() {
  render(
    <StrictMode>
      <ConfirmDialogProvider>
        <PuntoCompraView />
      </ConfirmDialogProvider>
    </StrictMode>,
  );
}

/** Tacho de la tarjeta → «Sí, eliminar» → el servidor confirma el DELETE. */
async function eliminar(tpl: { id: string; description: string }) {
  await act(async () => {
    fireEvent.click(screen.getByLabelText(`Eliminar ${tpl.description} del catálogo`));
  });
  fireEvent.click(await screen.findByRole("button", { name: "Sí, eliminar" }));
  await waitFor(() => expect(pedido("DELETE", `/api/expenses/${tpl.id}`)).toBeTruthy());
  await resolver(pedido("DELETE", `/api/expenses/${tpl.id}`), { ok: true });
}

describe("PuntoCompraView — una carga vieja no devuelve una plantilla borrada", () => {
  it("la plantilla eliminada no reaparece cuando el GET del doble montaje vuelve tarde", async () => {
    montar();
    await waitFor(() => expect(cargas()).toHaveLength(2));

    await resolver(cargas()[1], [ALQUILER]);
    expect(await screen.findByText("Alquiler del local")).toBeTruthy();

    await eliminar(ALQUILER);
    await waitFor(() => expect(screen.queryByText("Alquiler del local")).toBeNull());

    // El GET que salió en el montaje llega ahora, con la lista de antes del borrado.
    await resolver(cargas()[0], [ALQUILER]);
    expect(screen.queryByText("Alquiler del local")).toBeNull();
  });

  it("la recarga tras un alta que llega de la caché vieja no devuelve lo borrado, y sí trae lo nuevo", async () => {
    montar();
    await waitFor(() => expect(cargas()).toHaveLength(2));
    await resolver(cargas()[1], [ALQUILER, LUZ]);
    await resolver(cargas()[0], [ALQUILER, LUZ]);
    expect(await screen.findByText("Alquiler del local")).toBeTruthy();

    await eliminar(ALQUILER);
    await waitFor(() => expect(screen.queryByText("Alquiler del local")).toBeNull());

    // Se crea otro gasto; el servidor todavía sirve la copia marcada como vieja.
    await act(async () => {
      fireEvent.click(await screen.findByText("Simular gasto creado"));
    });
    await waitFor(() => expect(cargas()).toHaveLength(3));
    await resolver(cargas()[2], [ALQUILER, LUZ, AGUA]);

    expect(await screen.findByText("Recibo del agua")).toBeTruthy();
    expect(screen.getByText("Recibo de la luz")).toBeTruthy();
    expect(screen.queryByText("Alquiler del local")).toBeNull();
  });

  it("sin borrados de por medio, la carga más nueva gana aunque la vieja llegue después", async () => {
    montar();
    await waitFor(() => expect(cargas()).toHaveLength(2));

    await resolver(cargas()[1], [ALQUILER]);
    expect(await screen.findByText("Alquiler del local")).toBeTruthy();

    await resolver(cargas()[0], []);
    expect(screen.getByText("Alquiler del local")).toBeTruthy();
  });
});
