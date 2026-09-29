/**
 * placa-historial (29-09-2026) — «Buscar placa»: juntar lo que el negocio ya
 * sabe de una placa y llenar SOLO los casilleros vacíos de la guía.
 *
 * Fixtures con los datos de la base: el despacho QA-LOTE-SALIDA-3 de `main`
 * (AXQ-871, JULIO PAREDES, DNI 44120987, licencia Q44120987) y la guía de
 * SERFOR 019-001-0000004 (W2D-853 / -, OVALLE MEJIA MANUEL OSCAR, 07705709).
 */

import { describe, expect, it } from "vitest";
import {
  juntarLoDelSistema,
  rellenarDesdePlaca,
  resumenDeRelleno,
  type RegistroPlaca,
  type TransporteDeGuia,
} from "@/lib/forestal/placa-historial";

const despacho = (fecha: string, extra: Partial<RegistroPlaca> = {}): RegistroPlaca => ({
  fuente: "despacho_ctp",
  referencia: `GTF-${fecha}`,
  fecha,
  placa: "AXQ-871",
  placaRemolque: "",
  modo: "terrestre",
  tipo: "Camión",
  marca: "Volvo",
  transportista: "Maderera San Martín SAC",
  transportistaDocTipo: "RUC",
  transportistaDoc: "20512345678",
  conductor: "JULIO PAREDES",
  conductorDni: "44120987",
  licencia: "Q44120987",
  ...extra,
});

const vacia = (): TransporteDeGuia => ({
  vehiculo: { tipo: "", marca: "", placaRemolque: "", conductor: "", conductorDni: "", licencia: "" },
  transportista: { nombre: "", docTipo: "RUC", docNumero: "" },
});

describe("juntarLoDelSistema", () => {
  it("la guía más nueva manda y las viejas completan huecos", () => {
    const s = juntarLoDelSistema("AXQ871", [
      despacho("2026-07-29", { transportista: "ASERRADERO SAN MARTÍN SAC", tipo: "Tráiler" }),
      despacho("2026-08-08", { tipo: "", licencia: "" }),
    ]);
    expect(s.encontrado).toBe(true);
    expect(s.veces).toBe(2);
    expect(s.datos.transportista).toBe("Maderera San Martín SAC");
    expect(s.origen.transportista?.fecha).toBe("2026-08-08");
    // El tipo y la licencia no estaban en la nueva: salen de la de julio.
    expect(s.datos.tipo).toBe("Tráiler");
    expect(s.origen.tipo?.fecha).toBe("2026-07-29");
    expect(s.datos.licencia).toBe("Q44120987");
    expect(s.origen.licencia?.fecha).toBe("2026-07-29");
    expect(s.ultimaGuia).toEqual({ fuente: "despacho_ctp", referencia: "GTF-2026-08-08", fecha: "2026-08-08" });
  });

  it("el Directorio va primero aunque no tenga fecha", () => {
    const s = juntarLoDelSistema("AXQ-871", [
      despacho("2026-08-08"),
      { fuente: "directorio", referencia: null, fecha: null, placa: "AXQ871", marca: "Scania", tipo: "Tráiler" },
    ]);
    expect(s.datos.marca).toBe("Scania");
    expect(s.origen.marca?.fuente).toBe("directorio");
    // El Directorio no es un viaje: la última guía sigue siendo el despacho.
    expect(s.ultimaGuia?.fuente).toBe("despacho_ctp");
  });

  it("SERFOR: «W2D-853 / -» es la placa; «TRANSPORTISTA» llega como conductor con DNI y licencia", () => {
    const s = juntarLoDelSistema("W2D853", [
      {
        fuente: "guia_serfor",
        referencia: "019-001-0000004",
        fecha: "2026-08-15",
        placa: "W2D-853 / -",
        tipo: "Camión",
        conductor: "OVALLE MEJIA MANUEL OSCAR",
        conductorDni: "07705709",
        licencia: "Q07705709",
      },
    ]);
    expect(s.datos).toMatchObject({ tipo: "Camión", conductor: "OVALLE MEJIA MANUEL OSCAR", conductorDni: "07705709", licencia: "Q07705709" });
    expect(s.datos.placaRemolque).toBeUndefined();
  });

  it("no mezcla: el DNI de otro chofer no se pega al nombre encontrado", () => {
    const s = juntarLoDelSistema("AXQ871", [
      despacho("2026-08-08", { conductor: "JULIO PAREDES", conductorDni: "", licencia: "" }),
      despacho("2026-07-01", { conductor: "PEDRO RAMOS", conductorDni: "11111111", licencia: "Q11111111" }),
      despacho("2026-06-01", { conductor: "Julio  Paredes", conductorDni: "44120987", licencia: "" }),
    ]);
    expect(s.datos.conductor).toBe("JULIO PAREDES");
    expect(s.datos.conductorDni).toBe("44120987");
    expect(s.origen.conductorDni?.fecha).toBe("2026-06-01");
    expect(s.datos.licencia).toBeUndefined();
  });

  it("no cuenta otra placa, el remolque de otro camión ni lo fluvial", () => {
    const s = juntarLoDelSistema("AXQ871", [
      despacho("2026-08-08", { placa: "AXQ-872" }),
      despacho("2026-08-07", { placa: "W2D-853 / AXQ-871" }),
      despacho("2026-08-06", { modo: "fluvial" }),
    ]);
    expect(s.encontrado).toBe(false);
    expect(s.datos).toEqual({});
    expect(s.ultimaGuia).toBeNull();
  });

  it("el remolque sólo si es una placa que puede existir", () => {
    const s = juntarLoDelSistema("AXQ871", [
      despacho("2026-08-08", { placaRemolque: "-----" }),
      despacho("2026-08-07", { placaRemolque: "QA-45" }),
      despacho("2026-08-06", { placaRemolque: "t3a120" }),
    ]);
    expect(s.datos.placaRemolque).toBe("T3A-120");
    expect(s.origen.placaRemolque?.fecha).toBe("2026-08-06");
  });

  it("sin tipo de documento, lo deduce por los dígitos (11 = RUC)", () => {
    const s = juntarLoDelSistema("AXQ871", [despacho("2026-08-08", { transportistaDocTipo: null })]);
    expect(s.datos.transportistaDocTipo).toBe("RUC");
  });
});

