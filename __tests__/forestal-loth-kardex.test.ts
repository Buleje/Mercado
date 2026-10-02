/**
 * Kárdex del permiso: cada movimiento del Libro TH en orden con su saldo, sin
 * sumar tala + trozado + despacho entre sí, y un cierre que ES la cascada del
 * permiso (`cascadaDelPlan` sobre `computeBalance`, lo que calcula el servidor).
 */

import { describe, expect, it } from "vitest";
import {
  computeBalance,
  type BalanceMovement,
  type BalanceSpeciesInput,
  type LothEntryDTO,
} from "@/lib/forestal/loth-constants";
import {
  construirKardex,
  cierreDelKardex,
  cuadrarConCascada,
  filasDelKardex,
  lineasDelPermiso,
  resumirKardex,
  saldoInicial,
  type EspecieDelPermiso,
} from "@/lib/forestal/loth-kardex";
import {
  celdaTexto,
  fechaKardex,
  hojasDelKardex,
  htmlKardex,
  nombreArchivoKardex,
  type DatosKardex,
} from "@/lib/forestal/loth-kardex-reporte";
import { cascadaDelPlan } from "@/lib/forestal/loth-saldo-cascada";
import type { BandaPermiso } from "@/lib/forestal/loth-tablero-permiso";

const PLAN = "plan-po-12";
let n = 0;
function linea(
  p: Partial<Omit<LothEntryDTO, "volumeM3" | "quantity">> & {
    section: string;
    volumeM3?: number | null;
    quantity?: number | null;
  },
): LothEntryDTO {
  const { volumeM3, quantity, ...resto } = p;
  n += 1;
  return {
    ...resto,
    id: p.id ?? `l${n}`,
    lineNo: p.lineNo ?? n,
    section: p.section,
    entryDate: p.entryDate ?? "2026-05-28T00:00:00.000Z",
    treeCode: p.treeCode ?? null,
    trozaCode: p.trozaCode ?? null,
    speciesCommon: p.speciesCommon ?? null,
    speciesScientific: p.speciesScientific ?? null,
    gtfNumber: p.gtfNumber ?? null,
    unit: p.unit ?? null,
    status: p.status ?? "registrado",
    annulledReason: p.annulledReason ?? null,
    planId: p.planId === undefined ? PLAN : p.planId,
    volumeM3: volumeM3 == null ? null : String(volumeM3),
    quantity: quantity == null ? null : String(quantity),
  } as unknown as LothEntryDTO;
}

const ESPECIES: EspecieDelPermiso[] = [
  {
    speciesCommon: "Tornillo",
    speciesScientific: "Cedrelinga cateniformis",
    volumenAutorizadoM3: "80.0000",
  },
  {
    speciesCommon: "Shihuahuaco",
    speciesScientific: "Dipteryx micrantha",
    volumenAutorizadoM3: 60,
  },
  {
    speciesCommon: "Cedro rojo",
    speciesScientific: "Cedrela odorata",
    volumenAutorizadoM3: 30,
    cites: true,
  },
];

/** Lo que el servidor manda a `computeBalance` (`balanceExtraccion` sin `solo`). */
function cascadaDelServidor(entries: LothEntryDTO[], especies: EspecieDelPermiso[], planId = PLAN) {
  const species: BalanceSpeciesInput[] = especies.map((s) => ({
    speciesCommon: s.speciesCommon,
    speciesScientific: s.speciesScientific ?? null,
    cites: s.cites === true,
    volumenAutorizadoM3: Number(s.volumenAutorizadoM3),
  }));
  const movements: BalanceMovement[] = entries
    .filter((e) => (e.planId === planId || e.planId == null) && e.status === "registrado")
    .map((e) => ({
      section: e.section,
      speciesCommon: e.speciesCommon,
      speciesScientific: e.speciesScientific,
      trozaCode: e.trozaCode,
      volumeM3: e.volumeM3 ? Number(e.volumeM3) : null,
      quantity: e.quantity ? Number(e.quantity) : null,
      unit: e.unit,
    }));
  const b = computeBalance(species, movements);
  return { cascada: cascadaDelPlan(b.rows), balance: b };
}

