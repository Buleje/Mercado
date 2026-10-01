/**
 * El modal de reproceso del Libro, renderizado de verdad (Vitest 4 Browser
 * Mode), para la parte que `tsc` no ve: **qué productos ofrece según de qué
 * producto se parte** y el aviso cuando la conversión no es de las habituales
 * (ADR-407).
 *
 * Se prueba acá y no en la pantalla porque el caso que importa —partir de un
 * producto TERMINADO (tabla, larga angosta, corta)— no existe hoy en los datos
 * del Libro, y fabricarlo escribiendo un asiento en el tenant real sería meter
 * madera inventada en un libro oficial.
 *
 * Sin `toMatchScreenshot`: lo que se protege es el comportamiento, no el pixel.
 * Corre con `npm run test:vrt`.
 */
import "@/app/globals.css";
import { expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import CtpReprocesoModal, {
  type OrigenDeReproceso,
} from "@/components/admin/forestal/CtpReprocesoModal";

const origen = (producto: string): OrigenDeReproceso => ({
  id: "e1",
  lineNo: 23,
  especie: "TORNILLO",
  producto,
  unidad: "m3",
  disponible: 1.326,
});

async function montar(producto: string) {
  const r = render(
    <div style={{ width: 900, minHeight: 620 }}>
      <CtpReprocesoModal origen={origen(producto)} onListo={() => {}} onClose={() => {}} />
    </div>,
  );
  /* El modal monta en un portal: sin ceder un tick, el DOM todavía está vacío
     y un `expect(0)` pasaría por la razón equivocada. */
  await new Promise((res) => setTimeout(res, 60));
  return r;
}

/** El control de un campo, por el texto de su `<label>` (que sí trae `for`). */
const campo = (label: RegExp): HTMLInputElement | HTMLSelectElement => {
  const lab = [...document.querySelectorAll("label")].find((l) => label.test(l.textContent || ""));
  const el = lab?.htmlFor
    ? document.getElementById(lab.htmlFor)
    : lab?.querySelector("input, select");
  if (!el) throw new Error(`No se encontró el campo ${label}`);
  return el as HTMLInputElement | HTMLSelectElement;
};

const botonRegistrar = () =>
  [...document.querySelectorAll("button")].find((b) =>
    /Registrar el reproceso/i.test(b.textContent || ""),
  ) as HTMLButtonElement;

/** Los `<optgroup>` del desplegable «Producto que sale», como los ve el usuario. */
function grupos() {
  return [...document.querySelectorAll("optgroup")].map((g) => ({
    label: g.label,
    opciones: [...g.querySelectorAll("option")].map((o) => o.value),
  }));
}

test("de una TABLA, el desplegable separa lo habitual de lo que hay que explicar", async () => {
  await montar("MADERA ASERRADA (TABLA)");
  const gs = grupos();
  expect(gs.length).toBe(2);
  expect(gs[0].label).toMatch(/Tabla/i);
  expect(gs[1].label).toMatch(/no es lo habitual/i);
  /* De un producto terminado no sale ninguno de los otros tipos: comercial,
     paquetería, corta y larga angosta caen todos en el segundo grupo. */
  expect(gs[1].opciones).toContain("MADERA ASERRADA (COMERCIAL)");
  expect(gs[1].opciones).toContain("MADERA ASERRADA (PAQUETERIA LARGA)");
  /* Y los productos que el catálogo no mapea a un tipo («MADERA ASERRADA» a
     secas, «BLOQUES») no se marcan como raros: no hay de qué afirmarlo. */
  expect(gs[0].opciones).toContain("MADERA ASERRADA");
});

test("de PAQUETERÍA no hay nada raro que separar: sale cualquier tipo", async () => {
  await montar("MADERA ASERRADA (PAQUETERIA LARGA)");
  /* El modal montó de verdad —si no, el 0 de abajo no probaría nada. */
  expect(document.querySelectorAll("select").length).toBeGreaterThan(0);
  expect(grupos().length).toBe(0);
});

test("elegir una conversión no habitual avisa y exige explicarla", async () => {
  await montar("MADERA ASERRADA (TABLA)");
  await userEvent.selectOptions(campo(/Producto que sale/i), "MADERA ASERRADA (COMERCIAL)");
  await new Promise((res) => setTimeout(res, 60));
  expect(document.body.innerText).toMatch(/producto terminado/i);

  /* Con el aviso a la vista, un motivo de tres letras no alcanza: lo que
     sostiene el asiento ante un fiscalizador es la explicación. */
  await userEvent.fill(campo(/Vuelve a la sierra/i), "1");
  await userEvent.fill(campo(/Sale del reproceso/i), "0.8");
  await userEvent.fill(campo(/Por qué se reprocesa/i), "ok");
  await new Promise((res) => setTimeout(res, 60));
  expect(botonRegistrar().disabled).toBe(true);

  await userEvent.fill(campo(/Por qué se reprocesa/i), "Se hinchó con la lluvia y hubo que reaserrarla");
  await new Promise((res) => setTimeout(res, 60));
  expect(botonRegistrar().disabled).toBe(false);
});
