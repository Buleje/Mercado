import { describe, expect, it } from "vitest";
import { metaArchivado, papelesDeIngreso } from "@/lib/forestal/ctp-documentos-ingreso";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";

const guia = (over: Partial<GtfSerfor> = {}): GtfSerfor =>
  ({
    numeroRegistro: "1-19-0313629",
    gtfNumber: "019-0000003",
    estado: "Activa",
    fechaExpedicion: "17/12/2024",
    titular: "CC.NN. SAN LUIS",
    listaTrozas: "L-19-0313629",
    distrito: "PUERTO BERMUDEZ",
    provincia: "OXAPAMPA",
    departamento: "PASCO",
    productos: [],
    trozas: [
      {
        codificacion: "106/B",
        cientifico: "Copaifera reticulata",
        comun: "Copaiba",
        tipoProducto: "Madera en rollo",
        presentacion: "Trozas",
        cantidad: 1,
        unidad: "m3",
        volumen: 5.133,
        dimensiones: "105.0 x 101.0 x 6.16",
      },
    ],
    volumenTotal: 5.133,
    campos: {},
    ...over,
  }) as GtfSerfor;

const ingreso = (over: Record<string, unknown> = {}) => ({
  serforGtf: guia(),
  gtfNumber: "019-0000003",
  providerName: "MADERERA X",
  libroNro: 14,
  entryDate: "2026-07-30T00:00:00.000Z",
  volumeM3: "4.8740",
  speciesCommonName: "Sapotillo",
  ...over,
});

describe("papelesDeIngreso — un solo lugar arma la guía y su anexo", () => {
  it("sin ficha de SERFOR no hay papel: devuelve null en vez de una hoja vacía", () => {
    expect(papelesDeIngreso({ serforGtf: null, gtfNumber: "x", providerName: "y" })).toBeNull();
    expect(papelesDeIngreso({ gtfNumber: "x", providerName: "y" })).toBeNull();
  });

  it("la GTF sale completa y autocontenida", () => {
    const p = papelesDeIngreso(ingreso());
    expect(p?.gtf.nombre).toBe("GTF 019-0000003");
    expect(p?.gtf.html.startsWith("<!doctype html>")).toBe(true);
    expect(p?.gtf.html).toContain("Reproducción");
  });

  it("la lista sólo existe si la guía trae trozas", () => {
    expect(papelesDeIngreso(ingreso())?.lista).toBeDefined();
    expect(papelesDeIngreso(ingreso({ serforGtf: guia({ trozas: [] }) }))?.lista).toBeUndefined();
  });

  it("el ARCHIVO de la lista lleva su número: en el Drive no puede haber diez «Lista de trozas»", () => {
    const p = papelesDeIngreso(ingreso());
    expect(p?.lista?.nombre).toBe("Lista de trozas");
    expect(p?.lista?.archivo).toBe("Lista de trozas L-19-0313629");
  });

  it("el pie corrido dice de qué guía es cada hoja", () => {
    const p = papelesDeIngreso(ingreso());
    expect(p?.gtf.pieCorrido).toContain("019-0000003");
    expect(p?.lista?.pieCorrido).toContain("Anexo de la GTF 019-0000003");
  });
});

describe("metaArchivado — con qué se encuentra el papel después", () => {
  it("etiqueta con el tipo de documento, el N° de guía, el proveedor y la especie", () => {
    const m = metaArchivado(ingreso(), "GTF 019-0000003");
    expect(m.etiquetas).toContain("GTF");
    expect(m.etiquetas).toContain("019-0000003");
    expect(m.etiquetas).toContain("MADERERA X");
    expect(m.etiquetas).toContain("Sapotillo");
  });

  it("la lista se etiqueta como lista, no como guía", () => {
    expect(metaArchivado(ingreso(), "Lista de trozas").etiquetas).toContain("lista de trozas");
  });

  it("no cuela etiquetas vacías", () => {
    const m = metaArchivado({ serforGtf: guia(), gtfNumber: "019-1", providerName: "" }, "GTF 019-1");
    expect(m.etiquetas.every((t) => t.trim().length > 0)).toBe(true);
  });

  it("la descripción ubica el papel en el libro", () => {
    const d = metaArchivado(ingreso(), "GTF 019-0000003").descripcion;
    expect(d).toContain("N° 14");
    expect(d).toContain("2026-07-30");
    expect(d).toContain("4.8740 m³");
  });
});
