/**
 * El Directorio de y hacia una planilla.
 *
 * Lo que importa acá no es el CSV: es que una fila mal escrita NO entre en
 * silencio. La lección del importador de trozas (2026-08-04) fue exactamente
 * ésa — 51 filas descartadas sin que nadie lo viera.
 */

import { describe, it, expect } from "vitest";
import {
  COLUMNAS_DIRECTORIO,
  partesACsv,
  plantillaDePartesCsv,
  mapearEncabezados,
  interpretarFilasDePartes,
} from "@/lib/forestal/directorio-importar";
import type { Parte } from "@/lib/forestal/directorio";

const parte = (over: Partial<Parte> = {}): Parte => ({
  id: "p1",
  roles: ["proveedor"],
  nombre: "COMUNIDAD NATIVA SANTA ROSA DE CHIVIS",
  categoria: "ccnn",
  codigoCtp: null,
  docTipo: "RUC",
  docNumero: "20156698963",
  direccion: null,
  region: null,
  provincia: null,
  distrito: null,
  zona: null,
  ubigeo: null,
  telefono: null,
  email: null,
  registroMtc: null,
  licencia: null,
  tituloHabilitante: null,
  resolucion: null,
  planManejo: null,
  arffs: null,
  representante: null,
  representanteDni: null,
  notas: null,
  activo: true,
  usos: 0,
  ultimoUso: null,
  logo: null,
  adjuntos: [],
  ...over,
});

describe("exportar", () => {
  it("sale con BOM y separado por `;` — Excel es-PE usa la coma como decimal", () => {
    const csv = partesACsv([parte()]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.split("\n")[0]).toContain("Nombre;Tipo de documento;Documento");
  });

  it("entrecomilla lo que trae el separador adentro", () => {
    const csv = partesACsv([parte({ direccion: "Jr. Lima 123; interior B" })]);
    expect(csv).toContain('"Jr. Lima 123; interior B"');
  });

  it("el punto de acopio sale como se pega: latitud, longitud", () => {
    const csv = partesACsv([parte({ acopioLat: -8.3791, acopioLng: -74.5539 })]);
    expect(csv).toContain("-8.3791, -74.5539");
  });

  it("lo que sale se puede volver a leer: mismas columnas en los dos sentidos", () => {
    const csv = partesACsv([parte({ telefono: "961000111", condicionPago: "credito", diasCredito: 30 })]);
    const filas = csv.replace("﻿", "").split("\n").map((l) => l.split(";"));
    const { listas, errores } = interpretarFilasDePartes(filas, []);
    expect(errores).toEqual([]);
    expect(listas).toHaveLength(1);
    expect(listas[0].input.nombre).toBe("COMUNIDAD NATIVA SANTA ROSA DE CHIVIS");
    expect(listas[0].input.telefono).toBe("961000111");
    expect(listas[0].input.condicionPago).toBe("credito");
    expect(listas[0].input.diasCredito).toBe(30);
  });

  it("la plantilla trae todas las columnas y un ejemplo", () => {
    const filas = plantillaDePartesCsv().replace("﻿", "").split("\n");
    expect(filas[0].split(";")).toHaveLength(COLUMNAS_DIRECTORIO.length);
    expect(filas[1].split(";")).toHaveLength(COLUMNAS_DIRECTORIO.length);
  });
});

describe("mapearEncabezados — nadie escribe el encabezado como nosotros", () => {
  it("entiende «RAZON SOCIAL», «RUC/DNI» y «Celular»", () => {
    const m = mapearEncabezados(["RAZON SOCIAL", "RUC/DNI", "Celular"]);
    expect(m.nombre).toBe(0);
    expect(m.docNumero).toBe(1);
    expect(m.telefono).toBe(2);
  });

  it("lo que no reconoce queda en -1, no en 0", () => {
    // Un -1 mal leído como «columna 0» metería el nombre en todos los campos.
    expect(mapearEncabezados(["Nombre"]).banco).toBe(-1);
  });
});