/** El libro de un permiso con todo lo que puede pasar. */
function libro(): LothEntryDTO[] {
  return [
    // Día 1: un árbol de Tornillo talado y trozado en 4.
    linea({
      section: "tala",
      lineNo: 1,
      treeCode: "85-TOR",
      speciesCommon: "Tornillo",
      speciesScientific: "Cedrelinga cateniformis",
      volumeM3: 5.003,
    }),
    linea({
      section: "trozado",
      lineNo: 1,
      entryDate: "2026-05-28T23:50:43.115Z",
      treeCode: "85-TOR",
      trozaCode: "85-TOR-A",
      speciesCommon: "Tornillo",
      volumeM3: 1.471,
    }),
    linea({
      section: "trozado",
      lineNo: 2,
      entryDate: "2026-05-28T23:50:43.670Z",
      treeCode: "85-TOR",
      trozaCode: "85-TOR-B",
      speciesCommon: "Tornillo",
      volumeM3: 1.29,
    }),
    linea({
      section: "trozado",
      lineNo: 3,
      entryDate: "2026-05-28T23:50:44.063Z",
      treeCode: "85-TOR",
      trozaCode: "85-TOR-C",
      speciesCommon: "Tornillo",
      volumeM3: 0.995,
    }),
    linea({
      section: "trozado",
      lineNo: 4,
      entryDate: "2026-05-28T23:50:44.462Z",
      treeCode: "85-TOR",
      trozaCode: "85-TOR-D",
      speciesCommon: "Tornillo",
      volumeM3: 1.131,
    }),
    // Salen A y B con GTF; C se despachó y se anuló.
    linea({
      section: "despacho_troza",
      lineNo: 1,
      entryDate: "2026-05-28T23:50:45.011Z",
      trozaCode: "85-TOR-A",
      gtfNumber: "001-0000120",
    }),
    linea({
      section: "despacho_troza",
      lineNo: 2,
      entryDate: "2026-05-28T23:50:45.436Z",
      trozaCode: "85-TOR-B",
      gtfNumber: "001-0000120",
    }),
    linea({
      section: "despacho_troza",
      lineNo: 3,
      entryDate: "2026-09-28T00:00:00.000Z",
      trozaCode: "85-TOR-C",
      gtfNumber: "001-0000123",
      status: "anulado",
      annulledReason: "Guía anulada",
    }),
    // Una tala anulada (no cuenta) y una de una especie que el registro no tiene.
    linea({
      section: "tala",
      lineNo: 2,
      entryDate: "2026-09-28T00:00:00.000Z",
      treeCode: "1-SHI",
      speciesCommon: "Shihuahuaco",
      volumeM3: 9.5426,
      status: "anulado",
    }),
    linea({
      section: "tala",
      lineNo: 3,
      entryDate: "2026-09-28T00:00:00.000Z",
      treeCode: "50-MIS",
      speciesCommon: "Misa",
      volumeM3: 6.8047,
    }),
    // Por científico: «Cedro» (Cedrela odorata) es el «Cedro rojo» del registro.
    linea({
      section: "tala",
      lineNo: 4,
      entryDate: "2026-09-29T00:00:00.000Z",
      treeCode: "7-CED",
      speciesCommon: "Cedro",
      speciesScientific: "Cedrela odorata",
      volumeM3: 3.2,
    }),
    linea({
      section: "trozado",
      lineNo: 5,
      entryDate: "2026-09-29T00:00:00.000Z",
      treeCode: "7-CED",
      trozaCode: "7-CED-A",
      speciesCommon: "Cedro",
      speciesScientific: "Cedrela odorata",
      volumeM3: 2.5,
    }),
    linea({
      section: "consumo_troza",
      lineNo: 1,
      entryDate: "2026-09-30T00:00:00.000Z",
      trozaCode: "7-CED-A",
    }),
    linea({
      section: "producto_terminado",
      lineNo: 1,
      entryDate: "2026-09-30T00:00:00.000Z",
      speciesCommon: "Cedro",
      quantity: 400,
      unit: "pt",
    }),
    linea({
      section: "despacho_producto",
      lineNo: 1,
      entryDate: "2026-10-01T00:00:00.000Z",
      speciesCommon: "Cedro",
      speciesScientific: "Cedrela odorata",
      quantity: 0.8,
      unit: "m3",
      gtfNumber: "001-0000130",
    }),
    // Una línea sin plan: cuenta en todos los permisos.
    linea({
      section: "tala",
      lineNo: 5,
      entryDate: "2026-10-01T00:00:00.000Z",
      treeCode: "9-SHI",
      speciesCommon: "Shihuahuaco",
      volumeM3: 4,
      planId: null,
    }),
    // Un despacho de una troza sin trozado (no descuenta) y una línea de OTRO plan.
    linea({
      section: "despacho_troza",
      lineNo: 4,
      entryDate: "2026-10-01T00:00:00.000Z",
      trozaCode: "QABK-1-A",
      gtfNumber: "001-0000131",
    }),
    linea({
      section: "tala",
      lineNo: 1,
      entryDate: "2026-10-01T00:00:00.000Z",
      treeCode: "X-1",
      speciesCommon: "Tornillo",
      volumeM3: 50,
      planId: "otro-plan",
    }),
  ];
}

