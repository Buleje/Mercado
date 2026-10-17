/**
 * ADR-442 — regresión del bucle de «Documentos» desde la bandeja (revisión
 * 27-09): la capa pasaba una flecha nueva en cada render y comparaba contra el
 * conteo viejo de la lista; los casilleros avisaban por cada flecha nueva →
 * aviso → la bandeja se relee → render → aviso… Ahora se avisa una vez por
 * cambio del NÚMERO.
 */
import { useState, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, act } from "@testing-library/react";

let llenosMock = 3;
vi.mock("@/hooks/use-documentos-guia", () => {
  const subir = async () => null;
  const quitar = async () => null;
  return {
    useDocumentosGuia: () => ({
      datos: { gtf: "X", llenos: llenosMock, total: 6, casilleros: [] },
      cargando: false, error: null, subiendo: {}, subir, quitar, recargar: async () => {},
    }),
  };
});
vi.mock("@/hooks/use-mi-rol", () => ({ useMiRol: () => "admin" }));
vi.mock("@/components/admin/shared/ConfirmDialog", () => ({ useConfirm: () => ({ confirm: async () => true }) }));
vi.mock("@/components/admin/shared/AdminModal", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  MODAL_BODY: "",
}));
vi.mock("@/components/superadmin/_shared/InfoTip", () => ({ InfoTip: () => null }));

import CtpGuiasGuardadasCapa, { type ModalGuardadas } from "@/components/admin/forestal/CtpGuiasGuardadasCapa";

const guia = { id: "g1", gtfNumber: "X", docsLlenos: 2, titularNombre: "T", permisoCodigo: "P" } as never;

function Host({ contador }: { contador: { n: number } }) {
  // Igual que CtpIngresosView: estado estable para el modal abierto, onCambio inline.
  const [abierto] = useState<ModalGuardadas>({ tipo: "docs", guia });
  const [, setKey] = useState(0);
  return (
    <CtpGuiasGuardadasCapa
      abierto={abierto}
      onCerrar={() => {}}
      onCambio={() => { contador.n++; if (contador.n < 200) setKey((k) => k + 1); }}
      onIngresar={() => {}}
    />
  );
}

describe("documentos desde la bandeja de guías guardadas (ADR-442)", () => {
  it("conteo distinto al de la lista → avisa UNA vez, no en bucle", async () => {
    llenosMock = 3;
    const contador = { n: 0 };
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<Host contador={contador} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
    errSpy.mockRestore();
    expect(contador.n).toBe(1);
  });
  it("mismo conteo que la lista → no hay nada que releer", async () => {
    llenosMock = 2;
    const contador = { n: 0 };
    render(<Host contador={contador} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    expect(contador.n).toBe(0);
  });
});
