/**
 * «Valorizar» con una especie cuyo precio cambia SÓLO por el tipo (Brandon
 * 28-10: «Cuenta con precio por tipo»). Lo que se prueba es el cableado de la
 * plata (el cálculo vive en `cubicacion-madera-cuenta.test.ts`):
 *
 *  - El campo arranca con el ponderado y el total es el de la cubicación.
 *  - Al servidor viaja el ponderado EXACTO (no el «3.6667» del campo) y la
 *    marca: el general nunca cubre la especie.
 *  - Escribir otro precio vale lo escrito; el botón del promedio lo devuelve.
 *  - Sin promedio si el borrador no tiene el PT con que se calculó, ni en el despacho.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CubicacionTrozas } from "@/components/admin/forestal/hooks/use-cubicaciones-trozas";
import { preciosSugeridosMadera, type PreciosSugeridos } from "@/lib/forestal/cubicacion-madera-cuenta";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import { tipoDePieza, type TipoComercial } from "@/lib/forestal/cubicacion-tipo";

const m = vi.hoisted(() => ({ aplicar: vi.fn() }));

vi.mock("@/components/admin/forestal/hooks/use-cubicaciones-trozas", async (orig) => ({
  ...(await orig<typeof import("@/components/admin/forestal/hooks/use-cubicaciones-trozas")>()),
  useCubicacionesTrozas: () => ({ lista: [], error: null, recargar: () => {} }),
  useAdelantosAbiertos: () => [],
  aplicarCubicacionTrozas: m.aplicar,
}));

import ValorizarPrecios from "@/components/admin/forestal/cubicador-trozas-precios";

afterEach(cleanup);

/* 1"×12"×10' = 10 PT la pieza. */
const fila = (id: string, cantidad: number, tipo: TipoComercial): PiezaCubicada => ({
  id, cantidad, espesor: 1, ancho: 12, largo: 10, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies",
  pieTablar: cantidad * 10, m3: 0, especie: "Tornillo", tipo, dueno: "Ana", duenoParteId: "pt1",
});
const precioPorTipo = (p: PiezaCubicada) => (tipoDePieza(p) === "Corta" ? 3 : 4);

/** La cubicación que congeló el servidor con esas piezas (PT por pieza). */
const cubDe = (filas: PiezaCubicada[]): CubicacionTrozas => ({
  id: "cub1", codigo: "CUB-2026-0001", fecha: "2026-10-28", formula: "tablar", diametros: 2, unidad: "PT",
  beneficiarioId: null, parteId: "pt1", personaNombre: "Ana", sentido: "venta", gtfNumber: null, contratoId: null,
  nTrozas: filas.reduce((t, f) => t + f.cantidad, 0), volumen: filas.reduce((t, f) => t + f.pieTablar, 0),
  porEspecie: null, monto: null, moneda: "PEN", estado: "borrador", version: 1, aplicadaAt: null, aplicadaPor: null,
  imputacion: null, aCuenta: null, valorVenta: null, anuladaAt: null, anuladaPor: null, motivoAnulacion: null, notas: null,
  placa: null, chofer: null, createdBy: "qa", createdAt: "2026-10-28T00:00:00Z", updatedAt: "2026-10-28T00:00:00Z",
  material: "aserrada", origen: "libre", modo: "pieza", trozas: [],
  piezas: filas.map((f, i) => ({
    n: i + 1, especie: "Tornillo", cantidad: f.cantidad, espesor: 1, ancho: 12, largo: 10, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies",
    bruto: f.pieTablar, volumen: f.pieTablar,
  })),
} as unknown as CubicacionTrozas);

/** `lote` = las filas vivas del cubicador (por omisión, las del borrador); `ajustar` = lo que le hace el despacho. */
function montar(filas: PiezaCubicada[], { lote = filas, ajustar = (s: PreciosSugeridos) => s }: { lote?: PiezaCubicada[]; ajustar?: (s: PreciosSugeridos) => PreciosSugeridos } = {}) {
  const sugeridos = ajustar(preciosSugeridosMadera(lote, null, precioPorTipo, 2));
  render(<ValorizarPrecios cub={cubDe(filas)} cuenta={{ parteId: "pt1", nombre: "Ana", saldo: 0 }} preciosSugeridos={sugeridos} onAplicada={() => {}} />);
  return screen.getByLabelText("Precio de Tornillo por PT") as HTMLInputElement;
}

