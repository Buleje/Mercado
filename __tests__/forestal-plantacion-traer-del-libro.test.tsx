// @vitest-environment jsdom
/**
 * «Traer lo del Libro TH» en el trámite de actualización, por el camino de la
 * persona: abre el panel, la plantación se elige sola por el código del
 * trámite, ve qué pasa con cada especie y completa la producción. La que el
 * libro tiene y el trámite no, entra con un clic. Lo que ya estaba escrito no
 * se toca.
 */

import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BloqueInput } from "@/lib/forestal/plantacion-tramite";
import PlantacionTraerDelLibro from "@/components/admin/forestal/PlantacionTraerDelLibro";

const PLANES = [
  { id: "po", planType: "PO", planNumber: "PO 12", tituloHabilitante: null, titularName: "Otro" },
  { id: "plt", planType: "PLANTACION", planNumber: "QA-459-INFORME", tituloHabilitante: null, titularName: "Agroforestal QA" },
];
const ESPECIES = [
  { speciesCommon: "Bolaina", speciesScientific: "Guazuma crinita", cites: false, volumenAutorizadoM3: "120", arbolesAutorizados: 400, anioInstalacion: 2018 },
  { speciesCommon: "Capirona", speciesScientific: "Calycophyllum spruceanum", cites: false, volumenAutorizadoM3: "80", arbolesAutorizados: 200, anioInstalacion: 2019 },
];
const BALANCE = {
  rows: [
    { species: "Bolaina", cites: false, autorizado: 120, talado: 2.553, trozado: 2.4, movilizado: 1.2, movilizadoTroza: 1.2, consumido: 0 },
    { species: "Capirona", cites: false, autorizado: 80, talado: 1.1, trozado: 0, movilizado: 0, movilizadoTroza: 0, consumido: 0 },
  ],
  sinRegistrar: [],
};

let urls: string[] = [];
beforeEach(() => {
  urls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(String(url));
      const u = String(url);
      const cuerpo = u.includes("balance=") ? { balance: BALANCE } : u.includes("planId=") ? { plan: PLANES[1], species: ESPECIES } : { plans: PLANES };
      return new Response(JSON.stringify(cuerpo), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

let ultimo: BloqueInput[] = [];
function Arnes({ inicial, codigo }: { inicial: BloqueInput[]; codigo: string | null }) {
  const [bloques, setBloques] = useState(inicial);
  ultimo = bloques;
  return <PlantacionTraerDelLibro bloques={bloques} codigo={codigo} onChange={setBloques} />;
}

describe("Traer lo del Libro TH", () => {
  it("elige la plantación por el código, completa lo vacío y agrega la que falta", async () => {
    render(<Arnes inicial={[{ numero: 1, vertices: [], especies: [{ nombreComun: "Bolaina" }] }]} codigo="qa/459 informe" />);
    // Nada se lee antes de pedirlo.
    expect(urls).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: /Traer lo del Libro TH/ }));

    const lista = await screen.findByRole("list", { name: "Especies del Libro TH" });
    expect((screen.getByLabelText("Plantación del Libro TH") as HTMLSelectElement).value).toBe("plt");
    expect(screen.getByText("Coincide con el código de plantación del trámite.")).toBeTruthy();
    // El PO no se ofrece.
    expect(screen.queryByRole("option", { name: /PO 12/ })).toBeNull();
    expect(urls.some((u) => u.includes("balance=plt"))).toBe(true);
    expect(within(lista).getByText(/Bloque 1: se completa con 2\.553 m³/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Completar la producción (1)" }));
    await waitFor(() => expect(ultimo[0].especies[0]).toMatchObject({ produccionCantidad: 2.553, produccionUnidad: "m³" }));
    expect(screen.getByText(/Completé la producción de Bolaina 2\.553 m³ \(bloque 1\)/)).toBeTruthy();
    expect(within(lista).getByText(/Bloque 1: ya dice 2\.553 m³/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Agregar Capirona al trámite" }));
    await waitFor(() => expect(ultimo[0].especies).toHaveLength(2));
    expect(ultimo[0].especies[1]).toMatchObject({ nombreComun: "Capirona", nombreCientifico: "Calycophyllum spruceanum", anioInstalacion: 2019, cantidad: 200, produccionCantidad: 1.1 });
  });

  it("no pisa una producción ya escrita y lo dice", async () => {
    render(<Arnes inicial={[{ numero: 1, vertices: [], especies: [{ nombreComun: "Bolaina", produccionCantidad: 3, produccionUnidad: "m³" }, { nombreComun: "Capirona" }] }]} codigo="QA-459-INFORME" />);
    fireEvent.click(screen.getByRole("button", { name: /Traer lo del Libro TH/ }));
    const lista = await screen.findByRole("list", { name: "Especies del Libro TH" });
    expect(within(lista).getByText(/Bloque 1: ya tiene 3 m³ — no se cambia/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Completar la producción (1)" }));
    await waitFor(() => expect(ultimo[0].especies[1].produccionCantidad).toBe(1.1));
    expect(ultimo[0].especies[0].produccionCantidad).toBe(3);
    expect(screen.getByText(/No cambié una especie que ya tenía dato/)).toBeTruthy();
  });

  it("con dos plantaciones y sin código no adivina; al escribir el código se elige sola, y una elección a mano no se pisa", async () => {
    const dos = [...PLANES, { id: "plt2", planType: "PLANTACION", planNumber: "OTRA-1", tituloHabilitante: null, titularName: "Otro titular" }];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        const cuerpo = u.includes("balance=") ? { balance: BALANCE } : u.includes("planId=") ? { plan: dos[1], species: ESPECIES } : { plans: dos };
        return new Response(JSON.stringify(cuerpo), { status: 200, headers: { "Content-Type": "application/json" } });
      }),
    );
    const inicial: BloqueInput[] = [{ numero: 1, vertices: [], especies: [{ nombreComun: "Bolaina" }] }];
    const { rerender } = render(<Arnes inicial={inicial} codigo={null} />);
    fireEvent.click(screen.getByRole("button", { name: /Traer lo del Libro TH/ }));
    await screen.findByText("Escribe arriba el código de plantación y se elige sola.");
    const select = screen.getByLabelText("Plantación del Libro TH") as HTMLSelectElement;
    expect(select.value).toBe("");

    rerender(<Arnes inicial={inicial} codigo="QA-459-INFORME" />);
    await waitFor(() => expect(select.value).toBe("plt"));
    await screen.findByRole("list", { name: "Especies del Libro TH" });

    fireEvent.change(select, { target: { value: "plt2" } });
    await screen.findByText("Elegiste otra plantación que la del código del trámite.");
    rerender(<Arnes inicial={inicial} codigo="qa-459-informe" />);
    expect(select.value).toBe("plt2");
  });

  it("sin el Libro TH habilitado lo dice, sin romper el trámite", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "specialization_disabled" }), { status: 403, headers: { "Content-Type": "application/json" } })),
    );
    render(<Arnes inicial={[]} codigo={null} />);
    fireEvent.click(screen.getByRole("button", { name: /Traer lo del Libro TH/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("El Libro TH no está habilitado");
  });
});
