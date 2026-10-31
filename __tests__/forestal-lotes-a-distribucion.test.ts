import { describe, expect, it } from "vitest";
import type { CorridaDelLote, LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import {
  abrirDeFrente,
  avisoDeReparto,
  ayudaDeReparto,
  partirParaDistribucion,
  type ResumenDeReparto,
} from "@/lib/forestal/lotes-a-distribucion";

/* Varios lotes a la Distribución de una vez (Brandon 28-10). */
type L = Pick<LoteAserrio, "id" | "code" | "status" | "produccion" | "corridas">;

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

const lote = (code: string, over: Partial<L> = {}): L => ({
  id: `id-${code}`,
  code,
  status: "consumido",
  produccion: null,
  corridas: [corrida({ id: `c-${code}` })],
  ...over,
});

describe("partirParaDistribucion", () => {
  it("van los en consumo; se saltan el abierto, el cerrado y el que ya declaró, con su porqué", () => {
    const { enConsumo, saltados } = partirParaDistribucion([
      lote("28-2026"),
      lote("29-2026"),
      lote("13-2026", { status: "abierto", corridas: [] }),
      lote("14-2026", { status: "cerrado" }),
      lote("15-2026", { corridas: [corrida({ quantity: 120 })] }),
    ]);
    expect(enConsumo.map((l) => l.code)).toEqual(["28-2026", "29-2026"]);
    expect(saltados).toEqual([
      { code: "13-2026", porque: "todavía no entra a la sierra" },
      { code: "14-2026", porque: "ya está cerrado" },
      { code: "15-2026", porque: "ya declaró su producción" },
    ]);
  });

  it("la ayuda dice cuántos van y cuántos se saltan", () => {
    expect(ayudaDeReparto(2, [])).toMatch(/^Lleva 2 lotes en consumo a la Distribución/);
    expect(ayudaDeReparto(1, [{ code: "13-2026", porque: "todavía no entra a la sierra" }])).toMatch(
      /Lleva 1 lote en consumo .* Se salta 1: 13-2026 \(todavía no entra a la sierra\)\.$/,
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
    expect(txt).toContain("No están en consumo: 13-2026 (ya está cerrado).");
  });

  it("no entró ninguno: no abre", () => {
    const r = { ...base, fallaron: [{ lote: "28-2026", message: "x" }] };
    expect(abrirDeFrente(r)).toBe(false);
    expect(avisoDeReparto(r)).toMatch(/^No entró ningún lote a la Distribución\./);
  });
});
