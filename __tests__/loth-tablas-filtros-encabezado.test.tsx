/**
 * Libro TH: las tablas por especie traen su filtro en cada encabezado (lista
 * para especie/estado, rango para números) y los chips/«Mostrando N de M».
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import LothCupoEspecies from "@/components/admin/forestal/LothCupoEspecies";
import LothRentabilidadRendimiento from "@/components/admin/forestal/loth-rentabilidad-rendimiento";
import type { CupoEspecie } from "@/lib/forestal/loth-cupo-especie";
import type { FilaRendimiento } from "@/components/admin/forestal/loth-rentabilidad-datos";

afterEach(cleanup);

const cuerpo = () => within(document.querySelector("tbody") as HTMLElement);
const cabecera = () => within(document.querySelector("thead") as HTMLElement);
const filas = () => document.querySelectorAll("tbody tr").length;

const rend = (species: string, rendimientoPct: number, valorMovilizado: number): FilaRendimiento => ({
  species, cites: false, taladoM3: 10, rendimientoPct, mermaM3: 4, valorMovilizado,
});
const RENDIMIENTOS = [rend("Tornillo", 62, 5000), rend("Cedro", 48, 1200), rend("Shihuahuaco", 70, 9000)];

const cupo = (especie: string, taladoM3: number, cupoM3: number, veredicto: CupoEspecie["veredicto"]): CupoEspecie => ({
  clave: especie.toLowerCase(), especie, arbolesCensados: 5, arbolesTalados: 2, arbolesAutorizados: null,
  censadoM3: cupoM3, autorizadoM3: null, cupoM3, fuente: "censo", taladoM3, restanteM3: cupoM3 - taladoM3,
  excesoM3: Math.max(0, taladoM3 - cupoM3), pctUsado: (taladoM3 / cupoM3) * 100, talasSinVolumen: 0, veredicto,
});

describe("Rendimiento por especie: filtros en el encabezado", () => {
  it("la lista de «Especie» y el rango de «Rendimiento» acotan las filas, con su chip y su conteo", () => {
    render(<LothRentabilidadRendimiento filas={RENDIMIENTOS} />);
    expect(filas()).toBe(3);
    fireEvent.click(cabecera().getByLabelText("Especie: Cedro"));
    expect(filas()).toBe(1);
    expect(cuerpo().getByText("Cedro")).toBeTruthy();
    expect(screen.getByTestId("filtros-conteo").textContent).toBe("Mostrando 1 de 3");
  });

  it("el rango numérico deja fuera lo que no llega al mínimo", () => {
    render(<LothRentabilidadRendimiento filas={RENDIMIENTOS} />);
    fireEvent.change(cabecera().getByLabelText("Rendimiento desde"), { target: { value: "60" } });
    expect(filas()).toBe(2);
    expect(cuerpo().queryByText("Cedro")).toBeNull();
  });
});

describe("Cupo por especie: filtros en el encabezado", () => {
  it("«Estado» filtra por veredicto y el mensaje de vacío aparece si nada coincide", () => {
    render(<LothCupoEspecies filas={[cupo("Tornillo", 12, 10, "excedido"), cupo("Cedro", 3, 10, "ok")]} />);
    expect(filas()).toBe(2);
    fireEvent.click(cabecera().getByLabelText("Estado: Excedido"));
    expect(filas()).toBe(1);
    expect(cuerpo().getByText("Tornillo")).toBeTruthy();
    fireEvent.click(cabecera().getByLabelText("Estado: En regla"));
    expect(filas()).toBe(2);
  });
});
