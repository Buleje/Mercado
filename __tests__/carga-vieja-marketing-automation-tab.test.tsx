/**
 * __tests__/carga-vieja-marketing-automation-tab.test.tsx
 *
 * El mismo bug medido en Tareas el 2026-09-14: al montar salen dos GET (doble
 * montaje) y, si el primero vuelve DESPUÉS de Eliminar, la lista vieja pisa la
 * pantalla y la campaña borrada reaparece.
 *
 * Eliminar NO recarga a propósito: `CampaignsDB.list` es "use cache" y el borrado
 * hace `revalidateTag(tag, "max")`, que sirve la lista vieja una vez más. El
 * test lo fija: después de Eliminar no sale otro GET.
 *
 * Cada pedido queda pendiente hasta que el test lo resuelve: el orden de
 * llegada lo decide el test, no la red. StrictMode reproduce los dos GET.
 */
import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/csrf-client", () => ({ csrfHeaders: (h: Record<string, string> = {}) => h }));

import MarketingAutomationTab from "@/components/admin/MarketingAutomationTab";

const ARROZ = {
  id: "c1",
  name: "Oferta de arroz",
  message: "Hola, hoy tenemos 20% en arroz",
  segment: "todos",
  channel: "whatsapp",
  status: "borrador",
  scheduledAt: null,
  sentAt: null,
  totalAudience: 12,
  delivered: 0,
  opened: 0,
  conversions: 0,
  revenue: 0,
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

const gets = () => pendientes.filter((p) => p.metodo === "GET" && p.url === "/api/campaigns");
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
      <MarketingAutomationTab />
    </StrictMode>,
  );
}

describe("MarketingAutomationTab — una carga vieja no pisa lo que ya cambió", () => {
  it("la campaña eliminada no reaparece cuando el GET del doble montaje vuelve tarde", async () => {
    montar();
    await waitFor(() => expect(gets()).toHaveLength(2));

    await resolver(gets()[1], [ARROZ]);
    expect(await screen.findByText("Oferta de arroz")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Eliminar campaña" }));
    await waitFor(() => expect(pedido("DELETE", "/api/campaigns?id=c1")).toBeTruthy());
    await resolver(pedido("DELETE", "/api/campaigns?id=c1"), { ok: true });
    expect(screen.queryByText("Oferta de arroz")).toBeNull();

    // El GET que salió en el montaje llega ahora, con la lista de antes del borrado.
    await resolver(gets()[0], [ARROZ]);
    expect(screen.queryByText("Oferta de arroz")).toBeNull();
    expect(screen.getByText("Aún no tienes campañas")).toBeTruthy();
    // Sin recarga tras Eliminar: el caché del GET la traería de vuelta.
    expect(gets()).toHaveLength(2);
  });

  it("CONTROL: sin cambios de por medio, la carga más nueva gana aunque la vieja llegue después", async () => {
    montar();
    await waitFor(() => expect(gets()).toHaveLength(2));

    await resolver(gets()[1], [ARROZ]);
    expect(await screen.findByText("Oferta de arroz")).toBeTruthy();

    await resolver(gets()[0], []);
    expect(screen.getByText("Oferta de arroz")).toBeTruthy();
  });
});
