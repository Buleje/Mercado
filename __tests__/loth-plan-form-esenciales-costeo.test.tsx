// @vitest-environment jsdom
/**
 * Alta de un plan (Brandon 2026-10-07), por el camino de la persona:
 * 1. los esenciales de ESE tipo se ven distintos, el contador dice cuántos
 *    faltan, y el titular vacío se marca recién al tocar «Crear» (sin POST);
 * 2. en un registro de plantación no hay regente sino «Encargado», sin
 *    registro SERFOR ni especialidad, y lo ya guardado no se pierde al editar;
 * 3. el costeo suma por m³, propone la UIT del año que conoce, avisa del plan
 *    vencido que sigue vigente y agrega frases rápidas.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CATALOGO_VACIO } from "@/lib/forestal/especies-catalogo";
import type { Plan } from "@/components/admin/forestal/loth-plan-shared";
import { esencialesDe } from "@/lib/forestal/loth-plan-esenciales";
import { agregarFrase, costoPorM3, uitDelAnio, vencidoPeroVigente } from "@/lib/forestal/loth-plan-costeo";

vi.mock("@/components/admin/forestal/DirectorioPicker", () => ({ default: () => null }));
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

type Llamada = { method: string; body: Record<string, unknown> | null };
function fetchQueResponde(): Llamada[] {
  const llamadas: Llamada[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      llamadas.push({ method: init?.method ?? "GET", body: typeof init?.body === "string" ? JSON.parse(init.body) : null });
      return new Response(JSON.stringify({ plan: { id: "p1" } }), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
  return llamadas;
}
const escribir = (el: HTMLElement, v: string) => fireEvent.change(el, { target: { value: v } });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("esenciales por tipo (reglas)", () => {
  const base = { titularName: "", planNumber: "", regenteName: "", vigenciaHasta: "" };
  it("el único obligatorio es el titular, que es lo único que exige el servidor", () => {
    for (const planType of ["PGMF", "PO", "PMFI", "DEMA", "PLANTACION"]) {
      const l = esencialesDe({ ...base, planType }, { llevaEspecies: planType === "PLANTACION", especiesConVolumen: 0 });
      expect(l.filter((e) => e.nivel === "obligatorio").map((e) => e.campo)).toEqual(["titularName"]);
    }
  });
  it("PO pide 4 (regente recomendado); DEMA 3 (regente según caso); plantación sin regente ni vigencia", () => {
    const campos = (planType: string, llevaEspecies = false) =>
      esencialesDe({ ...base, planType }, { llevaEspecies, especiesConVolumen: 0 }).map((e) => e.campo);
    expect(campos("PO")).toEqual(["titularName", "planNumber", "regenteName", "vigenciaHasta"]);
    expect(campos("DEMA")).toEqual(["titularName", "planNumber", "vigenciaHasta"]);
    expect(campos("PLANTACION", true)).toEqual(["titularName", "planNumber", "especies"]);
  });
});

describe("el formulario", () => {
  it("cuenta los esenciales, y sin titular «Crear» marca el campo y no manda nada", () => {
    const llamadas = fetchQueResponde();
    render(<LothPlanForm onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByText("Te faltan 4 de 4 esenciales")).toBeTruthy();
    expect(screen.getAllByText("Obligatorio")).toHaveLength(1);
    expect(screen.getAllByText("Recomendado")).toHaveLength(3);
    // Antes de tocar nada no hay nada en rojo.
    expect(screen.queryByText(/Falta: /)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Crear PO" }));
    expect(screen.getByText(/Falta: Sin titular el plan no se puede crear/)).toBeTruthy();
    expect(screen.getByLabelText("Titular").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(screen.getByLabelText("Titular"));
    expect(llamadas.filter((l) => l.method === "POST")).toHaveLength(0);

    escribir(screen.getByLabelText("Titular"), "Maderera El Aguajal");
    escribir(screen.getByLabelText("N° de documento"), "PO 12");
    expect(screen.getByText("Te faltan 2 de 4 esenciales")).toBeTruthy();
  });

  it("el contador lleva al primero que falta", () => {
    fetchQueResponde();
    render(<LothPlanForm onClose={() => {}} onSaved={() => {}} />);
    escribir(screen.getByLabelText("Titular"), "Maderera El Aguajal");
    fireEvent.click(screen.getByRole("button", { name: /Te faltan 3 de 4 esenciales/ }));
    expect(document.activeElement).toBe(screen.getByLabelText("N° de documento"));
  });

  it("plantación: «Titular y encargado», sin SERFOR ni especialidad, sin aviso de regente", () => {
    fetchQueResponde();
    render(<LothPlanForm onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByLabelText("Regente forestal")).toBeTruthy();
    expect(screen.getByText(/lo elabora e implementa un regente forestal/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Plantación/ }));
    expect(screen.getByText("Titular y encargado")).toBeTruthy();
    expect(screen.getByLabelText("Encargado")).toBeTruthy();
    expect(screen.queryByLabelText("Regente forestal")).toBeNull();
    expect(screen.queryByText("N° de registro SERFOR")).toBeNull();
    expect(screen.queryByText("Especialidad del regente")).toBeNull();
    expect(screen.queryByText(/lo elabora e implementa un regente forestal/)).toBeNull();
  });

  it("al editar una plantación que traía registro SERFOR, el dato viaja igual (no se borra)", async () => {
    const llamadas = fetchQueResponde();
    const onSaved = vi.fn();
    const plan = {
      id: "p9", planType: "PLANTACION", planNumber: "REG-1", tituloHabilitante: null, resolucionNumber: null,
      resolucionDate: null, titularName: "Blas", arffs: null, region: "Ucayali", parcelaCorta: null, areaHa: null,
      uitRef: null, vigenciaDesde: null, vigenciaHasta: null, estado: "vigente",
      regenteName: "Juan Pérez", regenteRegistro: "RNR-0042", regenteEspecialidad: "plantaciones",
    } as Plan;
    render(<LothPlanForm plan={plan} onClose={() => {}} onSaved={onSaved} />);
    expect((screen.getByLabelText("Encargado") as HTMLInputElement).value).toBe("Juan Pérez");
    expect(screen.getByText(/RNR-0042/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const patch = llamadas.find((l) => l.method === "PATCH")!.body!;
    expect(patch.regenteRegistro).toBe("RNR-0042");
    expect(patch.regenteEspecialidad).toBe("plantaciones");
    expect(patch.regenteName).toBe("Juan Pérez");
  });

  it("costeo: total por m³, UIT del año que conoce, aviso de vencido y frases rápidas", () => {
    fetchQueResponde();
    render(<LothPlanForm onClose={() => {}} onSaved={() => {}} />);
    fireEvent.change(screen.getByLabelText("Fecha resolución"), { target: { value: "2025-03-10" } });
    fireEvent.change(screen.getByLabelText("Vigencia hasta"), { target: { value: "2020-01-15" } });
    fireEvent.click(screen.getByRole("button", { name: /^Costeo, estado y observaciones/ }));

    escribir(screen.getByLabelText("UIT de referencia (S/)"), "5000");
    fireEvent.click(screen.getByRole("button", { name: /Usar la UIT de 2025/ }));
    expect((screen.getByLabelText("UIT de referencia (S/)") as HTMLInputElement).value).toBe("5350");

    escribir(screen.getByLabelText("Extracción (S/ por m³)"), "40");
    escribir(screen.getByLabelText("Flete (S/ por m³)"), "15");
    expect(screen.getByText(/^S\/ 55[.,]00$/)).toBeTruthy();
    expect(screen.getByText("(2 de 3 costos)")).toBeTruthy();

    expect(screen.getByText(/sigue «Vigente»/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Marcar vencido" }));
    expect((screen.getByLabelText("Estado del plan") as HTMLSelectElement).value).toBe("vencido");

    fireEvent.click(screen.getByRole("button", { name: /Con supervisión OSINFOR/ }));
    const notas = screen.getByLabelText("Observaciones") as HTMLTextAreaElement;
    expect(notas.value).toBe("Con supervisión OSINFOR");
    expect(screen.getByText(`${"Con supervisión OSINFOR".length}/1000`)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Con supervisión OSINFOR/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("costeo (reglas puras)", () => {
  it("no inventa UIT: sólo los años que el repo conoce", () => {
    expect(uitDelAnio(2025)).toBe(5350);
    expect(uitDelAnio(2026)).toBeNull();
    expect(uitDelAnio(null)).toBeNull();
  });
  it("suma sólo lo cargado; vencido sólo si sigue vigente; frase repetida no entra", () => {
    expect(costoPorM3(["40", "", "15.5"])).toEqual({ total: 55.5, cargados: 2 });
    expect(costoPorM3(["", " "])).toBeNull();
    expect(vencidoPeroVigente("vigente", "2026-01-01", "2026-10-07")).toBe(true);
    expect(vencidoPeroVigente("cerrado", "2026-01-01", "2026-10-07")).toBe(false);
    expect(agregarFrase("Hola", "Con supervisión OSINFOR")).toBe("Hola\nCon supervisión OSINFOR");
    expect(agregarFrase("Con supervisión OSINFOR", "Con supervisión OSINFOR")).toBeNull();
    expect(agregarFrase("x".repeat(995), "Con supervisión OSINFOR")).toBeNull();
  });
});
