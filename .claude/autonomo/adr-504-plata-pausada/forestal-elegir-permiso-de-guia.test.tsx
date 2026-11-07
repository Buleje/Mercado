/**
 * ADR-504 · «¿De qué permiso es la GTF X?» — el 409 GUIA_AMBIGUA abre la
 * ventana, se elige el permiso y el pedido se reintenta con su `contratoId`.
 * Cerrar sin elegir (o sin ventana montada) devuelve el 409 tal cual.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ElegirPermisoDeGuia from "@/components/admin/forestal/ElegirPermisoDeGuia";
import {
  cuerpoConPermiso,
  fetchConPermisoDeGuia,
  reiniciarPedidoDePermiso,
} from "@/components/admin/forestal/hooks/use-elegir-permiso-de-guia";

const AMBIGUA = {
  codigo: "GUIA_AMBIGUA",
  gtfNumber: "4",
  message: "La guía N° 4 está en 2 permisos (017, 020). Elige el permiso del archivo para saber cuál es.",
  candidatas: [
    { contratoId: "c17", gtfNumber: "4", permiso: "19-SEC/REG-PLT-2021-017", titular: "Blas", especies: ["Tornillo"] },
    { contratoId: null, gtfNumber: "4", permiso: null, titular: "Blas", especies: ["Cumala"] },
  ],
};

const respuesta = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Un `fetch` simulado: sin permiso contesta 409 ambigua; con permiso, 200. */
function servidor() {
  const cuerpos: Record<string, unknown>[] = [];
  const f = vi.fn(async (_url: string, init?: RequestInit) => {
    const cuerpo = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    cuerpos.push(cuerpo);
    return cuerpo.contratoId ? respuesta(200, { ok: true }) : respuesta(409, AMBIGUA);
  });
  const guardar = () =>
    fetchConPermisoDeGuia((contratoId) =>
      f("/api/admin/forestal/guias/plata/gastos", { method: "POST", body: cuerpoConPermiso(JSON.stringify({ gtfNumber: "4", monto: 50 }), contratoId) }),
    );
  return { f, cuerpos, guardar };
}

afterEach(() => {
  act(() => reiniciarPedidoDePermiso());
});

describe("ElegirPermisoDeGuia · 409 → elegir → reintento", () => {
  it("elegido el permiso, reintenta con su contratoId y devuelve el 200", async () => {
    render(<ElegirPermisoDeGuia />);
    const { f, cuerpos, guardar } = servidor();
    const fin: { r?: Response } = {};
    const enCurso = guardar().then((x) => (fin.r = x));

    expect(await screen.findByText("¿De qué permiso?")).toBeTruthy();
    expect(screen.getByText("GTF 4 · está en 2 permisos")).toBeTruthy();
    expect(screen.getByText("GTF 4 · permiso 017")).toBeTruthy();
    expect(screen.getByText("GTF 4 · sin permiso")).toBeTruthy();
    fireEvent.click(document.querySelector('[data-candidata="c17"]')!);
    await act(async () => {
      await enCurso;
    });

    expect(f).toHaveBeenCalledTimes(2);
    expect(cuerpos[1]).toEqual({ gtfNumber: "4", monto: 50, contratoId: "c17" });
    expect(fin.r?.status).toBe(200);
    await waitFor(() => expect(screen.queryByText("¿De qué permiso?")).toBeNull());
  });

  it("la guía sin permiso viaja como «∅»", async () => {
    render(<ElegirPermisoDeGuia />);
    const { cuerpos, guardar } = servidor();
    const enCurso = guardar();
    await screen.findByText("¿De qué permiso?");
    fireEvent.click(document.querySelector('[data-candidata="sin-permiso"]')!);
    await act(async () => {
      await enCurso;
    });
    expect(cuerpos[1]?.contratoId).toBe("∅");
  });

  it("Cancelar no reintenta: vuelve el 409 para que la pantalla muestre el mensaje", async () => {
    render(<ElegirPermisoDeGuia />);
    const { f, guardar } = servidor();
    const enCurso = guardar();
    await screen.findByText("¿De qué permiso?");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    const fin: { r?: Response } = {};
    await act(async () => {
      fin.r = await enCurso;
    });
    expect(f).toHaveBeenCalledTimes(1);
    expect(fin.r?.status).toBe(409);
  });

  it("sin la ventana montada no pregunta: devuelve el 409", async () => {
    const { f, guardar } = servidor();
    const r = await guardar();
    expect(f).toHaveBeenCalledTimes(1);
    expect(r.status).toBe(409);
  });

  it("otro 409 (no ambigua) pasa de largo", async () => {
    render(<ElegirPermisoDeGuia />);
    const f = vi.fn(async () => respuesta(409, { error: "cubicacion_desactualizada" }));
    const r = await fetchConPermisoDeGuia(() => f());
    expect(f).toHaveBeenCalledTimes(1);
    expect(r.status).toBe(409);
    expect(screen.queryByText(/De qué permiso/)).toBeNull();
  });
});
