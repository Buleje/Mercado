/**
 * __tests__/carga-vieja-custom-kpi-tab.test.tsx
 *
 * El mismo bug medido en Tareas el 2026-09-14: al montar salen dos GET (doble
 * montaje) y, si el primero vuelve DESPUÉS de Eliminar, la lista vieja pisa la
 * pantalla y el KPI borrado reaparece.
 *
 * Eliminar no recarga a propósito: con 0 KPIs en la base el GET responde los de
 * ejemplo (`demo: true`) y los pintaría en lugar de «Sin KPIs definidos».
 *
 * Cada pedido queda pendiente hasta que el test lo resuelve: el orden de
 * llegada lo decide el test, no la red. StrictMode reproduce los dos GET.
 */
import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/csrf-client", () => ({ csrfHeaders: (h: Record<string, string> = {}) => h }));

import CustomKPITab from "@/components/admin/CustomKPITab";

const TICKET = {
  id: "k1",
  name: "Ticket promedio",
  description: "",
  formula: "ventas / transacciones",
  currentValue: 20,
  target: 25,
  unit: "S/",
  trend: "up",
  changePercent: 5,
  period: "Hoy",
  category: "Ventas",
  color: "bg-primary/10",
  history: [],
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

const gets = () => pendientes.filter((p) => p.metodo === "GET" && p.url === "/api/custom-kpis");
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
      <CustomKPITab />
    </StrictMode>,
  );
}

describe("CustomKPITab — una carga vieja no pisa lo que ya cambió", () => {
  it("el KPI eliminado no reaparece cuando el GET del doble montaje vuelve tarde", async () => {
    montar();
    await waitFor(() => expect(gets()).toHaveLength(2));

    await resolver(gets()[1], { kpis: [TICKET] });
    expect(await screen.findByText("Ticket promedio")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(pedido("DELETE", "/api/custom-kpis?id=k1")).toBeTruthy());
    await resolver(pedido("DELETE", "/api/custom-kpis?id=k1"), { ok: true });
    expect(screen.queryByText("Ticket promedio")).toBeNull();

    // El GET que salió en el montaje llega ahora, con la lista de antes del borrado.
    await resolver(gets()[0], { kpis: [TICKET] });
    expect(screen.queryByText("Ticket promedio")).toBeNull();
    expect(screen.getByText("Sin KPIs definidos")).toBeTruthy();
  });

  it("con Eliminar en camino, un Actualizar que vuelve después no trae el KPI de vuelta", async () => {
    montar();
    await waitFor(() => expect(gets()).toHaveLength(2));
    await resolver(gets()[1], { kpis: [TICKET] });
    await resolver(gets()[0], { kpis: [TICKET] });
    expect(await screen.findByText("Ticket promedio")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(pedido("DELETE", "/api/custom-kpis?id=k1")).toBeTruthy());

    // Actualizar mientras el borrado viaja: ese GET leyó antes de que se guardara.
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    await waitFor(() => expect(gets()).toHaveLength(3));

    await resolver(pedido("DELETE", "/api/custom-kpis?id=k1"), { ok: true });
    await resolver(gets()[2], { kpis: [TICKET] });
    expect(screen.queryByText("Ticket promedio")).toBeNull();

    // Esa carga se descarta y vuelve a pedir: ahora lee con el borrado ya guardado.
    await waitFor(() => expect(gets()).toHaveLength(4));
    await resolver(gets()[3], { kpis: [] });
    expect(screen.queryByText("Ticket promedio")).toBeNull();
    expect(screen.getByText("Sin KPIs definidos")).toBeTruthy();
  });

  it("guardar un KPI nuevo mientras viaja la carga inicial no deja la lista sólo con el nuevo (se vuelve a pedir)", async () => {
    // Sin StrictMode: una sola carga, como en producción.
    render(<CustomKPITab />);
    await waitFor(() => expect(gets()).toHaveLength(1));

    fireEvent.click(screen.getByRole("button", { name: /Nuevo KPI/ }));
    fireEvent.change(await screen.findByPlaceholderText("Ej: Ticket Promedio"), { target: { value: "Margen" } });
    fireEvent.click(screen.getByRole("button", { name: /Guardar/ }));

    await waitFor(() => expect(pedido("POST", "/api/custom-kpis")).toBeTruthy());
    await resolver(pedido("POST", "/api/custom-kpis"), { id: "k9" });
    await resolver(gets()[0], { kpis: [TICKET] });
    await waitFor(() => expect(gets()).toHaveLength(2));
    await resolver(gets()[1], { kpis: [TICKET, { ...TICKET, id: "k9", name: "Margen" }] });

    expect(await screen.findByText("Margen")).toBeTruthy();
    expect(screen.getByText("Ticket promedio")).toBeTruthy();
  });

  it("una carga vieja que falla no borra la lista que ya pintó la más nueva", async () => {
    montar();
    await waitFor(() => expect(gets()).toHaveLength(2));

    await resolver(gets()[1], { kpis: [TICKET] });
    expect(await screen.findByText("Ticket promedio")).toBeTruthy();

    // El GET viejo vuelve roto (sin cuerpo): su catch vaciaba la lista.
    await resolver(gets()[0], undefined);
    expect(screen.getByText("Ticket promedio")).toBeTruthy();
  });
});
