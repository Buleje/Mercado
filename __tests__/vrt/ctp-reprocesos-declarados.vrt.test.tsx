/**
 * El panel «qué volvió a la sierra», renderizado de verdad (Vitest 4 Browser
 * Mode) con la respuesta del endpoint simulada.
 *
 * Va acá y no en la pantalla porque hoy **ningún tenant tiene reprocesos
 * declarados** (medido: el endpoint responde 200 con lista vacía), y declarar
 * uno para poder mirarlo sería meter madera inventada en un libro oficial. Lo
 * que se prueba es lo que cambia una decisión: que la merma se lea, que lo que
 * hay que explicar quede marcado y que el filtro deje sólo eso.
 *
 * Sin `toMatchScreenshot`: se protege el comportamiento, no el pixel.
 */
import "@/app/globals.css";
import { expect, test, beforeEach, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import CtpReprocesosDeclarados from "@/components/admin/forestal/CtpReprocesosDeclarados";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";

const PERIODO: CtpPeriod = { key: "todo", from: null, to: null, label: "Histórico" };

/** Dos reprocesos: uno normal y uno que hay que poder explicar. */
const REPROCESOS = [
  {
    destinoEntryId: "d1",
    lineNo: 31,
    fecha: "2026-09-02T00:00:00.000Z",
    producto: "MADERA ASERRADA (PAQUETERIA LARGA)",
    especie: "TORNILLO",
    unidad: "m3",
    salio: 0.8,
    observaciones: "Fuera de medida para el cliente.",
    permiso: "19-SEC/REG-PLT-2026-032",
    origenes: [
      { entryId: "o1", lineNo: 12, producto: "MADERA ASERRADA (COMERCIAL)", especie: "TORNILLO", cantidad: 1 },
    ],
  },
  {
    destinoEntryId: "d2",
    lineNo: 32,
    fecha: "2026-09-05T00:00:00.000Z",
    producto: "MADERA ASERRADA (COMERCIAL)",
    especie: "TORNILLO",
    unidad: "m3",
    salio: 0.4,
    observaciones: "Reproceso (conversión no habitual: de Tabla a Comercial): devolución del cliente.",
    permiso: null,
    origenes: [
      { entryId: "o2", lineNo: 20, producto: "MADERA ASERRADA (TABLA)", especie: "TORNILLO", cantidad: 0.5 },
    ],
  },
];

beforeEach(() => {
  /* Cada test monta su propio panel: sin limpiar, `document.body.innerText`
     mezcla el DOM de los anteriores y un `1 de 2` puede venir de otro montaje. */
  document.body.innerHTML = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ reprocesos: REPROCESOS }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
});

async function montar() {
  const r = render(
    <div style={{ width: 1100, minHeight: 700 }}>
      <CtpReprocesosDeclarados period={PERIODO} />
    </div>,
  );
  /* El panel pide sus datos al montar. Se espera a que aparezca el contenido
     —no a que desaparezca el spinner—: en el primer tick React todavía no
     pintó nada y un «no está el spinner» daría por listo un body vacío. */
  for (let i = 0; i < 60; i++) {
    if (/Volvió a la sierra|no volvió madera/i.test(document.body.innerText)) break;
    await new Promise((res) => setTimeout(res, 50));
  }
  return r;
}

test("dice lo que entró, lo que salió y la merma del conjunto", async () => {
  await montar();
  const txt = document.body.innerText;
  /* 1 + 0.5 entraron, 0.8 + 0.4 salieron → 0.3 de merma, 20 % del conjunto. */
  expect(txt).toMatch(/1\.500 m³/);
  expect(txt).toMatch(/1\.200 m³/);
  expect(txt).toMatch(/0\.300 m³/);
  expect(txt).toMatch(/20 % de lo que entró/);
});

test("marca la conversión que hay que explicar y muestra el porqué", async () => {
  await montar();
  const txt = document.body.innerText;
  expect(txt).toMatch(/Tabla/);
  expect(txt).toMatch(/producto terminado/i);
  /* El contador del encabezado cuenta ese reproceso, no los dos. */
  expect(txt).toMatch(/1 fuera de lo habitual/);
});

test("el filtro deja sólo los que hay que explicar", async () => {
  await montar();
  const check = [...document.querySelectorAll("input[type=checkbox]")].at(-1) as HTMLInputElement;
  await userEvent.click(check);
  await new Promise((res) => setTimeout(res, 80));
  const txt = document.body.innerText;
  expect(txt).toMatch(/1 de 2/);
  /* La corrida normal desaparece de la lista; la marcada queda. */
  expect(txt).toMatch(/N° 32/);
});

test("abrir un reproceso muestra su origen y lo que se escribió al declararlo", async () => {
  await montar();
  const btn = [...document.querySelectorAll("button")].find((b) => /N° 32/.test(b.textContent || ""));
  await userEvent.click(btn!);
  await new Promise((res) => setTimeout(res, 80));
  const txt = document.body.innerText;
  /* El título va en versalitas por CSS y `innerText` respeta el text-transform. */
  expect(txt).toMatch(/corridas que entraron/i);
  expect(txt).toMatch(/devolución del cliente/);
});
