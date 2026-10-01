/**
 * TraerDesdeAdelantosModal — «Estrenar RRHH con tu gente» (Brandon 2026-09-14).
 *
 * RTL + fetch mockeado, sin navegador: el botón cuenta sólo los marcados
 * (empresa arranca desmarcada), y los omitidos se muestran con su motivo.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import TraerDesdeAdelantosModal from "@/components/admin/rrhh/personal/TraerDesdeAdelantosModal";
import type { CandidatoDesdeAdelantosDTO, ColaboradorDTO } from "@/lib/rrhh/tipos";

const CANDIDATOS: CandidatoDesdeAdelantosDTO[] = [
  { beneficiarioId: "b1", nombre: "Victor Quispe", tipoDocumento: null, documentoEnmascarado: null, tieneCelular: false, esEmpresa: false, saldoAbierto: 17000 },
  { beneficiarioId: "b2", nombre: "Mama de Alex", tipoDocumento: null, documentoEnmascarado: null, tieneCelular: true, esEmpresa: false, saldoAbierto: 0 },
  { beneficiarioId: "b3", nombre: "Ferretería El Clavo SAC", tipoDocumento: "RUC", documentoEnmascarado: "•••• 6789", tieneCelular: true, esEmpresa: true, saldoAbierto: 500 },
];

function colaborador(over: Partial<ColaboradorDTO> & { id: string; nombre: string }): ColaboradorDTO {
  return {
    grupoSanguineo: null,
    alergias: null,
    apodo: null,
    puesto: null,
    estado: "ACTIVO",
    fechaIngreso: null,
    fechaCese: null,
    tipoDocumento: null,
    documento: null,
    celular: null,
    direccion: null,
    contactoEmergencia: { nombre: null, celular: null },
    observaciones: null,
    motivoCese: null,
    fotoUrl: null,
    beneficiarioId: null,
    adminUserId: null,
    creadoEn: "2026-09-14T00:00:00.000Z",
    actualizadoEn: "2026-09-14T00:00:00.000Z",
    ...over,
  };
}

function mockFetch(secuencia: { ok: boolean; status?: number; json: () => Promise<unknown> }[]) {
  const fn = vi.fn();
  for (const r of secuencia) fn.mockResolvedValueOnce(r);
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  document.cookie = "csrf-token=test-token";
});

describe("TraerDesdeAdelantosModal", () => {
  it("las de RUC de empresa arrancan desmarcadas — el botón sólo cuenta los marcados", async () => {
    mockFetch([{ ok: true, json: async () => ({ candidatos: CANDIDATOS }) }]);

    render(
      <TraerDesdeAdelantosModal open onClose={() => {}} nivel="completo" onCambio={() => {}} />,
    );

    await waitFor(() => expect(screen.getByText("Victor Quispe")).toBeInTheDocument());

    // 2 personas (no empresa) marcadas de entrada, la empresa no.
    expect(screen.getByRole("button", { name: /Traer 2 personas/i })).toBeInTheDocument();

    // Identificar la casilla de la fila de la empresa por su fila, no por índice.
    const filaEmpresa = screen.getByText("Ferretería El Clavo SAC").closest("li")!;
    const checkboxEmpresa = filaEmpresa.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkboxEmpresa.checked).toBe(false);

    fireEvent.click(checkboxEmpresa);

    expect(screen.getByRole("button", { name: /Traer 3 personas/i })).toBeInTheDocument();
  });

  it("muestra los chips «Sin documento»/«Sin celular» y el aviso de RUC de empresa", async () => {
    mockFetch([{ ok: true, json: async () => ({ candidatos: CANDIDATOS }) }]);

    render(<TraerDesdeAdelantosModal open onClose={() => {}} nivel="completo" onCambio={() => {}} />);

    await waitFor(() => expect(screen.getByText("Victor Quispe")).toBeInTheDocument());

    const filaVictor = screen.getByText("Victor Quispe").closest("li")!;
    expect(filaVictor.textContent).toContain("Sin documento");
    expect(filaVictor.textContent).toContain("Sin celular");

    const filaMama = screen.getByText("Mama de Alex").closest("li")!;
    expect(filaMama.textContent).toContain("Sin documento");
    expect(filaMama.textContent).not.toContain("Sin celular");

    const filaEmpresa = screen.getByText("Ferretería El Clavo SAC").closest("li")!;
    expect(filaEmpresa.textContent).toContain("Tiene RUC de empresa");
  });

  it("después de traer, muestra los creados con datos faltantes y los omitidos con su motivo en criollo", async () => {
    const fetchMock = mockFetch([
      { ok: true, json: async () => ({ candidatos: CANDIDATOS }) },
      {
        ok: true,
        json: async () => ({
          creados: [
            colaborador({ id: "c1", nombre: "Victor Quispe", documento: null, celular: null }),
            colaborador({ id: "c2", nombre: "Mama de Alex", documento: null, celular: "999888777" }),
          ],
          omitidos: [{ beneficiarioId: "b3", nombre: "Ferretería El Clavo SAC", motivo: "es_empresa" }],
        }),
      },
    ]);

    render(<TraerDesdeAdelantosModal open onClose={() => {}} nivel="completo" onCambio={() => {}} />);

    await waitFor(() => expect(screen.getByText("Victor Quispe")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Traer 2 personas/i }));

    await waitFor(() => expect(screen.getByText(/2 personas creadas/i)).toBeInTheDocument());

    // Victor (sin documento y sin celular) y Mama de Alex (sin documento) — 2 con algo faltante.
    expect(screen.getByText(/Faltan datos de 2 personas/i)).toBeInTheDocument();
    // El código "es_empresa" se traduce a criollo, no se muestra crudo.
    expect(screen.getByText(/es una empresa, no se trae como persona/i)).toBeInTheDocument();
    expect(screen.queryByText("es_empresa")).not.toBeInTheDocument();

    // El POST fue con las 2 personas marcadas (no la empresa).
    const postCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(postCall).toBeDefined();
    const body = JSON.parse((postCall![1] as RequestInit).body as string) as { beneficiarioIds: string[] };
    expect(body.beneficiarioIds.sort()).toEqual(["b1", "b2"]);
  });
});
