/**
 * __tests__/carga-vieja-devoluciones-proveedor.test.tsx
 *
 * Mismo bug que Tareas (medido en el navegador el 2026-09-14): un GET de
 * devoluciones que salió antes de un cambio volvía después y la pantalla
 * retrocedía; además dejaba esa lista vieja en el cache de localStorage.
 *
 * Cada pedido queda pendiente hasta que el test lo resuelve: el orden de
 * llegada lo decide el test, no la red. StrictMode reproduce los dos GET.
 */
import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/csrf-client", () => ({ csrfHeaders: (h: Record<string, string> = {}) => h }));
vi.mock("@/components/admin/shared/ConfirmDialog", () => ({ useConfirm: () => ({ confirm: async () => true }) }));

import DevolucionesProveedorModule from "@/components/admin/DevolucionesProveedorModule";

const URL_DEVOLUCIONES = "/api/supplier-returns";
const CACHE_KEY = "admin-devoluciones-cache";

const MADERERA = {
  id: "d1",
  createdAt: "2026-09-10T15:00:00.000Z",
  proveedorNombre: "Maderera Ucayali",
  items: [{ nombre: "Clavos", cantidad: 2, unidad: "kg" }],
  motivo: "Producto dañado",
  estado: "PENDIENTE",
};
const MADERERA_ANULADA = { ...MADERERA, estado: "ANULADA", notas: "Anulada el jueves 17/10 por qaadmin: Me equivoqué de proveedor." };
const FERRETERIA = {
  id: "d2",
  createdAt: "2026-09-14T15:00:00.000Z",
  proveedorNombre: "Ferretería Pasco",
  items: [{ nombre: "Bisagras", cantidad: 4, unidad: "und" }],
  motivo: "Producto dañado",
  estado: "PENDIENTE",
};

type Pendiente = { metodo: string; url: string; resolver: (cuerpo: unknown) => void };
let pendientes: Pendiente[] = [];

beforeEach(() => {
  pendientes = [];
  localStorage.clear();
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

const gets = () => pendientes.filter((p) => p.metodo === "GET" && p.url === URL_DEVOLUCIONES);
const pedido = (metodo: string, url: string) => pendientes.find((p) => p.metodo === metodo && p.url === url);
const nombresEnLista = (nombre: string) => screen.queryAllByText(nombre, { selector: "span" });
const estadoEnCache = (id: string) =>
  (JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{"data":[]}') as { data: Array<{ id: string; estado: string }> }).data.find((d) => d.id === id)?.estado;
/** La pastilla de estado de la (única) fila: el `<span>` justo después del nombre del proveedor. */
const estadoEnFila = () => screen.getByText("Maderera Ucayali", { selector: "span" }).nextElementSibling?.textContent;

async function resolver(p: Pendiente | undefined, cuerpo: unknown) {
  if (!p) throw new Error("el pedido todavía no salió");
  await act(async () => {
    p.resolver(cuerpo);
  });
}

async function clic(el: HTMLElement) {
  await act(async () => {
    el.click();
  });
}

function montar() {
  render(
    <StrictMode>
      <DevolucionesProveedorModule />
    </StrictMode>,
  );
}

describe("DevolucionesProveedorModule — una carga vieja no pisa lo que ya cambió", () => {
  it("la devolución anulada no vuelve a «Pendiente» (ni en el cache) cuando el GET del doble montaje llega tarde", async () => {
    montar();
    await waitFor(() => expect(gets()).toHaveLength(2));

    await resolver(gets()[1], [MADERERA]);
    expect(await screen.findByText("Maderera Ucayali", { selector: "span" })).toBeTruthy();
    expect(estadoEnFila()).toBe("Pendiente");

    // C55 (17-10): ya no se borra. «Anular…» vive en el «⋯» de la fila y pide el motivo.
    await clic(screen.getByRole("button", { name: "Más acciones" }));
    await clic(screen.getByRole("menuitem", { name: /Anular/ }));
    fireEvent.change(await screen.findByLabelText(/Por qué la anulas/), { target: { value: "Me equivoqué de proveedor" } });
    await clic(screen.getByRole("button", { name: "Anular" }));
    expect(pedido("DELETE", `${URL_DEVOLUCIONES}/d1`)).toBeUndefined();
    const enviado = pedido("POST", `${URL_DEVOLUCIONES}/d1/anular`);
    expect(enviado).toBeTruthy();
    await resolver(enviado, MADERERA_ANULADA);
    expect(estadoEnFila()).toBe("Anulada");

    // El GET que salió en el montaje llega ahora, con la lista de antes de anular.
    await resolver(gets()[0], [MADERERA]);
    expect(estadoEnFila()).toBe("Anulada");
    expect(estadoEnCache("d1")).toBe("ANULADA");

    // La carga silenciosa que sigue trae lo guardado: la fila sigue ahí, anulada.
    await waitFor(() => expect(gets()).toHaveLength(3));
    await resolver(gets()[2], [MADERERA_ANULADA]);
    expect(nombresEnLista("Maderera Ucayali")).toHaveLength(1);
    expect(estadoEnFila()).toBe("Anulada");
  });

  it("registrar mientras viaja la recarga pedida con el botón no duplica la devolución nueva", async () => {
    montar();
    await waitFor(() => expect(gets()).toHaveLength(2));
    await resolver(gets()[1], [MADERERA]);
    await resolver(gets()[0], [MADERERA]);
    for (const p of pendientes.filter((x) => x.url === "/api/suppliers")) {
      await resolver(p, { suppliers: [{ id: "p9", name: "Ferretería Pasco" }] });
    }
    expect(await screen.findByText("Maderera Ucayali", { selector: "span" })).toBeTruthy();

    await clic(screen.getByRole("button", { name: "Más" }));
    await clic(screen.getByRole("menuitem", { name: /Actualizar/ }));
    expect(gets()).toHaveLength(3);

    await clic(screen.getByRole("button", { name: "Nueva devolución" }));
    fireEvent.change(screen.getByLabelText("Proveedor *"), { target: { value: "p9" } });
    fireEvent.change(screen.getByPlaceholderText("Nombre del producto"), { target: { value: "Bisagras" } });
    await clic(screen.getByRole("button", { name: "Registrar devolución" }));

    // La recarga leyó la base DESPUÉS de que el POST se guardó y vuelve antes que su respuesta.
    await resolver(gets()[2], [FERRETERIA, MADERERA]);
    await resolver(pedido("POST", URL_DEVOLUCIONES), FERRETERIA);
    expect(nombresEnLista("Ferretería Pasco")).toHaveLength(1);

    await waitFor(() => expect(gets()).toHaveLength(4));
    await resolver(gets()[3], [FERRETERIA, MADERERA]);
    expect(nombresEnLista("Ferretería Pasco")).toHaveLength(1);
    expect(nombresEnLista("Maderera Ucayali")).toHaveLength(1);
  });

  it("CONTROL: sin cambios de por medio, la carga más nueva gana aunque la vieja llegue después", async () => {
    montar();
    await waitFor(() => expect(gets()).toHaveLength(2));

    await resolver(gets()[1], [MADERERA]);
    expect(await screen.findByText("Maderera Ucayali", { selector: "span" })).toBeTruthy();

    await resolver(gets()[0], []);
    expect(screen.getByText("Maderera Ucayali", { selector: "span" })).toBeTruthy();
  });
});
