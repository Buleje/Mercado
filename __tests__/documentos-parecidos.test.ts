import { describe, it, expect } from "vitest";
import { documentosParecidos, type DocConId } from "@/lib/documentos/parecidos";

const doc = (id: string, over: Partial<DocConId> = {}): DocConId => ({
  id,
  name: `${id}.pdf`,
  tags: [],
  aiTags: [],
  ocrText: null,
  ocrMetadata: null,
  ...over,
});

const conRuc = (id: string, ruc: string, extra: Record<string, unknown> = {}) =>
  doc(id, { ocrMetadata: { structured: { ruc, ...extra } } });

describe("documentosParecidos", () => {
  it("el mismo RUC manda, y lo dice", () => {
    const actual = conRuc("factura1", "20512345678");
    const [p] = documentosParecidos(actual, [conRuc("factura2", "20512345678"), doc("otro")]);
    expect(p.doc.id).toBe("factura2");
    expect(p.motivos[0]).toBe("Mismo RUC 20512345678");
  });

  it("nunca se devuelve a sí mismo", () => {
    const actual = conRuc("factura1", "20512345678");
    expect(documentosParecidos(actual, [actual])).toEqual([]);
  });

  it("empareja factura y pago por el importe exacto", () => {
    const actual = conRuc("factura", "20512345678", { total: 2680 });
    const pago = doc("recibo", { ocrMetadata: { structured: { total: 2680 } } });
    const [p] = documentosParecidos(actual, [pago]);
    expect(p.doc.id).toBe("recibo");
    expect(p.motivos.join(" ")).toContain("Mismo importe");
  });

  it("encuentra por la empresa aunque no haya RUC", () => {
    const actual = doc("a", { ocrMetadata: { entities: { orgs: ["Distribuidora El Roble S.A.C."] } } });
    const otro = doc("b", { ocrMetadata: { entities: { orgs: ["distribuidora el roble s.a.c."] } } });
    const [p] = documentosParecidos(actual, [otro]);
    // Se compara plegado pero se MUESTRA como está escrito en el documento
    // abierto: "Distribuidora el roble s.a.c." se lee como un error de tipeo.
    expect(p.motivos[0]).toBe("También es de Distribuidora El Roble S.A.C.");
  });

  it("una sola etiqueta compartida NO alcanza para llamarlo parecido", () => {
    const actual = doc("a", { tags: ["documento"] });
    const otro = doc("b", { tags: ["documento"] });
    expect(documentosParecidos(actual, [otro])).toEqual([]);
  });

  it("dos etiquetas sí, y se cuentan", () => {
    const actual = doc("a", { tags: ["arroz", "proveedor"] });
    const otro = doc("b", { aiTags: ["arroz", "proveedor"] });
    const [p] = documentosParecidos(actual, [otro]);
    expect(p.motivos[0]).toBe("2 etiquetas en común");
  });

  it("ordena del más parecido al menos, y respeta el máximo", () => {
    const actual = conRuc("a", "20512345678", { docType: "factura" });
    const mismoRuc = conRuc("mismo-ruc", "20512345678");
    const soloTipo = doc("solo-tipo", { ocrMetadata: { structured: { docType: "factura" } }, tags: ["x", "y"] });
    const otros = [soloTipo, mismoRuc, doc("nada"), conRuc("c", "20512345678"), conRuc("d", "20512345678")];
    const r = documentosParecidos(actual, otros, 2);
    expect(r).toHaveLength(2);
    expect(r[0].puntaje).toBeGreaterThanOrEqual(r[1].puntaje);
    expect(r.map((x) => x.doc.id)).toContain("mismo-ruc");
  });

  it("sin nada guardado no inventa parecidos", () => {
    expect(documentosParecidos(doc("a"), [doc("b"), doc("c")])).toEqual([]);
  });
});
