/**
 * Qué parte del depósito no se puede certificar, y por qué.
 *
 * Lo que se protege: los dos motivos se distinguen por los datos que ya viajan
 * en la corrida (`gtfOrigen` vacío = sin materia prima; con guía pero sin título
 * = el ingreso no lo declara); el pie tablar no se inventa en otra unidad; y el
 * lote referido dice si tiene piezas libres para atar.
 */

import { describe, expect, it } from "vitest";
import { diagnosticar, resumenDeOrigen } from "@/lib/forestal/origen-incompleto";
import type { CorridaDisponible, LoteDeCapacidad } from "@/lib/forestal/capacidad-de-planta";
import { casillerosCambiados } from "@/lib/db/wood-entries.db";
import { leerGtfDatos } from "@/lib/forestal/ctp-gtf-datos";

const corrida = (o: Partial<CorridaDisponible> & { id: string }): CorridaDisponible => ({
  fecha: "2026-08-01",
  lote: "L-1",
  producto: "ASERRADA",
  especie: "TORNILLO",
  unidad: "m3",
  disponible: 5,
  titularOrigen: [],
  gtfOrigen: [],
  paquetes: [],
  ...o,
});

const lote = (code: string, trozas: { consumida: boolean; m3: number }[]): LoteDeCapacidad => ({
  id: code,
  code,
  permisos: [],
  especie: "TORNILLO",
  status: "abierto",
  consumidoM3: 0,
  esperado56M3: 0,
  producidoM3: 0,
  restaM3: 0,
  apartadoM3: 0,
  piezas: trozas.length,
  trozas: trozas.map((t, i) => ({ id: `${code}-${i}`, codigo: `T${i}`, especie: "TORNILLO", permiso: "", guia: "", ...t })),
});

describe("diagnóstico de una corrida", () => {
  it("con título habilitante no hay nada que diagnosticar", () => {
    expect(diagnosticar(corrida({ id: "ok", titularOrigen: ["P-1"], gtfOrigen: ["G-1"] }), [])).toBeNull();
  });

  it("sin ninguna guía = sin materia prima atada", () => {
    expect(diagnosticar(corrida({ id: "a" }), [])?.motivo).toBe("sin_materia_prima");
  });

  it("con guía pero sin título = el ingreso no lo declara", () => {
    const d = diagnosticar(corrida({ id: "b", gtfOrigen: ["G-9"] }), []);
    expect(d?.motivo).toBe("ingreso_sin_titulo");
    expect(d?.guias).toEqual(["G-9"]);
  });

  it("el pie tablar sólo existe en m³", () => {
    expect(diagnosticar(corrida({ id: "c", disponible: 2 }), [])?.pt).toBe(848);
    expect(diagnosticar(corrida({ id: "d", unidad: "pt", disponible: 400 }), [])?.pt).toBeNull();
  });

  it("dice si el lote referido tiene piezas libres para atar", () => {
    const lotes = [lote("L-1", [{ consumida: false, m3: 1.5 }, { consumida: true, m3: 2 }])];
    const d = diagnosticar(corrida({ id: "e", lote: "L-1" }), lotes);
    expect(d).toMatchObject({ piezasLibresDelLote: 1, m3LibresDelLote: 1.5 });
  });

  it("una corrida agotada no cuenta", () => {
    expect(diagnosticar(corrida({ id: "f", disponible: 0 }), [])).toBeNull();
  });
});

describe("el resumen", () => {
  it("suma sólo m³ y da la fracción sobre lo disponible", () => {
    const r = resumenDeOrigen([
      corrida({ id: "1", disponible: 6 }),
      corrida({ id: "2", disponible: 4, titularOrigen: ["P-1"], gtfOrigen: ["G-1"] }),
      corrida({ id: "3", disponible: 100, unidad: "pt" }),
    ]);
    expect(r.m3SinCertificar).toBe(6);
    expect(r.fraccion).toBe(0.6);
    expect(r.corridas.map((c) => c.id)).toEqual(["1", "3"]);
    expect(r.porMotivo.sin_materia_prima).toEqual({ corridas: 2, m3: 6 });
  });
});

describe("procedencia de los casilleros del cuerpo de la guía", () => {
  it("anota sólo las rutas que cambiaron, no el bloque entero", () => {
    const antes = { propietario: { nombre: "JUAN", docNumero: "1" }, vehiculo: { placa: "ABC" } };
    const despues = { propietario: { nombre: "JUAN", docNumero: "2" }, vehiculo: { placa: "ABC" }, destinatario: { nombre: "EL CTP" } };
    expect(casillerosCambiados(antes, despues).sort()).toEqual(["destinatario.nombre", "propietario.docNumero"]);
  });

  it("vacío y ausente son lo mismo; el orden de las claves no es un cambio", () => {
    expect(casillerosCambiados({ a: { x: "", y: "1" } }, { a: { y: "1", x: null } })).toEqual([]);
  });
});

describe("los defaults del schema no cuentan como escritos a mano", () => {
  it("tipear sólo el nombre del propietario marca UNA ruta, no doce", () => {
    const antes = leerGtfDatos(null);
    const despues = leerGtfDatos({ propietario: { nombre: "TITULAR S.A.C." } });
    expect(casillerosCambiados(antes, despues)).toEqual(["propietario.nombre"]);
  });
});
