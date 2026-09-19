/**
 * __tests__/carga-vieja-promotions-tab.test.tsx
 *
 * El mismo bug medido en Tareas el 2026-09-14: al montar salen dos GET (doble
 * montaje) y, si el primero vuelve DESPUÉS de Eliminar, la lista vieja pisa la
 * pantalla y la promo borrada reaparece. En PromotionsTab la carga junta
 * `/api/promotions` y `/api/customers`, y Eliminar termina con una recarga.
 *
 * Cada pedido queda pendiente hasta que el test lo resuelve: el orden de
 * llegada lo decide el test, no la red. StrictMode reproduce los dos GET.
 */
import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/csrf-client", () => ({ csrfHeaders: (h: Record<string, string> = {}) => h }));

import PromotionsTab from "@/components/admin/PromotionsTab";
import { ConfirmDialogProvider } from "@/components/admin/shared/ConfirmDialog";

const ARROZ = {
  id: "p1",
  name: "2x1 en arroz",
  description: "Solo por hoy",
  discountPercent: 10,
  active: true,
  targetType: "all",
  createdAt: "2026-09-10T15:00:00.000Z",
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

const gets = (url: string) => pendientes.filter((p) => p.metodo === "GET" && p.url === url);
const pedido = (metodo: string, url: string) => pendientes.find((p) => p.metodo === metodo && p.url === url);
// Filas de la lista (su botón «Eliminar»): la tarjeta «Más usada» también
// muestra el nombre y no se oculta con el «Cargando…».
const filas = () => screen.queryAllByTitle("Eliminar").length;

async function resolver(p: Pendiente | undefined, cuerpo: unknown) {
  if (!p) throw new Error("el pedido todavía no salió");
  await act(async () => {
    p.resolver(cuerpo);
  });
}

/** La carga n-ésima = el par promociones + clientes que salió en ese orden. */
async function resolverCarga(n: number, promos: unknown[]) {
  await resolver(gets("/api/promotions")[n], promos);
  await resolver(gets("/api/customers")[n], []);
}

function montar() {
  render(
    <StrictMode>
      <ConfirmDialogProvider>
        <PromotionsTab />
      </ConfirmDialogProvider>
    </StrictMode>,
  );
}

describe("PromotionsTab — una carga vieja no pisa lo que ya cambió", () => {
  it("la promo eliminada no reaparece cuando el GET del doble montaje vuelve tarde", async () => {
    montar();
    await waitFor(() => expect(gets("/api/promotions")).toHaveLength(2));

    await resolverCarga(1, [ARROZ]);
    await waitFor(() => expect(filas()).toBeGreaterThan(0));

    await act(async () => {
      fireEvent.click(screen.getByTitle("Eliminar"));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));
    });
    await waitFor(() => expect(pedido("DELETE", "/api/promotions/p1")).toBeTruthy());
    await resolver(pedido("DELETE", "/api/promotions/p1"), { ok: true });

    // Eliminar recarga: sale la tercera carga.
    await waitFor(() => expect(gets("/api/promotions")).toHaveLength(3));

    // La carga del montaje llega ahora, con la lista de antes del borrado.
    await resolverCarga(0, [ARROZ]);
    expect(filas()).toBe(0);
    // Y no apaga el «Cargando…»: la pantalla espera a la carga más nueva.
    expect(screen.getByText("Cargando…")).toBeTruthy();

    await resolverCarga(2, []);
    expect(filas()).toBe(0);
    expect(screen.getByText("Todavía no tienes promociones")).toBeTruthy();
  });

  it("CONTROL: sin cambios de por medio, la carga más nueva gana aunque la vieja llegue después", async () => {
    montar();
    await waitFor(() => expect(gets("/api/promotions")).toHaveLength(2));

    await resolverCarga(1, [ARROZ]);
    await waitFor(() => expect(filas()).toBeGreaterThan(0));

    await resolverCarga(0, []);
    expect(filas()).toBeGreaterThan(0);
  });
});
