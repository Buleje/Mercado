import { describe, it, expect } from "vitest";
import { documentosParecidos, type DocConId } from "@/lib/documentos/parecidos";
import { diasHasta, textoCorto, textoCuando, tituloAviso } from "@/lib/documentos/aviso-vencimiento";

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

describe("aviso de vencimiento — el texto que decide qué hacés", () => {
  it("distingue por vencer de vencido, y hace cuánto", () => {
    expect(textoCuando(3)).toBe("vence en 3 días");
    expect(textoCuando(1)).toBe("vence mañana");
    expect(textoCuando(0)).toBe("vence HOY");
    expect(textoCuando(-1)).toBe("venció ayer");
    expect(textoCuando(-45)).toBe("venció hace 45 días");
  });

  it("la versión corta del WhatsApp también dice hace cuánto", () => {
    expect(textoCorto(5)).toBe("en 5d");
    expect(textoCorto(0)).toBe("vence hoy");
    expect(textoCorto(-5)).toBe("vencido hace 5d");
  });

  it("lo vencido manda en el título", () => {
    expect(tituloAviso([{ dias: 3 }])).toBe("Documento por vencer");
    expect(tituloAviso([{ dias: 3 }, { dias: 5 }])).toBe("2 documentos por vencer");
    expect(tituloAviso([{ dias: -2 }])).toBe("Documento VENCIDO");
    expect(tituloAviso([{ dias: -2 }, { dias: -9 }])).toBe("2 documentos VENCIDOS");
    expect(tituloAviso([{ dias: -2 }, { dias: 4 }, { dias: 6 }])).toBe("1 vencido y 2 por vencer");
  });

  it("sin fecha no hay días", () => {
    expect(diasHasta(null)).toBeNull();
    expect(diasHasta("no es fecha")).toBeNull();
  });
});
