/**
 * __tests__/carga-vieja-purchase-orders-tab.test.tsx
 *
 * Mismo bug que Tareas (medido en el navegador el 2026-09-14): un GET que salió
 * antes de un cambio volvía después y deshacía lo que la pantalla ya mostraba.
 * En Compras pasaba dos veces: la recurrencia eliminada reaparecía, y el estado
 * elegido en una orden volvía al anterior aunque el PATCH ya estaba en camino.
 *
 * Cada pedido queda pendiente hasta que el test lo resuelve: el orden de
 * llegada lo decide el test, no la red. StrictMode reproduce los dos GET.
 */
import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/csrf-client", () => ({ csrfHeaders: (h: Record<string, string> = {}) => h }));
vi.mock("@/components/admin/shared/ConfirmDialog", () => ({ useConfirm: () => ({ confirm: async () => true }) }));

import PurchaseOrdersTab from "@/components/admin/PurchaseOrdersTab";

const URL_RECURRENTES = "/api/compras/recurrentes";
const URL_ORDENES = "/api/purchases";

function recurrente(id: string, supplierName: string) {
  return {
    id,
    supplierId: `s-${id}`,
    supplierName,
    items: [{ productId: 1, name: "Arroz extra", quantity: 10, unitCost: 3.5, unit: "kg" }],
    intervalDays: 15,
    nextDate: "2026-09-30T00:00:00.000Z",
    notifyDaysBefore: 2,
    active: true,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

const ARROCERA = recurrente("r1", "Arrocera del Norte");

const ORDEN = {
  id: "oc1",
  supplierId: "s1",
  supplierName: "Distribuidora Pucallpa",
  items: [{ productId: 1, name: "Arroz extra", quantity: 10, unitCost: 3.5, unit: "kg" }],
  total: 35,
  status: "pendiente",
  paymentMethod: "contado",
  createdAt: "2026-09-14T15:00:00.000Z",
};

type Pendiente = { metodo: string; url: string; resolver: (cuerpo: unknown) => void };
let pendientes: Pendiente[] = [];

beforeEach(() => {
  pendientes = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (url: string, init?: RequestInit) =>
        new Promise((resolve) => {
          pendientes.push({
            metodo: init?.method ?? "GET",
            url,
            resolver: (cuerpo) => resolve({ ok: true, status: 200, json: async () => cuerpo }),
          });
        }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const getsDe = (url: string) => pendientes.filter((p) => p.metodo === "GET" && p.url === url);
const gets = () => getsDe(URL_RECURRENTES);
const pedido = (metodo: string, url: string) => pendientes.find((p) => p.metodo === metodo && p.url === url);
const estadoEnPantalla = () => (screen.getByLabelText("Cambiar estado") as HTMLSelectElement).value;

async function resolver(p: Pendiente | undefined, cuerpo: unknown) {
  if (!p) throw new Error("el pedido todavía no salió");
  await act(async () => {
    p.resolver(cuerpo);
  });
}

/** `load` pide órdenes, proveedores y productos juntos: la carga número `i` son los tres `i`-ésimos. */
async function resolverCargaDeOrdenes(i: number, ordenes: unknown[]) {
  await resolver(getsDe(URL_ORDENES)[i], ordenes);
  await resolver(getsDe("/api/suppliers")[i], { suppliers: [] });
  await resolver(getsDe("/api/products")[i], []);
}

function montar() {
  render(
    <StrictMode>
      <PurchaseOrdersTab />
    </StrictMode>,
  );
}

describe("PurchaseOrdersTab — una carga vieja de recurrentes no pisa lo que ya cambió", () => {
  it("la recurrencia eliminada no reaparece cuando el GET del doble montaje vuelve tarde", async () => {
    montar();
    await waitFor(() => expect(gets()).toHaveLength(2));

    await resolver(gets()[1], [ARROCERA]);
    expect(await screen.findByText("Arrocera del Norte")).toBeTruthy();

    await act(async () => {
      screen.getByRole("button", { name: "Eliminar pedido recurrente" }).click();
    });
    await resolver(pedido("DELETE", `${URL_RECURRENTES}/r1`), { ok: true });
    expect(screen.queryByText("Arrocera del Norte")).toBeNull();

    // El GET que salió en el montaje llega ahora, con la lista de antes del borrado.
    await resolver(gets()[0], [ARROCERA]);
    expect(screen.queryByText("Arrocera del Norte")).toBeNull();

    // La carga que sigue al borrado trae lo guardado.
    await waitFor(() => expect(gets()).toHaveLength(3));
    await resolver(gets()[2], []);
    expect(screen.queryByText("Arrocera del Norte")).toBeNull();
  });

  it("CONTROL: sin cambios de por medio, la carga más nueva gana aunque la vieja llegue después", async () => {
    montar();
    await waitFor(() => expect(gets()).toHaveLength(2));

    await resolver(gets()[1], [ARROCERA]);
    expect(await screen.findByText("Arrocera del Norte")).toBeTruthy();

    await resolver(gets()[0], []);
    expect(screen.getByText("Arrocera del Norte")).toBeTruthy();
  });
});

describe("PurchaseOrdersTab — una carga vieja de órdenes no deshace el cambio de estado", () => {
  it("el estado elegido no vuelve al anterior cuando el GET del doble montaje llega mientras viaja el PATCH", async () => {
    montar();
    await waitFor(() => expect(getsDe(URL_ORDENES)).toHaveLength(2));

    await resolverCargaDeOrdenes(1, [ORDEN]);
    expect(((await screen.findByLabelText("Cambiar estado")) as HTMLSelectElement).value).toBe("pendiente");

    // Elegir «parcial»: la pantalla cambia al toque y el PATCH queda pendiente.
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Cambiar estado"), { target: { value: "parcial" } });
    });
    expect(estadoEnPantalla()).toBe("parcial");

    // La carga que salió en el montaje llega ahora, con la orden todavía pendiente.
    await resolverCargaDeOrdenes(0, [ORDEN]);
    expect(estadoEnPantalla()).toBe("parcial");

    // El PATCH confirma y la carga que le sigue trae lo guardado.
    await resolver(pedido("PATCH", `${URL_ORDENES}/oc1`), { ...ORDEN, status: "parcial" });
    await waitFor(() => expect(getsDe(URL_ORDENES)).toHaveLength(3));
    await resolverCargaDeOrdenes(2, [{ ...ORDEN, status: "parcial" }]);
    expect(((await screen.findByLabelText("Cambiar estado")) as HTMLSelectElement).value).toBe("parcial");
  });

  it("un cambio de estado hecho mientras viaja la recarga silenciosa de otro no se revierte", async () => {
    const AUTOMATICA = { ...ORDEN, id: "oc2", supplierName: "Molinera Pasco", status: "auto_generated", createdAt: "2026-09-14T16:00:00.000Z" };
    const PARCIAL = { ...ORDEN, status: "parcial" };
    const estados = () => screen.getAllByLabelText("Cambiar estado").map((s) => (s as HTMLSelectElement).value).sort();
    const selectCon = (valor: string) => screen.getAllByLabelText("Cambiar estado").find((s) => (s as HTMLSelectElement).value === valor)!;

    montar();
    await waitFor(() => expect(getsDe(URL_ORDENES)).toHaveLength(2));
    await resolverCargaDeOrdenes(1, [AUTOMATICA, PARCIAL]);
    await resolverCargaDeOrdenes(0, [AUTOMATICA, PARCIAL]);
    await waitFor(() => expect(estados()).toEqual(["auto_generated", "parcial"]));

    // Pasar la automática a pendiente: su recarga silenciosa queda en vuelo.
    await act(async () => {
      fireEvent.change(selectCon("auto_generated"), { target: { value: "pendiente" } });
    });
    await resolver(pedido("PATCH", `${URL_ORDENES}/oc2`), { ...AUTOMATICA, status: "pendiente" });
    await waitFor(() => expect(getsDe(URL_ORDENES)).toHaveLength(3));

    // Marcar recibida la otra mientras esa recarga viaja; su PATCH queda pendiente.
    await act(async () => {
      fireEvent.change(selectCon("parcial"), { target: { value: "recibido" } });
    });
    expect(estados()).toEqual(["pendiente", "recibido"]);

    // La recarga llega con lo de antes del segundo PATCH: no puede revertir la pantalla.
    await resolverCargaDeOrdenes(2, [{ ...AUTOMATICA, status: "pendiente" }, PARCIAL]);
    expect(estados()).toEqual(["pendiente", "recibido"]);

    // El PATCH confirma y la carga que le sigue trae lo guardado.
    await resolver(pedido("PATCH", `${URL_ORDENES}/oc1`), { ...ORDEN, status: "recibido" });
    await waitFor(() => expect(getsDe(URL_ORDENES)).toHaveLength(4));
    await resolverCargaDeOrdenes(3, [{ ...AUTOMATICA, status: "pendiente" }, { ...ORDEN, status: "recibido" }]);
    await waitFor(() => expect(estados()).toEqual(["pendiente", "recibido"]));
  });

  it("CONTROL: sin cambios de por medio, la carga de órdenes más nueva gana aunque la vieja llegue después", async () => {
    montar();
    await waitFor(() => expect(getsDe(URL_ORDENES)).toHaveLength(2));

    await resolverCargaDeOrdenes(1, [ORDEN]);
    expect(await screen.findByLabelText("Cambiar estado")).toBeTruthy();

    await resolverCargaDeOrdenes(0, []);
    expect(screen.getByLabelText("Cambiar estado")).toBeTruthy();
  });
});
