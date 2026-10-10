/**
 * Tabla GTF del Libro TH (Brandon 07-10): ocultar/mostrar columnas (genérico,
 * recordado), autofiltro por columna (estado CTP y tipo de plan) y la regla
 * del tipo de plan.
 */
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import {
  BotonColumnasVisibles,
  useOrdenColumnas,
  useVisibilidadColumnas,
  type ColumnaElegible,
} from "@/components/admin/shared/columnas-ordenables";
import LothGtfTabla from "@/components/admin/forestal/LothGtfTabla";
import { COLUMNAS_GTF, ORDEN_GTF_DEFECTO, type Gtf } from "@/components/admin/forestal/gtf-tabla-columnas";
import { estadosDeGuia, resolucionDeGuia, tipoPlanDeGuia } from "@/lib/forestal/gtf-columnas";

vi.mock("@/components/admin/forestal/LothImportarGuiasFicha", () => ({ default: () => null }));
vi.mock("@/components/admin/forestal/LothImportarGuiasDeshacer", () => ({ default: () => null }));

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

// ── Mostrar/ocultar columnas (componente compartido) ─────────────────────────

const COLS: ColumnaElegible[] = [
  { id: "a", label: "Alfa" },
  { id: "b", label: "Beta" },
  { id: "c", label: "Gamma", ocultaPorDefecto: true },
];

function Mini() {
  const vis = useVisibilidadColumnas("prueba", COLS);
  return (
    <div>
      <BotonColumnasVisibles vis={vis} />
      <p data-testid="ven">{vis.filtrar(["a", "b", "c", "fija"]).join(",")}</p>
    </div>
  );
}
const abrir = () => fireEvent.click(screen.getByRole("button", { name: /Columnas/ }));
const ven = () => screen.getByTestId("ven").textContent;

describe("Columnas visibles", () => {
  it("arranca con las de fábrica, oculta y muestra, y lo recuerda al volver", () => {
    const { unmount } = render(<Mini />);
    expect(ven()).toBe("a,b,fija");
    const boton = screen.getByRole("button", { name: /Columnas/ });
    expect(boton.getAttribute("aria-expanded")).toBe("false");
    abrir();
    expect(boton.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByLabelText("Beta"));
    fireEvent.click(screen.getByLabelText("Gamma"));
    expect(ven()).toBe("a,c,fija");
    expect(JSON.parse(localStorage.getItem("columnas-visibles:prueba") ?? "null")).toEqual({ b: false, c: true });
    unmount();
    render(<Mini />);
    expect(ven()).toBe("a,c,fija");
  });

  it("la última visible no se apaga y «Mostrar todas» las prende", () => {
    render(<Mini />);
    abrir();
    fireEvent.click(screen.getByLabelText("Beta"));
    const alfa = screen.getByLabelText("Alfa") as HTMLInputElement;
    expect(alfa.disabled).toBe(true);
    fireEvent.click(alfa);
    expect(ven()).toBe("a,fija");
    fireEvent.click(screen.getByRole("button", { name: "Mostrar todas" }));
    expect(ven()).toBe("a,b,c,fija");
  });

  it("una preferencia guardada que apaga todas se lee como «todas»", () => {
    localStorage.setItem("columnas-visibles:prueba", JSON.stringify({ a: false, b: false, c: false }));
    render(<Mini />);
    expect(ven()).toBe("a,b,c,fija");
  });

  it("Escape cierra y devuelve el foco al botón", () => {
    render(<Mini />);
    abrir();
    const grupo = screen.getByRole("group", { name: "Columnas visibles" });
    fireEvent.keyDown(within(grupo).getByLabelText("Alfa"), { key: "Escape" });
    expect(screen.queryByRole("group", { name: "Columnas visibles" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /Columnas/ }));
  });
});

// ── La tabla GTF ─────────────────────────────────────────────────────────────

const guia = (id: string, extra: Partial<Gtf>): Gtf => ({
  id, gtfNumber: `019-001-00000${id}`, gtfDate: "2026-09-10T00:00:00.000Z", tipo: "trozas",
  titularName: "Blas SA", tituloHabilitante: null, parcelaCorta: null, transportista: null, transportistaDoc: null,
  conductor: null, conductorLicencia: null, placaVehiculo: null, origen: null, destino: null, items: [],
  volumenTotalM3: "10", piezasTotal: null, observations: null, status: "emitida", annulledReason: null,
  ...extra,
});
const GUIAS: Gtf[] = [
  guia("1", { planId: "P1", ctp: "por_ingresar", tituloHabilitante: "25-UCA/C-OPP-J-001-20" }),
  guia("2", { ctp: "ingresada", gtfDatos: { guia: { origenRecurso: "plantacion" } } }),
  guia("3", { tipo: "producto", ctp: null }),
  guia("4", { status: "anulada", ctp: null, planId: "P2" }),
];
const PLANES = [
  { id: "P1", planType: "PO", resolucionNumber: "RD 123-2025" },
  { id: "P2", planType: "DEMA", resolucionNumber: null },
];

