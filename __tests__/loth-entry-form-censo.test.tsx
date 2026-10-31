/**
 * Tests — «Nueva línea · Tala» con el censo cruzado con el libro (28-09).
 *
 * Lo que se prueba, por el camino del usuario (el formulario montado, con la
 * red simulada por URL):
 *   - la lista corta NO ofrece un árbol que el libro ya taló aunque el censo
 *     diga «en pie» (el 85-TOR del tenant de QA);
 *   - «Ver censo» abre la tabla; «Talados» lo muestra con su línea y sin
 *     botón para elegirlo;
 *   - elegir un disponible lo carga en el formulario y en la ficha;
 *   - un semillero del regente pide confirmar antes de cargarse;
 *   - el árbol que llega por `arbolInicial` (enlace `?nuevaTala=`) se elige solo;
 *   - lo que viaja al guardar: GPS con su origen, científico del censo y los
 *     datos internos (motosierrista, hora), y `arbolTalado` para «Trozarlo».
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import LothEntryForm from "@/components/admin/forestal/LothEntryForm";

const ARBOLES = [
  { id: "t1", treeCode: "85-TOR", speciesCommon: "Tornillo", speciesScientific: null, speciesNative: null, cites: false, dapM: "0.800", alturaComercialM: "13.00", volumenEstimadoM3: "4.2474", utmZona: "18L", utmX: "545120.00", utmY: "9012340.00", condicion: null, notes: null, estado: "en_pie" },
  { id: "t2", treeCode: "111", speciesCommon: "Copaiba", speciesScientific: "Copaifera reticulata Ducke", speciesNative: "Coubé", cites: false, dapM: "0.950", alturaComercialM: "21.00", volumenEstimadoM3: "9.6750", utmZona: null, utmX: "521961.00", utmY: "8918254.00", condicion: "Aprovechable", notes: null, estado: "en_pie" },
  { id: "t3", treeCode: "106", speciesCommon: "Copaiba", speciesScientific: "Copaifera reticulata Ducke", speciesNative: "Coubé", cites: false, dapM: "0.900", alturaComercialM: "20.00", volumenEstimadoM3: "8.1000", utmZona: null, utmX: "521970.00", utmY: "8918200.00", condicion: "Semillero", notes: null, estado: "en_pie" },
];

const USOS = [{ treeCode: "85-TOR", tala: { lineNo: 1, fecha: "2026-05-28", volumeM3: 5.003 }, trozas: 4, trozasM3: 4.2, despachadas: 2, consumidas: 0 }];

let posts: Record<string, unknown>[] = [];

function responder(url: string, init?: RequestInit) {
  const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
  if (init?.method === "POST" && url.startsWith("/api/admin/forestal/loth")) {
    posts.push(JSON.parse(String(init.body)));
    return json({ entry: { id: "nueva" } });
  }
  if (url.startsWith("/api/admin/forestal/plan?active=1")) return json({ active: { id: "p1" } });
  if (url.startsWith("/api/admin/forestal/plan?planId=")) return json({ species: [] });
  if (url === "/api/admin/forestal/plan") return json({ plans: [{ id: "p1", planType: "PO", planNumber: "12", titularName: "Maderera El Aguajal SAC" }] });
  if (url.startsWith("/api/admin/forestal/plan/census?planId=")) return json({ trees: ARBOLES, total: ARBOLES.length, truncado: false });
  if (url.startsWith("/api/admin/forestal/loth?usoCenso=1")) return json({ usos: USOS });
  if (url.startsWith("/api/admin/forestal/loth/poa")) return json({ config: { dmcOverrides: {}, semillerosPct: 10 } });
  if (url.startsWith("/api/rrhh/colaboradores")) return json({ colaboradores: [{ id: "c1", nombre: "Juan Pérez", apodo: null, puesto: { id: "p", nombre: "Motosierrista" }, estado: "ACTIVO" }] });
  return { ok: false, status: 404, json: async () => ({}) };
}

beforeEach(() => {
  posts = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => responder(String(url), init)));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const codigoArbol = () => screen.getByPlaceholderText("1-MIS") as HTMLInputElement;
const verCenso = () => screen.getByRole("button", { name: /Ver censo/ });

describe("Tala · el censo cruzado con el libro", () => {
  it("la lista corta no ofrece el árbol que el libro ya taló", async () => {
    render(<LothEntryForm section="tala" onClose={() => {}} onSaved={() => {}} />);
    const lista = await screen.findByRole("region", { name: "Elige el árbol del censo" });
    await within(lista).findByText("111");
    expect(within(lista).queryByText("85-TOR")).toBeNull();
    // El semillero del regente se ofrece, pero marcado.
    expect(within(lista).getByText("No se tala")).toBeTruthy();
  });

  it("«Ver censo» · Talados muestra la línea y no deja elegirlo; elegir un disponible lo carga", async () => {
    render(<LothEntryForm section="tala" onClose={() => {}} onSaved={() => {}} />);
    /* El conteo llega tras 3 fetch encadenados: con el hook de commit corriendo
       cientos de archivos a la vez, 1 s (el default) no alcanza. */
    await waitFor(() => expect(verCenso().textContent).toMatch(/3/), { timeout: 5000 });
    fireEvent.click(verCenso());
    const modal = await screen.findByRole("dialog", { name: "Censo del plan" });
    fireEvent.click(within(modal).getByRole("button", { name: /^Talados/ }));
    const fila = modal.querySelector('tr[data-arbol="85-TOR"]') as HTMLElement;
    expect(fila).toBeTruthy();
    expect(within(fila).getByText(/jueves 28\/05 · línea N° 1/)).toBeTruthy();
    expect(within(fila).getByText(/4 trozas · 2 despachadas/)).toBeTruthy();
    expect(within(fila).queryByRole("button", { name: /Elegir/ })).toBeNull();

    fireEvent.click(within(modal).getByRole("button", { name: /^Disponibles/ }));
    fireEvent.click(within(modal).getByRole("button", { name: "Elegir el árbol 111" }));
    // El más grueso de su especie: el cálculo del plan lo reserva como semillero.
    // El regente dice «Aprovechable» → aviso, no infracción, pero igual se confirma.
    expect(within(modal).getByRole("alert").textContent).toMatch(/Reservado como semillero en el plan/);
    fireEvent.click(within(modal).getByRole("button", { name: "Elegirlo igual" }));
    await waitFor(() => expect(codigoArbol().value).toBe("111"));
    expect(screen.queryByRole("dialog", { name: "Censo del plan" })).toBeNull();
    const ficha = document.querySelector('[data-ficha-arbol="111"]') as HTMLElement;
    expect(within(ficha).getByText("Copaifera reticulata Ducke")).toBeTruthy();
    expect(within(ficha).getByText("Coubé")).toBeTruthy();
  });

  it("un semillero del regente pide confirmar antes de cargarse", async () => {
    render(<LothEntryForm section="tala" onClose={() => {}} onSaved={() => {}} />);
    /* El conteo llega tras 3 fetch encadenados: con el hook de commit corriendo
       cientos de archivos a la vez, 1 s (el default) no alcanza. */
    await waitFor(() => expect(verCenso().textContent).toMatch(/3/), { timeout: 5000 });
    fireEvent.click(verCenso());
    const modal = await screen.findByRole("dialog", { name: "Censo del plan" });
    fireEvent.click(within(modal).getByRole("button", { name: "Elegir el árbol 106" }));
    expect(within(modal).getByRole("alert").textContent).toMatch(/El regente lo declaró semillero/);
    expect(codigoArbol().value).toBe("");
    fireEvent.click(within(modal).getByRole("button", { name: "Elegirlo igual" }));
    await waitFor(() => expect(codigoArbol().value).toBe("106"));
  });

  it("un árbol ya talado en el libro no se deja registrar otra vez (T3 lo rechazaría)", async () => {
    render(<LothEntryForm section="tala" arbolInicial="85-TOR" onClose={() => {}} onSaved={() => {}} />);
    await waitFor(() => expect(codigoArbol().value).toBe("85-TOR"));
    const registrar = screen.getByRole("button", { name: /Registrar línea/ }) as HTMLButtonElement;
    await waitFor(() => expect(registrar.getAttribute("title")).toMatch(/ya se taló en la línea N° 1/));
    expect(registrar.disabled).toBe(true);
    const ficha = document.querySelector('[data-ficha-arbol="85-TOR"]') as HTMLElement;
    expect(within(ficha).getByRole("alert").textContent).toMatch(/Talado el jueves 28\/05 · línea N° 1/);
  });

  it("el árbol que llega por el enlace se elige solo", async () => {
    render(<LothEntryForm section="tala" arbolInicial="111" onClose={() => {}} onSaved={() => {}} />);
    await waitFor(() => expect(codigoArbol().value).toBe("111"));
  });

  it("al guardar viajan el origen del GPS, el científico del censo y los datos internos", async () => {
    const onSaved = vi.fn();
    render(<LothEntryForm section="tala" arbolInicial="111" onClose={() => {}} onSaved={onSaved} />);
    await waitFor(() => expect(codigoArbol().value).toBe("111"));
    fireEvent.change(screen.getByLabelText("Ø sección menor — medida cruzada 1"), { target: { value: "0.75" } });
    fireEvent.change(screen.getByPlaceholderText(/Elige de tu personal|Nombre de quien tumbó/), { target: { value: "Juan Pérez" } });
    fireEvent.change(screen.getByLabelText("Hora de tala"), { target: { value: "09:30" } });
    const registrar = screen.getByRole("button", { name: /Registrar línea/ }) as HTMLButtonElement;
    await waitFor(() => expect(registrar.disabled).toBe(false));
    fireEvent.click(registrar);
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      section: "tala",
      treeCode: "111",
      speciesCommon: "Copaiba",
      speciesScientific: "Copaifera reticulata Ducke",
      gpsOrigen: "censo",
      motosierrista: "Juan Pérez",
      motosierristaId: "c1",
      horaTala: "09:30",
    });
    // `entry`: la línea que el servidor acaba de crear — la vista la usa para
    // ofrecer «Imprimir las etiquetas» sin adivinar el código (28-09).
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ arbolTalado: "111", entry: { id: "nueva" } }));
  });
});
