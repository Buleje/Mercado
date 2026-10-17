/**
 * Tests — la tala en tanda de una PLANTACIÓN sin censo (ADR-459, Brandon 02-10)
 * y el lenguaje de plantación en la foto de la placa.
 *
 *   - lo puro: N códigos correlativos sin repetir (plan, negocio, planilla), el
 *     saldo registrado − talado − la planilla por especie (con la misma regla
 *     de especie que T7/T6), la fila del registro y su código editable, lo que
 *     viaja al libro, T3/T7 en la fila, la especie de la placa por sus letras;
 *   - por el camino del usuario: «Varios» en la lista de la tala abre la
 *     planilla con «Bolaina × 3»; la planilla arranca con 3 filas y los
 *     códigos 003/004/005-BOL, el saldo baja al medir y pasa a ámbar al
 *     pasarse; el 422 T7 cae en SU fila; abierta sin el plan (desde el mapa)
 *     lo pide; un PO con censo sigue igual;
 *   - «Foto de la placa» en una plantación sin árbol marcado: «003-BOL» elige
 *     Bolaina del registro y deja ese código.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import LothEntryForm from "@/components/admin/forestal/LothEntryForm";
import LothTalaTandaModal from "@/components/admin/forestal/LothTalaTandaModal";
import { aArbolCensoTala, olvidarCensoDeTala } from "@/components/admin/forestal/hooks/use-censo-de-tala";
import { olvidarRegistroPlantacion } from "@/components/admin/forestal/hooks/use-registro-plantacion";
import type { TandaTalaInicial } from "@/components/admin/forestal/hooks/use-tala-en-tanda";
import { prepararArboles } from "@/lib/forestal/loth-censo-uso";
import { medidasVacias } from "@/lib/forestal/loth-forma-medicion";
import { codigoDePlaca, cruzarPlacaConRegistro } from "@/lib/forestal/loth-placa";
import { codigosPropuestos, especiesDelRegistro, saldoDeLaPlanilla, MAX_ARBOLES_POR_ESPECIE } from "@/lib/forestal/loth-tala-plantacion";
import {
  calcularFila,
  cambiarCodigo,
  codigosRepetidos,
  filaDelRegistro,
  payloadDeFila,
  queCorregir,
  type ComunesTala,
} from "@/lib/forestal/loth-tala-tanda";

const PLAN = { id: "pp", planType: "PLANTACION", planNumber: "QA-459-TANDA", titularName: "Plantaciones QA SAC", tituloHabilitante: null };
const ESPECIES = [
  { id: "s1", speciesCommon: "Bolaina", speciesScientific: "Guazuma crinita", cites: false, volumenAutorizadoM3: "120.5", anioInstalacion: 2019, superficieHa: "3.5" },
  { id: "s2", speciesCommon: "Capirona", speciesScientific: "Calycophyllum spruceanum", cites: false, volumenAutorizadoM3: "80", anioInstalacion: null, superficieHa: null },
];
const FILAS_BALANCE = (taladoBolaina: number) => [
  { species: "Bolaina", cites: false, autorizado: 120.5, talado: taladoBolaina, trozado: 0, movilizado: 0, consumido: 0 },
  { species: "Capirona", cites: false, autorizado: 80, talado: 0, trozado: 0, movilizado: 0, consumido: 0 },
];
const REGISTRO = especiesDelRegistro(FILAS_BALANCE(2.25), ESPECIES);
const bolaina = REGISTRO.find((e) => e.especie === "Bolaina")!;
const COMUNES: ComunesTala = { fecha: "2026-10-02", motosierrista: "Juan Pérez", motosierristaId: "c1", hora: "08:00", modo: null };

// ─── Lo puro ─────────────────────────────────────────────────────────────────

describe("lo puro", () => {
  it("N códigos correlativos que no repiten los del plan, los del negocio ni entre sí", () => {
    // El plan taló el 001-BOL; otro plan del negocio usó el 002-BOL (T3 mira el negocio entero).
    expect(codigosPropuestos("Bolaina", 3, ["001-BOL"], ["002-BOL"])).toEqual(["003-BOL", "004-BOL", "005-BOL"]);
    // Con la planilla ya llevando 003-005, los siguientes siguen desde ahí.
    expect(codigosPropuestos("Capirona", 2, ["001-BOL", "003-BOL", "004-BOL", "005-BOL"], ["002-BOL"])).toEqual(["006-CAP", "007-CAP"]);
    expect(codigosPropuestos("Bolaina", 0, [])).toEqual([]);
    expect(codigosPropuestos("Bolaina", 999, [])).toHaveLength(MAX_ARBOLES_POR_ESPECIE);
  });

  it("el saldo de la planilla: registrado − talado − lo medido, con la regla de especie de T7/T6", () => {
    const { porEspecie, fuera } = saldoDeLaPlanilla(REGISTRO, [
      { especie: "Bolaina", cientifico: "Guazuma crinita", volumenM3: 1.0 },
      // Escrita distinto pero con el mismo científico: es la Bolaina registrada.
      { especie: "Bolaina blanca", cientifico: "Guazuma crinita", volumenM3: 1.1 },
      { especie: "Bolaina", cientifico: null, volumenM3: null },
      { especie: "Cedro", cientifico: "Cedrela odorata", volumenM3: 2 },
    ]);
    expect(porEspecie).toHaveLength(1);
    expect(porEspecie[0]).toMatchObject({ especie: "Bolaina", registradoM3: 120.5, taladoM3: 2.25, estaTalaM3: 2.1, quedaM3: 116.15, excesoM3: 0, arboles: 3, sinVolumen: 1 });
    expect(fuera).toEqual(["Cedro"]);
    const pasado = saldoDeLaPlanilla(REGISTRO, [{ especie: "Bolaina", cientifico: null, volumenM3: 119 }]);
    expect(pasado.porEspecie[0]).toMatchObject({ quedaM3: -0.75, excesoM3: 0.75 });
  });

  it("la fila del registro lleva la especie, el científico y el CITES; su código se cambia, el del censo no", () => {
    const f = { ...filaDelRegistro({ especie: "Bolaina", cientifico: "Guazuma crinita", cites: false }, "003-BOL", "r1"), medidas: { ...medidasVacias(), d1: "0.5", d2: "0.4", totalM: "10" } };
    expect(f).toMatchObject({ origen: "registro", gps: null, arbol: { treeCode: "003-BOL", speciesCommon: "Bolaina", reparo: null, volM3: null } });
    const c = calcularFila(f, "promedio", null);
    expect(c).toMatchObject({ volumenM3: 1.5904, lista: true, difPct: null });
    const p = payloadDeFila(cambiarCodigo(f, " 009-bol "), c, COMUNES, "promedio", { planId: "pp", caratulaId: null });
    expect(p).toMatchObject({ section: "tala", planId: "pp", treeCode: "009-BOL", speciesCommon: "Bolaina", speciesScientific: "Guazuma crinita", cites: false, gpsOrigen: null });
    // Un árbol del censo no cambia de código; una guardada tampoco.
    const delCenso = { ...f, origen: "censo" as const };
    expect(cambiarCodigo(delCenso, "X")).toBe(delCenso);
    const guardada = { ...f, resultado: { estado: "guardada" as const, lineNo: 9 } };
    expect(cambiarCodigo(guardada, "X")).toBe(guardada);
  });

  it("sin código, o repetido en la planilla, la fila no se asienta", () => {
    const base = { ...filaDelRegistro({ especie: "Bolaina", cientifico: null, cites: false }, "003-BOL", "r1"), medidas: { ...medidasVacias(), d1: "0.5", d2: "0.4", totalM: "10" } };
    expect(calcularFila(cambiarCodigo(base, ""), "promedio", null)).toMatchObject({ lista: false, faltan: ["el código del árbol"] });
    const otra = { ...base, id: "r2" };
    const rep = codigosRepetidos([base, otra]);
    expect(calcularFila(otra, "promedio", null, rep).faltan).toEqual(["un código que no se repita en la planilla"]);
  });

  it("T3 pide cambiar el código; T7, la especie", () => {
    expect(queCorregir({ estado: "fallida", codigo: "T3_TALA_DUPLICADA", mensaje: "" })).toBe("codigo");
    expect(queCorregir({ estado: "fallida", codigo: "T7_ESPECIE_NO_AUTORIZADA", mensaje: "" })).toBe("especie");
  });

  it("la placa propone la especie del registro por sus letras y deja el código", () => {
    expect(codigoDePlaca("N° 3 bol")).toBe("3-BOL");
    expect(cruzarPlacaConRegistro({ codigo: "003-BOL", confianza: 0.95 }, REGISTRO)).toMatchObject({ tipo: "especie", especie: { especie: "Bolaina" }, codigo: "003-BOL" });
    expect(cruzarPlacaConRegistro({ codigo: "003-BOL", confianza: 0.5 }, REGISTRO)).toMatchObject({ tipo: "confirmar", motivo: "confianza" });
    expect(cruzarPlacaConRegistro({ codigo: "3", confianza: 1 }, REGISTRO)).toMatchObject({ tipo: "confirmar", motivo: "sin_letras", codigo: "3" });
    expect(cruzarPlacaConRegistro({ codigo: "3-XYZ", confianza: 1 }, REGISTRO)).toMatchObject({ tipo: "confirmar", motivo: "letras" });
    const conCaoba = [...REGISTRO, { ...bolaina, especie: "Caoba", clave: "caoba", cientifico: "Swietenia macrophylla" }];
    expect(cruzarPlacaConRegistro({ codigo: "3-CA", confianza: 1 }, conCaoba)).toMatchObject({ tipo: "confirmar", motivo: "varias" });
    expect(cruzarPlacaConRegistro({ codigo: "BOL", confianza: 1 }, REGISTRO)).toEqual({ tipo: "ilegible" });
  });
});

// ─── Por el camino del usuario ───────────────────────────────────────────────

let posts: Record<string, unknown>[] = [];
let lineNo = 20;
let planesGet = 0;
let censo: unknown[] = [];

function responder(url: string, init?: RequestInit) {
  const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
  if (init?.method === "POST" && url === "/api/admin/forestal/loth") {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    posts.push(body);
    // El registro del servidor ya no tiene Capirona (la quitaron mientras se medía).
    if (body.speciesCommon === "Capirona") {
      return json({ error: "T7_ESPECIE_NO_AUTORIZADA", message: "La especie Capirona no está en el registro de la plantación: agrégala en Plan de manejo → Registro." }, 422);
    }
    lineNo += 1;
    return json({ entry: { id: `e${lineNo}`, lineNo } }, 201);
  }
  if (init?.method === "POST" && url === "/api/upload") return json({ error: "sin red" }, 500);
  if (url.startsWith("/api/admin/forestal/plan?active=1")) return json({ active: { id: PLAN.id } });
  if (url.startsWith("/api/admin/forestal/plan?balance=")) return json({ balance: { rows: FILAS_BALANCE(2.25) } });
  if (url.startsWith("/api/admin/forestal/plan?planId=")) {
    planesGet += 1;
    return json({ plan: PLAN, species: ESPECIES });
  }
  if (url === "/api/admin/forestal/plan") return json({ plans: [PLAN] });
  if (url.startsWith("/api/admin/forestal/plan/census?planId=")) return json({ trees: censo, total: censo.length, truncado: false });
  if (url.startsWith("/api/admin/forestal/loth?available=trozado")) return json({ items: [{ kind: "tala", code: "001-BOL" }] });
  if (url.startsWith("/api/admin/forestal/loth?usoCenso=1")) {
    return json({ usos: [{ treeCode: "002-BOL", tala: { lineNo: 9, fecha: "2026-09-01", volumeM3: 1 }, trozas: 0, trozasM3: 0, despachadas: 0, consumidas: 0 }] });
  }
  if (url.startsWith("/api/admin/forestal/loth/poa")) return json({ config: { dmcOverrides: {}, semillerosPct: 0 } });
  if (url.startsWith("/api/rrhh/colaboradores")) return json({ colaboradores: [] });
  return json({}, 404);
}

beforeEach(() => {
  // jsdom no trae scrollIntoView (la planilla lleva a la vista la fila que falló).
  Element.prototype.scrollIntoView = vi.fn();
  posts = [];
  lineNo = 20;
  planesGet = 0;
  censo = [];
  window.localStorage.clear();
  olvidarCensoDeTala();
  olvidarRegistroPlantacion();
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => responder(String(url), init)));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const campo = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const tipear = (label: string, v: string) => fireEvent.change(campo(label), { target: { value: v } });
const filaDe = (code: string) => document.querySelector(`[data-fila-tala="${code}"]`) as HTMLElement;
const pie = () => document.querySelector("[data-pie-registro]") as HTMLElement | null;

const inicialPlantacion = (extra: Partial<TandaTalaInicial> = {}): TandaTalaInicial => ({
  planId: PLAN.id,
  planLabel: "Plan PLANTACION QA-459-TANDA — Plantaciones QA SAC",
  arboles: [],
  comunes: COMUNES,
  plan: PLAN,
  especiesDelPlan: ESPECIES,
  porEspecie: [{ especie: "Bolaina", n: 3 }],
  ...extra,
});

describe("Talar varios de una plantación", () => {
  it("«Varios» en la lista de la tala abre la planilla con «Bolaina × 3»", async () => {
    const onTalarVarios = vi.fn();
    render(<LothEntryForm section="tala" onClose={() => {}} onSaved={() => {}} onTalarVarios={onTalarVarios} />);
    const region = await screen.findByRole("region", { name: "Elige la especie del registro" });
    fireEvent.click(await within(region).findByRole("button", { name: "Talar varios árboles de Bolaina" }));
    fireEvent.click(within(region).getByRole("button", { name: "Uno más" }));
    fireEvent.click(within(region).getByRole("button", { name: "Talar 3 árboles" }));
    expect(onTalarVarios).toHaveBeenCalledTimes(1);
    const t = onTalarVarios.mock.calls[0][0] as TandaTalaInicial;
    expect(t).toMatchObject({ planId: "pp", arboles: [], porEspecie: [{ especie: "Bolaina", n: 3 }], plan: { planType: "PLANTACION" } });
    expect(t.especiesDelPlan?.map((e) => e.speciesCommon)).toEqual(["Bolaina", "Capirona"]);
  });

  it("sin la planilla a mano (o corrigiendo una línea) no se ofrece «Varios»", async () => {
    render(<LothEntryForm section="tala" onClose={() => {}} onSaved={() => {}} />);
    const region = await screen.findByRole("region", { name: "Elige la especie del registro" });
    await within(region).findByText("Bolaina");
    expect(within(region).queryByRole("button", { name: /Talar varios árboles/ })).toBeNull();
  });

  it("la planilla arranca con 3 Bolainas, el saldo baja al medir, avisa al pasarse y T7 cae en su fila", async () => {
    const onGuardadas = vi.fn(async () => {});
    render(<LothTalaTandaModal inicial={inicialPlantacion()} caratulaId="car1" onClose={() => {}} onGuardadas={onGuardadas} onTrozar={() => {}} />);
    const modal = await screen.findByRole("dialog", { name: "Talar varios árboles" });
    // Los códigos siguen al 001-BOL del plan y saltan el 002-BOL de otro plan.
    await waitFor(() => expect(filaDe("003-BOL")).toBeTruthy());
    expect(filaDe("004-BOL")).toBeTruthy();
    expect(filaDe("005-BOL")).toBeTruthy();
    expect(within(filaDe("003-BOL")).getByText("Guazuma crinita")).toBeTruthy();
    // Sin árboles marcados no hay censo que agregar ni contra qué comparar.
    expect(within(modal).queryByRole("button", { name: /Agregar del censo|Agregar árboles marcados/ })).toBeNull();
    expect(within(modal).getByText("Volumen · pt")).toBeTruthy();
    expect(pie()?.textContent).toMatch(/Bolaina quedan 118\.250/);

    fireEvent.click(within(modal).getByRole("radio", { name: "D1 y D2 promediados" }));
    tipear("003-BOL · D1 · Ø mayor", "0.5");
    tipear("003-BOL · D2 · Ø menor", "0.4");
    tipear("003-BOL · Long. aprov.", "10");
    // 120,500 − 2,250 − 1,590 = 116,660
    await waitFor(() => expect(pie()?.textContent).toMatch(/Bolaina quedan 116\.660/));
    const saldoBloque = document.querySelector('[data-saldo-especie="Bolaina"]') as HTMLElement;
    expect(saldoBloque.textContent).toMatch(/3 árboles · 2 sin medir/);

    // El código propuesto se cambia en la fila.
    tipear("Fila 2 · código del árbol (Bolaina)", "010-bol");
    expect(filaDe("010-BOL")).toBeTruthy();

    // Un árbol enorme pasa lo registrado: ámbar, no frena.
    tipear("010-BOL · D1 · Ø mayor", "4");
    tipear("010-BOL · D2 · Ø menor", "4");
    tipear("010-BOL · Long. aprov.", "10");
    await screen.findByText(/Bolaina pasa lo registrado por .* m³: la tala entra/);

    // Capirona desde la misma planilla.
    const registroSec = within(modal).getByRole("region", { name: "Registro de la plantación" });
    fireEvent.change(within(registroSec).getByRole("combobox"), { target: { value: "capirona" } });
    fireEvent.click(within(registroSec).getByRole("button", { name: "Agregar 1 árbol" }));
    await waitFor(() => expect(filaDe("011-CAP")).toBeTruthy());
    tipear("011-CAP · D1 · Ø mayor", "0.5");
    tipear("011-CAP · D2 · Ø menor", "0.4");
    tipear("011-CAP · Long. aprov.", "10");

    // Se quita la fila sin medir para que entren 3.
    fireEvent.click(within(filaDe("005-BOL")).getByRole("button", { name: "Quitar el árbol 005-BOL de la planilla" }));
    fireEvent.click(screen.getByRole("button", { name: "Talar 3 árboles" }));
    await waitFor(() => expect(posts).toHaveLength(3));
    expect(posts.map((p) => [p.treeCode, p.speciesCommon, p.speciesScientific, p.planId])).toEqual([
      ["003-BOL", "Bolaina", "Guazuma crinita", "pp"],
      ["010-BOL", "Bolaina", "Guazuma crinita", "pp"],
      ["011-CAP", "Capirona", "Calycophyllum spruceanum", "pp"],
    ]);
    // T7 en SU fila; las otras entraron.
    await waitFor(() => expect(within(filaDe("011-CAP")).getByRole("alert").textContent).toMatch(/Capirona no está en el registro/));
    expect(within(filaDe("011-CAP")).getByRole("alert").textContent).toMatch(/O quita esta fila de la planilla/);
    expect(within(filaDe("003-BOL")).getByText("Línea N° 21")).toBeTruthy();
    expect(within(filaDe("010-BOL")).getByText("Línea N° 22")).toBeTruthy();
    await waitFor(() => expect(onGuardadas).toHaveBeenCalledTimes(1));
    // Las guardadas siguen descontando desde la planilla (el registro no se relee).
    expect(screen.getByText(/Bolaina pasa lo registrado por/)).toBeTruthy();
    expect(pie()?.textContent).toMatch(/Capirona quedan 78\.410/);
  });

  it("abierta sin el plan (desde el mapa) lo pide y reconoce la plantación", async () => {
    render(
      <LothTalaTandaModal
        inicial={inicialPlantacion({ plan: undefined, especiesDelPlan: undefined, porEspecie: [{ especie: "Capirona", n: 2 }] })}
        caratulaId={null}
        onClose={() => {}}
        onGuardadas={() => {}}
        onTrozar={() => {}}
      />,
    );
    // 002 está libre para Capirona: T3 compara el código entero (el 002-BOL es otro árbol).
    await waitFor(() => expect(filaDe("002-CAP")).toBeTruthy());
    expect(filaDe("003-CAP")).toBeTruthy();
    expect(planesGet).toBe(1);
    expect(within(filaDe("002-CAP")).getByText("Calycophyllum spruceanum")).toBeTruthy();
  });
});

describe("Un PO con censo sigue igual", () => {
  it("sin registro: «Agregar del censo», cabecera con censo y ningún bloque de plantación", async () => {
    const PO = { id: "p1", planType: "PO", planNumber: "12", titularName: "Maderera El Aguajal SAC", tituloHabilitante: null };
    censo = [
      { id: "t4", treeCode: "9-TOR", speciesCommon: "Tornillo", speciesScientific: null, speciesNative: null, cites: false, dapM: "0.700", alturaComercialM: "14.00", volumenEstimadoM3: "4.0000", utmZona: null, utmX: null, utmY: null, condicion: null, notes: null, estado: "en_pie" },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) =>
        String(url).startsWith("/api/admin/forestal/plan?planId=")
          ? { ok: true, status: 200, json: async () => ({ plan: PO, species: [{ speciesCommon: "Tornillo", volumenAutorizadoM3: "80" }] }) }
          : responder(String(url), init),
      ),
    );
    const arboles = prepararArboles(censo.map((c) => aArbolCensoTala(c as Parameters<typeof aArbolCensoTala>[0])), [], { dmcOverrides: {}, semillerosPct: 10 });
    render(
      <LothTalaTandaModal
        inicial={{ planId: "p1", planLabel: "Plan PO 12 — Maderera El Aguajal SAC", arboles, comunes: COMUNES }}
        caratulaId={null}
        onClose={() => {}}
        onGuardadas={() => {}}
        onTrozar={() => {}}
      />,
    );
    const modal = await screen.findByRole("dialog", { name: "Talar varios árboles" });
    const urls = () => (fetch as unknown as { mock: { calls: [string][] } }).mock.calls.map((c) => String(c[0]));
    // La planilla pidió el plan (vino sin él) y supo que no es una plantación.
    await waitFor(() => expect(urls().some((u) => u.startsWith("/api/admin/forestal/plan?planId=p1"))).toBe(true));
    await new Promise((r) => setTimeout(r, 20));
    expect(filaDe("9-TOR")).toBeTruthy();
    expect(within(modal).getByRole("button", { name: /Agregar del censo/ })).toBeTruthy();
    expect(within(modal).getByText("Volumen · censo · pt")).toBeTruthy();
    expect(within(modal).queryByRole("region", { name: "Registro de la plantación" })).toBeNull();
    // Ni una lectura del registro para un PO.
    expect(urls().some((u) => u.includes("balance="))).toBe(false);
  });
});

describe("Foto de la placa en una plantación", () => {
  it("sin árbol marcado, «003-BOL» elige Bolaina del registro y deja ese código", async () => {
    render(<LothEntryForm section="tala" onClose={() => {}} onSaved={() => {}} />);
    await within(await screen.findByRole("region", { name: "Elige la especie del registro" })).findByText("Bolaina");
    const placa = screen.getByRole("region", { name: "Foto de la placa" });
    expect(within(placa).getByText(/elige la especie y toma el GPS/)).toBeTruthy();
    // jsdom no abre la imagen: queda el código para escribir (el camino sin lector).
    fireEvent.change(within(placa).getByLabelText("Foto de la placa del tocón"), { target: { files: [new File(["x"], "placa.jpg", { type: "image/jpeg" })] } });
    const codigo = await within(placa).findByLabelText("Código de la placa");
    fireEvent.change(codigo, { target: { value: "003-bol" } });
    fireEvent.click(within(placa).getByRole("button", { name: "Buscar" }));
    await waitFor(() => expect((screen.getByPlaceholderText("001-BOL") as HTMLInputElement).value).toBe("003-BOL"));
    expect(within(placa).getByText(/Bolaina del registro · código/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Especie/ }).textContent).toMatch(/Bolaina/);
    expect(within(placa).queryByText(/no está en el censo/)).toBeNull();
  });

  it("sin letras de especie pide elegirla; el código queda el de la placa", async () => {
    render(<LothEntryForm section="tala" onClose={() => {}} onSaved={() => {}} />);
    await within(await screen.findByRole("region", { name: "Elige la especie del registro" })).findByText("Bolaina");
    const placa = screen.getByRole("region", { name: "Foto de la placa" });
    fireEvent.change(within(placa).getByLabelText("Foto de la placa del tocón"), { target: { files: [new File(["x"], "placa.jpg", { type: "image/jpeg" })] } });
    fireEvent.change(await within(placa).findByLabelText("Código de la placa"), { target: { value: "7" } });
    fireEvent.click(within(placa).getByRole("button", { name: "Buscar" }));
    await within(placa).findByText(/«7» no es un árbol marcado\. ¿De qué especie del registro es\?/);
    fireEvent.click(within(placa).getByRole("button", { name: /Capirona/ }));
    await waitFor(() => expect((screen.getByPlaceholderText("001-BOL") as HTMLInputElement).value).toBe("7"));
    expect(screen.getByRole("button", { name: /^Especie/ }).textContent).toMatch(/Capirona/);
  });
});
