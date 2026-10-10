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
const idsEnCache = () =>
  (JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{"data":[]}') as { data: Array<{ id: string }> }).data.map((d) => d.id);

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
  it("la devolución eliminada no reaparece (ni vuelve al cache) cuando el GET del doble montaje llega tarde", async () => {
    montar();
    await waitFor(() => expect(gets()).toHaveLength(2));

    await resolver(gets()[1], [MADERERA]);
    expect(await screen.findByText("Maderera Ucayali")).toBeTruthy();

    // «Eliminar registro» vive en el detalle: el botón de abrirlo va al lado de «Marcar enviada».
    await clic(screen.getByRole("button", { name: "Marcar enviada" }).nextElementSibling as HTMLElement);
    await clic(screen.getByRole("button", { name: "Eliminar registro" }));
    await resolver(pedido("DELETE", `${URL_DEVOLUCIONES}/d1`), { ok: true });
    expect(nombresEnLista("Maderera Ucayali")).toHaveLength(0);

    // El GET que salió en el montaje llega ahora, con la lista de antes del borrado.
    await resolver(gets()[0], [MADERERA]);
    expect(nombresEnLista("Maderera Ucayali")).toHaveLength(0);
    expect(idsEnCache()).not.toContain("d1");

    // La carga silenciosa que sigue al borrado trae lo guardado.
    await waitFor(() => expect(gets()).toHaveLength(3));
    await resolver(gets()[2], []);
    expect(nombresEnLista("Maderera Ucayali")).toHaveLength(0);
  });

  it("registrar mientras viaja la recarga pedida con el botón no duplica la devolución nueva", async () => {
    montar();
    await waitFor(() => expect(gets()).toHaveLength(2));
    await resolver(gets()[1], [MADERERA]);
    await resolver(gets()[0], [MADERERA]);
    for (const p of pendientes.filter((x) => x.url === "/api/suppliers")) {
      await resolver(p, { suppliers: [{ id: "p9", name: "Ferretería Pasco" }] });
    }
    expect(await screen.findByText("Maderera Ucayali")).toBeTruthy();

    await clic(screen.getByRole("button", { name: "Recargar devoluciones" }));
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
    expect(await screen.findByText("Maderera Ucayali")).toBeTruthy();

    await resolver(gets()[0], []);
    expect(screen.getByText("Maderera Ucayali")).toBeTruthy();
  });
});
