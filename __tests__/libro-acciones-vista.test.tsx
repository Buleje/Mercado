/**
 * Las acciones de cada vista viajan al riel del libro (Brandon 17-10: «los
 * botones… al lado de las pestañas en la esquina»).
 *
 * Contrato de `AccionesDeLaVista`:
 *  · dentro de un libro con riel → portal al hueco del riel;
 *  · sin libro (otra pestaña del panel, un test) → en su lugar;
 *  · dentro de una ventana (`role="dialog"`) abierta desde la vista → en su
 *    lugar, aunque el contexto del libro llegue por React.
 * Y lo usan solas `VistaHeader` (título callado, ⓘ y acciones al riel) y
 * `useKpisPlegables` (el botón al riel, el panel en la vista).
 */
import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { AccionesDeLaVista, ProveedorAccionesDeLaVista } from "@/components/admin/shared/libro-acciones-vista";
import { VistaHeader } from "@/components/admin/shared/module-primitives";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";

/** Lo mínimo de `LibroChrome`: un riel con su hueco y las vistas debajo. */
function Libro({ children }: { children: ReactNode }) {
  const [hueco, setHueco] = useState<HTMLElement | null>(null);
  return (
    <div>
      <div data-testid="riel" ref={setHueco} />
      <ProveedorAccionesDeLaVista value={hueco}>
        <div data-testid="vista">{children}</div>
      </ProveedorAccionesDeLaVista>
    </div>
  );
}

describe("AccionesDeLaVista", () => {
  it("sin libro se pinta en su lugar", () => {
    render(
      <div data-testid="vista">
        <AccionesDeLaVista>
          <button type="button">Nuevo ingreso</button>
        </AccionesDeLaVista>
      </div>,
    );
    expect(within(screen.getByTestId("vista")).getByRole("button", { name: "Nuevo ingreso" })).toBeTruthy();
  });

  it("dentro del libro va al hueco del riel, no a la vista", async () => {
    render(
      <Libro>
        <AccionesDeLaVista>
          <button type="button">Nuevo ingreso</button>
        </AccionesDeLaVista>
      </Libro>,
    );
    await waitFor(() =>
      expect(within(screen.getByTestId("riel")).getByRole("button", { name: "Nuevo ingreso" })).toBeTruthy(),
    );
    expect(within(screen.getByTestId("vista")).queryByRole("button", { name: "Nuevo ingreso" })).toBeNull();
  });

  it("respeta el orden: «+ Nuevo» va último aunque monte primero", async () => {
    render(
      <Libro>
        <AccionesDeLaVista orden={20}>
          <button type="button">Nuevo</button>
        </AccionesDeLaVista>
        <AccionesDeLaVista orden={-20}>
          <button type="button">Indicadores</button>
        </AccionesDeLaVista>
      </Libro>,
    );
    const riel = screen.getByTestId("riel");
    await waitFor(() => expect(within(riel).getAllByRole("button")).toHaveLength(2));
    const grupos = Array.from(riel.querySelectorAll<HTMLElement>("[data-acciones-vista]"));
    const orden = Object.fromEntries(grupos.map((g) => [g.textContent, Number(g.style.order)]));
    expect(orden.Indicadores).toBeLessThan(orden.Nuevo);
  });

  it("dentro de una ventana abierta desde la vista se queda en la ventana", async () => {
    render(
      <Libro>
        <div role="dialog" aria-label="Ingreso">
          <AccionesDeLaVista>
            <button type="button">Guardar</button>
          </AccionesDeLaVista>
        </div>
      </Libro>,
    );
    await waitFor(() =>
      expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Guardar" })).toBeTruthy(),
    );
    expect(within(screen.getByTestId("riel")).queryByRole("button")).toBeNull();
  });

  it("`fueraDelLibro` reemplaza lo que se pinta en su lugar; null = nada", () => {
    render(
      <div data-testid="vista">
        <AccionesDeLaVista fueraDelLibro={<span>cabecera entera</span>}>
          <button type="button">sólo ⓘ</button>
        </AccionesDeLaVista>
        <AccionesDeLaVista fueraDelLibro={null}>
          <button type="button">nada</button>
        </AccionesDeLaVista>
      </div>,
    );
    expect(screen.getByText("cabecera entera")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("VistaHeader", () => {
  it("fuera del libro: título y acciones en su fila", () => {
    render(
      <VistaHeader titulo="Fletes" meta="3 viajes">
        <button type="button">Anotar viaje</button>
      </VistaHeader>,
    );
    expect(screen.getByText("Fletes")).toBeTruthy();
    expect(screen.getByText("3 viajes")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Anotar viaje" })).toBeTruthy();
  });

  it("dentro del libro: el título se calla y la cifra y las acciones van al riel", async () => {
    render(
      <Libro>
        <VistaHeader titulo="Fletes" meta="3 viajes">
          <button type="button">Anotar viaje</button>
        </VistaHeader>
      </Libro>,
    );
    const riel = screen.getByTestId("riel");
    await waitFor(() => expect(within(riel).getByRole("button", { name: "Anotar viaje" })).toBeTruthy());
    expect(within(riel).getByText("3 viajes")).toBeTruthy();
    expect(screen.queryByText("Fletes")).toBeNull();
    expect(screen.getByTestId("vista").textContent).toBe("");
  });
});

function VistaConIndicadores() {
  const { boton, panel } = useKpisPlegables({
    claveMemoria: "test-riel",
    tarjetas: [<div key="a">Tarjeta A</div>],
    abiertoPorDefecto: true,
  });
  return (
    <div>
      {boton}
      {panel}
    </div>
  );
}

describe("useKpisPlegables", () => {
  it("dentro del libro el botón va al riel y el panel queda en la vista", async () => {
    render(
      <Libro>
        <VistaConIndicadores />
      </Libro>,
    );
    const riel = screen.getByTestId("riel");
    await waitFor(() => expect(within(riel).getByRole("button", { name: /Indicadores/ })).toBeTruthy());
    expect(within(screen.getByTestId("vista")).getByText("Tarjeta A")).toBeTruthy();
    expect(within(screen.getByTestId("vista")).queryByRole("button")).toBeNull();
  });
});
