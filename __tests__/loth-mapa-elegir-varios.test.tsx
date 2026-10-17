/**
 * Tests — «Elegir varios» en el mapa del Libro TH (29-09).
 *
 *   - lo puro (`loth-mapa-tala-varios`): el censo del mapa cruzado con el
 *     libro da el MISMO `ArbolParaElegir` que «Ver censo», sin una segunda
 *     consulta al servidor;
 *   - el hook (`use-loth-mapa-tala-varios`): tocar marca/desmarca, la MISMA
 *     guarda que «Registrar tala» (semillero no se marca, bajo DMC se marca
 *     con aviso), «Talar» arma la tanda con el orden en que se marcó, y salir
 *     del modo limpia lo marcado;
 *   - el símbolo: la insignia de marcado no pisa el anillo de elegido/cercano.
 */

import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { fromUtm } from "@/lib/forestal/loth-utm";
import { defaultPoaConfig } from "@/lib/forestal/loth-poa";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import type { CensoTree, CensusTreeDTO } from "@/components/admin/forestal/loth-mapa-shared";
import { aArbolCensoTala, arbolesDelMapaParaElegir, etiquetaTalarVarios } from "@/components/admin/forestal/loth-mapa-tala-varios";
import { useLothMapaTalaVarios } from "@/components/admin/forestal/hooks/use-loth-mapa-tala-varios";
import { simboloArbolHtml } from "@/components/admin/forestal/loth-mapa-arbol-simbolo";
import type { PlanActivoMapa } from "@/components/admin/forestal/hooks/use-loth-mapa-datos";

const TREES: CensusTreeDTO[] = [
  { id: "a1", treeCode: "111", speciesCommon: "Copaiba", dapM: "0.70", alturaComercialM: "14", volumenEstimadoM3: "4.0000", condicion: "Aprovechable", utmZona: "18S", utmX: "521961", utmY: "8918254", estado: "en_pie" },
  { id: "a2", treeCode: "106", speciesCommon: "Copaiba", dapM: "0.90", alturaComercialM: "20", volumenEstimadoM3: "8.1000", condicion: "Semillero", utmZona: "18S", utmX: "521970", utmY: "8918200", estado: "en_pie" },
  { id: "a3", treeCode: "9-TOR", speciesCommon: "Tornillo", dapM: "0.40", alturaComercialM: "10", volumenEstimadoM3: "0.9000", condicion: "Bajo DMC", utmZona: "18S", utmX: "521980", utmY: "8918180", estado: "en_pie" },
  { id: "a4", treeCode: "7-TOR", speciesCommon: "Tornillo", dapM: "0.65", alturaComercialM: "12", volumenEstimadoM3: "3.2000", condicion: "Aprovechable", utmZona: "18S", utmX: "521990", utmY: "8918160", estado: "talado" },
];

function censoTree(t: CensusTreeDTO): CensoTree {
  const [lat, lng] = fromUtm(Number(t.utmX), Number(t.utmY), 18, true);
  return {
    id: t.id,
    lat,
    lng,
    code: t.treeCode,
    species: t.speciesCommon,
    cites: false,
    estado: t.estado ?? "en_pie",
    condicion: t.condicion,
    dapM: Number(t.dapM),
    volumeM3: Number(t.volumenEstimadoM3),
    utmZona: t.utmZona ?? "18S",
    utmX: Number(t.utmX),
    utmY: Number(t.utmY),
  };
}
const CENSO: CensoTree[] = TREES.map(censoTree);

const PLAN: PlanActivoMapa = {
  id: "plan-1",
  areaHa: 40,
  parcelaCorta: "PO 12",
  titularName: "Maderera El Aguajal SAC",
  planNumber: "PO 12",
  tituloHabilitante: null,
  resolucionNumber: null,
  arffs: null,
  region: null,
};

const deps = (raw: LothEntryDTO[] | null = []) => ({
  censoAll: CENSO,
  trees: TREES,
  raw,
  poaConfig: defaultPoaConfig(),
  plan: PLAN,
});

// ─── Lo puro ─────────────────────────────────────────────────────────────────

describe("loth-mapa-tala-varios (puro)", () => {
  it("aArbolCensoTala lee el DTO del mapa (metros, no cm; sin nota de campo)", () => {
    const a = aArbolCensoTala(TREES[0]);
    expect(a).toMatchObject({ id: "a1", treeCode: "111", dapM: 0.7, hcM: 14, volM3: 4, condicion: "Aprovechable", notes: null });
  });

  it("el censo del mapa cruzado con el libro es el MISMO ArbolParaElegir que «Ver censo»: el semillero pide reparo", () => {
    const arboles = arbolesDelMapaParaElegir(TREES, [], defaultPoaConfig());
    const semillero = arboles.find((a) => a.treeCode === "106")!;
    expect(semillero.disponibilidad).toBe("disponible");
    expect(semillero.reparo?.nivel).toBe("infraccion");
    expect(semillero.reparo?.titulo).toMatch(/semillero/i);
  });

  it("una línea del libro (aunque anulada) manda: el 7-TOR ya talado en el libro no es disponible", () => {
    const raw: Partial<LothEntryDTO>[] = [
      { section: "tala", lineNo: 1, entryDate: "2026-09-20", treeCode: "9-TOR", trozaCode: null, volumeM3: "0.90", status: "registrado" },
      { section: "tala", lineNo: 2, entryDate: "2026-09-21", treeCode: "111", trozaCode: null, volumeM3: "4.00", status: "anulado" },
    ];
    const arboles = arbolesDelMapaParaElegir(TREES, raw as LothEntryDTO[], defaultPoaConfig());
    expect(arboles.find((a) => a.treeCode === "9-TOR")!.disponibilidad).toBe("talado");
    // La tala del 111 está anulada: sigue disponible.
    expect(arboles.find((a) => a.treeCode === "111")!.disponibilidad).toBe("disponible");
  });

  it.each([
    [0, "Talar los elegidos"],
    [1, "Talar el elegido"],
    [3, "Talar los 3 elegidos"],
  ])("etiquetaTalarVarios(%i) → %s", (n, texto) => {
    expect(etiquetaTalarVarios(n)).toBe(texto);
  });
});

