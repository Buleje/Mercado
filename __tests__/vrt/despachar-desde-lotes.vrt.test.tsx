/**
 * Elegir lotes, marcar su madera y que eso llegue a la guía.
 *
 * En el tenant real las cinco corridas están marcadas como uso propio, así que
 * la pantalla muestra —con razón— que no hay nada para despachar. Eso prueba el
 * caso vacío, no el flujo. Acá se monta el componente con un patio que SÍ tiene
 * madera, para recorrer lo que pidió Brandon: tildar lotes a la izquierda, ver
 * sus productos a la derecha, marcar y salir con los `uid`s que espera la guía.
 *
 * Corre en navegador real porque lo que se prueba son clics y estado, no HTML.
 */
import "@/app/globals.css";
import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import type { CorridaConSaldo } from "@/lib/forestal/productos-de-lote";

const PATIO: CorridaConSaldo[] = [
  {
    id: "c19",
    lineNo: 19,
    fecha: "2026-08-01",
    especie: "Tornillo",
    especieCientifica: null,
    producto: "MADERA ASERRADA (COMERCIAL)",
    presentacion: null,
    unidad: "m3",
    lote: "13-2026",
    cantidad: null,
    volumenConsumidoM3: null,
    producido: 19.103,
    despachado: 0,
    reprocesado: 0,
    disponible: 19.103,
    paquetes: [
      { id: "p1", codigo: "PQ-001", producto: null, presentacion: null, cantidad: 20, volumenM3: 9.1, espesorCm: null, anchoCm: null, largoM: null, observations: null },
      { id: "p2", codigo: "PQ-002", producto: null, presentacion: null, cantidad: 18, volumenM3: 10.003, espesorCm: null, anchoCm: null, largoM: null, observations: null },
    ],
    observations: null,
    titularOrigen: [],
    gtfOrigen: [],
    usadoAt: null,
    usadoMotivo: null,
  },
  {
    id: "c18",
    lineNo: 18,
    fecha: "2026-08-01",
    especie: "Tornillo",
    especieCientifica: null,
    producto: "MADERA ASERRADA (TABLA)",
    presentacion: null,
    unidad: "m3",
    lote: "15-2026",
    cantidad: null,
    volumenConsumidoM3: null,
    producido: 35.647,
    despachado: 0,
    reprocesado: 0,
    disponible: 35.647,
    paquetes: [
      { id: "p9", codigo: "PQ-009", producto: null, presentacion: null, cantidad: 30, volumenM3: 35.647, espesorCm: null, anchoCm: null, largoM: null, observations: null },
    ],
    observations: null,
    titularOrigen: [],
    gtfOrigen: [],
    usadoAt: null,
    usadoMotivo: null,
  },
  {
    /* Marcada como uso propio: NO tiene que aparecer en ningún lado de acá. */
    id: "c17",
    lineNo: 17,
    fecha: "2026-08-01",
    especie: "Tornillo",
    especieCientifica: null,
    producto: "MADERA ASERRADA (CORTA)",
    presentacion: null,
    unidad: "m3",
    lote: "16-2026",
    cantidad: null,
    volumenConsumidoM3: null,
    producido: 3.51,
    despachado: 0,
    reprocesado: 0,
    disponible: 3.51,
    paquetes: [],
    observations: null,
    titularOrigen: [],
    gtfOrigen: [],
    usadoAt: "2026-09-08T15:40:34.822Z",
    usadoMotivo: "Usado",
  },
];

vi.mock("@/lib/forestal/ctp-fetch", () => ({
  ctpGet: async () => ({ corridas: PATIO }),
  invalidarCtp: () => {},
}));

/** Clic real sobre el control que lleva ese `aria-label`. */
async function tildar(aria: string) {
  const el = document.querySelector<HTMLInputElement>(`[aria-label="${aria}"]`);
  if (!el) throw new Error(`no se encontró el control «${aria}»`);
  el.click();
  await new Promise((r) => setTimeout(r, 60));
}

const { default: CtpDespacharDesdeLotesModal } = await import(
  "@/components/admin/forestal/CtpDespacharDesdeLotesModal"
);

test("de tildar lotes a los uid que entran a la guía", async () => {
  const despachado = vi.fn();
  render(<CtpDespacharDesdeLotesModal onClose={() => {}} onDespachar={despachado} />);

  /* Sólo los lotes con madera: el marcado como uso propio no está en la lista. */
  await vi.waitFor(() => {
    expect(document.body.innerText).toContain("13-2026");
  });
  expect(document.body.innerText).toContain("15-2026");
  expect(document.body.innerText).not.toContain("16-2026");

  /* Sin lotes elegidos, la derecha invita a elegir y el botón no se puede usar. */
  expect(document.body.innerText).toContain("Elige un lote para ver su madera");
  const armar = () =>
    [...document.querySelectorAll("button")].find((b) => /Armar la guía/.test(b.innerText || ""))!;
  expect(armar().disabled).toBe(true);

  await tildar("Usar el lote 13-2026");

  /* Los dos paquetes del lote aparecen; los del otro lote todavía no. */
  await vi.waitFor(() => expect(document.body.innerText).toContain("PQ-001"));
  expect(document.body.innerText).toContain("PQ-002");
  expect(document.body.innerText).not.toContain("PQ-009");

  /* Marcar uno solo: el botón cuenta uno. */
  await tildar("Despachar PQ-001");
  await vi.waitFor(() => expect(armar().innerText).toContain("(1)"));
  expect(armar().disabled).toBe(false);

  /* Sumar el otro lote y marcar todo: tres filas de dos lotes. */
  await tildar("Usar el lote 15-2026");
  await vi.waitFor(() => expect(document.body.innerText).toContain("PQ-009"));
  await tildar("Marcar todo lo de estos lotes");
  await vi.waitFor(() => expect(armar().innerText).toContain("(3)"));

  armar().click();

  /* Lo que sale es exactamente lo que `presetUids` espera: corridaId:paqueteId. */
  await vi.waitFor(() => expect(despachado).toHaveBeenCalled());
  expect(despachado.mock.calls[0][0].sort()).toEqual(["c18:p9", "c19:p1", "c19:p2"]);
});

test("destildar un lote OLVIDA lo que estaba marcado de él", async () => {
  /* El conteo ya ignora las filas que no están a la vista; lo que esto prueba
     es que la selección no REVIVE: destildar y volver a tildar tiene que dejar
     el lote en cero, no devolver los paquetes que el operador soltó. */
  const despachado = vi.fn();
  render(<CtpDespacharDesdeLotesModal onClose={() => {}} onDespachar={despachado} />);
  await vi.waitFor(() => expect(document.body.innerText).toContain("13-2026"));

  await tildar("Usar el lote 13-2026");
  await vi.waitFor(() => expect(document.body.innerText).toContain("PQ-001"));
  await tildar("Marcar todo lo de estos lotes");

  const armar = () =>
    [...document.querySelectorAll("button")].find((b) => /Armar la guía/.test(b.innerText || ""))!;
  await vi.waitFor(() => expect(armar().innerText).toContain("(2)"));

  await tildar("Usar el lote 13-2026");
  await vi.waitFor(() => expect(armar().innerText).toContain("(0)"));
  expect(armar().disabled).toBe(true);

  /* Y al volver a elegirlo, sus paquetes vuelven DESMARCADOS. */
  await tildar("Usar el lote 13-2026");
  await vi.waitFor(() => expect(document.body.innerText).toContain("PQ-001"));
  expect(armar().innerText).toContain("(0)");
  expect(armar().disabled).toBe(true);
});
