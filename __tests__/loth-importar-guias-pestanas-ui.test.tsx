/**
 * La tarjeta de una guía en «Importar guías despachadas» (Brandon 07-10-2026):
 * tres pestañas —Datos de la guía · Trozas y resumen · Directorio—, cada una
 * con su cifra en el rótulo, plegable, con ←/→ y sin perder nada de lo que
 * antes se veía apilado. La ficha es REAL de Blas (`fichas-blas.json`).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import LothImportarGuiasGuia from "@/components/admin/forestal/LothImportarGuiasGuia";
import type { GuiaVistaPrevia, TrozaImportada } from "@/lib/forestal/loth-importar-guia-tipos";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import fichasJson from "./forestal-loth-importar-guia.fichas-blas.json";

const FICHA = (fichasJson as unknown as Record<string, GtfSerfor>)["1-10-0473187"];

const troza = (i: number, especie: string): TrozaImportada => ({
  indice: i,
  codificacionGuia: `16${i}-C`,
  trozaCode: `16${i}-C`,
  treeCode: `16${i}`,
  sinCodigo: false,
  speciesCommon: especie,
  speciesScientific: null,
  diamMayorM: 0.6,
  diamMenorM: 0.5,
  lengthM: 5,
  volumeM3: 1.4,
  estado: "nueva",
  detalle: null,
});

function guia(over: Partial<GuiaVistaPrevia> = {}): GuiaVistaPrevia {
  return {
    clave: "1-10-0473187",
    fuente: { tipo: "serfor", numeroRegistro: "1-10-0473187" },
    estado: "lista",
    estadoSinTala: "lista",
    mensaje: null,
    guia: {
      numeroRegistro: "1-10-0473187",
      gtfNumber: "010-001-0473187",
      fecha: "2026-09-10",
      estadoSerfor: "Activa",
      anulada: false,
      titular: FICHA.titular,
      representanteLegal: null,
      numeroTitulo: null,
      origenRecurso: "PERMISO",
      destinatario: FICHA.destinatario,
      volumenDeclaradoM3: 2.8,
      volumenTrozasM3: 2.8,
      piezas: 2,
      especies: ["Cumala", "Pashaco"],
      verificadaEnSerfor: true,
    },
    permiso: null,
    trozas: [troza(1, "Cumala"), troza(2, "Pashaco")],
    talas: [],
    crearTalaPorDefecto: true,
    avisos: [],
    ficha: FICHA,
    directorio: { partes: [], vehiculo: null, permiso: null },
    ...over,
  };
}

function montar(g: GuiaVistaPrevia, abiertaDeEntrada: boolean) {
  return render(
    <LothImportarGuiasGuia
      g={g}
      incluida
      onIncluir={vi.fn()}
      conTala
      alDirectorio={undefined}
      onDirectorio={vi.fn()}
      abiertaDeEntrada={abiertaDeEntrada}
      motivoCupo=""
      onMotivoCupo={vi.fn()}
      renombresOk={[]}
      onRenombres={vi.fn()}
    />,
  );
}

afterEach(cleanup);

describe("pestañas de la guía en la vista previa", () => {
  it("con pocas guías arranca en «Datos de la guía», sin el resumen por especie", () => {
    montar(guia(), true);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual([
      expect.stringContaining("Datos de la guía"),
      expect.stringMatching(/Trozas y resumen.*2 trozas/),
      expect.stringMatching(/Directorio.*todos ya están/),
    ]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getAllByText("Destinatario").length).toBeGreaterThan(0);
    expect(within(panel).getAllByText("Propietario del producto").length).toBeGreaterThan(0);
    expect(within(panel).queryByText("Resumen por especie")).toBeNull();
    expect(within(panel).queryByText("Detalle del producto (37)")).toBeNull();
  });

  it("«Trozas y resumen» trae la lista, el resumen por especie y el (37); clic otra vez la pliega", () => {
    montar(guia(), true);
    const trozas = screen.getAllByRole("tab")[1];
    fireEvent.click(trozas);
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText(/Lista de trozas \(2\)/)).toBeTruthy();
    expect(within(panel).getByText("Resumen por especie")).toBeTruthy();
    expect(within(panel).getByText("Detalle del producto (37)")).toBeTruthy();
    expect(within(panel).queryByText("Destinatario")).toBeNull();
    fireEvent.click(trozas);
    expect(screen.queryByRole("tabpanel")).toBeNull();
  });

  it("con muchas guías arranca plegada; ← / → recorren las pestañas", () => {
    montar(guia(), false);
    expect(screen.queryByRole("tabpanel")).toBeNull();
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0].tabIndex).toBe(0);
    fireEvent.keyDown(tabs[0], { key: "ArrowLeft" });
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(tabs[2].id);
    expect(screen.getByText("Quién de esta guía ya está en tu directorio")).toBeTruthy();
  });

  it("sin ficha ni directorio: sólo «Trozas y resumen», con el resumen por especie", () => {
    montar(guia({ ficha: null, directorio: null }), true);
    expect(screen.getAllByRole("tab")).toHaveLength(1);
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("Resumen por especie")).toBeTruthy();
  });
});
