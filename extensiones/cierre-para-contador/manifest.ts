/**
 * Pieza `cierre-para-contador` — manifiesto (ADR-457).
 *
 * Una pestaña «A medida» con UN botón: el Excel del mes (ventas y gastos) con
 * las columnas que ese contador pidió. Las columnas y el nombre del contador
 * son opciones del negocio: dos negocios con contadores distintos reciben dos
 * Excel distintos sin tocar código.
 */
import { z } from "zod";
import type { ManifiestoPieza } from "../_contrato";
import { COLUMNAS_GASTOS, COLUMNAS_VENTAS, ROTULO_GASTO, ROTULO_VENTA } from "./columnas";

export const opcionesCierreParaContador = z
  .object({
    /** Para quién es el Excel; sale en el nombre del archivo y en la hoja «Resumen». */
    contador: z
      .string()
      .trim()
      .max(60)
      .default("")
      .meta({ title: "Nombre del contador", description: "Sale en el nombre del archivo. Puedes dejarlo vacío." }),
    /** Columnas de la hoja de ventas (salen en el orden de la lista de columnas). */
    columnasVentas: z
      .array(z.enum(COLUMNAS_VENTAS))
      .min(1)
      .max(COLUMNAS_VENTAS.length)
      .default(["fecha", "comprobante", "ruc", "pago", "total"])
      .meta({ title: "Columnas de ventas", description: "Las que pidió el contador.", "x-etiquetas": ROTULO_VENTA }),
    /** ¿Sumar la hoja de gastos del mes? */
    incluirGastos: z.boolean().default(true).meta({ title: "Incluir la hoja de gastos" }),
    /** Columnas de la hoja de gastos (salen en el orden de la lista de columnas). */
    columnasGastos: z
      .array(z.enum(COLUMNAS_GASTOS))
      .min(1)
      .max(COLUMNAS_GASTOS.length)
      .default(["fecha", "categoria", "proveedor", "ruc", "tipoDoc", "numeroDoc", "igv", "monto"])
      .meta({ title: "Columnas de gastos", "x-etiquetas": ROTULO_GASTO }),
  })
  .strict();

export type OpcionesCierreParaContador = z.output<typeof opcionesCierreParaContador>;

export const manifiesto = {
  id: "cierre-para-contador",
  nombre: "Cierre del mes para el contador",
  descripcion:
    "Agrega a la pestaña «A medida» un botón que baja el Excel del mes con las ventas y los gastos, " +
    "con las columnas que pida el contador de este negocio.",
  version: "1.0.0",
  enchufes: ["panel.pestana"],
  opciones: opcionesCierreParaContador,
} as const satisfies ManifiestoPieza<typeof opcionesCierreParaContador>;