describe("interpretarFilasDePartes", () => {
  const cab = ["Nombre", "Documento", "Roles", "Teléfono"];

  it("lee una fila normal y propone crearla", () => {
    const r = interpretarFilasDePartes([cab, ["Maderera del Oriente SAC", "20100047218", "proveedor", "961000111"]], []);
    expect(r.errores).toEqual([]);
    expect(r.listas[0].accion).toBe("crear");
    expect(r.listas[0].input.docTipo).toBe("RUC");
  });

  it("deduce el tipo de documento por el largo, como se lee en el papel", () => {
    const r = interpretarFilasDePartes([cab, ["Julio Paredes", "45871236", "conductor", ""]], []);
    expect(r.listas[0].input.docTipo).toBe("DNI");
    expect(r.listas[0].input.roles).toEqual(["conductor"]);
  });

  it("un RUC con el verificador mal NO entra, y dice por qué y en qué fila", () => {
    const r = interpretarFilasDePartes([cab, ["Fantasma SAC", "20999999991", "proveedor", ""]], []);
    expect(r.listas).toHaveLength(0);
    expect(r.errores[0].linea).toBe(2);
    expect(r.errores[0].motivo).toContain("último dígito");
  });

  it("una fila sin nombre se rechaza en vez de crear una ficha en blanco", () => {
    const r = interpretarFilasDePartes([cab, ["", "20100047218", "proveedor", ""]], []);
    expect(r.errores[0].motivo).toContain("nombre");
  });

  it("el mismo documento dos veces en el archivo: la segunda señala a la primera", () => {
    const r = interpretarFilasDePartes(
      [cab, ["Maderera del Oriente SAC", "20100047218", "", ""], ["MADERERA DEL ORIENTE", "20100047218", "", ""]],
      [],
    );
    expect(r.listas).toHaveLength(1);
    expect(r.errores[0].motivo).toContain("fila 2");
  });

  it("si el documento ya está en la libreta, actualiza esa ficha en vez de duplicar", () => {
    const r = interpretarFilasDePartes([cab, ["Comunidad Santa Rosa", "20156698963", "", ""]], [parte()]);
    expect(r.listas[0].accion).toBe("actualizar");
    expect(r.listas[0].coincide?.id).toBe("p1");
  });

  it("sin documento pero con nombre parecido, avisa antes de duplicar", () => {
    const r = interpretarFilasDePartes([cab, ["Comunidad Nativa Santa Rosa de Chivis", "", "", ""]], [parte()]);
    expect(r.listas[0].accion).toBe("crear");
    expect(r.listas[0].aviso).toContain("casi igual");
  });

  it("un rol inválido no rompe la fila: cae al rol de la pestaña", () => {
    const r = interpretarFilasDePartes([cab, ["Alguien SAC", "", "comprador", ""]], [], "destinatario");
    expect(r.listas[0].input.roles).toEqual(["destinatario"]);
  });

  it("varios roles en una celda entran todos", () => {
    const r = interpretarFilasDePartes([cab, ["Dos Papeles SAC", "", "proveedor, transportista", ""]], []);
    expect(r.listas[0].input.roles).toEqual(["proveedor", "transportista"]);
  });

  it("las filas vacías del final de un Excel no cuentan", () => {
    const r = interpretarFilasDePartes([cab, ["Alguien SAC", "", "", ""], ["", "", "", ""], [null, null, null, null]], []);
    expect(r.listas).toHaveLength(1);
    expect(r.errores).toEqual([]);
  });

  it("las columnas que no se entienden se ignoran, pero se dicen", () => {
    const r = interpretarFilasDePartes([[...cab, "Color favorito"], ["Alguien SAC", "", "", "", "azul"]], []);
    expect(r.columnasIgnoradas).toEqual(["Color favorito"]);
  });

  it("un archivo sólo con encabezado no inventa filas", () => {
    expect(interpretarFilasDePartes([cab], []).listas).toEqual([]);
    expect(interpretarFilasDePartes([], []).listas).toEqual([]);
  });

  it("lee el punto de acopio y los días de crédito de sus columnas", () => {
    const r = interpretarFilasDePartes(
      [
        ["Nombre", "Punto de acopio", "Condición de pago", "Días de crédito"],
        ["Alguien SAC", "https://maps.google.com/@-8.3791,-74.5539,17z", "Crédito", "45 días"],
      ],
      [],
    );
    expect(r.listas[0].input.acopioLat).toBe(-8.3791);
    expect(r.listas[0].input.condicionPago).toBe("credito");
    expect(r.listas[0].input.diasCredito).toBe(45);
  });

  it("contado no arrastra días de crédito", () => {
    const r = interpretarFilasDePartes(
      [["Nombre", "Condición de pago", "Días de crédito"], ["Alguien SAC", "contado", "30"]],
      [],
    );
    expect(r.listas[0].input.condicionPago).toBe("contado");
    expect(r.listas[0].input.diasCredito).toBeUndefined();
  });
});
