/**
 * Personas de Adelantos (Brandon 30-10):
 * - la foto del DNI: quien no edita adelantos (el analista) ve el candado y la
 *   imagen NO se pide (el GET le da 403); mientras el rol carga, tampoco;
 * - «Completar datos» en lote: guarda fila por fila, una que falla no frena a
 *   las demás, y cada fila dice cómo quedó.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rol: "admin" as string | null }));
vi.mock("@/hooks/use-mi-rol", () => ({ useMiRol: () => m.rol }));
vi.mock("@/components/admin/adelantos/CapturaFoto", () => ({ default: () => null }));

import FotoDocumento from "@/components/admin/adelantos/personas/crear-persona/FotoDocumento";
import { FotoDelDni } from "@/components/admin/adelantos/personas/FichaPiezas";
import CompletarLote from "@/components/admin/adelantos/personas/completar-lote/CompletarLote";
import type { BeneficiarioConSaldo } from "@/components/admin/adelantos/crear-adelanto/tipos";

const fetchMock = vi.fn();
beforeEach(() => {
  m.rol = "admin";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const foto = (extra: Partial<Parameters<typeof FotoDocumento>[0]> = {}) => (
  <FotoDocumento personaId="p1" tieneGuardada foto={null} onFoto={vi.fn()} quitarGuardada={false} onQuitarGuardada={vi.fn()} {...extra} />
);

describe("FotoDocumento según el rol", () => {
  it("el analista ve el candado, sin <img>, sin «Ver en grande» y sin quitar", () => {
    m.rol = "analista";
    const { container } = render(foto());
    expect(screen.getByText("Solo quien edita adelantos ve la foto")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.queryByLabelText("Ver la foto del DNI")).toBeNull();
    expect(screen.queryByLabelText("Quitar la foto del DNI")).toBeNull();
  });

  it("quien edita adelantos ve la miniatura de su ruta privada y puede abrirla", () => {
    const { container } = render(foto());
    expect(container.querySelector("img")?.getAttribute("src")).toContain("p1");
    expect(screen.getByLabelText("Ver la foto del DNI")).toBeTruthy();
    expect(screen.queryByText("Solo quien edita adelantos ve la foto")).toBeNull();
  });

  it("mientras el rol carga no se pide la imagen", () => {
    m.rol = null;
    const { container } = render(foto());
    expect(container.querySelector("img")).toBeNull();
    expect(screen.queryByLabelText("Ver la foto del DNI")).toBeNull();
  });
});

describe("Ficha: «Foto del DNI: guardada»", () => {
  it("el analista ve que hay foto y el aviso, sin enlace", () => {
    m.rol = "analista";
    const { container } = render(<FotoDelDni personaId="p1" />);
    expect(screen.getByText(/Foto del DNI: guardada/)).toBeTruthy();
    expect(screen.getByText(/Solo quien edita adelantos ve la foto/)).toBeTruthy();
    expect(container.querySelector("a")).toBeNull();
  });

  it("quien edita la abre con «Ver»", () => {
    render(<FotoDelDni personaId="p1" />);
    expect(screen.getByRole("link", { name: "Ver" }).getAttribute("href")).toContain("p1");
  });
});

const persona = (id: string, nombre: string): BeneficiarioConSaldo =>
  ({
    id,
    nombre,
    documento: null,
    telefono: "987654321",
    notas: null,
    limiteCredito: null,
    activo: true,
    tipoRelacion: null,
    totalAdelantado: {},
    saldoPendiente: {},
    totalEntregado: {},
    saldoAFavor: {},
    adelantosAbiertos: 0,
    adelantosLiquidados: 0,
    adelantosCancelados: 0,
    ultimoAdelanto: null,
  }) as unknown as BeneficiarioConSaldo;

describe("Completar datos en lote", () => {
  it("guarda sólo las filas cambiadas, una que falla no frena a la otra, y cada una dice cómo quedó", async () => {
    const gente = [persona("a", "Ana QA"), persona("b", "Beto QA"), persona("c", "Carla QA")];
    /* Antes de cada PATCH se relee la ficha: la de Carla cambió en otra pestaña
       (tope 500, notas) y eso NO se pisa con la lista vieja. */
    const fichaDe = (p: BeneficiarioConSaldo, extra: object = {}) => new Response(JSON.stringify({ ...p, ...extra }), { status: 200 });
    fetchMock
      .mockResolvedValueOnce(fichaDe(gente[0]))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Ese DNI ya lo tiene otra persona." }), { status: 409 }))
      .mockResolvedValueOnce(fichaDe(gente[2], { limiteCredito: 500, notas: "Paga los sábados" }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const onGuardado = vi.fn();
    const { container } = render(<CompletarLote personas={gente} onGuardado={onGuardado} onSalir={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("DNI o RUC de Ana QA"), { target: { value: "45678912" } });
    fireEvent.change(screen.getByLabelText("Qué es Carla QA para el negocio"), { target: { value: "chofer" } });
    const guardar = screen.getByRole("button", { name: "Guardar 2 cambios" });
    fireEvent.click(guardar);
    fireEvent.click(guardar); // el doble clic no lanza otra tanda

    await waitFor(() => expect(onGuardado).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const llamadas = fetchMock.mock.calls as [string, RequestInit | undefined][];
    expect(llamadas.map(([u, i]) => `${i?.method ?? "GET"} ${u}`)).toEqual([
      "GET /api/adelantos/beneficiarios/a",
      "PATCH /api/adelantos/beneficiarios/a",
      "GET /api/adelantos/beneficiarios/c",
      "PATCH /api/adelantos/beneficiarios/c",
    ]);
    const cuerpo = (n: number) => JSON.parse(String(llamadas[n][1]?.body));
    expect(cuerpo(1).documento).toBe("45678912");
    expect("tipoRelacion" in cuerpo(1)).toBe(false);
    expect(cuerpo(3)).toMatchObject({ tipoRelacion: "chofer", limiteCredito: 500, notas: "Paga los sábados" });

    const fila = (id: string) => container.querySelector(`[data-fila-completar="${id}"]`) as HTMLElement;
    expect(fila("a").textContent).toContain("Ese DNI ya lo tiene otra persona.");
    expect(fila("c").textContent).toContain("Guardado");
    expect(fila("b").hasAttribute("data-cambiada")).toBe(false);
    /* La que falló sigue pendiente para reintentar. */
    expect(screen.getByRole("button", { name: "Guardar 1 cambio" })).toBeTruthy();
  });

  it("si no se puede releer la ficha, la fila no se guarda (no pisa con la lista vieja)", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 503 }));
    const gente = [persona("a", "Ana QA")];
    const { container } = render(<CompletarLote personas={gente} onGuardado={vi.fn()} onSalir={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Qué es Ana QA para el negocio"), { target: { value: "chofer" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar 1 cambio" }));
    await waitFor(() =>
      expect((container.querySelector('[data-fila-completar="a"]') as HTMLElement).textContent).toContain("No se pudo leer su ficha"),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("Enter baja a la misma columna de la fila de abajo", () => {
    render(<CompletarLote personas={[persona("a", "Ana QA"), persona("b", "Beto QA")]} onGuardado={vi.fn()} onSalir={vi.fn()} />);
    const de = screen.getByLabelText("DNI o RUC de Ana QA");
    de.focus();
    fireEvent.keyDown(de, { key: "Enter" });
    expect(document.activeElement).toBe(screen.getByLabelText("DNI o RUC de Beto QA"));
  });
});
