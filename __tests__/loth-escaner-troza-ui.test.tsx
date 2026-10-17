/**
 * Tests — «Escanear troza» montado en el Control del permiso (jsdom).
 *
 * jsdom no tiene `BarcodeDetector` ni cámara: es exactamente el caso «sin
 * cámara → entrada manual». Se recorre lo que haría el usuario con la pistola o
 * el teclado: abrir el escáner, tipear/escanear, ver la tarjeta, contar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import LothTableroTrozas from "@/components/admin/forestal/LothTableroTrozas";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import { textoFichaDeTrozaLoth } from "@/lib/forestal/ficha-texto-troza";

const base = {
  despachoCode: null, isRama: false, speciesScientific: null, cites: false, diamMayorM: null, diamMenorM: null,
  lengthM: null, productType: null, quantity: null, unit: null, pieces: null, gtfNumber: null, discarded: false,
  consumoInterno: false, observations: null, status: "registrado" as const, annulledReason: null, gpsLat: null,
  gpsLng: null, photoUrl: null, treeCode: null, speciesCommon: null, volumeM3: null, planId: null,
};
let seq = 0;
const l = (p: Partial<LothEntryDTO> & Pick<LothEntryDTO, "section" | "trozaCode">): LothEntryDTO => ({
  ...base, id: `e${++seq}`, lineNo: seq, entryDate: "2026-09-22T00:00:00.000Z", ...p,
});

const T111A = l({ section: "trozado", trozaCode: "111-A", treeCode: "111", speciesCommon: "Shihuahuaco", volumeM3: "4.9510" });
const ENTRIES: LothEntryDTO[] = [
  T111A,
  l({ section: "trozado", trozaCode: "002-TOR-A", treeCode: "002-TOR", speciesCommon: "Tornillo", volumeM3: "1.5150" }),
  l({ section: "despacho_troza", trozaCode: "111-A", gtfNumber: "019-0000002", entryDate: "2026-09-29T00:00:00.000Z" }),
];

function mockApi() {
  return vi.fn(async (url: string) => {
    const body = url.includes("/gtf")
      ? { gtfs: [{ gtfNumber: "019-0000002", status: "emitida", placaVehiculo: "W2D-835", destino: "Pucallpa" }] }
      : { plans: [] };
    return new Response(JSON.stringify(body), { status: 200 });
  });
}

function escanear(texto: string) {
  const campo = screen.getByPlaceholderText("Código de troza o árbol + Enter");
  fireEvent.change(campo, { target: { value: texto } });
  fireEvent.keyDown(campo, { key: "Enter" });
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal("fetch", mockApi());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Control del permiso · Escanear troza", () => {
  it("sin cámara: el botón abre la entrada manual con el foco y lo dice", () => {
    render(<LothTableroTrozas entries={ENTRIES} />);
    fireEvent.click(screen.getByRole("button", { name: /Escanear troza/ }));
    const campo = screen.getByPlaceholderText("Código de troza o árbol + Enter");
    expect(document.activeElement).toBe(campo);
    expect(screen.getByText(/Sin cámara en este navegador/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Escanear con la cámara" })).toBeNull();
  });

  it("el QR grande (ficha en texto) muestra la tarjeta con estado, GTF, placa y salida", async () => {
    render(<LothTableroTrozas entries={ENTRIES} />);
    await waitFor(() => expect(screen.getAllByText("W2D-835").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: /Escanear troza/ }));
    escanear(textoFichaDeTrozaLoth(T111A));
    const tarjeta = screen.getByRole("article", { name: "Troza 111-A" });
    const t = within(tarjeta);
    expect(t.getByText("Despachada")).toBeTruthy();
    expect(t.getByText("019-0000002")).toBeTruthy();
    expect(t.getByText("W2D-835")).toBeTruthy();
    expect(t.getByText("martes 29/09")).toBeTruthy();
    expect(t.getByText("Shihuahuaco")).toBeTruthy();
    // Ya salió: no se ofrece registrar su despacho.
    expect(t.queryByRole("button", { name: /Registrar su despacho/ })).toBeNull();
  });

  it("una disponible ofrece «Registrar su despacho», que lleva a la sección Despacho", () => {
    render(<LothTableroTrozas entries={ENTRIES} />);
    fireEvent.click(screen.getByRole("button", { name: /Escanear troza/ }));
    escanear("https://blas.buleje.pe/verificar/002-TOR-A");
    const t = within(screen.getByRole("article", { name: "Troza 002-TOR-A" }));
    expect(t.getByText("Disponible")).toBeTruthy();
    const pop = vi.fn();
    window.addEventListener("popstate", pop);
    fireEvent.click(t.getByRole("button", { name: "Registrar su despacho" }));
    window.removeEventListener("popstate", pop);
    const q = new URLSearchParams(window.location.search);
    expect(q.get("vista")).toBe("secciones");
    expect(q.get("seccion")).toBe("despacho_troza");
    expect(pop).toHaveBeenCalledTimes(1);
  });

  it("una troza de otro permiso lo dice, sin tarjeta", () => {
    render(<LothTableroTrozas entries={ENTRIES} />);
    fireEvent.click(screen.getByRole("button", { name: /Escanear troza/ }));
    escanear("999-Z");
    expect(screen.getByText(/999-Z: esta troza no es de este permiso o no está registrada/)).toBeTruthy();
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("«Ver en la tabla» deja la tabla filtrada en esa troza", () => {
    const { container } = render(<LothTableroTrozas entries={ENTRIES} />);
    fireEvent.click(screen.getByRole("button", { name: /Escanear troza/ }));
    escanear("002-tor-a");
    fireEvent.click(screen.getByRole("button", { name: /Ver en la tabla/ }));
    expect((screen.getByLabelText("Buscar trozas") as HTMLInputElement).value).toBe("002-TOR-A");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
  });

  it("contar el patio: lista sin duplicados, líneas de la ficha calladas, resumen", () => {
    render(<LothTableroTrozas entries={ENTRIES} />);
    fireEvent.click(screen.getByRole("button", { name: /Escanear troza/ }));
    fireEvent.click(screen.getByRole("button", { name: /Contar el patio/ }));
    escanear("TROZA 111-A");
    escanear("🌳 Shihuahuaco"); // la pistola sigue tipeando la ficha
    escanear("002-TOR-A");
    escanear("999-Z");
    expect(screen.getByText(/Leídas 3 · 2 en este permiso · 1 desconocida/)).toBeTruthy();
    const lista = within(screen.getByRole("list", { name: "Trozas leídas" }));
    expect(lista.getAllByRole("listitem")).toHaveLength(3);
    expect(lista.getByText("No es de este permiso")).toBeTruthy();
    expect(screen.getByRole("button", { name: /CSV/ }).hasAttribute("disabled")).toBe(false);
  });
});
