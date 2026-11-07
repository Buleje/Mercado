/**
 * Tests — «Talar varios árboles de una vez» (Brandon 28-09).
 *
 *   - lo puro: la fila exige lo mismo que la tala de a una (longitud siempre;
 *     Ø y volumen salvo «Despacho trozas»), lo medido contra el censo y el
 *     ≈ pt al 56 %, lo que viaja al libro (fecha propia o común, motosierrista,
 *     GPS del censo con su origen) y la respuesta del libro traducida;
 *   - la planilla montada con la red simulada: Enter recorre las medidas de
 *     fila en fila y termina en «Talar»; una fila bajo el DMC falla sin motivo
 *     y las otras entran; con el motivo escrito entra la que faltaba; después
 *     ofrece «Trozar estos árboles»;
 *   - «Ver censo» desde la tala: las casillas, la confirmación conjunta del
 *     semillero y lo que llega a la planilla.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import LothEntryForm from "@/components/admin/forestal/LothEntryForm";
import LothTalaTandaModal from "@/components/admin/forestal/LothTalaTandaModal";
import { aArbolCensoTala, olvidarCensoDeTala } from "@/components/admin/forestal/hooks/use-censo-de-tala";
import type { TandaTalaInicial } from "@/components/admin/forestal/hooks/use-tala-en-tanda";
import { prepararArboles } from "@/lib/forestal/loth-censo-uso";
import { medidasVacias } from "@/lib/forestal/loth-forma-medicion";
import {
  calcularFila,
  filaDeArbol,
  payloadDeFila,
  resultadoDeRespuesta,
  totalesTanda,
  type ComunesTala,
} from "@/lib/forestal/loth-tala-tanda";

const ARBOLES_GET = [
  { id: "t2", treeCode: "111", speciesCommon: "Copaiba", speciesScientific: "Copaifera reticulata Ducke", speciesNative: null, cites: false, dapM: "0.950", alturaComercialM: "21.00", volumenEstimadoM3: "9.6750", utmZona: null, utmX: "521961.00", utmY: "8918254.00", condicion: "Aprovechable", notes: null, estado: "en_pie" },
  { id: "t3", treeCode: "106", speciesCommon: "Copaiba", speciesScientific: null, speciesNative: null, cites: false, dapM: "0.900", alturaComercialM: "20.00", volumenEstimadoM3: "8.1000", utmZona: null, utmX: "521970.00", utmY: "8918200.00", condicion: "Semillero", notes: null, estado: "en_pie" },
  { id: "t4", treeCode: "9-TOR", speciesCommon: "Tornillo", speciesScientific: null, speciesNative: null, cites: false, dapM: "0.700", alturaComercialM: "14.00", volumenEstimadoM3: "4.0000", utmZona: null, utmX: null, utmY: null, condicion: null, notes: null, estado: "en_pie" },
  { id: "t5", treeCode: "7-TOR", speciesCommon: "Tornillo", speciesScientific: null, speciesNative: null, cites: false, dapM: "0.400", alturaComercialM: "10.00", volumenEstimadoM3: "0.9000", utmZona: null, utmX: null, utmY: null, condicion: null, notes: null, estado: "en_pie" },
];
const ARBOLES = prepararArboles(ARBOLES_GET.map(aArbolCensoTala), [], { dmcOverrides: {}, semillerosPct: 10 });
const arbol = (code: string) => ARBOLES.find((a) => a.treeCode === code)!;

const COMUNES: ComunesTala = { fecha: "2026-09-28", motosierrista: "Juan Pérez", motosierristaId: "c1", hora: "08:00", modo: null };

// ─── Lo puro ─────────────────────────────────────────────────────────────────

describe("lo puro", () => {
  it("la fila pide lo mismo que la tala de a una; con «Despacho trozas» basta la longitud", () => {
    const f = { ...filaDeArbol(arbol("9-TOR")), medidas: { ...medidasVacias(), d1: "0.70", d2: "0.60", totalM: "12" } };
    const c = calcularFila(f, "promedio", null);
    // Smalian: 0.7854 × 0.65² × 12 = 3.9820 → contra 4.000 del censo: −0,4 %
    expect(c).toMatchObject({ diamMayorM: 0.7, diamMenorM: 0.6, longitudM: 12, volumenM3: 3.982, lista: true, faltan: [] });
    expect(c.difPct).toBe(-0.4);
    expect(c.ptAserrable).toBe(945);

    const soloLargo = { ...f, medidas: { ...medidasVacias(), totalM: "12" } };
    expect(calcularFila(soloLargo, "promedio", null)).toMatchObject({ lista: false, faltan: ["D1 y D2"] });
    expect(calcularFila(soloLargo, "promedio", "despacho_trozas")).toMatchObject({ lista: true, volumenM3: null });
    expect(calcularFila(filaDeArbol(arbol("9-TOR")), "cruzadas", null)).toMatchObject({ tipeada: false, lista: false });
  });

  it("viaja lo mismo que la tala de a una: fecha propia o común, el motosierrista y el GPS del censo", () => {
    const f = { ...filaDeArbol(arbol("111")), fecha: "2026-09-27", medidas: { ...medidasVacias(), d1: "0.9", d2: "0.8", totalM: "18" } };
    const p = payloadDeFila(f, calcularFila(f, "promedio", null), COMUNES, "promedio", { planId: "p1", caratulaId: "car1" });
    expect(p).toMatchObject({
      section: "tala",
      caratulaId: "car1",
      planId: "p1",
      entryDate: "2026-09-27T00:00:00.000Z",
      treeCode: "111",
      speciesCommon: "Copaiba",
      speciesScientific: "Copaifera reticulata Ducke",
      diamMayorM: 0.9,
      diamMenorM: 0.8,
      lengthM: 18,
      motosierrista: "Juan Pérez",
      motosierristaId: "c1",
      horaTala: "08:00",
      gpsOrigen: "censo",
      medicionCruda: { forma: "promedio", mayor: [], menor: [], totalM: 18 },
    });
    expect(p.justificacionDmc).toBeUndefined();
    // Motosierrista propio: el id del común no se cuela.
    const otro = payloadDeFila({ ...f, motosierrista: "Tercero", motosierristaId: null }, calcularFila(f, "promedio", null), COMUNES, "promedio", { planId: null, caratulaId: null });
    expect(otro).toMatchObject({ motosierrista: "Tercero", motosierristaId: null });
  });

  it("la respuesta del libro, en lo que la fila tiene que decir", () => {
    expect(resultadoDeRespuesta(201, { entry: { lineNo: 7 } })).toEqual({ estado: "guardada", lineNo: 7 });
    expect(resultadoDeRespuesta(422, { error: "T8_BAJO_DMC", message: "Tiene 40,0 cm de DAP" })).toEqual({ estado: "fallida", codigo: "T8_BAJO_DMC", mensaje: "Tiene 40,0 cm de DAP" });
    expect(resultadoDeRespuesta(429, {})).toMatchObject({ estado: "fallida", codigo: "RATE_LIMIT" });
    expect(resultadoDeRespuesta(500, {})).toMatchObject({ mensaje: "No se pudo guardar (error 500)." });
  });

  it("los totales cuentan lo que entra, lo que ya entró y lo que no se asienta", () => {
    const lista = { ...filaDeArbol(arbol("111")), medidas: { ...medidasVacias(), d1: "0.9", d2: "0.8", totalM: "18" } };
    const aMedias = { ...filaDeArbol(arbol("9-TOR")), medidas: { ...medidasVacias(), d1: "0.7" } };
    const sinMedir = filaDeArbol(arbol("7-TOR"));
    const filas = [lista, aMedias, sinMedir];
    const t = totalesTanda(filas, filas.map((f) => calcularFila(f, "promedio", null)));
    expect(t).toMatchObject({ listas: 1, aMedias: ["9-TOR"], sinMedir: ["7-TOR"], guardadas: 0 });
    expect(t.listasM3).toBe(10.2141);
  });
});

// ─── La planilla montada ─────────────────────────────────────────────────────

let posts: Record<string, unknown>[] = [];
let lineNo = 10;

function responder(url: string, init?: RequestInit) {
  const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
  if (init?.method === "POST" && url === "/api/admin/forestal/loth") {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    posts.push(body);
    if (body.treeCode === "7-TOR" && !body.justificacionDmc) {
      return json({ error: "T8_BAJO_DMC", message: "El árbol 7-TOR (Tornillo) tiene 40.0 cm de DAP y el DMC es 61 cm." }, 422);
    }
    lineNo += 1;
    return json({ entry: { id: `e${lineNo}`, lineNo } }, 201);
  }
  if (url.startsWith("/api/admin/forestal/plan?active=1")) return json({ active: { id: "p1" } });
  if (url.startsWith("/api/admin/forestal/plan?planId=")) return json({ species: [] });
  if (url === "/api/admin/forestal/plan") return json({ plans: [{ id: "p1", planType: "PO", planNumber: "12", titularName: "Maderera El Aguajal SAC" }] });
  if (url.startsWith("/api/admin/forestal/plan/census?planId=")) return json({ trees: ARBOLES_GET, total: ARBOLES_GET.length, truncado: false });
  if (url.startsWith("/api/admin/forestal/loth?usoCenso=1")) return json({ usos: [] });
  if (url.startsWith("/api/admin/forestal/loth/poa")) return json({ config: { dmcOverrides: {}, semillerosPct: 10 } });
  if (url.startsWith("/api/rrhh/colaboradores")) return json({ colaboradores: [{ id: "c1", nombre: "Juan Pérez", apodo: null, puesto: { id: "p", nombre: "Motosierrista" }, estado: "ACTIVO" }] });
  return { ok: false, status: 404, json: async () => ({}) };
}

beforeEach(() => {
  posts = [];
  lineNo = 10;
  window.localStorage.clear();
  olvidarCensoDeTala();
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => responder(String(url), init)));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const campo = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const tipear = (label: string, v: string) => fireEvent.change(campo(label), { target: { value: v } });

describe("la planilla «Talar varios árboles»", () => {
  it("Enter recorre las medidas; la fila bajo el DMC falla sola, con su motivo entra, y ofrece trozar", async () => {
    const onGuardadas = vi.fn(async () => {});
    const onTrozar = vi.fn();
    const inicial: TandaTalaInicial = { planId: "p1", planLabel: "Plan PO 12 — Maderera El Aguajal SAC", arboles: [arbol("111"), arbol("7-TOR"), arbol("9-TOR")], comunes: COMUNES };
    render(<LothTalaTandaModal inicial={inicial} caratulaId="car1" onClose={() => {}} onGuardadas={onGuardadas} onTrozar={onTrozar} />);
    const modal = await screen.findByRole("dialog", { name: "Talar varios árboles" });
    fireEvent.click(within(modal).getByRole("radio", { name: "D1 y D2 promediados" }));

    // El bajo DMC ya pide el motivo, antes de guardar.
    expect(campo("7-TOR · justificación de la tala bajo el DMC")).toBeTruthy();
    expect(within(modal).getByRole("note").textContent).toMatch(/7-TOR \(bajo el diámetro mínimo de corta\)/);

    const filas: [string, string, string, string][] = [
      ["111", "0.90", "0.80", "18"],
      ["7-TOR", "0.40", "0.35", "8"],
      ["9-TOR", "0.70", "0.60", "12"],
    ];
    for (const [code, d1, d2, largo] of filas) {
      tipear(`${code} · D1 · Ø mayor`, d1);
      tipear(`${code} · D2 · Ø menor`, d2);
      tipear(`${code} · Long. aprov.`, largo);
    }
    // Como la libreta: Enter de la última medida de un árbol va a la primera del siguiente…
    campo("111 · Long. aprov.").focus();
    expect(fireEvent.keyDown(campo("111 · Long. aprov."), { key: "Enter" })).toBe(false);
    expect(document.activeElement).toBe(campo("7-TOR · D1 · Ø mayor"));
    // …y la última de todas, a «Talar».
    fireEvent.keyDown(campo("9-TOR · Long. aprov."), { key: "Enter" });
    const talar = screen.getByRole("button", { name: "Talar 3 árboles" });
    expect(document.activeElement).toBe(talar);

    // La fecha de una fila se cambia sola.
    tipear("9-TOR · fecha de tala", "2026-09-27");
    fireEvent.click(talar);
    await waitFor(() => expect(posts).toHaveLength(3));
    expect(posts.map((p) => [p.treeCode, p.entryDate, p.motosierrista, p.horaTala])).toEqual([
      ["111", "2026-09-28T00:00:00.000Z", "Juan Pérez", "08:00"],
      ["7-TOR", "2026-09-28T00:00:00.000Z", "Juan Pérez", "08:00"],
      // La que falló en el medio no frena a las de después.
      ["9-TOR", "2026-09-27T00:00:00.000Z", "Juan Pérez", "08:00"],
    ]);
    const fila7 = document.querySelector('[data-fila-tala="7-TOR"]') as HTMLElement;
    await waitFor(() => expect(within(fila7).getByRole("alert").textContent).toMatch(/40.0 cm de DAP/));
    expect(within(document.querySelector('[data-fila-tala="111"]') as HTMLElement).getByText("Línea N° 11")).toBeTruthy();
    expect(within(document.querySelector('[data-fila-tala="9-TOR"]') as HTMLElement).getByText("Línea N° 12")).toBeTruthy();
    expect(campo("111 · D1 · Ø mayor").disabled).toBe(true);
    await waitFor(() => expect(onGuardadas).toHaveBeenCalledTimes(1));

    // Con el motivo escrito entra la que faltaba, sola.
    tipear("7-TOR · justificación de la tala bajo el DMC", "Árbol caído por viento");
    fireEvent.click(screen.getByRole("button", { name: "Guardar el que falta" }));
    await waitFor(() => expect(posts).toHaveLength(4));
    expect(posts[3]).toMatchObject({ treeCode: "7-TOR", justificacionDmc: "Árbol caído por viento" });
    await waitFor(() => expect(within(fila7).getByText("Línea N° 13")).toBeTruthy());

    // «Trozar» espera a que la vista relea el libro (el trozado lista esas talas).
    const trozar = screen.getByRole("button", { name: /Trozar estos árboles/ }) as HTMLButtonElement;
    await waitFor(() => expect(trozar.disabled).toBe(false));
    fireEvent.click(trozar);
    expect(onTrozar).toHaveBeenCalledWith(["111", "7-TOR", "9-TOR"]);
  });
});

// ─── «Ver censo» desde la tala ───────────────────────────────────────────────

describe("«Ver censo» · marcar varios", () => {
  it("las casillas llevan los marcados a la planilla; el semillero se confirma junto", async () => {
    const onTalarVarios = vi.fn();
    render(<LothEntryForm section="tala" onClose={() => {}} onSaved={() => {}} onTalarVarios={onTalarVarios} />);
    const ver = screen.getByRole("button", { name: /Ver censo/ });
    await waitFor(() => expect(ver.textContent).toMatch(/4/));
    fireEvent.click(ver);
    const modal = await screen.findByRole("dialog", { name: "Censo del plan" });
    const talar = within(modal).getByRole("button", { name: "Talar los elegidos" }) as HTMLButtonElement;
    expect(talar.disabled).toBe(true);

    fireEvent.click(within(modal).getByRole("checkbox", { name: "Marcar el árbol 9-TOR" }));
    fireEvent.click(within(modal).getByRole("checkbox", { name: "Marcar el árbol 106" }));
    fireEvent.click(within(modal).getByRole("button", { name: "Talar los 2 elegidos" }));
    // El semillero del regente no pasa sin confirmar.
    expect(within(modal).getByRole("alert").textContent).toMatch(/106 \(el regente lo declaró semillero\)/);
    expect(onTalarVarios).not.toHaveBeenCalled();
    fireEvent.click(within(modal).getByRole("button", { name: "Seguir con todos" }));

    expect(onTalarVarios).toHaveBeenCalledTimes(1);
    const t = onTalarVarios.mock.calls[0][0] as TandaTalaInicial;
    expect(t.arboles.map((a) => a.treeCode)).toEqual(["9-TOR", "106"]);
    expect(t).toMatchObject({ planId: "p1", planLabel: "Plan PO 12 — Maderera El Aguajal SAC" });
    expect(t.comunes.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("«marcar todos» toma sólo los disponibles de la lista", async () => {
    const onTalarVarios = vi.fn();
    render(<LothEntryForm section="tala" onClose={() => {}} onSaved={() => {}} onTalarVarios={onTalarVarios} />);
    const ver = screen.getByRole("button", { name: /Ver censo/ });
    await waitFor(() => expect(ver.textContent).toMatch(/4/));
    fireEvent.click(ver);
    const modal = await screen.findByRole("dialog", { name: "Censo del plan" });
    fireEvent.click(within(modal).getByRole("checkbox", { name: "Marcar los 4 disponibles de la lista" }));
    expect(within(modal).getByRole("button", { name: "Talar los 4 elegidos" })).toBeTruthy();
    fireEvent.click(within(modal).getByRole("button", { name: "Desmarcar" }));
    expect(within(modal).getByRole("button", { name: "Talar los elegidos" })).toBeTruthy();
  });

  it("sin la prop (o corrigiendo) «Ver censo» sigue eligiendo de a uno", async () => {
    render(<LothEntryForm section="tala" onClose={() => {}} onSaved={() => {}} />);
    const ver = screen.getByRole("button", { name: /Ver censo/ });
    await waitFor(() => expect(ver.textContent).toMatch(/4/));
    fireEvent.click(ver);
    const modal = await screen.findByRole("dialog", { name: "Censo del plan" });
    expect(within(modal).queryByRole("checkbox")).toBeNull();
    expect(within(modal).queryByRole("button", { name: /Talar los/ })).toBeNull();
  });
});
