/**
 * 20-10 · «cuáles pertenecen a marketplace, a tienda y a mixta» + «dónde se
 * activa WhatsApp o formulario»: el mapa medido apunta a pestañas que existen,
 * el chip dice la superficie de la sección abierta, la tarjeta guarda
 * `Settings.mode` (única fuente) y la plantilla nueva lo lee de ahí.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const H = vi.hoisted(() => ({ sub: null as string | null, ajustes: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(H.sub ? `sub=${H.sub}` : "") }));
vi.mock("@/lib/tenant-fetch", () => ({ resolveActiveTenantSlug: async () => "main" }));
vi.mock("@/lib/db/settings.db", () => ({ SettingsDB: { get: async () => H.ajustes } }));
vi.mock("@/lib/db/store-page.db", () => ({ StorePageDB: { getCustomization: async () => null, listOverrides: async () => [] } }));
vi.mock("@/lib/db/products.db", () => ({ ProductsDB: { getAll: async () => [] }, PriceHistoryDB: { getByProducts: async () => [] } }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { ALCANCE_TIENDA, alcanceDe } from "@/lib/admin/alcance-tienda";
import { ANIDADAS_POR_MODULO, VISTAS_POR_MODULO } from "@/lib/admin/subvistas-modulos";
import { EtiquetaAlcance } from "@/components/admin/shared/EtiquetaAlcance";
import { TarjetaComoTePiden } from "@/components/admin/store-customizer/TarjetaComoTePiden";
import { cargarTienda } from "@/extensiones/pagina-tienda/datos";
import { leerPlantilla } from "@/extensiones/pagina-tienda/config";

afterEach(() => {
  vi.unstubAllGlobals();
  H.sub = null;
});

describe("mapa de alcance (lib/admin/alcance-tienda)", () => {
  it("cada clave es una pestaña, vista o sección que existe en el registro", () => {
    for (const clave of Object.keys(ALCANCE_TIENDA)) {
      const [tab, vista, sub] = clave.split("/");
      if (!vista) continue;
      const vistas = (VISTAS_POR_MODULO[tab] ?? []).map((v) => v.key);
      expect(vistas, clave).toContain(vista);
      if (sub) {
        const anidadas = (ANIDADAS_POR_MODULO[tab] ?? []).filter((a) => a.vista === vista).map((a) => a.key);
        expect(anidadas, clave).toContain(sub);
      }
    }
  });

  it("gana la clave más específica; sin clave, nada", () => {
    expect(alcanceDe("pagina-inicio", "contenido", "banners")?.alcance).toBe("marketplace");
    expect(alcanceDe("pagina-inicio", "contenido", "sections")?.alcance).toBe("tienda");
    expect(alcanceDe("pagina-inicio", "contenido")?.alcance).toBe("ambas");
    expect(alcanceDe("pagina-inicio", "apariencia", "colores")?.clave).toBe("pagina-inicio/apariencia");
    expect(alcanceDe("config", "cobros")?.alcance).toBe("ambas");
    expect(alcanceDe("config", "plan")).toBeNull();
  });
});

describe("EtiquetaAlcance", () => {
  it("lee el ?sub= de la URL: Contenido › Banners es del marketplace", () => {
    H.sub = "banners";
    render(<EtiquetaAlcance tab="pagina-inicio" vista="contenido" />);
    const chip = screen.getByTestId("etiqueta-alcance");
    expect(chip.dataset.alcance).toBe("marketplace");
    expect(chip.textContent).toContain("Marketplace");
  });

  it("sin entrada en el mapa no dibuja nada", () => {
    const { container } = render(<EtiquetaAlcance tab="config" vista="plan" />);
    expect(container.innerHTML).toBe("");
  });
});

describe("TarjetaComoTePiden (Settings.mode, se guarda al elegir)", () => {
  const conServidor = (put: number) => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/admin/store-customizer/pagina-propia") return new Response(JSON.stringify({ paginaPropia: null }));
      if (init?.method === "PUT") return new Response("{}", { status: put });
      return new Response(JSON.stringify({ mode: "checkout" }));
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  it("elegir WhatsApp manda PUT { mode: 'whatsapp' } y queda elegido", async () => {
    const fetchMock = conServidor(200);
    render(<TarjetaComoTePiden whatsapp="987654321" />);
    await waitFor(() => expect(screen.getByRole("radio", { name: /Formulario de compra/ }).getAttribute("aria-checked")).toBe("true"));
    await userEvent.click(screen.getByRole("radio", { name: /WhatsApp/ }));
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(put?.[0]).toBe("/api/settings");
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ mode: "whatsapp" });
    await screen.findByText("Guardado");
    expect(screen.getByRole("radio", { name: /WhatsApp/ }).getAttribute("aria-checked")).toBe("true");
  });

  it("si el servidor no guarda, vuelve a lo de antes y lo dice", async () => {
    conServidor(500);
    render(<TarjetaComoTePiden whatsapp="987654321" />);
    await waitFor(() => expect(screen.getByRole("radio", { name: /Formulario de compra/ }).getAttribute("aria-checked")).toBe("true"));
    await userEvent.click(screen.getByRole("radio", { name: /WhatsApp/ }));
    await screen.findByText(/No se guardó \(error 500\)/);
    expect(screen.getByRole("radio", { name: /Formulario de compra/ }).getAttribute("aria-checked")).toBe("true");
  });
});

describe("plantilla nueva: el pedido sale de Settings.mode", () => {
  it("un `pedido` viejo en tiendaPlantilla ya no manda (lo descarta el contrato)", async () => {
    expect(leerPlantilla({ tiendaPlantilla: { formato: "tienda", pedido: "whatsapp" } })).toEqual({ formato: "tienda" });
    H.ajustes = { mode: "whatsapp", storeTheme: { tiendaPlantilla: { formato: "tienda", pedido: "checkout" } } };
    expect((await cargarTienda({ tenantId: "t-wsp", slug: "wsp" })).contenido.pedido).toBe("whatsapp");
    H.ajustes = { mode: "checkout", storeTheme: { tiendaPlantilla: { formato: "tienda", pedido: "whatsapp" } } };
    expect((await cargarTienda({ tenantId: "t-form", slug: "form" })).contenido.pedido).toBe("checkout");
  });
});
