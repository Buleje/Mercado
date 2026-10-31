import { describe, expect, it } from "vitest";
import {
  codigoDeHoja, codigoDerivado, coincideConHoja, esIdDeLaCuenta, etiquetasDelPapel, filtrarPorHoja, idDeCubicacionEnTags,
  nombreDelPapel, normalizarCodigo, planillasDelTipo, problemaDelArchivo, tagCubicacion, TAG_PAPEL,
} from "@/components/admin/forestal/cubicador-papel/papel-cubicador";
import { htmlDePlanilla } from "@/lib/forestal/planillas/imprimir";
import { planillaPorId } from "@/lib/forestal/planillas/catalogo";

describe("código de la hoja", () => {
  it("las de la cuenta imprimen su CUB; las del cubicador de madera, uno corto y estable", () => {
    expect(codigoDeHoja("trozas", "cmh1abc", "cub-2026-0003")).toBe("CUB-2026-0003");
    const a = codigoDeHoja("aserrada", "cub-1729000000000-x7k2pq");
    expect(a).toMatch(/^MA-[0-9A-HJKMNP-TV-Z]{5}$/);
    expect(codigoDeHoja("aserrada", "cub-1729000000000-x7k2pq")).toBe(a);
    expect(codigoDerivado("trozas", "otro-id")).toMatch(/^TR-/);
  });

  it("sin I, L, O ni U (no se confunden al escribir a mano) y sin choques en 5 000 ids", () => {
    const vistos = new Set<string>();
    for (let i = 0; i < 5000; i++) {
      const c = codigoDerivado("aserrada", `cub-${1729000000000 + i * 997}-${i.toString(36)}`);
      expect(c.slice(3)).not.toMatch(/[ILOU]/);
      vistos.add(c);
    }
    expect(vistos.size).toBe(5000);
  });

  it("reconoce de dónde viene el id", () => {
    expect(esIdDeLaCuenta("cmh1x2y3z0000abcd")).toBe(true);
    expect(esIdDeLaCuenta("cub-1729000000000-abc")).toBe(false);
  });
});

describe("buscar por la hoja", () => {
  const cub = { codigos: ["CUB-2026-0003", "001-0045678"], textos: ["Juan Pérez", "patio norte"] };
  it("por código con o sin guiones, o una parte", () => {
    expect(coincideConHoja("cub 2026 0003", cub)).toBe(true);
    expect(coincideConHoja("0003", cub)).toBe(true);
    expect(coincideConHoja("45678", cub)).toBe(true);
    expect(coincideConHoja("0004", cub)).toBe(false);
  });
  it("por nombre sin tildes ni mayúsculas, todas las palabras", () => {
    expect(coincideConHoja("juan perez", cub)).toBe(true);
    expect(coincideConHoja("PÉREZ", cub)).toBe(true);
    expect(coincideConHoja("juan gómez", cub)).toBe(false);
    expect(coincideConHoja("   ", cub)).toBe(true);
  });
  it("filtra una lista y la vacía devuelve todo", () => {
    const lista = [{ c: "CUB-2026-0001", p: "Ana" }, { c: "CUB-2026-0002", p: "Luis" }];
    const campos = (x: (typeof lista)[number]) => ({ codigos: [x.c], textos: [x.p] });
    expect(filtrarPorHoja(lista, "0002", campos).map((x) => x.p)).toEqual(["Luis"]);
    expect(filtrarPorHoja(lista, "", campos)).toHaveLength(2);
    expect(normalizarCodigo("ma-7k3qx")).toBe("MA7K3QX");
  });
});

describe("planilla de cada cubicador", () => {
  it("aserrada = pie tablar; trozas = las dos fórmulas, primero la que usa", () => {
    expect(planillasDelTipo("aserrada", "oxapampina")).toEqual(["aserrada-pt"]);
    expect(planillasDelTipo("trozas", "oxapampina")).toEqual(["rolliza-oxapampa", "rolliza-smalian"]);
    expect(planillasDelTipo("trozas", null)).toEqual(["rolliza-smalian", "rolliza-oxapampa"]);
    for (const id of [...planillasDelTipo("trozas"), ...planillasDelTipo("aserrada")]) expect(planillaPorId(id)).not.toBeNull();
  });
});

describe("el papel en el Archivo", () => {
  it("etiquetas: vínculo + tipo + código en minúsculas, sin repetir y ≤ 64", () => {
    const id = "c".repeat(70);
    const t = etiquetasDelPapel({ tipo: "trozas", cubicacionId: id, codigo: "CUB-2026-0003", previas: ["foto", TAG_PAPEL] });
    expect(t).toEqual([TAG_PAPEL, "cubicador", tagCubicacion(id), "trozas", "cub-2026-0003", "foto"]);
    expect(t.every((x) => x.length <= 64)).toBe(true);
    expect(idDeCubicacionEnTags(["foto", tagCubicacion("abc")])).toBe("abc");
    expect(idDeCubicacionEnTags(["foto"])).toBeNull();
  });
  it("nombre y archivos que acepta", () => {
    expect(nombreDelPapel("CUB-2026-0003", "Juan  Pérez", 1)).toBe("Papel CUB-2026-0003 · Juan Pérez");
    expect(nombreDelPapel("MA-7K3QX", null, 2)).toBe("Papel MA-7K3QX · hoja 2");
    expect(problemaDelArchivo({ type: "image/jpeg", size: 1000 })).toBeNull();
    expect(problemaDelArchivo({ type: "application/pdf", size: 1000 })).toBeNull();
    expect(problemaDelArchivo({ type: "text/plain", size: 10 })).toMatch(/foto o un PDF/);
    expect(problemaDelArchivo({ type: "image/png", size: 30 * 1024 * 1024 })).toMatch(/20 MB/);
  });
});

describe("la hoja impresa lleva el código", () => {
  it("en el recuadro y al pie de cada hoja, escapado; sin código queda como antes", () => {
    const p = planillaPorId("rolliza-smalian");
    if (!p) throw new Error("falta la planilla");
    const html = htmlDePlanilla(p, { codigo: "CUB-2026-0003", lote: "Juan <b>Pérez</b>", copias: 2 });
    expect(html.match(/<b>CUB-2026-0003<\/b>/g)).toHaveLength(2);
    expect(html).toContain(`Planilla ${p.nombre} · v${p.versionPrompt} · CUB-2026-0003`);
    expect(html).toContain("Lote: Juan &lt;b&gt;Pérez&lt;/b&gt;");
    const sin = htmlDePlanilla(p);
    expect(sin).not.toContain("Código de la hoja");
    expect(sin).not.toContain('class="lote"');
  });
});
