/**
 * Tests — «Nueva línea · Tala» en una PLANTACIÓN sin censo (ADR-459).
 *
 * Por el camino del usuario (el formulario montado, la red simulada por URL):
 *   - la lista ofrece las especies del REGISTRO con lo que queda en pie, y no
 *     ofrece «Ver censo» (no hay árboles marcados);
 *   - elegir una llena la especie y propone el código del árbol con el
 *     correlativo del plan, sin repetir uno ya talado en el negocio;
 *   - mientras se mide, la ficha descuenta esta tala; pasarse avisa, no frena;
 *   - el 422 T7 del servidor sale junto a la especie, con su mensaje;
 *   - con árboles marcados y registro, las dos listas conviven en pestañas.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import LothEntryForm from "@/components/admin/forestal/LothEntryForm";
import { olvidarCensoDeTala } from "@/components/admin/forestal/hooks/use-censo-de-tala";
import { olvidarRegistroPlantacion } from "@/components/admin/forestal/hooks/use-registro-plantacion";

const PLAN = { id: "pp", planType: "PLANTACION", planNumber: "QA-459-TALA", titularName: "Plantaciones QA SAC", tituloHabilitante: null };
const ESPECIES = [
  { id: "s1", speciesCommon: "Bolaina", speciesScientific: "Guazuma crinita", cites: false, volumenAutorizadoM3: "120.5", anioInstalacion: 2019, superficieHa: "3.5" },
  { id: "s2", speciesCommon: "Capirona", speciesScientific: "Calycophyllum spruceanum", cites: false, volumenAutorizadoM3: "80", anioInstalacion: null, superficieHa: null },
];

let taladoBolaina = 2.25;
let censo: unknown[] = [];
let respuestaPost: { status: number; body: unknown } = { status: 200, body: { entry: { id: "nueva" } } };
let posts: Record<string, unknown>[] = [];

function responder(url: string, init?: RequestInit) {
  const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
  if (init?.method === "POST" && url.startsWith("/api/admin/forestal/loth")) {
    posts.push(JSON.parse(String(init.body)));
    return json(respuestaPost.body, respuestaPost.status);
  }
  if (url.startsWith("/api/admin/forestal/plan?active=1")) return json({ active: { id: PLAN.id } });
  if (url.startsWith("/api/admin/forestal/plan?balance=")) {
    return json({
      balance: {
        rows: [
          { species: "Bolaina", cites: false, autorizado: 120.5, talado: taladoBolaina, trozado: 0, movilizado: 0, consumido: 0 },
          { species: "Capirona", cites: false, autorizado: 80, talado: 0, trozado: 0, movilizado: 0, consumido: 0 },
        ],
      },
    });
  }
  if (url.startsWith("/api/admin/forestal/plan?planId=")) return json({ plan: PLAN, species: ESPECIES });
  if (url === "/api/admin/forestal/plan") return json({ plans: [PLAN] });
  if (url.startsWith("/api/admin/forestal/plan/census?planId=")) return json({ trees: censo, total: censo.length, truncado: false });
  // Las talas del plan (correlativo) y las del negocio (T3 mira el negocio entero).
  if (url.startsWith("/api/admin/forestal/loth?available=trozado")) return json({ items: [{ kind: "tala", code: "001-BOL" }] });
  if (url.startsWith("/api/admin/forestal/loth?usoCenso=1")) {
    return json({ usos: [{ treeCode: "002-BOL", tala: { lineNo: 9, fecha: "2026-09-01", volumeM3: 1 }, trozas: 0, trozasM3: 0, despachadas: 0, consumidas: 0 }] });
  }
  if (url.startsWith("/api/admin/forestal/loth/poa")) return json({ config: { dmcOverrides: {}, semillerosPct: 0 } });
  return json({}, 404);
}

beforeEach(() => {
  // Lo leído se recuerda 30 s por plan: cada test arranca con su propia red.
  olvidarCensoDeTala();
  olvidarRegistroPlantacion();
  taladoBolaina = 2.25;
  censo = [];
  respuestaPost = { status: 200, body: { entry: { id: "nueva" } } };
  posts = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => responder(String(url), init)));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const codigoArbol = () => screen.getByPlaceholderText("001-BOL") as HTMLInputElement;
const lista = () => screen.findByRole("region", { name: "Elige la especie del registro" });

function medir() {
  fireEvent.change(screen.getByLabelText("Ø sección mayor — medida cruzada 1"), { target: { value: "0.6" } });
  fireEvent.change(screen.getByLabelText("Ø sección mayor — medida cruzada 2"), { target: { value: "0.6" } });
  fireEvent.change(screen.getByLabelText("Ø sección menor — medida cruzada 1"), { target: { value: "0.5" } });
  fireEvent.change(screen.getByLabelText("Ø sección menor — medida cruzada 2"), { target: { value: "0.5" } });
  fireEvent.change(screen.getByLabelText("Longitud total (m)"), { target: { value: "10" } });
}

describe("Tala de una plantación sin censo", () => {
  it("la lista ofrece las especies del registro con lo que queda, sin «Ver censo»", async () => {
    render(<LothEntryForm section="tala" onClose={() => {}} onSaved={() => {}} />);
    const region = await lista();
    await within(region).findByText("quedan 118.250 de 120.500 m³");
    expect(within(region).getByText("Capirona")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Ver censo|Ver marcados/ })).toBeNull();
  });

  it("sin elegir nada no hay especie: el Tornillo de arranque no avisa «fuera del registro»", async () => {
    render(<LothEntryForm section="tala" onClose={() => {}} onSaved={() => {}} />);
    await within(await lista()).findByText("Bolaina");
    expect(screen.getByRole("button", { name: /^Especie/ }).textContent).toMatch(/Seleccionar especie/);
    expect(screen.queryByText(/no está en el registro/)).toBeNull();
  });

  it("elegir la especie la carga y propone el código que sigue, sin chocar con otro plan", async () => {
    render(<LothEntryForm section="tala" onClose={() => {}} onSaved={() => {}} />);
    const region = await lista();
    fireEvent.click(await within(region).findByText("Bolaina"));
    // El plan ya taló el 001-BOL y otro plan del negocio usó el 002-BOL.
    await waitFor(() => expect(codigoArbol().value).toBe("003-BOL"));
    const ficha = document.querySelector('[data-ficha-registro="Bolaina"]') as HTMLElement;
    expect(within(ficha).getByText("Guazuma crinita")).toBeTruthy();
    expect(within(ficha).getByText("Saldo de Bolaina")).toBeTruthy();
  });

  it("mientras se mide la ficha descuenta esta tala y viaja la especie del registro", async () => {
    render(<LothEntryForm section="tala" onClose={() => {}} onSaved={() => {}} />);
    fireEvent.click(await within(await lista()).findByText("Bolaina"));
    await waitFor(() => expect(codigoArbol().value).toBe("003-BOL"));
    medir();
    const ficha = document.querySelector('[data-ficha-registro="Bolaina"]') as HTMLElement;
    const esta = within(ficha).getByText("Esta tala").closest("tr") as HTMLElement;
    await waitFor(() => expect(esta.textContent).toMatch(/2\.\d{3}/));
    expect(within(ficha).getByText("Queda en pie")).toBeTruthy();
    expect(screen.queryByText(/pasa lo registrado/)).toBeNull();
    const registrar = screen.getByRole("button", { name: /Registrar línea/ }) as HTMLButtonElement;
    await waitFor(() => expect(registrar.disabled).toBe(false));
    fireEvent.click(registrar);
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ section: "tala", planId: "pp", treeCode: "003-BOL", speciesCommon: "Bolaina", speciesScientific: "Guazuma crinita" });
  });

  it("pasar lo registrado avisa (no frena)", async () => {
    taladoBolaina = 119.5;
    render(<LothEntryForm section="tala" onClose={() => {}} onSaved={() => {}} />);
    fireEvent.click(await within(await lista()).findByText("Bolaina"));
    await waitFor(() => expect(codigoArbol().value).toBe("003-BOL"));
    medir();
    await screen.findByText(/Esta tala pasa lo registrado de Bolaina en/);
    const registrar = screen.getByRole("button", { name: /Registrar línea/ }) as HTMLButtonElement;
    await waitFor(() => expect(registrar.disabled).toBe(false));
  });

  it("el 422 T7 del servidor sale junto a la especie, con su mensaje", async () => {
    const mensaje = "La especie Cedro no está en el registro de la plantación: agrégala en Plan de manejo → Registro.";
    respuestaPost = { status: 422, body: { error: "T7_ESPECIE_NO_AUTORIZADA", message: mensaje } };
    render(<LothEntryForm section="tala" onClose={() => {}} onSaved={() => {}} />);
    fireEvent.click(await within(await lista()).findByText("Bolaina"));
    await waitFor(() => expect(codigoArbol().value).toBe("003-BOL"));
    // Cambia a una especie que el registro no tiene.
    fireEvent.click(screen.getByRole("button", { name: /^Especie/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cedro" }));
    await screen.findByText(/no está en el registro de la plantación\./);
    medir();
    const registrar = screen.getByRole("button", { name: /Registrar línea/ }) as HTMLButtonElement;
    await waitFor(() => expect(registrar.disabled).toBe(false));
    fireEvent.click(registrar);
    const alerta = await screen.findByText(mensaje);
    expect(alerta.closest('[role="alert"]')).toBeTruthy();
    // El aviso previo no se repite: queda el del servidor.
    expect(screen.queryByText(/no está en el registro de la plantación\.$/)).toBeNull();
  });

  it("con árboles marcados y registro, las dos listas conviven en pestañas", async () => {
    censo = [
      { id: "t1", treeCode: "M-1", speciesCommon: "Bolaina", speciesScientific: null, speciesNative: null, cites: false, dapM: "0.300", alturaComercialM: "12.00", volumenEstimadoM3: "0.8", utmZona: null, utmX: null, utmY: null, condicion: null, notes: null, estado: "en_pie" },
    ];
    render(<LothEntryForm section="tala" onClose={() => {}} onSaved={() => {}} />);
    await lista();
    const marcados = await screen.findByRole("button", { name: /Árboles marcados/ });
    expect(screen.getByRole("button", { name: /Por especie/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(marcados);
    const region = await screen.findByRole("region", { name: "Elige el árbol marcado" });
    expect(within(region).getByText("M-1")).toBeTruthy();
    // En una plantación el censo son sus árboles marcados.
    expect(screen.getByRole("button", { name: /Ver marcados/ })).toBeTruthy();
  });
});
