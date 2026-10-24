import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ConfirmDialogProvider } from "@/components/admin/shared/ConfirmDialog";
import { foto, pdf, servidorFalso, type Llamada } from "./helpers/plan-documentos-fixtures";

/**
 * El formulario del plan (alta) con «Documentos» (ADR-467), por el camino del
 * usuario: se carga una resolución en PDF y un DNI en foto con vencimiento
 * ANTES de que el plan exista, y al guardar:
 *
 *   crear plan → preparar → subir cada uno a su carpeta → etiqueta + vence.
 *
 * Y si un archivo falla, el modal no se cierra, dice cuál, y «Reintentar» NO
 * crea otro plan (PATCH al mismo id) ni vuelve a subir lo que ya subió.
 */

vi.mock("@/hooks/use-permisos-forestal", () => ({
  usePermisosForestal: () => ({ contratos: [], actualizar: vi.fn(async () => ({})) }),
}));
vi.mock("@/components/admin/forestal/DirectorioPicker", () => ({ default: () => null }));

afterEach(() => vi.unstubAllGlobals());

const PLAN = "plan-nuevo-1";

function servidorConPlan(falla: (l: Llamada) => boolean) {
  return servidorFalso(PLAN, (l) => {
    if (falla(l)) return { status: 413, json: { error: "too_large" } };
    if (l.ruta === "/api/admin/forestal/plan") return { status: l.metodo === "POST" ? 201 : 200, json: { plan: { id: PLAN } } };
    return undefined;
  });
}

async function montar() {
  const { default: LothPlanForm } = await import("@/components/admin/forestal/LothPlanForm");
  const onSaved = vi.fn();
  const utils = render(
    <ConfirmDialogProvider>
      <LothPlanForm onClose={vi.fn()} onSaved={onSaved} />
    </ConfirmDialogProvider>,
  );
  fireEvent.change(screen.getByPlaceholderText("Maderera ... SAC"), { target: { value: "QA TITULAR DOCS" } });
  // La plantilla del negocio se lee al abrir (vacía acá → la sugerida).
  await screen.findByRole("navigation", { name: "Carpetas del plan" });
  return { ...utils, onSaved };
}

function subirEn(container: HTMLElement, casillero: string, file: File) {
  const input = container.querySelector<HTMLInputElement>(`[data-casillero-plan="${casillero}"] input[type="file"][multiple]`);
  if (!input) throw new Error(`no está el casillero ${casillero}`);
  fireEvent.change(input, { target: { files: [file] } });
}

/** Resolución (PDF) en su carpeta + DNI (foto) en la del jefe, con vencimiento. */
function cargarDosArchivos(container: HTMLElement) {
  subirEn(container, "resolucion-o-constancia-de-registro", pdf());
  fireEvent.click(within(screen.getByRole("navigation", { name: "Carpetas del plan" })).getByRole("button", { name: /Jefe \/ representante/ }));
  subirEn(container, "dni-del-jefe-o-representante", foto());
  const dni = container.querySelector<HTMLElement>('[data-casillero-plan="dni-del-jefe-o-representante"]');
  if (!dni) throw new Error("sin casillero DNI");
  const vence = within(dni).getByLabelText("Vence");
  fireEvent.change(vence, { target: { value: "2027-03-01" } });
  // Se confirma al salir del campo (tipeando, espera a que la mano pare).
  fireEvent.blur(vence);
}

const subidas = (srv: ReturnType<typeof servidorFalso>) => srv.de("POST", "/api/admin/documents").filter((l) => l.ruta === "/api/admin/documents");
/** El plan en sí (no sus subrutas de documentos). */
const alPlan = (srv: ReturnType<typeof servidorFalso>, metodo: string) => srv.llamadas.filter((l) => l.metodo === metodo && l.ruta === "/api/admin/forestal/plan");

describe("LothPlanForm — alta con documentos pendientes", () => {
  it("guarda el plan y DESPUÉS sube cada archivo a su carpeta con su casillero y su vencimiento", async () => {
    const srv = servidorConPlan(() => false);
    vi.stubGlobal("fetch", srv.fetchMock);
    const { container, onSaved } = await montar();

    cargarDosArchivos(container);
    // Antes de guardar no viajó nada al Drive: el plan todavía no existe.
    expect(subidas(srv)).toHaveLength(0);
    // Los dos quedan anotados como «por subir» en lo que falta (cada uno en su carpeta).
    expect(screen.getAllByText("· por subir")).toHaveLength(2);
    expect(screen.getByText(/se sube al guardar/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Crear PO/ }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));

    expect(alPlan(srv, "POST")).toHaveLength(1);
    const orden = srv.llamadas.map((l) => `${l.metodo} ${l.ruta.split("?")[0]}`);
    expect(orden.indexOf("POST /api/admin/forestal/plan")).toBeLessThan(orden.indexOf("POST /api/admin/forestal/plan/documentos/preparar"));
    expect(subidas(srv).map((l) => (l.cuerpo as FormData).get("folderId")).sort()).toEqual(["f-jefe", "f-res"]);
    expect(srv.de("PATCH", "/api/admin/documents/").map((l) => l.cuerpo)).toEqual(
      expect.arrayContaining([{ tags: ["pdf", "campo:c-res"] }, { tags: ["imagen", "campo:c-dni"], expiresAt: "2027-03-01T00:00:00.000Z" }]),
    );
  }, 30_000); // formulario completo con RTL: 17 s con la suite entera cargada (04-10)

  it("si un archivo falla, el modal sigue abierto, dice cuál, y «Reintentar» no duplica el plan ni lo ya subido", async () => {
    let fallaDni = true;
    const srv = servidorConPlan((l) => fallaDni && l.cuerpo instanceof FormData && (l.cuerpo.get("file") as File).name === "dni.jpg");
    vi.stubGlobal("fetch", srv.fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { container, onSaved } = await montar();
    cargarDosArchivos(container);

    fireEvent.click(screen.getByRole("button", { name: /Crear PO/ }));
    const boton = await screen.findByRole("button", { name: /Reintentar lo que faltó/ });
    expect(screen.getByText(/El plan se guardó y subieron 1 archivo, pero 1 archivo no: dni\.jpg: pesa más de lo permitido/)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    // Lo que no entró sigue a la vista, con su motivo.
    expect(screen.getByText("pesa más de lo permitido")).toBeInTheDocument();

    fallaDni = false;
    fireEvent.click(boton);
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));

    expect(alPlan(srv, "POST")).toHaveLength(1);
    expect(alPlan(srv, "PATCH")).toHaveLength(1);
    expect((alPlan(srv, "PATCH")[0].cuerpo as { id: string }).id).toBe(PLAN);
    // resolución una vez + DNI dos (falló y reintento): nunca la resolución de nuevo.
    const nombres = subidas(srv).map((l) => ((l.cuerpo as FormData).get("file") as File).name);
    expect(nombres.filter((n) => n === "resolucion.pdf")).toHaveLength(1);
    expect(nombres.filter((n) => n === "dni.jpg")).toHaveLength(2);
  });
});
