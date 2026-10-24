/**
 * «Para poner al día» en la ficha del permiso — lo que se ve según el rol y el
 * estado (la regla de cada paso está en `forestal-puesta-al-dia-del-permiso`).
 *
 *  · Corregir la fecha, acomodar y poner precio los firma admin/dueño (el
 *    servidor lo exige): el almacenero ve el paso, sin botón, con «Pídele a un
 *    administrador». Descontar (vincular) sí lo puede hacer.
 *  · Un permiso al día no monta nada (un «todo bien» permanente es ruido).
 *  · El paso actual tiene el único botón principal.
 */
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminRole } from "@/lib/session";
import { armarPuestaAlDia, type EntradaPuestaAlDia } from "@/lib/forestal/puesta-al-dia-del-permiso";
import type { VolumenDelPermiso } from "@/lib/forestal/volumen-del-permiso";

const estado = vi.hoisted(() => ({ rol: null as AdminRole | null, entrada: null as unknown }));

vi.mock("@/hooks/use-mi-rol", () => ({ useMiRol: () => estado.rol }));
vi.mock("@/components/admin/forestal/hooks/use-puesta-al-dia", () => ({
  usePuestaAlDia: () => ({
    lista: armarPuestaAlDia(estado.entrada as EntradaPuestaAlDia),
    recibidas: [],
    actualizando: false,
    reintentar: () => {},
  }),
}));

const { default: CtpPermisoPuestaAlDia } = await import("@/components/admin/forestal/CtpPermisoPuestaAlDia");

const listo = <T,>(valor: T) => ({ estado: "listo" as const, valor });
const PENDIENTE: EntradaPuestaAlDia = {
  fecha: listo({ sospechosas: ["G1"], sinRecibir: [], recibidasEl: ["2026-09-24"], sierraDesde: "2026-09-20", sinRevisar: 0 }),
  trozas: listo({ mover: 1, m3: 1.5, guias: 1, quietas: 0, sinFila: 0 }),
  precio: { sinPrecio: 2, m3SinPrecio: 5.1, filas: 2 },
  descontar: listo({ corridas: 2, ya: 1, porFecha: 1, porFila: 0, sinMadera: 0, otras: 0 }),
};
const AL_DIA: EntradaPuestaAlDia = {
  fecha: listo({ sospechosas: [], sinRecibir: [], recibidasEl: [], sierraDesde: null, sinRevisar: 0 }),
  trozas: listo({ mover: 0, m3: 0, guias: 0, quietas: 0, sinFila: 0 }),
  precio: { sinPrecio: 0, m3SinPrecio: 0, filas: 2 },
  descontar: listo({ corridas: 0, ya: 0, porFecha: 0, porFila: 0, sinMadera: 0, otras: 0 }),
};
const VOLUMEN = {
  contratoId: "c1",
  codigo: "QA-PUESTA-0925",
  avisos: { corridasSinMateriaPrima: { cantidad: 2, m3: 2.1, ids: ["a", "b"] } },
} as unknown as VolumenDelPermiso;

const filas = () => within(screen.getByRole("list")).getAllByRole("listitem");

describe("CtpPermisoPuestaAlDia", () => {
  beforeEach(() => {
    estado.rol = "admin";
    estado.entrada = PENDIENTE;
  });

  it("admin: un botón por paso pendiente y el principal sólo en el actual", () => {
    render(<CtpPermisoPuestaAlDia volumen={VOLUMEN} />);
    expect(screen.getByText("1 de 4")).toBeTruthy();
    const botones = filas().map((li) => within(li).queryByRole("button")?.textContent?.trim() ?? null);
    expect(botones).toEqual(["Corregir fechas", "Acomodar", "Poner precio", "Descontar 1"]);
    expect(within(filas()[0]!).getByRole("button").className).toContain("accent-dark");
    expect(within(filas()[1]!).getByRole("button").className).not.toContain("accent-dark");
    expect(filas()[0]!.getAttribute("aria-current")).toBe("step");
  });

  it("almacenero: ve los pasos 1-3 sin botón («Pídele a un administrador») y sí puede descontar", () => {
    estado.rol = "almacenero";
    render(<CtpPermisoPuestaAlDia volumen={VOLUMEN} />);
    const [f1, f2, f3, f4] = filas();
    for (const li of [f1!, f2!, f3!]) {
      expect(within(li).queryByRole("button")).toBeNull();
      expect(within(li).getByText("Pídele a un administrador")).toBeTruthy();
    }
    expect(within(f4!).getByRole("button", { name: /Descontar 1 — paso 4/ })).toBeTruthy();
  });

  it("al día desde que se abre: no monta nada", () => {
    estado.entrada = AL_DIA;
    const { container } = render(<CtpPermisoPuestaAlDia volumen={VOLUMEN} />);
    expect(container.innerHTML).toBe("");
  });

  it("si en esta visita quedó al día, lo dice en una línea", () => {
    const { rerender } = render(<CtpPermisoPuestaAlDia volumen={VOLUMEN} />);
    estado.entrada = AL_DIA;
    rerender(<CtpPermisoPuestaAlDia volumen={{ ...VOLUMEN }} />);
    expect(screen.getByRole("status").textContent).toContain("Este permiso quedó al día");
  });
});
