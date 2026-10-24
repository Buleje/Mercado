import { describe, it, expect } from "vitest";
import {
  chequearPiso,
  textoBajoPiso,
  respuestaBajoPiso,
  esRespuestaBajoPiso,
  dialogoBajoPiso,
  textoBajoPisoConfirmado,
  type AvisoBajoPiso,
} from "@/lib/precios/piso";

/**
 * El piso de una rebaja (Brandon 19-10): la regla única que usan Precios en
 * bloque (rechaza), la ficha del producto y los precios en lote (409 + «Guardar igual»).
 */
describe("chequearPiso", () => {
  const base = { precioActual: 5, costo: 3.8, pisoSobreCosto: 5 };

  it("una rebaja bajo costo + 5 % no pasa y dice el piso (redondeado hacia arriba)", () => {
    // 3,80 × 1,05 = 3,99 exacto; 3,98 queda debajo.
    expect(chequearPiso({ ...base, precioNuevo: 3.98 })).toEqual({ ok: false, bajoPiso: true, piso: 3.99 });
  });

  it("justo en el piso pasa", () => {
    expect(chequearPiso({ ...base, precioNuevo: 3.99 })).toEqual({ ok: true });
  });

  it("el piso con fracción de céntimo sube al céntimo siguiente", () => {
    // 3,81 × 1,05 = 4,0005 → piso 4,01: 4,00 ya queda debajo.
    expect(chequearPiso({ ...base, costo: 3.81, precioNuevo: 4 })).toEqual({ ok: false, bajoPiso: true, piso: 4.01 });
  });

  it("una subida pasa aunque siga bajo el piso (no es una rebaja)", () => {
    expect(chequearPiso({ precioActual: 3, precioNuevo: 3.5, costo: 3.8, pisoSobreCosto: 5 })).toEqual({ ok: true });
  });

  it("el mismo precio pasa (ruido del float incluido)", () => {
    expect(chequearPiso({ precioActual: 4.35, precioNuevo: 4.35 * 1, costo: 9, pisoSobreCosto: 5 })).toEqual({ ok: true });
  });

  it("sin costo (null, 0 o negativo) pasa", () => {
    expect(chequearPiso({ ...base, costo: null, precioNuevo: 1 })).toEqual({ ok: true });
    expect(chequearPiso({ ...base, costo: 0, precioNuevo: 1 })).toEqual({ ok: true });
    expect(chequearPiso({ ...base, costo: -2, precioNuevo: 1 })).toEqual({ ok: true });
  });

  it("sin piso del negocio pasa", () => {
    expect(chequearPiso({ ...base, pisoSobreCosto: null, precioNuevo: 1 })).toEqual({ ok: true });
  });

  it("producto nuevo (precioActual null): se mide igual, no hay de dónde bajar", () => {
    expect(chequearPiso({ precioActual: null, precioNuevo: 3.5, costo: 3.8, pisoSobreCosto: 5 })).toEqual({ ok: false, bajoPiso: true, piso: 3.99 });
    expect(chequearPiso({ precioActual: null, precioNuevo: 3.99, costo: 3.8, pisoSobreCosto: 5 })).toEqual({ ok: true });
    expect(chequearPiso({ precioActual: null, precioNuevo: 1, costo: null, pisoSobreCosto: 5 })).toEqual({ ok: true });
  });

  it("piso 0 = no vender bajo costo", () => {
    expect(chequearPiso({ ...base, pisoSobreCosto: 0, precioNuevo: 3.79 })).toEqual({ ok: false, bajoPiso: true, piso: 3.8 });
    expect(chequearPiso({ ...base, pisoSobreCosto: 0, precioNuevo: 3.8 })).toEqual({ ok: true });
  });
});

describe("textos del aviso", () => {
  const aviso: AvisoBajoPiso = {
    productId: 1, nombre: "Leche Gloria", precioActual: 5, precioNuevo: 3.5, costo: 3.8, piso: 3.99,
    mensaje: textoBajoPiso("Leche Gloria", 3.99, 5),
  };

  it("el renglón tiene el formato que pidió Brandon", () => {
    expect(aviso.mensaje).toBe("Leche Gloria: queda bajo costo + 5 % (S/ 3,99)");
    expect(textoBajoPiso("Arroz", 4.2, 7.5)).toBe("Arroz: queda bajo costo + 7,5 % (S/ 4,20)");
  });

  it("el 409 se reconoce del lado del cliente y trae el mensaje", () => {
    const r = respuestaBajoPiso([aviso], 5);
    expect(esRespuestaBajoPiso(r)).toBe(true);
    expect(r.error).toBe(aviso.mensaje);
    expect(esRespuestaBajoPiso({ error: "otra cosa" })).toBe(false);
    expect(esRespuestaBajoPiso(null)).toBe(false);
    expect(respuestaBajoPiso([aviso, { ...aviso, productId: 2 }], 5).error).toBe("2 productos quedan bajo costo + 5 %");
  });

  it("el diálogo dice «Guardar igual» / «Corregir» y el precio puesto", () => {
    const d = dialogoBajoPiso(respuestaBajoPiso([aviso], 5));
    expect(d.confirmLabel).toBe("Guardar igual");
    expect(d.cancelLabel).toBe("Corregir");
    expect(d.description).toContain("Leche Gloria: queda bajo costo + 5 % (S/ 3,99) — pusiste S/ 3,50");
  });

  it("al subir un archivo: «Importar igual» / «Volver al archivo» y cuenta filas", () => {
    const fila = { ...aviso, productId: null, precioActual: null, fila: 3 };
    const d = dialogoBajoPiso(respuestaBajoPiso([fila, { ...fila, fila: 4 }], 5), "importar");
    expect(d.title).toBe("2 filas quedan bajo tu piso");
    expect(d.confirmLabel).toBe("Importar igual");
    expect(d.cancelLabel).toBe("Volver al archivo");
    expect(d.description).toContain("Si importas igual");
  });

  it("la línea del registro nombra a quien confirmó", () => {
    expect(textoBajoPisoConfirmado([aviso], "qaadmin")).toBe(
      "Bajo piso confirmado por qaadmin: Leche Gloria: queda bajo costo + 5 % (S/ 3,99), puesto en S/ 3,50",
    );
  });
});
