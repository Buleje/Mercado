/**
 * «Ver qué salió ese día» abre el día pieza por pieza (Brandon, 2026-09-23).
 *
 * Se fija con datos simulados lo que el usuario hace con él:
 *  · ve cada paquete con su escuadría en pulgadas × pulgadas × pies;
 *  · cambia al resumen por especie y tipo SIN volver a pedir;
 *  · «Traer todo el día al cubicado» manda las piezas de TODAS las corridas
 *    —no corrida por corrida— una sola vez;
 *  · editar abre las puertas que ya existen (escuadría del paquete, corrida) y
 *    un rol que no puede corregir no las ve.
 */
import { fireEvent, render, screen, waitFor, within, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resumirJornadas } from "@/lib/forestal/resumen-de-jornadas";
import type { CorridaDelDia, PaqueteDelDia } from "@/lib/forestal/piezas-del-dia";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";

const H = vi.hoisted(() => ({ rol: "admin" as string | null }));
vi.mock("@/hooks/use-mi-rol", () => ({ useMiRol: () => H.rol }));

const DIA = "2026-09-23";
const paq = (id: string, over: Partial<PaqueteDelDia> = {}): PaqueteDelDia => ({
  id,
  codigo: `PQ-2609-${id}`,
  producto: "MADERA ASERRADA (COMERCIAL)",
  presentacion: "PIEZAS",
  cantidad: 10,
  volumenM3: 0.3145,
  espesorCm: 5.08,
  anchoCm: 20.32,
  largoM: 3.05,
  pieTablar: 133.33,
  ...over,
});
const corrida = (id: string, lineNo: number, over: Partial<CorridaDelDia>): CorridaDelDia => ({
  id,
  lineNo,
  dia: DIA,
  fecha: `${DIA}T00:00:00.000Z`,
  especie: "Tornillo",
  especieCientifica: null,
  producto: "MADERA ASERRADA (COMERCIAL)",
  presentacion: "PIEZAS",
  unidad: "m3",
  cantidad: 0.629,
  m3: 0.629,
  piezasAsiento: 20,
  volumenConsumidoM3: null,
  observaciones: null,
  materiaPrimaRef: null,
  dueno: "Del centro",
  duenoMadera: "propia",
  titularNombre: null,
  duenoParteId: null,
  gtfOrigen: [],
  permisos: [],
  atadaPorque: null,
  paquetes: [],
  ...over,
});

const DETALLE: CorridaDelDia[] = [
  corrida("c41", 41, { paquetes: [paq("001"), paq("002", { espesorCm: 7.62, largoM: 2.44, pieTablar: 160 })] }),
  corrida("c42", 42, {
    especie: "Cumala",
    dueno: "De tercero · WASACO",
    duenoMadera: "tercero",
    titularNombre: "WASACO",
    m3: 0.4,
    paquetes: [paq("003", { cantidad: 6 }), paq("004", { anchoCm: null, cantidad: 4, volumenM3: 0.0855 })],
  }),
];
const DATOS = {
  ...resumirJornadas(
    [DIA],
    DETALLE.map((c) => ({
      id: c.id,
      lineNo: c.lineNo,
      dia: c.dia,
      especie: c.especie,
      linea: null,
      dueno: c.dueno,
      m3: c.m3,
      piezasAsiento: c.piezasAsiento,
      materiaPrimaRef: null,
      paquetes: c.paquetes.map((p) => ({ productType: p.producto, cantidad: p.cantidad, volumenM3: p.volumenM3 })),
    })),
  ),
  detalle: DETALLE,
};

const ctpGet = vi.fn(async (_url: string) => DATOS);
vi.mock("@/lib/forestal/ctp-fetch", () => ({
  ctpGet: (url: string) => ctpGet(url),
  invalidarCtp: () => {},
}));

import CtpDiaDeProduccionModal from "@/components/admin/forestal/CtpDiaDeProduccionModal";

beforeEach(() => {
  ctpGet.mockClear();
  H.rol = "admin";
});
afterEach(() => {
  cleanup();
});

async function abrir(props: Partial<React.ComponentProps<typeof CtpDiaDeProduccionModal>> = {}) {
  const onCopiarAlCubicado = vi.fn<(p: PiezaCubicada[]) => void>();
  render(<CtpDiaDeProduccionModal dia={DIA} onClose={vi.fn()} onCopiarAlCubicado={onCopiarAlCubicado} {...props} />);
  const tabla = await screen.findByRole("table", { name: "Cada paquete de cada corrida, con su escuadría" });
  return { tabla, onCopiarAlCubicado };
}