// ─── El hook ─────────────────────────────────────────────────────────────────

describe("useLothMapaTalaVarios", () => {
  it("tocar un árbol aprovechable lo marca; tocarlo de nuevo lo desmarca", () => {
    const { result } = renderHook(() => useLothMapaTalaVarios(deps()));
    act(() => result.current.alternar("a1"));
    expect(result.current.marcados.has("a1")).toBe(true);
    expect(result.current.lista).toEqual(["a1"]);
    act(() => result.current.alternar("a1"));
    expect(result.current.marcados.has("a1")).toBe(false);
  });

  it("un semillero NO se marca: avisa con la MISMA guarda que «Registrar tala»", () => {
    const { result } = renderHook(() => useLothMapaTalaVarios(deps()));
    act(() => result.current.alternar("a2"));
    expect(result.current.marcados.has("a2")).toBe(false);
    expect(result.current.aviso?.rechazo).toBe(true);
    expect(result.current.aviso?.texto).toMatch(/semillero/i);
  });

  it("bajo el DMC SÍ se marca, pero con aviso (no rechazo)", () => {
    const { result } = renderHook(() => useLothMapaTalaVarios(deps()));
    act(() => result.current.alternar("a3"));
    expect(result.current.marcados.has("a3")).toBe(true);
    expect(result.current.aviso?.rechazo).toBe(false);
    expect(result.current.aviso?.texto).toMatch(/DMC/i);
  });

  it("un talado no se marca (ya no está en pie)", () => {
    const { result } = renderHook(() => useLothMapaTalaVarios(deps()));
    act(() => result.current.alternar("a4"));
    expect(result.current.marcados.has("a4")).toBe(false);
    expect(result.current.aviso?.rechazo).toBe(true);
  });

  it("el total en m³ suma sólo lo marcado, y limpiar lo vacía sin salir del modo", () => {
    const { result } = renderHook(() => useLothMapaTalaVarios(deps()));
    act(() => result.current.activar());
    act(() => result.current.alternar("a1")); // 4.0000
    act(() => result.current.alternar("a3")); // 0.9000
    expect(result.current.totalM3).toBeCloseTo(4.9, 4);
    act(() => result.current.limpiar());
    expect(result.current.lista).toEqual([]);
    expect(result.current.activo).toBe(true);
  });

  it("desactivar limpia lo marcado (al salir del modo no queda nada marcado)", () => {
    const { result } = renderHook(() => useLothMapaTalaVarios(deps()));
    act(() => result.current.activar());
    act(() => result.current.alternar("a1"));
    act(() => result.current.desactivar());
    expect(result.current.activo).toBe(false);
    expect(result.current.lista).toEqual([]);
  });

  it("armarTanda arma la planilla en el orden en que se marcó, con el árbol talado en el libro afuera", () => {
    const raw: Partial<LothEntryDTO>[] = [
      { section: "tala", lineNo: 1, entryDate: "2026-09-20", treeCode: "9-TOR", trozaCode: null, volumeM3: "0.90", status: "registrado" },
    ];
    const { result } = renderHook(() => useLothMapaTalaVarios(deps(raw as LothEntryDTO[])));
    act(() => result.current.alternar("a1"));
    act(() => result.current.alternar("a3")); // ya talado en el libro: no entra a la tanda
    const tanda = result.current.armarTanda();
    expect(tanda).not.toBeNull();
    expect(tanda!.planId).toBe("plan-1");
    expect(tanda!.arboles.map((a) => a.treeCode)).toEqual(["111"]);
    expect(tanda!.comunes.modo).toBeNull();
  });

  it("sin marcados, armarTanda es null (no abre una planilla vacía)", () => {
    const { result } = renderHook(() => useLothMapaTalaVarios(deps()));
    expect(result.current.armarTanda()).toBeNull();
  });
});

// ─── El símbolo ─────────────────────────────────────────────────────────────

describe("simboloArbolHtml — la insignia de marcado", () => {
  it("agrega la insignia y la anuncia en el nombre accesible, sin pisar el anillo de elegido", () => {
    const html = simboloArbolHtml({ clase: "aprovechable", estado: "en_pie", resaltado: true, marcado: true, etiqueta: "Árbol 111, Copaiba" });
    expect(html).toContain("var(--accent)");
    expect(html).toContain("Árbol 111, Copaiba, marcado");
    // El anillo de resaltado (RESALTE_ARBOL) sigue presente junto a la insignia.
    expect(html).toContain("var(--data-info-500)");
  });

  it("sin marcar, no hay insignia ni sufijo en la etiqueta", () => {
    const html = simboloArbolHtml({ clase: "aprovechable", estado: "en_pie", etiqueta: "Árbol 111, Copaiba" });
    expect(html).not.toContain(", marcado");
  });
});
