import { describe, it, expect } from "vitest";
import { buscarEnEsenciales, partirResaltado, palabrasDe } from "@/lib/documentos/esenciales-buscar";

const carpetas = [
  { id: "ccnn", name: "CCNN Santa Rosa", parentId: null },
  { id: "sec", name: "19-SEC", parentId: "ccnn" },
  { id: "sub", name: "Anexos", parentId: "sec" },
  { id: "otra", name: "Contratos", parentId: null },
  { id: "suelta", name: "Suelta", parentId: null },
];
const esenciales = [
  { carpeta: { id: "ccnn", name: "CCNN Santa Rosa" }, carpetaIds: new Set(["ccnn", "sec", "sub"]) },
  { carpeta: { id: "sec", name: "19-SEC" }, carpetaIds: new Set(["sec", "sub"]) },
  { carpeta: { id: "otra", name: "Contratos" }, carpetaIds: new Set(["otra"]) },
];
const doc = (id: string, folderId: string | null, name: string, extra: Record<string, unknown> = {}) => ({
  id, folderId, name, uploadedAt: "2026-10-01T00:00:00Z", ...extra,
});

describe("buscarEnEsenciales", () => {
  it("encuentra sin tildes ni mayúsculas y da el camino", () => {
    const r = buscarEnEsenciales({ q: "RESOLUCION", esenciales, carpetas, docs: [doc("a", "sec", "Resolución.pdf")] });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ esencialId: "sec", carpetaId: "sec", ruta: ["19-SEC"], coincideEn: "nombre", fragmento: null });
  });
  it("papel en dos esenciales anidadas sale una vez, con la más cercana", () => {
    const r = buscarEnEsenciales({ q: "plano", esenciales, carpetas, docs: [doc("a", "sub", "Plano.pdf")] });
    expect(r).toHaveLength(1);
    expect(r[0].esencialId).toBe("sec");
    expect(r[0].ruta).toEqual(["19-SEC", "Anexos"]);
  });
  it("la ruta arranca en la esencial incluida", () => {
    const r = buscarEnEsenciales({ q: "plano", esenciales: [esenciales[0]], carpetas, docs: [doc("a", "sub", "Plano.pdf")] });
    expect(r[0].ruta).toEqual(["CCNN Santa Rosa", "19-SEC", "Anexos"]);
  });
  it("todas las palabras, en cualquier campo", () => {
    const d = doc("a", "otra", "Contrato.pdf", { tags: ["Ramírez"], ocrText: "firmado en Pucallpa" });
    expect(buscarEnEsenciales({ q: "ramirez pucallpa", esenciales, carpetas, docs: [d] })).toHaveLength(1);
    expect(buscarEnEsenciales({ q: "ramirez lima", esenciales, carpetas, docs: [d] })).toHaveLength(0);
  });
  it("fragmento alrededor de la palabra en el texto leído", () => {
    const ocr = `${"x ".repeat(100)}Se otorga la RESOLUCIÓN directoral de aprobación ${"y ".repeat(100)}`;
    const [r] = buscarEnEsenciales({ q: "resolucion", esenciales, carpetas, docs: [doc("a", "sec", "Scan 1.pdf", { ocrText: ocr })] });
    expect(r.coincideEn).toBe("texto");
    expect(r.fragmento).toContain("RESOLUCIÓN directoral");
    expect(r.fragmento!.length).toBeLessThan(100);
    expect(r.fragmento!.startsWith("…") && r.fragmento!.endsWith("…")).toBe(true);
  });
  it("orden: nombre, etiqueta, texto; dentro, lo más nuevo", () => {
    const docs = [
      doc("txt", "sec", "Scan.pdf", { ocrText: "acta" }),
      doc("eti", "sec", "B.pdf", { tags: ["acta"] }),
      doc("n-viejo", "sec", "Acta vieja.pdf", { uploadedAt: "2026-01-01T00:00:00Z" }),
      doc("n-nuevo", "sec", "Acta nueva.pdf", { uploadedAt: "2026-09-01T00:00:00Z" }),
    ];
    const r = buscarEnEsenciales({ q: "acta", esenciales, carpetas, docs });
    expect(r.map((x) => x.doc.id)).toEqual(["n-nuevo", "n-viejo", "eti", "txt"]);
    expect(r.map((x) => x.coincideEn)).toEqual(["nombre", "nombre", "etiqueta", "texto"]);
  });
  it("borrados, fuera de esenciales y q corta no salen", () => {
    const docs = [doc("b", "sec", "Acta.pdf", { deletedAt: "2026-10-02" }), doc("c", "suelta", "Acta.pdf"), doc("d", null, "Acta.pdf")];
    expect(buscarEnEsenciales({ q: "acta", esenciales, carpetas, docs })).toEqual([]);
    expect(buscarEnEsenciales({ q: "a", esenciales, carpetas, docs: [doc("e", "sec", "Acta.pdf")] })).toEqual([]);
    expect(buscarEnEsenciales({ q: "  ", esenciales, carpetas, docs: [doc("e", "sec", "Acta.pdf")] })).toEqual([]);
  });
  it("tope", () => {
    const docs = Array.from({ length: 60 }, (_, i) => doc(`d${i}`, "sec", `Acta ${i}.pdf`));
    expect(buscarEnEsenciales({ q: "acta", esenciales, carpetas, docs })).toHaveLength(50);
    expect(buscarEnEsenciales({ q: "acta", esenciales, carpetas, docs, tope: 5 })).toHaveLength(5);
  });
});

describe("partirResaltado", () => {
  it("marca sin tildes y conserva el texto original", () => {
    const p = partirResaltado("Resolución Directoral", palabrasDe("resolucion"));
    expect(p).toEqual([{ texto: "Resolución", marca: true }, { texto: " Directoral", marca: false }]);
    expect(p.map((x) => x.texto).join("")).toBe("Resolución Directoral");
  });
});
