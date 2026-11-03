import { describe, expect, it } from "vitest";
import { sobranteDeLote, type CorridaDelLote, type LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import {
  abrirDeFrente,
  aporteDeLote,
  avisoDeReparto,
  ayudaDeReparto,
  bloqueDeAporte,
  partirParaDistribucion,
  type ResumenDeReparto,
} from "@/lib/forestal/lotes-a-distribucion";

/* Varios lotes a la Distribución de una vez (Brandon 28-10). Desde el 03-11
   («va todo, sea declarada o no declarada») van todos los que aportan algo. */
const corrida = (over: Partial<CorridaDelLote> = {}): CorridaDelLote => ({
  id: "c1",
  lineNo: 1,
  entryDate: "2026-10-28T12:00:00.000Z",
  productType: null,
  quantity: null,
  unit: null,
  status: "registrado",
  viva: true,
  ...over,
});

const lote = (code: string, over: Partial<LoteAserrio> = {}): LoteAserrio =>
  ({
    id: `id-${code}`,
    code,
    status: "consumido",
    speciesCommon: "TORNILLO",
    permiso: "19-SEC/REG-PLT-2025-167",
    trozas: [],
    produccion: null,
    corridas: [corrida({ id: `c-${code}` })],
    volumenM3: 0,
    ...over,
  }) as LoteAserrio;

const troza = (id: string, volumenM3: number, consumidaEnId: string | null = null) =>
  ({ id, codificacion: null, codigoPlanta: `P-${id}`, volumenM3, consumidaEnId }) as LoteAserrio["trozas"][number];

/* Ya declarado: entraron 10 m³ y se declararon 3 → el 56 % deja 5.6, sobran 2.6. */
const declarada = (quantity: number) => corrida({ id: "c-dec", volumeInputM3: 10, quantity, unit: "m3" });

describe("partirParaDistribucion", () => {
  it("van todos los que aportan: en consumo al servidor; abierto y declarado directos", () => {
    const { enConsumo, directos, saltados } = partirParaDistribucion([
      lote("28-2026"),
      lote("13-2026", { status: "abierto", corridas: [], trozas: [troza("t1", 1.25), troza("t2", 0.75), troza("t3", 9, "c-otra")] }),
      lote("15-2026", { produccion: declarada(3), corridas: [declarada(3)] }),
      lote("16-2026", { status: "cerrado", produccion: declarada(3), corridas: [declarada(3)] }),
    ]);
    expect(enConsumo.map((l) => l.code)).toEqual(["28-2026"]);
    expect(saltados).toEqual([]);
    expect(directos.map((d) => d.lote.code)).toEqual(["13-2026", "15-2026", "16-2026"]);
    /* Abierto: su rolliza LIBRE (no la ya consumida), con sus trozas para las jornadas. */
    expect(directos[0]!.bloque).toMatchObject({
      etiqueta: "Lote 13-2026",
      especie: "TORNILLO",
      m3: 2,
      tipo: "rolliza",
      origen: "lote",
      loteId: "id-13-2026",
      trozaIds: ["t1", "t2"],
      aprovechablePct: null,
      permiso: "19-SEC/REG-PLT-2025-167",
    });
    /* Declarado: lo que le sobra hasta el 56 %, como aserrada (sin descontar otra vez). */
    expect(directos[1]!.bloque).toMatchObject({ m3: 2.6, tipo: "aserrada", trozaIds: null, aprovechablePct: null });
  });

  it("se saltan sólo los que no tienen nada que amparar, con su porqué", () => {
    const { enConsumo, directos, saltados } = partirParaDistribucion([
      lote("14-2026", { status: "abierto", corridas: [] }),
      lote("17-2026", { status: "cerrado", produccion: declarada(5.6), corridas: [declarada(5.6)] }),
    ]);
    expect(enConsumo).toEqual([]);
    expect(directos).toEqual([]);
    expect(saltados).toEqual([
      { code: "14-2026", porque: "no tiene trozas libres" },
      { code: "17-2026", porque: "no le sobra nada: llegó al tope del 56 %" },
    ]);
  });

  it("aporteDeLote: la misma cifra que la etiqueta roja «Sobra» del lote declarado", () => {
    const l = lote("15-2026", { produccion: declarada(3), corridas: [declarada(3)] });
    expect(aporteDeLote(l)).toEqual({ m3: 2.6, aprovechablePct: 100, esMargen: true, permiso: "19-SEC/REG-PLT-2025-167" });
    expect(sobranteDeLote(l)?.m3).toBe(2.6);
    expect(bloqueDeAporte(l, aporteDeLote(l)!).etiqueta).toBe("Lote 15-2026");
  });

  it("la ayuda dice cuántos van y cuántos se saltan", () => {
    expect(ayudaDeReparto(2, [])).toMatch(/^Lleva 2 lotes a la Distribución, un bloque por lote/);
    expect(ayudaDeReparto(1, [{ code: "14-2026", porque: "no tiene trozas libres" }])).toMatch(
      /Lleva 1 lote .* Se salta 1: 14-2026 \(no tiene trozas libres\)\.$/,
    );
  });
});

describe("avisoDeReparto / abrirDeFrente", () => {
  const base: ResumenDeReparto = { entraron: [], repetidos: [], fallaron: [], saltados: [] };

  it("entró todo: abre de frente y sin aviso", () => {
    const r = { ...base, entraron: ["28-2026", "29-2026"] };
    expect(abrirDeFrente(r)).toBe(true);
    expect(avisoDeReparto(r)).toBeNull();
  });

  it("uno falló: los otros igual entran y el aviso dice cuál no y por qué", () => {
    const r = {
      ...base,
      entraron: ["28-2026"],
      fallaron: [{ lote: "29-2026", message: "El lote 29-2026 tiene 2 corridas sin declarar." }],
    };
    expect(abrirDeFrente(r)).toBe(false);
    expect(avisoDeReparto(r)).toBe("Entró a la Distribución: 28-2026. 29-2026: El lote 29-2026 tiene 2 corridas sin declarar.");
  });

  it("repetidos y saltados también frenan la navegación y se dicen", () => {
    const r = { ...base, entraron: ["28-2026"], repetidos: ["30-2026"], saltados: [{ code: "13-2026", porque: "ya está cerrado" }] };
    expect(abrirDeFrente(r)).toBe(false);
    const txt = avisoDeReparto(r)!;
    expect(txt).toContain("Ya estaba en la hoja: 30-2026");
    expect(txt).toContain("No se llevaron: 13-2026 (ya está cerrado).");
  });

  it("no entró ninguno: no abre", () => {
    const r = { ...base, fallaron: [{ lote: "28-2026", message: "x" }] };
    expect(abrirDeFrente(r)).toBe(false);
    expect(avisoDeReparto(r)).toMatch(/^No entró ningún lote a la Distribución\./);
  });
});
