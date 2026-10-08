/**
 * Vista GTF del Libro TH (Brandon 07-10):
 *   1. «Acciones» = un menú ⋯ con las mismas acciones y condiciones de antes;
 *      a la vista sólo «Ingresar al CTP» cuando la guía está por ingresar.
 *   2. Las anuladas (y las borradas) salen de «Guías» y viven en «Anuladas y otras».
 *   3. El modal «Datos» separa «GTF» y «Lista de trozas» en dos pestañas.
 * La ficha de SERFOR es la anonimizada de Blas (mismo JSON que el importador).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import fichasJson from "./forestal-loth-importar-guia.fichas-blas.json";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import { gtfDatosConFicha, observacionGuia } from "@/lib/forestal/loth-importar-guia";
import AccionesGtf from "@/components/admin/forestal/gtf-acciones-menu";
import ModalFichaImportada from "@/components/admin/forestal/LothImportarGuiasFicha";
import LothGtfView from "@/components/admin/forestal/LothGtfView";
import type { Gtf } from "@/components/admin/forestal/gtf-tabla-columnas";

const FICHA = (fichasJson as unknown as Record<string, GtfSerfor>)["1-10-0474633"];
const DATOS = JSON.parse(JSON.stringify(gtfDatosConFicha(FICHA, true))) as unknown;
const ITEMS = [
  { code: "A-1", species: "Cumala", diamMayorM: 0.6, diamMenorM: 0.5, lengthM: 4, volumeM3: 0.95 },
  { code: "A-2", species: "Cumala", diamMayorM: 0.55, diamMenorM: 0.5, lengthM: 4, volumeM3: 0.87 },
];

const guia = (n: string, extra: Partial<Gtf> = {}): Gtf => ({
  id: `g${n}`, gtfNumber: `019-001-00000${n}`, gtfDate: "2026-09-1" + n, tipo: "trozas",
  titularName: "Titular", tituloHabilitante: null, parcelaCorta: null, transportista: null, transportistaDoc: null,
  conductor: null, conductorLicencia: null, placaVehiculo: null, origen: null, destino: "Pucallpa",
  items: ITEMS, volumenTotalM3: "1.8200", piezasTotal: 2, observations: null, status: "emitida", annulledReason: null,
  ...extra,
});

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const nada = () => undefined;
const abrirMenu = (n: string) => fireEvent.click(screen.getByRole("button", { name: `Acciones de la GTF 019-001-00000${n}` }));
/* Al hacer clic, ActionMenu abre en el pointerdown/clic: se leen las opciones del menú en el portal. */
const opciones = () => within(screen.getByRole("menu")).getAllByRole("menuitem").map((b) => b.textContent ?? "");
const tiene = (lista: string[], texto: string) => lista.some((t) => t.includes(texto));

describe("Acciones de la guía: menú ⋯", () => {
  it("importada, viva y por ingresar: «Ingresar al CTP» a la vista y el resto en el menú", () => {
    const onAnular = vi.fn();
    render(
      <AccionesGtf
        g={guia("1", { gtfDatos: DATOS, observations: observacionGuia("1-10-0474633", true) })}
        porIngresar onIngresarCtp={nada} onHoja={nada} onResumen={nada} onAnular={onAnular} onRecargar={nada}
      />,
    );
    expect(screen.getByRole("button", { name: /Ingresar al CTP/ })).toBeTruthy();
    abrirMenu("1");
    const o = opciones();
    for (const t of ["Datos", "Imprimir hoja SERFOR", "Imprimir resumen interno", "Deshacer la importación", "Anular la guía"]) {
      expect(tiene(o, t), t).toBe(true);
    }
    expect(tiene(o, "Ver sus ingresos")).toBe(false);
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: /Anular la guía/ }));
    expect(onAnular).toHaveBeenCalledWith("g1");
  });

  it("anotada a mano y ya ingresada: sin Datos ni Deshacer, con «Ver sus ingresos» y sin el botón de ingresar", () => {
    render(<AccionesGtf g={guia("2", { ctp: "ingresada" })} onIngresarCtp={nada} onHoja={nada} onResumen={nada} onAnular={nada} />);
    expect(screen.queryByRole("button", { name: /Ingresar al CTP/ })).toBeNull();
    abrirMenu("2");
    const o = opciones();
    expect(tiene(o, "Datos")).toBe(false);
    expect(tiene(o, "Deshacer")).toBe(false);
    expect(tiene(o, "Ver sus ingresos en el CTP")).toBe(true);
    expect(tiene(o, "Anular la guía")).toBe(true);
  });

  it("anulada o en sólo lectura: sólo ver, imprimir y sus documentos", () => {
    render(
      <AccionesGtf
        g={guia("3", { status: "anulada", annulledReason: "Error de tipeo", gtfDatos: DATOS, observations: observacionGuia("1-10-0474633", true) })}
        porIngresar onIngresarCtp={nada} onHoja={nada} onResumen={nada} onAnular={nada}
      />,
    );
    expect(screen.queryByRole("button", { name: /Ingresar al CTP/ })).toBeNull();
    abrirMenu("3");
    /* «Documentos del permiso» (08-10) también: leer los papeles del permiso no depende del estado de la guía. */
    expect(opciones()).toHaveLength(4);
    const o = opciones();
    expect(tiene(o, "Datos") && tiene(o, "Imprimir hoja SERFOR") && tiene(o, "Imprimir resumen interno") && tiene(o, "Documentos del permiso")).toBe(true);
    expect(tiene(o, "Anular") || tiene(o, "Deshacer")).toBe(false);
  });
});

