import { describe, expect, it } from "vitest";
import { paraRepasarVencimiento, pareceQueVence, TAG_NO_VENCE } from "@/lib/documentos/parece-que-vence";

const motivo = (name: string, extra: Partial<Parameters<typeof pareceQueVence>[0]> = {}) => pareceQueVence({ name, ...extra }).motivo;

describe("pareceQueVence", () => {
  it.each([
    ["DNI de Juan.jpg", "DNI"],
    ["02 DNI del jefe.png", "DNI"],
    ["Contrato de alquiler local Constitución.pdf", "Contrato"],
    ["Licencia de funcionamiento 2026.pdf", "Licencia"],
    ["licencia.png", "Licencia"],
    ["Permiso forestal Chinchiguani.pdf", "Permiso"],
    ["01 Resolucion de permiso.pdf", "Permiso"],
    ["qa-ui-resolucion.pdf", "Resolución"],
    ["SOAT camioneta.pdf", "SOAT"],
    ["Póliza de seguro.pdf", "Póliza"],
    ["Certificado de operatividad.pdf", "Certificado"],
    ["Constancia de inscripción.pdf", "Constancia"],
    ["Carné de sanidad Ana.jpg", "Carné"],
    ["Carnet de extranjería.png", "Carné"],
  ])("%s parece vencer (%s)", (name, esperado) => {
    expect(motivo(name)).toBe(esperado);
  });

  it("la categoría «contratos» y lo que la IA leyó también cuentan", () => {
    expect(motivo("scan 0012.pdf", { category: "contratos" })).toBe("Contrato");
    expect(motivo("scan 0012.pdf", { ocrMetadata: { vencimientoLeido: { fecha: "2027-01-05" } } })).toBe("Vencimiento leído");
    expect(motivo("scan 0012.pdf", { ocrMetadata: { vencimientoLeido: { fecha: "2027-01-05", motivo: "comprobante" } } })).toBeNull();
  });

  it.each([
    "Factura — GTF 019-001-0000771 (factura-prueba-qa).pdf",
    "GTF 19-00000-000001.pdf",
    "boleta-escaneada.pdf",
    "recibo-pago-brandon.pdf",
    "Pago 2026-10-12 a 2026-10-18 — Juan Pérez Ríos",
    "Estado de cuenta — QA Caja 549235",
    "Lista de trozas 5, 6.pdf",
    "Hoja de firmas HF-261025-MVRR",
    "03 Contrato borrador.docx",
    "Acta de asamblea.pdf",
    "Registro de Plantacion.pdf",
    "Titulo de chinchiguani.pdf",
    "IMG_2041.jpg",
    "12-15-42 · Sigue en cuadro · 1 persona.webp",
    "10-02-11 · Permiso · Portón.webp",
  ])("%s no", (name) => {
    expect(pareceQueVence({ name }).parece).toBe(false);
  });

  it("las fotos de máquina y las planillas nunca", () => {
    expect(pareceQueVence({ name: "Licencia", tags: ["personas"] }).parece).toBe(false);
    expect(pareceQueVence({ name: "Contratos.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }).parece).toBe(false);
  });
});

describe("paraRepasarVencimiento", () => {
  const base = { name: "DNI de Juan.jpg" };
  it("entra si parece vencer y no tiene fecha", () => expect(paraRepasarVencimiento(base)).toBe(true));
  it("sale con fecha, borrado o «No vence»", () => {
    expect(paraRepasarVencimiento({ ...base, expiresAt: "2030-01-01T12:00:00.000Z" })).toBe(false);
    expect(paraRepasarVencimiento({ ...base, deletedAt: "2026-10-01T00:00:00Z" })).toBe(false);
    expect(paraRepasarVencimiento({ ...base, tags: [TAG_NO_VENCE] })).toBe(false);
  });
});