describe("construirKardex — el cierre ES la cascada del permiso", () => {
  const entries = libro();
  const k = construirKardex(entries, { planId: PLAN, especies: ESPECIES });
  const { cascada, balance } = cascadaDelServidor(entries, ESPECIES);

  it("el cierre es exactamente `cascadaDelPlan(computeBalance(...))`, especie por especie", () => {
    expect(k.cierre).toEqual(cascada);
  });

  it("el último saldo del kárdex es el cierre (por talar, sin trozar, en patio)", () => {
    const ultima = [...k.filas].reverse().find((f) => f.saldoTotal != null);
    expect(ultima?.saldoTotal?.enPieM3).toBe(cascada.total.enPieM3);
    expect(ultima?.saldoTotal?.taladoSinTrozarM3).toBe(cascada.total.taladoSinTrozarM3);
    expect(ultima?.saldoTotal?.enPatioM3).toBe(cascada.total.enPatioM3);
    expect(cierreDelKardex(k, null)).toEqual(cascada.total);
  });

  it("cifras del cierre: Tornillo 80 − 5,003 en pie; patio 4,887 − 2,761", () => {
    const tor = k.cierre.especies.find((e) => e.especie === "Tornillo");
    expect(tor?.enPieM3).toBe(74.997);
    expect(tor?.taladoSinTrozarM3).toBe(0.116);
    expect(tor?.enPatioM3).toBe(2.126);
    expect(tor?.despachadoM3).toBe(2.761);
  });

  it("la especie se reconoce por el científico, como el saldo (Cedro → Cedro rojo)", () => {
    const ced = k.cierre.especies.find((e) => e.especie === "Cedro rojo");
    expect(ced?.taladoM3).toBe(3.2);
    expect(ced?.consumidoM3).toBe(2.5);
    expect(ced?.despachadoM3).toBe(0.8);
    expect(ced?.enPatioM3).toBe(0);
    // tala, trozado, consumo y despacho de producto; el producto terminado dice «Cedro» sin científico.
    expect(k.filas.filter((f) => f.clave === "cedro rojo")).toHaveLength(4);
  });

  it("lo que el registro no tiene va aparte y no suma al permiso (= `sinRegistrar` del servidor)", () => {
    expect(k.fueraDelRegistro.map((e) => [e.especie, e.taladoM3])).toEqual([["Misa", 6.8047]]);
    expect(balance.sinRegistrar.map((s) => [s.species, s.taladoM3])).toEqual([["Misa", 6.8047]]);
    const misa = k.filas.find((f) => f.especie === "Misa");
    expect(misa?.delRegistro).toBe(false);
    expect(misa?.saldoTotal).toBeNull();
    expect(misa?.saldoEspecie?.taladoSinTrozarM3).toBe(6.8047);
  });

  it("un producto que no dice su científico NO se reconoce como «Cedro rojo»: igual que el servidor", () => {
    const sinCientifico = [
      ...entries,
      linea({
        section: "despacho_producto",
        entryDate: "2026-10-02T00:00:00.000Z",
        speciesCommon: "Cedro",
        quantity: 0.5,
        unit: "m3",
      }),
    ];
    const k2 = construirKardex(sinCientifico, { planId: PLAN, especies: ESPECIES });
    expect(k2.cierre).toEqual(cascadaDelServidor(sinCientifico, ESPECIES).cascada);
    expect(k2.fueraDelRegistro.find((e) => e.especie === "Cedro")?.despachadoM3).toBe(0.5);
  });

  it("no depende del orden en que llega el libro", () => {
    const barajado = [...entries].reverse();
    expect(construirKardex(barajado, { planId: PLAN, especies: ESPECIES }).cierre).toEqual(cascada);
  });

  it("las líneas del plan y las sin plan; las de otro plan no", () => {
    expect(lineasDelPermiso(entries, PLAN)).toHaveLength(entries.length - 1);
    expect(k.filas.some((f) => f.arbol === "X-1")).toBe(false);
    expect(k.filas.find((f) => f.arbol === "9-SHI")?.sinPlan).toBe(true);
  });
});

