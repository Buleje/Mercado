// @vitest-environment node
/**
 * Ley 29733 (revisión 23-10): la copia del recibo que se comparte por WhatsApp
 * lleva el DNI tapado (`****8901`), también debajo de la firma. La impresa en
 * el mostrador lo lleva entero. La ruta rechaza una copia con el DNI completo
 * (`pdfLlevaAlgunDocumento`): este test fija que lo que arma el navegador pasa.
 */
import { describe, expect, it } from "vitest";
import { armarComprobante, documentoTapado, type DatosComprobante } from "@/lib/adelantos/comprobante";
import { pdfLlevaAlgunDocumento } from "@/lib/adelantos/recibo-whatsapp";

const PNG_1X1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const BASE: DatosComprobante = {
  codigoOperacion: "ADL-2026-0024",
  persona: "Juan Pérez",
  documento: "45678901",
  monto: 150,
  moneda: "PEN",
  fecha: "2026-10-08T15:00:00.000Z",
  modalidad: "CUENTA_CORRIENTE",
  negocio: "Bodega San Martín",
  direccion: "DADO",
  firma: { imagen: PNG_1X1, relacion: 3, nombre: "Rosa Quispe", documento: "70123456", fechaHora: "jueves 08/10/2026 · 21:14" },
};

const bytes = async (d: DatosComprobante) => new Uint8Array((await armarComprobante(d)).output("arraybuffer"));

describe("recibo del adelanto: DNI tapado en la copia que se comparte", () => {
  it("documentoTapado deja los 4 últimos", () => {
    expect(documentoTapado("45678901")).toBe("****8901");
    expect(documentoTapado("123")).toBe("****");
  });

  it("la copia compartida no lleva ningún DNI entero (persona ni quien firmó)", async () => {
    const pdf = await bytes({ ...BASE, taparDocumento: true });
    expect(pdfLlevaAlgunDocumento(pdf, ["45678901", "70123456"])).toBe(false);
    const texto = new TextDecoder("latin1").decode(pdf);
    expect(texto).toContain("****8901");
    expect(texto).toContain("****3456");
  });

  it("la impresa del mostrador lo lleva entero (y la ruta la rechazaría)", async () => {
    const pdf = await bytes(BASE);
    expect(pdfLlevaAlgunDocumento(pdf, ["45678901"])).toBe(true);
  });
});
