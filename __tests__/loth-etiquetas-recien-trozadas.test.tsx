/**
 * LothEtiquetasRecienTrozadas — el aviso persistente al GUARDAR un trozado
 * (28-09): «Imprimir etiquetas» sólo vivía en la tabla o en el detalle de una
 * línea; al guardar (de a uno, "Guardar y otro", o el múltiple de un árbol)
 * la vista no ofrecía imprimir sin volver a marcar en la tabla.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LothEtiquetasRecienTrozadas from "@/components/admin/forestal/LothEtiquetasRecienTrozadas";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";

const linea = (over: Partial<LothEntryDTO> = {}): LothEntryDTO => ({
  id: "l1",
  section: "trozado",
  lineNo: 901,
  entryDate: "2026-09-28",
  treeCode: "014-TOR",
  trozaCode: "014-TOR-A",
  despachoCode: null,
  isRama: false,
  speciesCommon: "Tornillo",
  speciesScientific: "Cedrelinga cateniformis",
  cites: false,
  diamMayorM: "0.45",
  diamMenorM: "0.39",
  lengthM: "6.16",
  volumeM3: "3.215",
  productType: null,
  quantity: null,
  unit: null,
  pieces: null,
  gtfNumber: null,
  discarded: false,
  consumoInterno: false,
  observations: null,
  status: "registrado",
  annulledReason: null,
  gpsLat: null,
  gpsLng: null,
  photoUrl: null,
  ...over,
});

describe("LothEtiquetasRecienTrozadas", () => {
  it("sin trozas, no se muestra (el aviso vacío es peor que ningún aviso)", () => {
    const { container } = render(
      <LothEtiquetasRecienTrozadas trozas={[]} imprimiendo={false} onImprimir={vi.fn()} onCerrar={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("con 1 troza, singular; con varias, el botón dice el número exacto", () => {
    const { rerender } = render(
      <LothEtiquetasRecienTrozadas
        trozas={[linea()]}
        imprimiendo={false}
        onImprimir={vi.fn()}
        onCerrar={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /imprimir la etiqueta/i })).toBeInTheDocument();

    rerender(
      <LothEtiquetasRecienTrozadas
        trozas={[linea({ id: "l1", trozaCode: "014-TOR-A" }), linea({ id: "l2", trozaCode: "014-TOR-B" }), linea({ id: "l3", trozaCode: "014-TOR-C" })]}
        imprimiendo={false}
        onImprimir={vi.fn()}
        onCerrar={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /imprimir las 3 etiquetas/i })).toBeInTheDocument();
  });

  it("«Imprimir» llama a onImprimir con las trozas que trajo; «Listo» llama a onCerrar", async () => {
    const user = userEvent.setup();
    const onImprimir = vi.fn();
    const onCerrar = vi.fn();
    render(
      <LothEtiquetasRecienTrozadas
        trozas={[linea({ id: "l1" }), linea({ id: "l2", trozaCode: "014-TOR-B" })]}
        imprimiendo={false}
        onImprimir={onImprimir}
        onCerrar={onCerrar}
      />,
    );
    await user.click(screen.getByRole("button", { name: /imprimir las 2 etiquetas/i }));
    expect(onImprimir).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: /listo/i }));
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });

  it("mientras imprime, el botón se deshabilita y avisa «Generando…» sin robar el foco", () => {
    render(
      <LothEtiquetasRecienTrozadas trozas={[linea()]} imprimiendo onImprimir={vi.fn()} onCerrar={vi.fn()} />,
    );
    const boton = screen.getByRole("button", { name: /generando/i });
    expect(boton).toBeDisabled();
    expect(document.activeElement).not.toBe(boton);
  });
});
