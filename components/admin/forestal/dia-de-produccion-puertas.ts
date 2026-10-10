/**
 * Las dos puertas de edición del modal del día (`CtpDiaDeProduccionModal`),
 * armadas desde la corrida y el paquete que trae `?resumenJornadas=1&paquetes=1`.
 *
 * No son formularios nuevos: son los datos que piden los dos editores que YA
 * existen, con sus reglas — la corrida (ADR-401, `CtpEditarLineaModal`) y la
 * escuadría del paquete (`CtpEscuadriaPaqueteModal`). «Productos disponibles»
 * arma los mismos objetos desde su fila; si uno de los dos editores suma un
 * campo, `tsc` lo pide en los dos lados.
 */

import type { CorridaDelDia, PaqueteDelDia } from "@/lib/forestal/piezas-del-dia";
import type { LineaEditable } from "./CtpEditarLineaModal";
import type { PaqueteAMedir } from "./CtpEscuadriaPaqueteModal";

/** Lo que pide el editor de la corrida (ADR-401), desde la corrida del día. */
export function lineaEditableDe(c: CorridaDelDia, especiesConocidas: string[]): LineaEditable {
  return {
    id: c.id,
    lineNo: c.lineNo,
    fecha: c.fecha,
    observations: c.observaciones,
    presentacion: c.presentacion,
    materiaPrimaRef: c.materiaPrimaRef,
    speciesCommon: c.especie,
    speciesScientific: c.especieCientifica,
    productType: c.producto,
    duenoMadera: c.duenoMadera,
    titularNombre: c.titularNombre,
    unit: c.unidad,
    quantity: c.cantidad,
    volumeInputM3: c.volumenConsumidoM3,
    atadaPorque: c.atadaPorque,
    permisos: c.permisos,
    gtfOrigen: c.gtfOrigen,
    especiesConocidas,
  };
}

/** Lo que pide la escuadría de un paquete, desde el paquete y su corrida. */
export function paqueteAMedirDe(c: CorridaDelDia, p: PaqueteDelDia): PaqueteAMedir {
  return {
    id: p.id,
    codigo: p.codigo,
    ctpEntryId: c.id,
    lineNo: c.lineNo,
    producto: p.producto ?? c.producto,
    especie: c.especie,
    cantidad: p.cantidad,
    volumenM3: p.volumenM3,
    espesorCm: p.espesorCm,
    anchoCm: p.anchoCm,
    largoM: p.largoM,
  };
}
