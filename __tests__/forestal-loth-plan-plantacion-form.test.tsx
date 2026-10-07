// @vitest-environment jsdom
/**
 * Alta de un plan tipo Plantación con su registro (ADR-459), por el camino de
 * la persona: elige «Plantación», el formulario habla de registro y no de
 * resolución, carga dos especies con sus m³ y TODO viaja en un solo POST.
 *
 * Y dos cosas que no pueden pasar: una fila a medias que se guarda igual, y un
 * PO que de pronto manda especies o cambia de rótulos.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CATALOGO_VACIO } from "@/lib/forestal/especies-catalogo";
import type { Plan } from "@/components/admin/forestal/loth-plan-shared";

vi.mock("@/components/admin/forestal/DirectorioPicker", () => ({ default: () => null }));
/* La sección «Documentos» (ADR-467) tiene su propia prueba
   (`loth-plan-form-documentos-alta`); acá estorbaría con su `useConfirm`. */
vi.mock("@/components/admin/forestal/plan-documentos/PlanDocumentosEnFormulario", () => ({ default: () => null }));
vi.mock("@/components/admin/shared/CamposPersonalizados", () => ({
  default: () => null,
  guardarValoresPendientes: async () => ({ errores: [] }),
  pendientesVacios: () => ({}),
}));
vi.mock("@/hooks/use-permisos-forestal", () => ({
  usePermisosForestal: () => ({ contratos: [], actualizar: vi.fn() }),
}));
vi.mock("@/components/admin/forestal/hooks/use-especies-catalogo", () => ({
  useEspeciesCatalogo: () => ({ catalogo: CATALOGO_VACIO }),
}));

import LothPlanForm from "@/components/admin/forestal/LothPlanForm";

type Llamada = { url: string; method: string; body: Record<string, unknown> | null };

