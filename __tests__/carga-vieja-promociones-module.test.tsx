/**
 * __tests__/carga-vieja-promociones-module.test.tsx
 *
 * El mismo bug medido en Tareas el 2026-09-14: al montar salen dos GET (doble
 * montaje) y, si el primero vuelve DESPUÉS de Eliminar, la lista vieja pisa la
 * pantalla y la promoción borrada reaparece. Acá Eliminar y activar/pausar
 * aplican la respuesta del servidor sin recargar, así que nada la vuelve a sacar.
 *
 * Cada pedido queda pendiente hasta que el test lo resuelve: el orden de
 * llegada lo decide el test, no la red. StrictMode reproduce los dos GET.
 */
import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/csrf-client", () => ({ csrfHeaders: (h: Record<string, string> = {}) => h }));

import PromocionesModule from "@/components/admin/PromocionesModule";
import { ConfirmDialogProvider } from "@/components/admin/shared/ConfirmDialog";

const LECHE = {
  id: "r1",
  nombre: "Leche con descuento",
  tipo: "porcentaje",
  valor: 10,
  categorias: [],
  fechaInicio: "2026-09-01",
  fechaFin: "2026-09-30",
  activa: true,
  condicion: null,
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

const gets = () => pendientes.filter((p) => p.metodo === "GET" && p.url === "/api/discount-rules");
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
        <PromocionesModule />
      </ConfirmDialogProvider>
    </StrictMode>,
  );
}

describe("PromocionesModule — una carga vieja no pisa lo que ya cambió", () => {
  it("la promoción eliminada no reaparece cuando el GET del doble montaje vuelve tarde", async () => {
    montar();
    await waitFor(() => expect(gets()).toHaveLength(2));

    await resolver(gets()[1], [LECHE]);
    expect(await screen.findByText("Leche con descuento")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Eliminar promoción" }));
    fireEvent.click(await screen.findByRole("button", { name: "Sí, eliminar" }));
    await waitFor(() => expect(pedido("DELETE", "/api/discount-rules/r1")).toBeTruthy());
    await resolver(pedido("DELETE", "/api/discount-rules/r1"), { ok: true });
    await waitFor(() => expect(screen.queryByText("Leche con descuento")).toBeNull());

    // El GET que salió en el montaje llega ahora, con la lista de antes del borrado.
    await resolver(gets()[0], [LECHE]);
    expect(screen.queryByText("Leche con descuento")).toBeNull();
    expect(screen.getByText("No hay promociones")).toBeTruthy();
  });

  it("con Eliminar en camino, un Recargar que vuelve después no trae la promoción de vuelta", async () => {
    montar();
    await waitFor(() => expect(gets()).toHaveLength(2));
    await resolver(gets()[1], [LECHE]);
    await resolver(gets()[0], [LECHE]);
    expect(await screen.findByText("Leche con descuento")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Eliminar promoción" }));
    fireEvent.click(await screen.findByRole("button", { name: "Sí, eliminar" }));
    await waitFor(() => expect(pedido("DELETE", "/api/discount-rules/r1")).toBeTruthy());

    // Recargar mientras el borrado viaja: ese GET leyó antes de que se guardara, y
    // es la carga más nueva, así que la guarda de «la más nueva» sola no lo para.
    fireEvent.click(screen.getByRole("button", { name: "Recargar promociones" }));
    await waitFor(() => expect(gets()).toHaveLength(3));

    await resolver(pedido("DELETE", "/api/discount-rules/r1"), { ok: true });
    await resolver(gets()[2], [LECHE]);
    expect(screen.queryByText("Leche con descuento")).toBeNull();

    // Esa carga se descarta y vuelve a pedir: ahora lee con el borrado ya guardado.
    await waitFor(() => expect(gets()).toHaveLength(4));
    await resolver(gets()[3], []);
    expect(screen.queryByText("Leche con descuento")).toBeNull();
    expect(screen.getByText("No hay promociones")).toBeTruthy();
  });

  it("crear una promo mientras viaja la carga inicial no deja la lista sólo con la nueva (se vuelve a pedir)", async () => {
    // Sin StrictMode: una sola carga, como en producción.
    render(
      <ConfirmDialogProvider>
        <PromocionesModule />
      </ConfirmDialogProvider>,
    );
    await waitFor(() => expect(gets()).toHaveLength(1));

    fireEvent.click(screen.getByRole("button", { name: "Nueva promoción" }));
    fireEvent.change(screen.getByPlaceholderText("Ej: Descuento fin de semana"), { target: { value: "Promo nueva" } });
    fireEvent.change(screen.queryByPlaceholderText("20") ?? screen.getByPlaceholderText("5.00"), { target: { value: "15" } });
    fireEvent.change(document.querySelectorAll('input[type="date"]')[1]!, { target: { value: "2099-12-31" } });
    const enviar = screen.getAllByRole("button").find((b) => /crear|guardar/i.test(b.textContent ?? "") && !/nueva/i.test(b.getAttribute("aria-label") ?? ""));
    if (!enviar) throw new Error("no está el botón de guardar");
    fireEvent.click(enviar);

    const NUEVA = { ...LECHE, id: "r9", nombre: "Promo nueva", fechaFin: "2099-12-31" };
    await waitFor(() => expect(pedido("POST", "/api/discount-rules")).toBeTruthy());
    await resolver(pedido("POST", "/api/discount-rules"), NUEVA);
    // Vuelve la carga inicial, leída antes de crear: se descarta y se pide otra.
    await resolver(gets()[0], [LECHE]);
    await waitFor(() => expect(gets()).toHaveLength(2));
    await resolver(gets()[1], [NUEVA, LECHE]);

    expect(await screen.findByText("Promo nueva")).toBeTruthy();
    expect(screen.getByText("Leche con descuento")).toBeTruthy();
  });

  it("Recargar con un activar/pausar en camino trae igual lo que agregó otro usuario", async () => {
    render(
      <ConfirmDialogProvider>
        <PromocionesModule />
      </ConfirmDialogProvider>,
    );
    await waitFor(() => expect(gets()).toHaveLength(1));
    await resolver(gets()[0], [LECHE]);
    expect(await screen.findByText("Leche con descuento")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Desactivar promoción" }));
    await waitFor(() => expect(pedido("PATCH", "/api/discount-rules/r1")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Recargar promociones" }));
    await waitFor(() => expect(gets()).toHaveLength(2));

    const PAN = { ...LECHE, id: "r2", nombre: "Pan de otro usuario" };
    await resolver(pedido("PATCH", "/api/discount-rules/r1"), { ...LECHE, activa: false });
    await resolver(gets()[1], [{ ...LECHE, activa: false }, PAN]);
    await waitFor(() => expect(gets()).toHaveLength(3));
    await resolver(gets()[2], [{ ...LECHE, activa: false }, PAN]);

    expect(await screen.findByText("Pan de otro usuario")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Recargar promociones" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("CONTROL: sin cambios de por medio, la carga más nueva gana aunque la vieja llegue después", async () => {
    montar();
    await waitFor(() => expect(gets()).toHaveLength(2));

    await resolver(gets()[1], [LECHE]);
    expect(await screen.findByText("Leche con descuento")).toBeTruthy();

    await resolver(gets()[0], []);
    expect(screen.getByText("Leche con descuento")).toBeTruthy();
  });
});