describe("cada movimiento en su columna — nunca se suman tala + trozado + despacho", () => {
  const k = construirKardex(libro(), { planId: PLAN, especies: ESPECIES });
  const de = (mov: string, troza?: string) =>
    k.filas.find((f) => f.movimiento === mov && (troza == null || f.troza === troza));

  it("la tala entra; el trozado no entra ni sale (transforma); el despacho sale con el volumen de su troza", () => {
    const tala = de("tala");
    expect([tala?.entraM3, tala?.saleM3]).toEqual([5.003, null]);
    const tro = de("trozado", "85-TOR-A");
    expect([tro?.entraM3, tro?.saleM3, tro?.m3]).toEqual([null, null, 1.471]);
    const des = de("despacho", "85-TOR-A");
    expect([des?.entraM3, des?.saleM3, des?.gtf, des?.especie, des?.arbol]).toEqual([
      null,
      1.471,
      "001-0000120",
      "Tornillo",
      "85-TOR",
    ]);
  });

  it("orden cronológico; en el mismo día la tala antes que su trozado", () => {
    expect(k.filas.slice(0, 2).map((f) => f.movimiento)).toEqual(["tala", "trozado"]);
    const dias = k.filas.map((f) => f.dia ?? "");
    expect([...dias].sort()).toEqual(dias);
  });

  it("el trozado pasa volumen del monte al patio sin cambiar lo por talar", () => {
    const i = k.filas.findIndex((f) => f.troza === "85-TOR-A" && f.movimiento === "trozado");
    const antes = k.filas[i - 1].saldoEspecie!;
    const despues = k.filas[i].saldoEspecie!;
    expect(despues.enPieM3).toBe(antes.enPieM3);
    expect(Math.round((antes.taladoSinTrozarM3 - despues.taladoSinTrozarM3) * 1000) / 1000).toBe(
      1.471,
    );
    expect(despues.enPatioM3 - antes.enPatioM3).toBeCloseTo(1.471, 6);
  });

  it("anulada: se ve, no cuenta y no tiene saldo", () => {
    const anulada = k.filas.find((f) => f.troza === "85-TOR-C" && f.movimiento === "despacho");
    expect(anulada?.anulada).toBe(true);
    expect(anulada?.cuenta).toBe(false);
    expect(anulada?.saldoTotal).toBeNull();
    expect(anulada?.motivoAnulacion).toBe("Guía anulada");
    expect(anulada?.saleM3).toBe(0.995); // se muestra tachada
  });

  it("despacho de una troza sin trozado: se ve con su aviso y no descuenta", () => {
    const f = k.filas.find((x) => x.troza === "QABK-1-A");
    expect(f?.cuenta).toBe(false);
    expect(f?.avisos.join(" ")).toMatch(/Sin trozado vigente/);
  });

  it("Σ entra − Σ sale = lo que hay en el área (monte + patio) cuando nada se recorta", () => {
    const r = resumirKardex(k.filas, null);
    const t = k.cierre.total;
    expect(r.entraM3 - r.saleM3).toBeCloseTo(t.taladoSinTrozarM3 + t.enPatioM3, 4);
    expect(r.anulados).toBe(2);
  });

  it("por especie: las filas de esa especie y su cierre", () => {
    const filas = filasDelKardex(k, "tornillo");
    expect(filas.every((f) => f.clave === "tornillo")).toBe(true);
    expect(filas.filter((f) => !f.anulada).at(-1)?.saldoEspecie?.enPatioM3).toBe(2.126);
    expect(saldoInicial(k, "tornillo").enPieM3).toBe(80);
    expect(saldoInicial(k, null).enPieM3).toBe(170);
  });

  it("se trozó más de lo talado: lo dice en la fila", () => {
    const sinTala = construirKardex(
      [linea({ section: "trozado", trozaCode: "Z-1-A", speciesCommon: "Tornillo", volumeM3: 1 })],
      { planId: PLAN, especies: ESPECIES },
    );
    expect(sinTala.filas[0].avisos.join(" ")).toMatch(/más de lo talado de Tornillo/);
    expect(sinTala.cierre.total.taladoSinTrozarM3).toBe(0);
  });
});

