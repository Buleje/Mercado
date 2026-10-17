/**
 * Revisión 23-09 (hallazgo 3): la línea de la tira PLEGADA decía «sin corridas
 * anotados» también cuando no lo sabía — lectura fallada, otra semana a la
 * vista o todavía cargando. Refutación del revisor con la expectativa dada
 * vuelta: ahora dice lo que pasa, y «anotadas» concuerda con «corridas».
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";

vi.mock("@/components/admin/forestal/CtpResumenDeJornadasModal", () => ({ default: () => null }));
import CtpSemanaDeRegistro from "@/components/admin/forestal/CtpSemanaDeRegistro";
import {
  useJornadasDeProduccion,
  type JornadaDeProduccion,
} from "@/components/admin/forestal/hooks/use-jornadas-produccion";

const LUNES_14: JornadaDeProduccion = {
  dia: "2026-09-14",
  corridas: 1,
  m3: 1,
  pt: 424,
  piezas: 10,
};

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

it("A) con la lectura fallada, plegada dice que no se pudo leer (no «sin corridas»)", () => {
  render(
    <CtpSemanaDeRegistro
      valor="2026-09-17"
      onElegir={() => {}}
      semana="2026-09-17"
      onSemana={() => {}}
      porDia={new Map()}
      error="El servidor respondió 500"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Ocultar los días" }));
  expect(
    screen.getByText(/no se pudo leer lo ya producido \(El servidor respondió 500\)/),
  ).toBeInTheDocument();
  expect(screen.queryByText(/sin corridas/)).not.toBeInTheDocument();
});

it("B) mirando OTRA semana, plegar vuelve a la del día elegido y no afirma nada que no sabe", () => {
  const onSemana = vi.fn();
  render(
    <CtpSemanaDeRegistro
      valor="2026-09-17"
      onElegir={() => {}}
      semana="2026-09-10"
      onSemana={onSemana}
      porDia={new Map([[LUNES_14.dia, LUNES_14]])}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Ocultar los días" }));
  expect(onSemana).toHaveBeenCalledWith("2026-09-17");
  expect(screen.getByText("jueves 17/09")).toBeInTheDocument();
  expect(screen.queryByText(/sin corridas/)).not.toBeInTheDocument();
  expect(screen.getByText(/de otra semana/)).toBeInTheDocument();
});

it("C) mientras carga, plegada dice que está leyendo", () => {
  render(
    <CtpSemanaDeRegistro
      valor="2026-09-17"
      onElegir={() => {}}
      semana="2026-09-17"
      onSemana={() => {}}
      porDia={new Map()}
      cargando
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Ocultar los días" }));
  expect(screen.getByText(/leyendo lo ya producido/)).toBeInTheDocument();
  expect(screen.queryByText(/sin corridas/)).not.toBeInTheDocument();
});

it("D) sabiendo que el día está vacío, lo dice con la concordancia bien", () => {
  render(
    <CtpSemanaDeRegistro
      valor="2026-09-17"
      onElegir={() => {}}
      semana="2026-09-17"
      onSemana={() => {}}
      porDia={new Map()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Ocultar los días" }));
  expect(screen.getByText(/sin corridas anotadas/)).toBeInTheDocument();
});

/* ── El hook: «cargando» hasta que lo leído sea de ESTA semana ─────────────── */

it("E) al cambiar de semana, `cargando` ya es true en el primer render (porDia es de la otra)", async () => {
  let soltar: (() => void) | null = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (url: string) =>
        new Promise<Response>((ok) => {
          const cuerpo = String(url).includes("semanaDesde=2026-09-14")
            ? { jornadas: [LUNES_14] }
            : { jornadas: [] };
          soltar = () => ok(new Response(JSON.stringify(cuerpo)));
        }),
    ),
  );
  const { result, rerender } = renderHook(({ semana }) => useJornadasDeProduccion(semana), {
    initialProps: { semana: "2026-09-17" },
  });
  await act(async () => {
    soltar?.();
    await new Promise((r) => setTimeout(r, 0));
  });
  expect(result.current.cargando).toBe(false);
  rerender({ semana: "2026-09-24" });
  /* Mismo render del cambio: porDia sigue siendo la semana del 14, y la tira no
     puede tomarlo como la del 24. */
  expect(result.current.cargando).toBe(true);
  await act(async () => {
    soltar?.();
    await new Promise((r) => setTimeout(r, 0));
  });
  expect(result.current.cargando).toBe(false);
  vi.unstubAllGlobals();
});