describe("rellenarDesdePlaca — sólo lo vacío", () => {
  const sistema = juntarLoDelSistema("AXQ871", [despacho("2026-08-08")]);

  it("guía en blanco: llena todo lo que se encontró", () => {
    const r = rellenarDesdePlaca(vacia(), sistema, null);
    expect(r.vehiculo).toEqual({ tipo: "Camión", marca: "Volvo", conductor: "JULIO PAREDES", conductorDni: "44120987", licencia: "Q44120987" });
    expect(r.transportista).toEqual({ nombre: "Maderera San Martín SAC", docNumero: "20512345678", docTipo: "RUC" });
  });

  it("nunca pisa lo escrito", () => {
    const actual = vacia();
    actual.vehiculo.tipo = "Tráiler";
    actual.vehiculo.licencia = "A-I 123";
    const r = rellenarDesdePlaca(actual, sistema, null);
    expect(r.vehiculo.tipo).toBeUndefined();
    expect(r.vehiculo.licencia).toBeUndefined();
    expect(r.vehiculo.conductorDni).toBe("44120987");
  });

  it("otro chofer ya escrito: no le pega el DNI ni la licencia de JULIO", () => {
    const actual = vacia();
    actual.vehiculo.conductor = "PEDRO RAMOS";
    const r = rellenarDesdePlaca(actual, sistema, null);
    expect(r.vehiculo.conductor).toBeUndefined();
    expect(r.vehiculo.conductorDni).toBeUndefined();
    expect(r.vehiculo.licencia).toBeUndefined();
  });

  it("el MISMO chofer (otra escritura): sí completa su DNI", () => {
    const actual = vacia();
    actual.vehiculo.conductor = "Julio Paredes";
    const r = rellenarDesdePlaca(actual, sistema, null);
    expect(r.vehiculo.conductorDni).toBe("44120987");
  });

  it("otro transportista ya escrito: no le pega el RUC", () => {
    const actual = vacia();
    actual.transportista.nombre = "Transportes Ucayali EIRL";
    const r = rellenarDesdePlaca(actual, sistema, null);
    expect(r.transportista).toEqual({});
  });

  it("la marca de SUNARP sólo si el negocio no la tenía", () => {
    const externo = { placa: "AXQ871", marca: "VOLVO", modelo: "FH", color: "BLANCO", serie: null, motor: null, vin: null };
    const sinMarca = juntarLoDelSistema("AXQ871", [despacho("2026-08-08", { marca: "" })]);
    const r = rellenarDesdePlaca(vacia(), sinMarca, externo);
    expect(r.vehiculo.marca).toBe("VOLVO");
    expect(r.aplicados.find((a) => a.texto === "marca VOLVO")?.origen).toEqual({ fuente: "externo" });
    expect(rellenarDesdePlaca(vacia(), sistema, externo).vehiculo.marca).toBe("Volvo");
  });

  it("nada encontrado y nada externo: no toca nada", () => {
    const r = rellenarDesdePlaca(vacia(), juntarLoDelSistema("AXQ871", []), null);
    expect(r).toEqual({ vehiculo: {}, transportista: {}, aplicados: [] });
  });
});

describe("resumenDeRelleno", () => {
  it("una frase por origen, con su guía y su fecha", () => {
    const s = juntarLoDelSistema("W2D853", [
      { fuente: "guia_serfor", referencia: "019-001-0000004", fecha: "2026-08-15", placa: "W2D-853 / -", tipo: "Camión", conductor: "OVALLE MEJIA MANUEL OSCAR", conductorDni: "07705709" },
      { fuente: "directorio", referencia: null, fecha: null, placa: "W2D853", marca: "Volvo" },
    ]);
    const r = rellenarDesdePlaca(vacia(), s, null);
    expect(resumenDeRelleno(r.aplicados, (iso) => iso.split("-").reverse().slice(0, 2).join("/"))).toEqual([
      "De la guía de SERFOR 019-001-0000004 del 15/08: camión, conductor OVALLE MEJIA MANUEL OSCAR, DNI 07705709.",
      "Del Directorio: marca Volvo.",
    ]);
  });
});