function fetchQueResponde(respuestaDelPlan: Record<string, unknown>) {
  const llamadas: Llamada[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    llamadas.push({
      url: String(url),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null,
    });
    const cuerpo = String(url).endsWith("/plan/species") ? { species: {} } : respuestaDelPlan;
    return new Response(JSON.stringify(cuerpo), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fn);
  return llamadas;
}

const escribir = (el: HTMLElement, v: string) => fireEvent.change(el, { target: { value: v } });

function cargarDosEspecies() {
  fireEvent.click(screen.getByRole("button", { name: /^Plantación/ }));
  escribir(screen.getByLabelText("Titular"), "Agroforestal QA SAC");
  escribir(screen.getByLabelText("Código del registro de plantación"), "Plantación QA-459");
  escribir(screen.getAllByLabelText("Especie *")[0], "Bolaina");
  escribir(screen.getAllByLabelText("Volumen (m³) *")[0], "120");
  fireEvent.click(screen.getByRole("button", { name: "Agregar especie" }));
  escribir(screen.getAllByLabelText("Especie *")[1], "Capirona");
  escribir(screen.getAllByLabelText("Volumen (m³) *")[1], "80");
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("alta de una plantación con sus especies", () => {
  it("el formulario habla de registro: código, constancia, inscripción y superficie; la vigencia va plegada", () => {
    fetchQueResponde({ plan: { id: "p1" } });
    render(<LothPlanForm onClose={() => {}} onSaved={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /^Plantación/ }));
    expect(screen.getByLabelText("Código del registro de plantación")).toBeTruthy();
    expect(screen.getByLabelText("N° de constancia")).toBeTruthy();
    expect(screen.getByLabelText("Fecha de inscripción")).toBeTruthy();
    expect(screen.getByLabelText("Superficie total (ha)")).toBeTruthy();
    expect(screen.queryByLabelText("N° resolución")).toBeNull();
    expect(screen.queryByLabelText("Vigencia hasta")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Período de aprovechamiento/ }));
    expect(screen.getByLabelText("Aprovechamiento hasta")).toBeTruthy();
    expect(screen.getByText("Especies registradas")).toBeTruthy();
  });

  it("completa el nombre científico y suma el total en vivo", () => {
    fetchQueResponde({ plan: { id: "p1" } });
    render(<LothPlanForm onClose={() => {}} onSaved={() => {}} />);
    cargarDosEspecies();
    expect((screen.getAllByLabelText("Nombre científico")[0] as HTMLInputElement).value).toBe("Guazuma crinita");
    expect(screen.getByText(/200\.000 m³/)).toBeTruthy();
  });

  it("manda el registro y sus dos especies en UN solo POST", async () => {
    const llamadas = fetchQueResponde({ plan: { id: "p1" }, species: [{ id: "s1" }, { id: "s2" }] });
    const onSaved = vi.fn();
    render(<LothPlanForm onClose={() => {}} onSaved={onSaved} />);
    cargarDosEspecies();
    fireEvent.click(screen.getByRole("button", { name: "Crear Plantación" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("p1"));

    const posts = llamadas.filter((l) => l.method === "POST");
    expect(posts).toHaveLength(1);
    const body = posts[0].body!;
    expect(posts[0].url).toBe("/api/admin/forestal/plan");
    expect(body.planType).toBe("PLANTACION");
    expect(body.planNumber).toBe("Plantación QA-459");
    expect(body.species).toEqual([
      expect.objectContaining({ speciesCommon: "Bolaina", speciesScientific: "Guazuma crinita", volumenAutorizadoM3: 120 }),
      expect.objectContaining({ speciesCommon: "Capirona", volumenAutorizadoM3: 80 }),
    ]);
  });

  it("si el servidor todavía no conoce `species`, las agrega de a una (y no se pierden)", async () => {
    const llamadas = fetchQueResponde({ plan: { id: "p1" } });
    const onSaved = vi.fn();
    render(<LothPlanForm onClose={() => {}} onSaved={onSaved} />);
    cargarDosEspecies();
    fireEvent.click(screen.getByRole("button", { name: "Crear Plantación" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("p1"));
    const porEspecie = llamadas.filter((l) => l.url === "/api/admin/forestal/plan/species");
    expect(porEspecie.map((l) => [l.body?.planId, l.body?.speciesCommon])).toEqual([["p1", "Bolaina"], ["p1", "Capirona"]]);
  });

  it("una fila a medias frena el guardado y dice qué falta", () => {
    const llamadas = fetchQueResponde({ plan: { id: "p1" } });
    render(<LothPlanForm onClose={() => {}} onSaved={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /^Plantación/ }));
    escribir(screen.getByLabelText("Titular"), "Agroforestal QA SAC");
    escribir(screen.getAllByLabelText("Especie *")[0], "Bolaina");
    fireEvent.click(screen.getByRole("button", { name: "Crear Plantación" }));
    expect(screen.getByText("Falta el volumen registrado")).toBeTruthy();
    expect(llamadas.filter((l) => l.method === "POST")).toHaveLength(0);
  });
});

describe("lo que NO cambia", () => {
  it("un PO no ofrece especies ni manda `species`, y sigue diciendo resolución", async () => {
    const llamadas = fetchQueResponde({ plan: { id: "p2" } });
    const onSaved = vi.fn();
    render(<LothPlanForm onClose={() => {}} onSaved={onSaved} />);
    expect(screen.getByLabelText("N° resolución")).toBeTruthy();
    expect(screen.getByLabelText("Vigencia hasta")).toBeTruthy();
    expect(screen.queryByText("Especies registradas")).toBeNull();
    escribir(screen.getByLabelText("Titular"), "Maderera El Aguajal");
    fireEvent.click(screen.getByRole("button", { name: "Crear PO" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(llamadas.find((l) => l.method === "POST")?.body).not.toHaveProperty("species");
  });

  it("al EDITAR una plantación las especies no se tocan acá: lleva a la pestaña Registro", async () => {
    const llamadas = fetchQueResponde({ plan: { id: "p3" } });
    const onIr = vi.fn();
    const plan = {
      id: "p3", planType: "PLANTACION", planNumber: "19-SEC/REG-PLT-2025-096", tituloHabilitante: null,
      resolucionNumber: null, resolucionDate: null, titularName: "Blas", arffs: null, region: "Ucayali",
      parcelaCorta: null, areaHa: null, uitRef: null, vigenciaDesde: null, vigenciaHasta: null, estado: "vigente",
    } as Plan;
    const onSaved = vi.fn();
    render(<LothPlanForm plan={plan} onClose={() => {}} onSaved={onSaved} onIrARegistro={onIr} />);
    expect(screen.queryAllByLabelText("Especie *")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /Ir a Registro y saldo/ }));
    expect(onIr).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const patch = llamadas.find((l) => l.method === "PATCH");
    expect(patch?.body).not.toHaveProperty("species");
  });
});
