/**
 * Ponerle el lote a varias producciones sin lote, en un navegador de verdad.
 *
 * El tenant real no sirve para probar esto: sus tres lotes de Tornillo abiertos
 * tienen CERO trozas libres, así que la pantalla —con razón— dice que no hay
 * madera y no hay reparto que mirar. Eso prueba el caso vacío, no el flujo.
 * Acá se monta el modal con un patio que SÍ tiene trozas para recorrer lo que
 * pidió Brandon: marcar varias, ver cuánto le toca a cada una, cuánto se usa y
 * cuánto queda de saldo, y que se escriba de a una y en orden.
 *
 * Lo que el módulo puro ya prueba (el reparto, las cinco reglas) no se repite:
 * acá se prueba lo que sólo se ve en pantalla y en la red.
 */
import "@/app/globals.css";
import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import type { LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import type { CorridaEnTanda } from "@/lib/forestal/vincular-en-tanda";

/** Un lote con cuatro trozas libres de 3 m³ cada una. */
const LOTE = {
  id: "L1",
  code: "13-2026",
  speciesCommon: "Tornillo",
  status: "abierto",
  volumenM3: 12,
  trozas: [
    { id: "t1", codificacion: "T-001", codigoPlanta: "P-001", volumenM3: 3, largoM: 4, consumidaEnId: null },
    { id: "t2", codificacion: "T-002", codigoPlanta: "P-002", volumenM3: 3, largoM: 4, consumidaEnId: null },
    { id: "t3", codificacion: "T-003", codigoPlanta: "P-003", volumenM3: 3, largoM: 4, consumidaEnId: null },
    { id: "t4", codificacion: "T-004", codigoPlanta: "P-004", volumenM3: 3, largoM: 4, consumidaEnId: null },
  ],
} as unknown as LoteAserrio;

const CORRIDAS: CorridaEnTanda[] = [
  { id: "c1", lineNo: 21, especie: "Tornillo", producidoM3: 1.2, largoMaxPiezaM: null, fecha: "2026-09-01", tieneMateriaPrima: false },
  { id: "c2", lineNo: 22, especie: "Tornillo", producidoM3: 1.5, largoMaxPiezaM: null, fecha: "2026-09-02", tieneMateriaPrima: false },
  /* La intrusa: otra madera. Tiene que quedar afuera sin arrastrar a las otras. */
  { id: "c3", lineNo: 23, especie: "Cachimbo", producidoM3: 0.8, largoMaxPiezaM: null, fecha: "2026-09-03", tieneMateriaPrima: false },
];

/* El modal busca los paquetes de cada corrida para la regla del largo. */
vi.mock("@/lib/forestal/ctp-fetch", () => ({
  ctpGet: async () => ({ entry: { paquetes: [] } }),
  invalidarCtp: () => {},
}));

const { default: CtpVincularEnTandaModal } = await import(
  "@/components/admin/forestal/CtpVincularEnTandaModal"
);

const boton = (re: RegExp) =>
  [...document.querySelectorAll("button")].find((b) => re.test(b.innerText || ""))!;

/** Espera a que el modal esté pintado: React 19 monta en un tick aparte. */
async function pintado() {
  await vi.waitFor(() => expect(document.querySelector("select")).toBeTruthy());
}

async function elegirLote() {
  await pintado();
  const sel = document.querySelector<HTMLSelectElement>("select")!;
  sel.value = "L1";
  sel.dispatchEvent(new Event("change", { bubbles: true }));
  /* `innerText` trae el texto como se ve, y el rótulo va en mayúsculas. */
  await vi.waitFor(() => expect(document.body.innerText).toContain("SALDO"));
}

test("el reparto se ve antes de firmar: qué le toca a cada una y qué saldo queda", async () => {
  render(<CtpVincularEnTandaModal corridas={CORRIDAS} lotes={[LOTE]} onCerrar={() => {}} onListo={() => {}} />);

  await pintado();
  /* Sin lote elegido no se promete nada y el botón no se puede usar. */
  expect(document.body.innerText).toContain("Elegí el lote para ver qué le toca a cada una.");
  expect(boton(/Ponerle el lote a 0/).disabled).toBe(true);

  /* Con especies mezcladas lo dice antes, no después de llenar la tabla de rojo. */
  expect(document.body.innerText).toContain("2 especies distintas");

  await elegirLote();

  /* Una troza por corrida (3 m³ cubren de sobra lo declarado) y la de Cachimbo
     queda afuera por especie: 2 de 3, 9 m³ usados, 3 m³ de saldo. */
  expect(boton(/Ponerle el lote a 2/)).toBeTruthy();
  const txt = document.body.innerText;
  expect(txt).toContain("de una madera no sale la otra");
  expect(txt).toContain("2 corridas van a quedar con su origen");
  expect(txt).toContain("9.000 m³ de troza atribuidos");
  expect(txt).toContain("3.000 m³ de saldo en el lote");
});

test("destildar una fila devuelve su madera al saldo", async () => {
  render(<CtpVincularEnTandaModal corridas={CORRIDAS} lotes={[LOTE]} onCerrar={() => {}} onListo={() => {}} />);
  await elegirLote();
  await vi.waitFor(() => expect(boton(/Ponerle el lote a 2/)).toBeTruthy());

  const sacar = document.querySelector<HTMLInputElement>('[aria-label="Sacar la corrida N° 21 de la tanda"]')!;
  sacar.click();

  await vi.waitFor(() => expect(boton(/Ponerle el lote a 1/)).toBeTruthy());
  /* Queda una sola corrida vinculable: se usan 6 m³ (la suya y la de Cachimbo,
     que igual consume su troza del reparto) y el saldo sube a 6. */
  expect(document.body.innerText).toContain("6.000 m³ de saldo en el lote");
  /* Y la fila desaparece: no vuelve sola en el próximo render. */
  expect(document.body.innerText).not.toContain("N° 21");
});

test("se escribe de a una, en orden, con trozas que no se repiten", async () => {
  const pedidos: { corridaId: string; trozaIds: string[]; loteId: string }[] = [];
  const listo = vi.fn();
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    pedidos.push(JSON.parse(String(init.body)));
    return { ok: true, json: async () => ({ message: "ok" }) } as Response;
  });

  render(<CtpVincularEnTandaModal corridas={CORRIDAS} lotes={[LOTE]} onCerrar={() => {}} onListo={listo} />);
  await elegirLote();
  await vi.waitFor(() => expect(boton(/Ponerle el lote a 2/)).toBeTruthy());
  boton(/Ponerle el lote a 2/).click();

  await vi.waitFor(() => expect(listo).toHaveBeenCalled());

  /* Dos escrituras, las dos al mismo lote, en el orden del reparto. */
  expect(pedidos.map((p) => p.corridaId)).toEqual(["c1", "c2"]);
  expect(pedidos.every((p) => p.loteId === "L1")).toBe(true);
  /* Y ninguna troza en dos pedidos: eso sería declarar la misma madera dos veces. */
  const todas = pedidos.flatMap((p) => p.trozaIds);
  expect(todas).toHaveLength(new Set(todas).size);
  /* El mensaje dice el saldo, que es lo que Brandon pidió ver. */
  expect(listo.mock.calls[0][0]).toContain("3.000 m³ de saldo");
  vi.unstubAllGlobals();
});

test("si una falla, se para ahí y dice cuántas alcanzaron a entrar", async () => {
  let n = 0;
  vi.stubGlobal("fetch", async () => {
    n += 1;
    return n === 1
      ? ({ ok: true, json: async () => ({}) } as Response)
      : ({ ok: false, status: 409, json: async () => ({ message: "el lote se cerró mientras tanto" }) } as Response);
  });
  const listo = vi.fn();
  render(<CtpVincularEnTandaModal corridas={CORRIDAS} lotes={[LOTE]} onCerrar={() => {}} onListo={listo} />);
  await elegirLote();
  await vi.waitFor(() => expect(boton(/Ponerle el lote a 2/)).toBeTruthy());
  boton(/Ponerle el lote a 2/).click();

  await vi.waitFor(() => expect(document.body.innerText).toContain("Se vincularon 1 de 2"));
  expect(document.body.innerText).toContain("el lote se cerró mientras tanto");
  /* Lo que entró, entró: no se anuncia un éxito que no pasó. */
  expect(listo).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
