import { describe, expect, it } from "vitest";
import {
  BORRADOR_VACIO,
  borradorSiguiente,
  completarSinPisar,
  leerCoordenada,
  leerDecimal,
  ordenarPorCodigo,
  revisarArbol,
  sugerirPorEspecie,
  type ArbolCenso,
} from "@/components/admin/forestal/loth-censo-arbol";

const arbol = (p: Partial<ArbolCenso>): ArbolCenso => ({
  id: p.treeCode ?? "x", treeCode: "1", speciesCommon: "Copaiba", speciesScientific: null, cites: false,
  dapM: null, alturaComercialM: null, factorForma: null, volumenEstimadoM3: null, utmZona: null,
  utmX: null, utmY: null, parcelaCorta: null, estado: "en_pie", ...p,
});

describe("censo en pantalla", () => {
  it("ordena por código natural: 2 antes que 13", () => {
    const orden = ordenarPorCodigo([arbol({ treeCode: "13" }), arbol({ treeCode: "2" }), arbol({ treeCode: "85-TOR" }), arbol({ treeCode: "8" })]);
    expect(orden.map((a) => a.treeCode)).toEqual(["2", "8", "13", "85-TOR"]);
  });

  it("lee decimales con coma o punto y coordenadas con separador de miles", () => {
    expect(leerDecimal("1,15")).toBe(1.15);
    expect(leerDecimal("14.853")).toBe(14.853);
    expect(leerDecimal("")).toBeNull();
    expect(Number.isNaN(leerDecimal("abc"))).toBe(true);
    expect(leerCoordenada("8.918.151")).toBe(8918151);
    expect(leerCoordenada("521 922")).toBe(521922);
    expect(leerCoordenada("521922.5")).toBe(521922.5);
  });

  it("sugiere el científico del plan antes que el del censo, y el nativo del censo", () => {
    const censo = [arbol({ treeCode: "2", speciesScientific: "Copaifera sp.", speciesNative: "Coubé" })];
    const plan = [{ speciesCommon: "copaiba", speciesScientific: "Copaifera reticulata Ducke" }];
    expect(sugerirPorEspecie("Copaiba", plan, censo)).toEqual({ cientifico: "Copaifera reticulata Ducke", nativo: "Coubé" });
    expect(sugerirPorEspecie("Copaiba", [], censo)).toEqual({ cientifico: "Copaifera sp.", nativo: "Coubé" });
    expect(sugerirPorEspecie("Tornillo", [], [])).toEqual({ cientifico: "Cedrelinga cateniformis", nativo: null });
  });

  it("no pisa lo que el usuario escribió, sí lo que puso la sugerencia anterior", () => {
    expect(completarSinPisar("", null, "Coubé")).toBe("Coubé");
    expect(completarSinPisar("Coubé", "Coubé", "Tsabiri")).toBe("Tsabiri");
    expect(completarSinPisar("Mi nombre", "Coubé", "Tsabiri")).toBe("Mi nombre");
    expect(completarSinPisar("Coubé", "Coubé", null)).toBe("");
  });

  it("revisa el borrador con los criterios del importador", () => {
    const codigos = new Set(["2"]);
    const r = revisarArbol({ ...BORRADOR_VACIO, treeCode: "2", speciesCommon: "Copaiba", dapM: "1,15", alturaComercialM: "22", utmX: "521922" }, { codigos });
    expect(r.errores).toContain("El código 2 ya está en el censo de este plan.");
    expect(r.errores).toContain("Coordenada incompleta: falta el Este o el Norte.");
    expect(r.invalidos.has("utmY")).toBe(true);
    expect(r.invalidos.has("utmX")).toBe(false);
    expect(r.volumenCalculado).toBeCloseTo(14.8534, 3);

    const ok = revisarArbol({ ...BORRADOR_VACIO, treeCode: "9", speciesCommon: "Copaiba", dapM: "1.15", alturaComercialM: "22", volumen: "14,853", utmX: "521922", utmY: "8918151" }, { codigos });
    expect(ok.errores).toEqual([]);
    expect(ok.avisos).toEqual([]);
    expect(ok.volumenEscrito).toBe(14.853);

    const raro = revisarArbol({ ...BORRADOR_VACIO, treeCode: "9", speciesCommon: "Copaiba", dapM: "1.15", alturaComercialM: "22", volumen: "40" }, { codigos });
    expect(raro.avisos[0]).toMatch(/no cuadra/);
    expect(revisarArbol(BORRADOR_VACIO, { codigos }).faltan).toEqual(["Código", "N. común"]);
  });

  it("«y otro» borra lo del árbol y deja lo que se repite", () => {
    const b = { ...BORRADOR_VACIO, treeCode: "2", speciesCommon: "Copaiba", speciesScientific: "C. r.", condicion: "Aprovechable", dapM: "1", utmX: "5", notes: "x" };
    const s = borradorSiguiente(b);
    expect(s).toMatchObject({ treeCode: "", dapM: "", utmX: "", notes: "", speciesCommon: "Copaiba", speciesScientific: "C. r.", condicion: "Aprovechable", factorForma: "0.65" });
  });
});
