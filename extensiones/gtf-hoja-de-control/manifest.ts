/**
 * Pieza `gtf-hoja-de-control` — manifiesto (ADR-457).
 *
 * Una 4ª hoja INTERNA que sale con la guía de salida: lo que dice la guía al
 * lado de un casillero en blanco para lo que se vio al cargar, la lista de
 * verificaciones del patio y las firmas. No es parte de la GTF ni se entrega en
 * un puesto de control: lo dice en la propia hoja.
 */
import { z } from "zod";
import type { ManifiestoPieza } from "../_contrato";

const texto = (max: number) => z.string().trim().min(1).max(max);

export const opcionesHojaDeControl = z
  .object({
    /** Título de la hoja. */
    titulo: texto(80).default("Hoja de control del despacho"),
    /** Quiénes firman, en orden (1 a 4 recuadros). */
    firmas: z.array(texto(40)).min(1).max(4).default(["Encargado del patio", "Conductor", "Vigilancia"]),
    /** Lo que se marca antes de que el camión salga (0 a 8 renglones). */
    verificaciones: z
      .array(texto(90))
      .max(8)
      .default([
        "La placa del vehículo coincide con la guía",
        "Se contaron las piezas cargadas",
        "La carga va amarrada y cubierta",
        "El conductor lleva el original de la guía",
      ]),
    /** Mostrar las GTF de ingreso de la madera (cadena de custodia). */
    mostrarOrigen: z.boolean().default(true),
    /** Una nota fija al pie de la hoja (p. ej. «Avisar al dueño antes de salir»). */
    nota: z.string().trim().max(240).default(""),
  })
  .strict();

export type OpcionesHojaDeControl = z.output<typeof opcionesHojaDeControl>;

export const manifiesto = {
  id: "gtf-hoja-de-control",
  nombre: "Hoja de control del despacho",
  descripcion:
    "Suma a la guía de salida una hoja interna para el patio: lo que dice la guía, un casillero para lo que se cargó, " +
    "las verificaciones antes de salir y las firmas. No es parte de la guía oficial.",
  version: "1.0.0",
  enchufes: ["forestal.guia-impresa"],
  opciones: opcionesHojaDeControl,
  rubros: ["madereria"],
  requiere: ["spec:forestal:ctp-libro"],
} as const satisfies ManifiestoPieza<typeof opcionesHojaDeControl>;