describe("Modal «Datos»", () => {
  it("separa «GTF» y «Lista de trozas» en pestañas, y es el modal amplio", () => {
    render(<ModalFichaImportada gtfDatos={DATOS} gtfNumber="019-001-000001" items={ITEMS} onClose={nada} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    expect(tabs[0].textContent).toContain("GTF");
    expect(tabs[1].textContent).toMatch(/Lista de trozas.*2/);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByText(/Trozas de la guía \(2\)/)).toBeNull();
    fireEvent.click(tabs[1]);
    expect(screen.getByText(/Trozas de la guía \(2\)/)).toBeTruthy();
    /* Los dos códigos SIEMPRE (08-10): «Código en la guía» y «Código único» (acá coinciden). */
    expect(screen.getAllByText("A-2")).toHaveLength(2);
    expect(screen.getByRole("columnheader", { name: "Código en la guía" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Código único" })).toBeTruthy();
    expect(screen.getByRole("dialog").className).toContain("sm:max-w-[min(96vw,1400px)]");
    expect(screen.getByRole("dialog").className).toContain("sm:h-[90vh]");
  });
});

describe("Vista GTF: «Guías» y «Anuladas y otras»", () => {
  it("la anulada no sale en Guías; sale (con la borrada) en Anuladas y otras", async () => {
    const vigente = guia("1");
    const anulada = guia("2", { status: "anulada", annulledReason: "Placa mal escrita", updatedAt: "2026-10-05T15:00:00.000Z" });
    const borrada = guia("3", { deletedAt: "2026-10-06T15:00:00.000Z" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });
        if (u.includes("estado=bajas")) return json({ gtfs: [anulada, borrada] });
        if (u.includes("sinIngresar=1")) return json({ gtfs: [] });
        if (u.includes("/forestal/gtf")) return json({ gtfs: [vigente, anulada] });
        if (u.includes("/loth/caratula")) return json({ active: null });
        return json({ entries: [] });
      }),
    );
    render(<LothGtfView />);
    await waitFor(() => expect(screen.getAllByText("019-001-000001").length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getByRole("tab", { name: /Anuladas y otras/ }).textContent).toContain("2"));
    expect(screen.queryByText("019-001-000002")).toBeNull();
    expect(screen.getByRole("tab", { name: /Guías/ }).textContent).toContain("1");

    fireEvent.click(screen.getByRole("tab", { name: /Anuladas y otras/ }));
    expect(screen.queryByText("019-001-000001")).toBeNull();
    expect(screen.getByText("019-001-000002")).toBeTruthy();
    expect(screen.getByText("019-001-000003")).toBeTruthy();
    expect(screen.getByText("Placa mal escrita")).toBeTruthy();
    expect(screen.getAllByText("Anulada").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Eliminada").length).toBeGreaterThan(0);
    /* Sus acciones son de sólo lectura. */
    abrirMenu("2");
    const o = opciones();
    expect(tiene(o, "Anular")).toBe(false);
    expect(tiene(o, "Imprimir hoja SERFOR")).toBe(true);
  });
});