describe("el modal del día", () => {
  it("pide el día con sus paquetes en UNA consulta", async () => {
    await abrir();
    expect(ctpGet).toHaveBeenCalledTimes(1);
    expect(ctpGet.mock.calls[0]![0]).toContain(`resumenJornadas=1&paquetes=1&dias=${DIA}`);
  });

  it("pieza por pieza: cada paquete con su escuadría en pulgadas y pies, agrupado por corrida", async () => {
    const { tabla } = await abrir();
    const texto = tabla.textContent ?? "";
    expect(texto).toContain("N.º 41 · Tornillo");
    expect(texto).toContain("N.º 42 · Cumala");
    expect(texto).toContain("WASACO");
    expect(within(tabla).getByRole("button", { name: /escuadría del paquete PQ-2609-001/ })).toHaveTextContent("2 × 8 × 10");
    expect(within(tabla).getByRole("button", { name: /escuadría del paquete PQ-2609-002/ })).toHaveTextContent("3 × 8 × 8");
    /* 3×8×8 de 10 piezas son 0.378 m³ y el paquete declara 0.3145: la fila lo
       dice (la escuadría se corrige para cotejar, no pisa el volumen). */
    expect(within(tabla).getByRole("button", { name: /escuadría del paquete PQ-2609-002/ })).toHaveTextContent("No cuadra");
    expect(within(tabla).getByRole("button", { name: /escuadría del paquete PQ-2609-001/ })).not.toHaveTextContent("No cuadra");
    /* El que no tiene ancho lo dice, no inventa una medida. */
    expect(within(tabla).getByRole("button", { name: /Cargar la escuadría del paquete PQ-2609-004/ })).toHaveTextContent(
      "Sin escuadría",
    );
    /* Total: 4 paquetes · 30 piezas. */
    const total = within(tabla).getByRole("rowheader", { name: /Total · 4 paquetes/ }).closest("tr")!;
    expect(total.textContent).toContain("30");
  });

  it("el resumen por especie y tipo sale de la misma respuesta, sin volver a pedir", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("radio", { name: "Por especie y tipo" }));
    const tabla = screen.getByRole("table", { name: "Cada día con una fila por especie y tipo" });
    const filas = within(tabla).getAllByRole("row").map((f) => f.textContent ?? "");
    expect(filas.some((t) => /^Tornillo\s*MADERA ASERRADA \(COMERCIAL\)/.test(t))).toBe(true);
    expect(filas.some((t) => /^Cumala/.test(t))).toBe(true);
    expect(ctpGet).toHaveBeenCalledTimes(1);
  });

  it("«Traer todo el día al cubicado» manda las piezas de TODAS las corridas, una sola vez", async () => {
    const { onCopiarAlCubicado } = await abrir();
    const traer = screen.getByRole("button", { name: /Traer todo el día al cubicado/ });
    fireEvent.click(traer);
    expect(onCopiarAlCubicado).toHaveBeenCalledTimes(1);
    const piezas = onCopiarAlCubicado.mock.calls[0]![0];
    /* 3 de 4 paquetes: el sin ancho no viaja. De las DOS corridas. */
    expect(piezas.map((p) => `${p.especie}:${p.espesor}×${p.ancho}×${p.largo}:${p.cantidad}`)).toEqual([
      "Tornillo:2×8×10:10",
      "Tornillo:3×8×8:10",
      "Cumala:2×8×10:6",
    ]);
    expect(piezas[2]!.dueno).toBe("WASACO");
    /* La copia se dice, y un segundo clic no duplica. */
    expect(screen.getByRole("status")).toHaveTextContent(/Es una copia: guardarla crea corridas NUEVAS/);
    expect(screen.getByRole("button", { name: /Ya está en el cubicado/ })).toBeDisabled();
    /* El paquete sin escuadría se avisa. */
    expect(screen.getByText(/1 paquete .* no tiene escuadría y no entra al cubicado/)).toBeInTheDocument();
  });

  it("sin cubicador a la vista no se ofrece traer", async () => {
    render(<CtpDiaDeProduccionModal dia={DIA} onClose={vi.fn()} />);
    await screen.findByRole("table", { name: "Cada paquete de cada corrida, con su escuadría" });
    expect(screen.queryByRole("button", { name: /Traer todo el día/ })).not.toBeInTheDocument();
  });

  it("«Editar escuadría» abre la escuadría de ESE paquete, en pulgadas y pies", async () => {
    const { tabla } = await abrir();
    fireEvent.click(within(tabla).getByRole("button", { name: /Corregir la escuadría del paquete PQ-2609-002/ }));
    const escuadria = await screen.findByRole("dialog", { name: /Escuadría del paquete PQ-2609-002/ });
    expect(within(escuadria).getByLabelText("Espesor (pulg)")).toHaveValue("3");
    expect(within(escuadria).getByLabelText("Largo (pies)")).toHaveValue("8");
  });

  it("«Editar corrida» abre el editor de ADR-401 con lo que la corrida dice hoy", async () => {
    const { tabla } = await abrir();
    fireEvent.click(within(tabla).getByRole("button", { name: /Editar la corrida N\.º 42/ }));
    const editor = await screen.findByRole("dialog", { name: /Editar la corrida N° 42/ });
    expect(editor).toBeInTheDocument();
    /* El día se oculta mientras tanto (Radix le apagaría los clics al editor). */
    await waitFor(() =>
      expect(screen.queryByRole("table", { name: "Cada paquete de cada corrida, con su escuadría" })).not.toBeInTheDocument(),
    );
  });

  it("un rol que no puede corregir ve el día sin las puertas de edición", async () => {
    H.rol = "almacenero";
    const { tabla } = await abrir();
    expect(within(tabla).queryByRole("button", { name: /Editar la corrida/ })).not.toBeInTheDocument();
    expect(within(tabla).queryByRole("button", { name: /escuadría del paquete/ })).not.toBeInTheDocument();
    expect(tabla.textContent).toContain("2 × 8 × 10");
  });
});
