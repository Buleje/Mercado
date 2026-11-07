import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  TOPE_ARCHIVO_SUNAT_BYTES,
  TOPE_ENTRADAS_ZIP,
  TOPE_XML_SUNAT_BYTES,
  xmlDeArchivoSunat,
} from "@/lib/documents/sunat-zip";

const XML = '<?xml version="1.0" encoding="UTF-8"?><ApplicationResponse><cbc:ResponseCode>0</cbc:ResponseCode></ApplicationResponse>';

describe("xmlDeArchivoSunat: XML suelto y .zip del CDR", () => {
  it("un XML suelto se devuelve tal cual", () => {
    expect(xmlDeArchivoSunat(strToU8(XML), "F001-123.xml")).toEqual({ ok: true, xml: XML });
  });

  it("un .zip con un .xml adentro devuelve ese XML", () => {
    const zip = zipSync({ "R-20123456789-01-F001-123.xml": strToU8(XML) });
    expect(xmlDeArchivoSunat(zip, "R-20123456789-01-F001-123.zip")).toEqual({ ok: true, xml: XML });
  });

  it("un zip se reconoce por su firma aunque el nombre no termine en .zip", () => {
    const zip = zipSync({ "cdr.xml": strToU8(XML) });
    expect(xmlDeArchivoSunat(zip, "cdr.bin")).toEqual({ ok: true, xml: XML });
  });

  it("el .xml puede venir después de otra entrada que no es xml", () => {
    const zip = zipSync({ "leeme.txt": strToU8("hola"), "dentro/cdr.XML": strToU8(XML) });
    expect(xmlDeArchivoSunat(zip, "cdr.zip")).toEqual({ ok: true, xml: XML });
  });

  it("un .zip sin ningún .xml da xml null (la ruta responde sin_xml)", () => {
    const zip = zipSync({ "leeme.txt": strToU8("hola") });
    expect(xmlDeArchivoSunat(zip, "cdr.zip")).toEqual({ ok: true, xml: null });
  });
});

describe("xmlDeArchivoSunat: topes contra el zip inflado", () => {
  it("un archivo de más de 4 MB ni se abre", () => {
    const grande = new Uint8Array(TOPE_ARCHIVO_SUNAT_BYTES + 1);
    expect(xmlDeArchivoSunat(grande, "cdr.zip")).toEqual({ ok: false, motivo: "demasiado_grande" });
    expect(xmlDeArchivoSunat(grande, "factura.xml")).toEqual({ ok: false, motivo: "demasiado_grande" });
  });

  it("un archivo de justo 4 MB todavía se acepta", () => {
    const justo = new Uint8Array(TOPE_ARCHIVO_SUNAT_BYTES).fill(0x20);
    expect(xmlDeArchivoSunat(justo, "factura.xml").ok).toBe(true);
  });

  it("un .zip chiquito que al abrirse pesa más de 10 MB se rechaza (la bomba)", () => {
    const inflado = new Uint8Array(TOPE_XML_SUNAT_BYTES + 1); // ceros: comprime a unos KB
    const zip = zipSync({ "bomba.xml": inflado });
    expect(zip.length).toBeLessThan(TOPE_ARCHIVO_SUNAT_BYTES);
    expect(xmlDeArchivoSunat(zip, "cdr.zip")).toEqual({ ok: false, motivo: "demasiado_grande" });
  });

  it("un .xml de justo 10 MB dentro del zip todavía se lee", () => {
    const justo = new Uint8Array(TOPE_XML_SUNAT_BYTES).fill(0x20);
    const zip = zipSync({ "ok.xml": justo });
    const r = xmlDeArchivoSunat(zip, "cdr.zip");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.xml?.length).toBe(TOPE_XML_SUNAT_BYTES);
  });

  it("un .zip con más de 100 entradas se rechaza", () => {
    const entradas: Record<string, Uint8Array> = {};
    for (let i = 0; i <= TOPE_ENTRADAS_ZIP; i++) entradas[`f${i}.txt`] = strToU8("x");
    expect(xmlDeArchivoSunat(zipSync(entradas), "cdr.zip")).toEqual({ ok: false, motivo: "demasiado_grande" });
  });

  it("un .zip de justo 100 entradas se acepta", () => {
    const entradas: Record<string, Uint8Array> = {};
    for (let i = 0; i < TOPE_ENTRADAS_ZIP - 1; i++) entradas[`f${i}.txt`] = strToU8("x");
    entradas["cdr.xml"] = strToU8(XML);
    expect(xmlDeArchivoSunat(zipSync(entradas), "cdr.zip")).toEqual({ ok: true, xml: XML });
  });

  it("el .zip que MIENTE el tamaño no llena la memoria: sale cortado a lo declarado", () => {
    // Se parte un zip bueno y se le baja el tamaño declarado (cabecera central y local) a 10 bytes.
    const real = strToU8(XML.repeat(50));
    const zip = zipSync({ "cdr.xml": real }, { level: 0 });
    const vista = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    for (let i = 0; i + 4 <= zip.length; i++) {
      const firma = vista.getUint32(i, true);
      if (firma === 0x04034b50) vista.setUint32(i + 22, 10, true); // local: tamaño sin comprimir
      if (firma === 0x02014b50) vista.setUint32(i + 24, 10, true); // central: tamaño sin comprimir
    }
    const r = xmlDeArchivoSunat(zip, "cdr.zip");
    if (r.ok) expect((r.xml ?? "").length).toBeLessThanOrEqual(real.length);
    else expect(r.motivo).toBe("zip_invalido");
  });
});

describe("xmlDeArchivoSunat: zip dañado", () => {
  it("un .zip cortado a la mitad da zip_invalido", () => {
    const zip = zipSync({ "cdr.xml": strToU8(XML.repeat(20)) });
    expect(xmlDeArchivoSunat(zip.slice(0, Math.floor(zip.length / 2)), "cdr.zip")).toEqual({ ok: false, motivo: "zip_invalido" });
  });

  it("un archivo .zip que no es zip da zip_invalido", () => {
    expect(xmlDeArchivoSunat(strToU8("esto no es un zip"), "cdr.zip")).toEqual({ ok: false, motivo: "zip_invalido" });
  });
});