describe("permiso sin especies en su registro (Blas 19-SEC)", () => {
  const entries = [
    linea({ section: "tala", treeCode: "001-BOL", speciesCommon: "Bolaina", volumeM3: 8 }),
    linea({ section: "trozado", trozaCode: "001-BOL-A", speciesCommon: "Bolaina", volumeM3: 3 }),
  ];
  const k = construirKardex(entries, { planId: PLAN, especies: [] });

  it("no hay por talar, pero el monte y el patio se llevan igual", () => {
    expect(k.sinBase).toBe(true);
    expect(k.cierre.total.taladoSinTrozarM3).toBe(5);
    expect(k.cierre.total.enPatioM3).toBe(3);
    expect(k.especies.every((e) => e.delRegistro)).toBe(true);
    expect(k.filas.every((f) => f.saldoTotal != null)).toBe(true);
    // El servidor no arma filas sin especies: la franja queda vacía y no hay contra qué cuadrar.
    expect(cascadaDelServidor(entries, []).cascada.especies).toHaveLength(0);
  });
});

describe("cuadrarConCascada", () => {
  const entries = libro();
  const k = construirKardex(entries, { planId: PLAN, especies: ESPECIES });
  const { cascada } = cascadaDelServidor(entries, ESPECIES);

  it("igual → cuadra", () => {
    expect(cuadrarConCascada(k.cierre, cascada)).toEqual({ cuadra: true, diferencias: [] });
  });
  it("distinto → dice especie, casillero y las dos cifras; 10 litros no es diferencia", () => {
    const otra = structuredClone(cascada);
    otra.especies[0].enPatioM3 += 0.005;
    expect(cuadrarConCascada(k.cierre, otra).cuadra).toBe(true);
    otra.especies[0].enPatioM3 += 1;
    const r = cuadrarConCascada(k.cierre, otra);
    expect(r.cuadra).toBe(false);
    expect(r.diferencias[0]).toMatchObject({
      especie: otra.especies[0].especie,
      campo: "En patio",
    });
  });
});