function Tabla() {
  const orden = useOrdenColumnas("t-gtf", ORDEN_GTF_DEFECTO);
  const vis = useVisibilidadColumnas("t-gtf", COLUMNAS_GTF);
  const ref = useRef<HTMLTableRowElement | null>(null);
  const nada = () => undefined;
  return (
    <>
      <BotonColumnasVisibles vis={vis} />
      <LothGtfTabla
        gtfs={GUIAS} planes={PLANES} busqueda="" sinIngresar={new Set(["019-001-000001"])} filaEnfocada={ref}
        orden={orden} vis={vis} onIngresarCtp={nada} onHoja={nada} onResumen={nada} onAnular={nada} onRecargar={nada}
      />
    </>
  );
}
const filas = () => screen.getAllByText(/^019-001-00000\d$/).map((n) => n.textContent);
/* El título, sin el autofiltro que va pegado a él. */
const cabeceras = () =>
  screen.getAllByRole("columnheader").map((th) => (th.querySelector(":scope > span")?.firstChild ?? th).textContent?.trim());
/* El control está dos veces (cabecera y plegable mobile): basta el primero. */
const marcar = (rotulo: string) => fireEvent.click(screen.getAllByLabelText(rotulo)[0]);

describe("Tabla GTF", () => {
  it("columnas de fábrica: el permiso arranca oculto y «Mostrar todas» lo trae", () => {
    render(<Tabla />);
    expect(cabeceras()).toEqual([
      "N° GTF", "Origen", "N° de registro", "Fecha", "Tipo de plan", "Tipo", "Titular", "Destino", "Vol. m³", "Estado", "Acciones",
    ]);
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Mostrar todas" }));
    expect(cabeceras()).toContain("N° de permiso / resolución");
    expect(screen.getByText("Res. RD 123-2025")).toBeTruthy();
  });

  it("Estado dice dónde está la guía en el CTP y se filtra por eso", () => {
    render(<Tabla />);
    expect(screen.getAllByText("Por ingresar al CTP").length).toBeGreaterThan(0);
    marcar("Estado: Por ingresar al CTP");
    expect(filas()).toEqual(["019-001-000001"]);
    marcar("Estado: Ingresada al CTP");
    expect(filas()).toEqual(["019-001-000001", "019-001-000002"]);
  });

  it("Tipo de plan: sigla del plan, Plantación por casilleros, y se filtra", () => {
    render(<Tabla />);
    marcar("Tipo de plan: Plantación");
    expect(filas()).toEqual(["019-001-000002"]);
    marcar("Tipo de plan: Plantación");
    marcar("Tipo de plan: Sin tipo de plan");
    expect(filas()).toEqual(["019-001-000003"]);
  });

  it("ocultar una columna saca su título y sus celdas", () => {
    render(<Tabla />);
    abrir();
    fireEvent.click(within(screen.getByRole("group", { name: "Columnas visibles" })).getByLabelText("Tipo de plan"));
    expect(cabeceras()).not.toContain("Tipo de plan");
    expect(screen.getAllByRole("cell").map((td) => td.textContent)).not.toContain("PO");
    /* Su filtro no queda huérfano: sigue en el plegable de filtros. */
    expect(screen.getAllByLabelText("Tipo de plan: PO").length).toBeGreaterThan(0);
  });
});

describe("Regla del tipo de plan", () => {
  it("manda el plan; sin plan, los casilleros o el código del título", () => {
    expect(tipoPlanDeGuia({ planType: "PLANTACION", resolucionNumber: null }, null)).toBe("Plantación");
    expect(tipoPlanDeGuia({ planType: "dema", resolucionNumber: null }, { guia: { origenRecurso: "plantacion" } })).toBe("DEMA");
    expect(tipoPlanDeGuia(null, { guia: { origenRecurso: "plantacion" } })).toBe("Plantación");
    expect(tipoPlanDeGuia(null, null, "19-SEC/REG-PLT-2025-096")).toBe("Plantación");
    expect(tipoPlanDeGuia(null, { guia: { planManejoTipo: "PMFI" } })).toBe("PMFI");
    expect(tipoPlanDeGuia(null, null, "25-UCA/C-OPP-J-001-20")).toBeNull();
    expect(tipoPlanDeGuia(null, {})).toBeNull();
  });

  it("resolución: la del plan o la del casillero (8)", () => {
    expect(resolucionDeGuia({ planType: "PO", resolucionNumber: " RD 9 " }, { guia: { resolucion: "otra" } })).toBe("RD 9");
    expect(resolucionDeGuia(null, { guia: { resolucion: "Const. 096-2025" } })).toBe("Const. 096-2025");
    expect(resolucionDeGuia(null, null)).toBeNull();
  });

  it("estados: anulada sola; producto sólo emitida; trozas con su CTP", () => {
    expect(estadosDeGuia({ status: "anulada", tipo: "trozas", ctp: "ingresada" })).toEqual(["anulada"]);
    expect(estadosDeGuia({ status: "emitida", tipo: "producto", ctp: "por_ingresar" })).toEqual(["emitida"]);
    expect(estadosDeGuia({ status: "emitida", tipo: "trozas", ctp: "por_ingresar" })).toEqual(["emitida", "por_ingresar"]);
    expect(estadosDeGuia({ status: "emitida", tipo: "trozas" })).toEqual(["emitida"]);
  });
});