async function cobrar() {
  m.aplicar.mockResolvedValue({ ok: false, status: 409, mensaje: "prueba" });
  const antes = m.aplicar.mock.calls.length;
  const confirmar = document.querySelector('[data-accion="confirmar-persona"]') as HTMLInputElement;
  fireEvent.click(confirmar);
  fireEvent.click(document.querySelector('[data-accion="aplicar-cubicacion"]') as HTMLElement);
  await waitFor(() => expect(m.aplicar.mock.calls.length).toBe(antes + 1));
  /* El 409 de mentira desmarca la casilla: esperar a que cierre antes de seguir. */
  await waitFor(() => expect(confirmar.checked).toBe(false));
  return m.aplicar.mock.calls.at(-1)?.[1] as { precios: Array<{ clave: string; precio: number }>; precioGeneral?: number; montoVisto: number; especiesConVariosPrecios?: unknown };
}

describe("Valorizar: precio por tipo (Brandon 28-10)", () => {
  it("caso medido: Corta 100 PT a S/ 3 + Comercial 300 PT a S/ 4 → arranca en 3.75 y cobra S/ 1.500,00", async () => {
    m.aplicar.mockReset();
    const campo = montar([fila("a", 10, "Corta"), fila("b", 30, "Comercial")]);
    expect(campo.value).toBe("3.75");
    expect(document.querySelector('[data-vista="precio-por-tipo"]')?.textContent).toContain("promedio por tipo");
    const cuerpo = await cobrar();
    expect(cuerpo.montoVisto).toBe(1500);
    expect(cuerpo.precios).toEqual([{ clave: "tornillo", precio: 3.75 }]);
    expect(cuerpo.especiesConVariosPrecios).toEqual([{ clave: "tornillo", cuantos: 2 }]);
  });

  it("con el campo vacío no se puede cobrar: el general no cubre una especie con precio por tipo", () => {
    const campo = montar([fila("a", 10, "Corta"), fila("b", 30, "Comercial")]);
    fireEvent.change(campo, { target: { value: "" } });
    expect(campo.placeholder).toBe("elige");
    /* Sin monto ni siquiera aparece «Sí, es la madera de…». */
    expect(document.querySelector('[data-accion="confirmar-persona"]')).toBeNull();
    expect((document.querySelector('[data-accion="aplicar-cubicacion"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it("periódico: el campo dice 3.6667 pero viaja 1100/300 y el monto es S/ 1.100,00 (no S/ 1.100,01 ni S/ 1.101)", async () => {
    m.aplicar.mockReset();
    const campo = montar([fila("a", 10, "Corta"), fila("b", 20, "Comercial")]);
    expect(campo.value).toBe("3.6667");
    const cuerpo = await cobrar();
    expect(cuerpo.precios[0].precio).toBeCloseTo(1100 / 300, 12);
    expect(cuerpo.montoVisto).toBe(1100);
  });

  it("otro precio escrito vale lo escrito; el botón del promedio vuelve al exacto", async () => {
    m.aplicar.mockReset();
    const campo = montar([fila("a", 10, "Corta"), fila("b", 20, "Comercial")]);
    fireEvent.change(campo, { target: { value: "4" } });
    let cuerpo = await cobrar();
    expect(cuerpo).toMatchObject({ precios: [{ clave: "tornillo", precio: 4 }], montoVisto: 1200 });
    fireEvent.click(document.querySelector('[data-accion="precio-ponderado"]') as HTMLElement);
    expect(campo.value).toBe("3.6667");
    cuerpo = await cobrar();
    expect(cuerpo.montoVisto).toBe(1100);
  });

  /** Ni campo, ni botón del promedio, ni ⓘ; el general no la cubre: no hay monto. */
  const esperarQuePidaElegir = (campo: HTMLInputElement) => {
    expect(campo.value).toBe("");
    expect(campo.placeholder).toBe("elige");
    expect(document.querySelector('[data-accion="precio-ponderado"]')).toBeNull();
    expect(document.querySelector('[data-vista="precio-por-tipo"]')).toBeNull();
    expect((document.querySelector('[data-accion="aplicar-cubicacion"]') as HTMLButtonElement).disabled).toBe(true);
  };

  it("lote cambiado sin volver a guardar: borrador 100+300 PT, filas 400+300 PT → pide elegir (no 3,43 × 400 PT = S/ 1.371,43)", () => {
    esperarQuePidaElegir(montar([fila("a", 10, "Corta"), fila("b", 30, "Comercial")], { lote: [fila("a", 40, "Corta"), fila("b", 30, "Comercial")] }));
  });

  it("despacho: sin los precios del cubicador tampoco hay promedio, pide elegir", () => {
    esperarQuePidaElegir(montar([fila("a", 10, "Corta"), fila("b", 30, "Comercial")], { ajustar: (s) => ({ ...s, general: null, porEspecie: {} }) }));
  });
});
