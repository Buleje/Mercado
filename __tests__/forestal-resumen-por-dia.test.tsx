/**
 * Resumen por día y por día · especie · tipo (Brandon, 2026-09-23): marcando
 * días en la tira aparecen los botones, cada uno abre su corte, y adentro del
 * modal se cambia de corte con la misma respuesta (sin volver a pedir).
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resumirJornadas, type CorridaParaResumen } from "@/lib/forestal/resumen-de-jornadas";

const LUNES = "2026-09-21";
const MARTES = "2026-09-22";
const c = (id: string, dia: string, especie: string, tipo: string, piezas: number, m3: number): CorridaParaResumen => ({
  id, lineNo: Number(id.slice(1)), dia, especie, linea: null, m3, piezasAsiento: 0, materiaPrimaRef: null,
  paquetes: [{ productType: tipo, cantidad: piezas, volumenM3: m3 }],
});
const DATOS = resumirJornadas([LUNES, MARTES], [
  c("c1", LUNES, "Tornillo", "Comercial", 40, 0.4123),
  c("c2", LUNES, "Cumala", "Tabla", 8, 0.0617),
  c("c3", MARTES, "Tornillo", "Paq. corta", 30, 0.3333),
]);

const ctpGet = vi.fn(async () => DATOS);
vi.mock("@/lib/forestal/ctp-fetch", () => ({ ctpGet: (...a: unknown[]) => ctpGet(...(a as [])) }));

import CtpResumenDeJornadasModal from "@/components/admin/forestal/CtpResumenDeJornadasModal";
import { DiasMarcados } from "@/components/admin/forestal/CtpAvisosDeLaTira";

beforeEach(() => ctpGet.mockClear());

describe("la barra de días marcados", () => {
  it("ofrece los tres cortes y cada botón abre el suyo", () => {
    const onResumen = vi.fn();
    render(<DiasMarcados marcados={[LUNES, MARTES]} onLimpiar={vi.fn()} onResumen={onResumen} />);
    const grupo = screen.getByRole("group", { name: "Resumen de los días marcados" });
    fireEvent.click(within(grupo).getByRole("button", { name: /Resumen por día/ }));
    fireEvent.click(within(grupo).getByRole("button", { name: /Por día, especie y tipo/ }));
    fireEvent.click(within(grupo).getByRole("button", { name: /Por especie de esos días/ }));
    expect(onResumen.mock.calls.map(([corte]) => corte)).toEqual(["dia", "diaEspecie", "especie"]);
  });
});

describe("el modal del resumen", () => {
  it("por día: un renglón por día con sus piezas, m³ y PT, y el total", async () => {
    render(<CtpResumenDeJornadasModal dias={[LUNES, MARTES]} corte="dia" onClose={vi.fn()} />);
    const tabla = await screen.findByRole("table", { name: "Un renglón por día" });
    const filas = within(tabla).getAllByRole("row");
    /* cabecera + lunes + martes + total */
    expect(filas).toHaveLength(4);
    expect(filas[1]!.textContent).toMatch(/lunes 21\/09/i);
    expect(filas[1]!.textContent).toContain("Tornillo · Cumala");
    expect(filas[1]!.textContent).toContain("48");
    expect(filas[2]!.textContent).toMatch(/martes 22\/09/i);
    expect(filas[3]!.textContent).toContain("Total · 2 días");
    expect(filas[3]!.textContent).toContain(String(DATOS.totales.pt));
  });

  it("por día, especie y tipo: la especie va en CADA fila, bajo su día", async () => {
    render(<CtpResumenDeJornadasModal dias={[LUNES, MARTES]} corte="diaEspecie" onClose={vi.fn()} />);
    const tabla = await screen.findByRole("table", { name: "Cada día con una fila por especie y tipo" });
    const textos = within(tabla).getAllByRole("row").map((f) => f.textContent ?? "");
    expect(textos.some((t) => /^Tornillo\s*Comercial/.test(t))).toBe(true);
    expect(textos.some((t) => /^Cumala\s*Tabla/.test(t))).toBe(true);
    expect(textos.some((t) => /^Tornillo\s*Paq\. corta/.test(t))).toBe(true);
    expect(within(tabla).getAllByRole("columnheader", { name: /lunes 21\/09/i })).toHaveLength(1);
  });

  it("cambiar de corte no vuelve a pedir al servidor", async () => {
    render(<CtpResumenDeJornadasModal dias={[LUNES, MARTES]} corte="especie" onClose={vi.fn()} />);
    await screen.findByRole("table", { name: "Por especie y producto, todos los días juntos" });
    fireEvent.click(screen.getByRole("radio", { name: "Por día" }));
    expect(screen.getByRole("table", { name: "Un renglón por día" })).toBeInTheDocument();
    expect(ctpGet).toHaveBeenCalledTimes(1);
  });
});
