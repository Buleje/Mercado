/**
 * Los pasos de la ficha del Directorio (24-10): cada dato que la salud de la
 * ficha reclama tiene un paso donde se carga, y el estado de cada paso sale de
 * lo que falta y de lo que está mal escrito.
 */

import { describe, expect, it } from "vitest";
import { ROLES_PARTE } from "@/lib/forestal/directorio";
import { pendientesDeFicha } from "@/lib/forestal/directorio-salud";
import {
  estadoDePasoFicha,
  PASO_DEL_PENDIENTE,
  pasosDeLaFicha,
  pasoVisibleDeLaFicha,
  type DatosDelEstado,
} from "@/lib/forestal/directorio-pasos";

const VACIO: DatosDelEstado = { requisitos: [], pendientes: [], errores: {}, sinNombre: false, intento: false };

describe("pasos de la ficha del Directorio", () => {
  it("todo lo que la salud reclama a una ficha con TODOS los papeles tiene su paso", () => {
    const campos = pendientesDeFicha({ roles: [...ROLES_PARTE] }).map((p) => p.campo);
    expect(campos.length).toBeGreaterThan(8);
    const sinPaso = campos.filter((c) => !(c in PASO_DEL_PENDIENTE));
    expect(sinPaso).toEqual([]);
  });

  it("los cinco pasos en orden; «Según el papel» sale sólo si hay papel", () => {
    expect(pasosDeLaFicha(true).map((p) => p.id)).toEqual(["quien", "papel", "donde", "pago", "papeles"]);
    expect(pasosDeLaFicha(false).map((p) => p.id)).toEqual(["quien", "donde", "pago", "papeles"]);
  });

  it("un destinatario sin dirección: «Dónde y contacto» pendiente, «Pago y vínculos» opcional", () => {
    const requisitos = pendientesDeFicha({ roles: ["destinatario"] });
    const d: DatosDelEstado = { ...VACIO, requisitos, pendientes: requisitos };
    expect(estadoDePasoFicha("donde", d)).toBe("pendiente");
    expect(estadoDePasoFicha("pago", d)).toBe("opcional");
    expect(estadoDePasoFicha("papeles", d)).toBe("opcional");
    // Con la dirección y el teléfono puestos, el paso queda completo.
    const completo: DatosDelEstado = { ...d, pendientes: [{ campo: "Documento" }] };
    expect(estadoDePasoFicha("donde", completo)).toBe("completo");
    expect(estadoDePasoFicha("quien", completo)).toBe("pendiente");
  });

  it("el nombre vacío avisa antes de guardar y marca en rojo después", () => {
    expect(estadoDePasoFicha("quien", { ...VACIO, sinNombre: true })).toBe("pendiente");
    expect(estadoDePasoFicha("quien", { ...VACIO, sinNombre: true, intento: true })).toBe("falta");
    expect(estadoDePasoFicha("quien", VACIO)).toBe("completo");
  });

  it("lo mal escrito gana a lo que falta y va al paso de su campo", () => {
    const requisitos = pendientesDeFicha({ roles: ["proveedor"] });
    const d: DatosDelEstado = { ...VACIO, requisitos, pendientes: requisitos };
    expect(estadoDePasoFicha("papel", { ...d, errores: { representanteDni: true } })).toBe("falta");
    expect(estadoDePasoFicha("papel", { ...d, errores: { precio: true } })).toBe("falta");
    expect(estadoDePasoFicha("pago", { ...d, errores: { cci: true } })).toBe("falta");
    expect(estadoDePasoFicha("quien", { ...d, errores: { documento: true } })).toBe("falta");
    // Un error de otro paso no tiñe a éste.
    expect(estadoDePasoFicha("donde", { ...d, errores: { cci: true } })).toBe("pendiente");
  });

  it("si el paso que se veía deja de existir, se pasa al que le sigue", () => {
    const sinPapel = pasosDeLaFicha(false);
    expect(pasoVisibleDeLaFicha(sinPapel, "papel")).toBe("donde");
    expect(pasoVisibleDeLaFicha(sinPapel, "pago")).toBe("pago");
    expect(pasoVisibleDeLaFicha(pasosDeLaFicha(true), "papel")).toBe("papel");
  });
});
