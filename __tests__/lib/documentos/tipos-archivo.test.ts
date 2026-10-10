import { describe, it, expect } from "vitest";
import {
  resolverMime, mimeDeExtension, familiaDe, etiquetaTipo, esImagenRenderizable,
} from "@/lib/documents/tipos-archivo";
import { motivoRechazo, esInlineSeguro, esMimePermitido, MAX_UPLOAD_SIZE } from "@/lib/documents/upload-limits";

function archivo(nombre: string, tipo = "", size = 1024): File {
  return new File([new Uint8Array(size)], nombre, { type: tipo });
}

describe("resolverMime", () => {
  it("le cree al navegador cuando reconoció el archivo", () => {
    expect(resolverMime("foto.jpg", "image/jpeg")).toBe("image/jpeg");
  });

  it("usa la extensión cuando el navegador se encoge de hombros", () => {
    // Lo que pasa DE VERDAD con HEIC del iPhone y .ods de LibreOffice.
    expect(resolverMime("IMG_0042.heic", "")).toBe("image/heic");
    expect(resolverMime("caja.ods", "application/octet-stream")).toBe("application/vnd.oasis.opendocument.spreadsheet");
    expect(resolverMime("plano.dwg", "")).toBe("image/vnd.dwg");
  });

  it("no inventa nada si no conoce la extensión", () => {
    expect(mimeDeExtension("cosa.qwerty")).toBeNull();
    expect(resolverMime("cosa.qwerty", "")).toBe("application/octet-stream");
  });

  it("un archivo sin extensión no rompe", () => {
    expect(resolverMime("BLAS doc", "")).toBe("application/octet-stream");
  });
});

describe("familiaDe / etiquetaTipo", () => {
  const casos: [string, string][] = [
    ["balance.xlsx", "planilla"],
    ["balance.ods", "planilla"],
    ["ventas.csv", "planilla"],
    ["contrato.docx", "texto"],
    ["contrato.odt", "texto"],
    ["carta.rtf", "texto"],
    ["charla.pptx", "presentacion"],
    ["charla.odp", "presentacion"],
    ["recibo.pdf", "pdf"],
    ["IMG_1.heic", "imagen"],
    ["escaneo.tiff", "imagen"],
    ["backup.rar", "comprimido"],
    ["backup.7z", "comprimido"],
    ["nota.eml", "correo"],
    ["local.dwg", "plano"],
    ["audio.m4a", "audio"],
    ["clip.mov", "video"],
    ["cosa.qwerty", "otro"],
  ];
  it.each(casos)("%s → %s", (nombre, familia) => {
    expect(familiaDe(nombre, "")).toBe(familia);
  });

  it("la etiqueta se lee en castellano, no en MIME", () => {
    expect(etiquetaTipo("caja.ods", "")).toBe("Hoja de cálculo · ODS");
    expect(etiquetaTipo("charla.pptx", "")).toBe("Presentación · PPTX");
  });
});

describe("esImagenRenderizable", () => {
  it("acepta las que el navegador sabe dibujar", () => {
    expect(esImagenRenderizable("a.jpg", "image/jpeg")).toBe(true);
    expect(esImagenRenderizable("a.webp", "")).toBe(true);
  });
  it("rechaza las que NO (pedirlas en un <img> daba un roto)", () => {
    expect(esImagenRenderizable("a.heic", "")).toBe(false);
    expect(esImagenRenderizable("a.tiff", "")).toBe(false);
    expect(esImagenRenderizable("a.psd", "")).toBe(false);
  });
});

describe("motivoRechazo — guardar es permisivo", () => {
  it("acepta los formatos que antes rebotaban", () => {
    for (const n of ["caja.ods", "IMG.heic", "backup.rar", "plano.dwg", "nota.eml", "BLAS doc"]) {
      expect(motivoRechazo(archivo(n))).toBeNull();
    }
  });

  it("rechaza ejecutables por extensión, aunque el MIME mienta", () => {
    expect(motivoRechazo(archivo("factura.pdf.exe", "application/pdf"))).toMatch(/ejecutable/);
    expect(motivoRechazo(archivo("script.bat"))).toMatch(/ejecutable/);
    expect(motivoRechazo(archivo("app.apk"))).toMatch(/ejecutable/);
  });

  it("rechaza ejecutables por MIME, aunque el nombre no lo diga", () => {
    expect(esMimePermitido("application/x-msdownload", "informe")).toBe(false);
  });

  it("sigue frenando lo pesado y lo vacío", () => {
    expect(motivoRechazo(archivo("gigante.pdf", "application/pdf", MAX_UPLOAD_SIZE + 1))).toMatch(/pesa/);
    expect(motivoRechazo(archivo("nada.pdf", "application/pdf", 0))).toMatch(/vacío/);
  });
});

describe("esInlineSeguro — servir es estricto", () => {
  it("deja mostrar lo inofensivo", () => {
    expect(esInlineSeguro("application/pdf", "a.pdf")).toBe(true);
    expect(esInlineSeguro("image/png", "a.png")).toBe(true);
    expect(esInlineSeguro("text/plain", "a.txt")).toBe(true);
  });

  it("NUNCA muestra inline un SVG o un HTML (ejecutan scripts en nuestro origen)", () => {
    expect(esInlineSeguro("image/svg+xml", "logo.svg")).toBe(false);
    // Aunque venga disfrazado de imagen por el MIME.
    expect(esInlineSeguro("image/png", "logo.svg")).toBe(false);
    expect(esInlineSeguro("text/html", "pagina.html")).toBe(false);
  });

  it("lo que no conoce se baja, no se abre", () => {
    expect(esInlineSeguro("application/vnd.rar", "backup.rar")).toBe(false);
    expect(esInlineSeguro("application/octet-stream", "cosa")).toBe(false);
  });
});