describe("lo que sale afuera", () => {
  const permiso: BandaPermiso = {
    nombre: "PO 12",
    tipo: "PO",
    esPlantacion: false,
    baseLabel: "Autorizado",
    tituloHabilitante: "17-CPO/C-J-001-02",
    titular: "<img src=x onerror=alert(1)>",
    resolucion: null,
    vigencia: {
      texto: "Sin fecha de fin",
      rango: null,
      hasta: null,
      tono: "sin-fecha",
      diasQueFaltan: null,
    },
  };
  const entries = [
    ...libro(),
    linea({
      section: "tala",
      entryDate: "2026-10-02T00:00:00.000Z",
      treeCode: '=HYPERLINK("http://x")',
      speciesCommon: "Tornillo",
      volumeM3: 1,
    }),
  ];
  const k = construirKardex(entries, { planId: PLAN, especies: ESPECIES });
  const datos: DatosKardex = {
    kardex: k,
    permiso,
    especie: null,
    cuadre: { cuadra: true, diferencias: [] },
    hoyKey: "2026-10-02",
  };

  it("celdaTexto: lo que empieza con = + - @ va como texto", () => {
    expect(celdaTexto("=1+1")).toBe("'=1+1");
    expect(celdaTexto("+51 999")).toBe("'+51 999");
    expect(celdaTexto("-")).toBe("'-");
    expect(celdaTexto("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(celdaTexto("85-TOR-A")).toBe("85-TOR-A");
  });

  it("el Excel: Kárdex (saldo inicial → movimientos → cierre), Cierre por especie, Permiso; m³ como número", () => {
    const hojas = hojasDelKardex(datos);
    expect(hojas.map((h) => h.nombre)).toEqual(["Kárdex", "Cierre por especie", "Permiso"]);
    const kar = hojas[0].filas;
    expect(kar[0]["Por talar m³"]).toBe(170);
    expect(kar.at(-1)?.Movimiento).toBe("Cierre");
    expect(kar.at(-1)?.["Por talar m³"]).toBe(k.cierre.total.enPieM3);
    const tala = kar.find((f) => f.Árbol === '\'=HYPERLINK("http://x")');
    expect(tala?.["Entra m³"]).toBe(1);
    const anulada = kar.find((f) => f.Estado === "Anulada");
    expect(anulada?.["Por talar m³"]).toBe("");
    // Sumar la columna «Entra» en Excel no cuenta lo anulado.
    expect(
      kar
        .filter((f) => f.Estado === "Anulada")
        .every((f) => f["Entra m³"] === "" && f["Sale m³"] === ""),
    ).toBe(true);
    expect(hojas[1].filas.find((f) => f.Especie === "Misa")?.["En el registro"]).toMatch(/^No/);
  });

  it("sin especies en el registro, «por talar» va vacío (sería −talado)", () => {
    const sinBase = construirKardex(
      [linea({ section: "tala", treeCode: "001-BOL", speciesCommon: "Bolaina", volumeM3: 8 })],
      {
        planId: PLAN,
        especies: [],
      },
    );
    const hojas = hojasDelKardex({ ...datos, kardex: sinBase, cuadre: null });
    expect(hojas[0].filas.every((f) => f["Por talar m³"] === "")).toBe(true);
    expect(hojas[0].filas.at(-1)?.["Talado sin trozar m³"]).toBe(8);
    expect(hojas[1].filas.every((f) => f["Por talar m³"] === "")).toBe(true);
    expect(htmlKardex({ ...datos, kardex: sinBase, cuadre: null }).body).not.toContain("-8.000");
  });

  it("el impreso escapa TODO texto", () => {
    const { body } = htmlKardex(datos);
    expect(body).not.toContain("<img src=x");
    expect(body).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(body).toContain("no cuenta");
  });

  it("la fecha como la dice Brandon, con el año si no es el de hoy; el archivo es un slug", () => {
    expect(fechaKardex("2026-05-28", "2026-10-02")).toBe("jueves 28/05");
    expect(fechaKardex("2025-05-28", "2026-10-02")).toBe("miércoles 28/05/2025");
    expect(nombreArchivoKardex({ ...datos, especie: "cedro rojo" })).toBe(
      "kardex-po-12-cedro-rojo-2026-10-02",
    );
  });
});
