/**
 * Esquemas Zod de «Importar guías ya despachadas» (ADR-461): los dos POST
 * los comparten. Lo que manda el navegador se valida acá; la ficha de una foto
 * o PDF entra con tope de largo en cada texto y de cantidad en cada lista.
 *
 * PURO y client-safe.
 */
import { z } from "zod";
import type { GtfSerfor } from "./serfor-gtf";
import { motivoSchema } from "./motivo";
import { IMPORTAR_GUIAS_MAX, IMPORTAR_GUIAS_POR_PEDIDO, IMPORTAR_SERFOR_POR_PEDIDO } from "./loth-importar-guia-tipos";

/** Texto opcional de la ficha: vacío o ausente = `null`. */
const t = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v == null || v.trim() === "" ? null : v.trim()));

const cifra = z.number().finite().min(0).max(100_000).nullable().optional().transform((v) => v ?? null);

const productoSchema = z.object({
  cientifico: t(200),
  comun: t(200),
  tipoProducto: t(120),
  presentacion: t(120),
  cantidad: cifra,
  unidad: t(40),
  volumen: cifra,
});

const trozaSchema = productoSchema.extend({
  codificacion: t(60),
  dimensiones: t(80),
});

/** La ficha de una guía (la forma de `GtfSerfor`), con topes. */
export const fichaGtfSchema = z
  .object({
    numeroRegistro: z.string().trim().max(40).default(""),
    gtfNumber: t(60),
    estado: t(60),
    registradoPor: t(200),
    fechaRegistro: t(40),
    fechaExpedicion: t(40),
    fechaVencimiento: t(40),
    origenRecurso: t(80),
    numeroTitulo: t(120),
    titular: t(250),
    direccionTitular: t(300),
    numeroResolucion: t(160),
    representanteLegal: t(250),
    departamento: t(80),
    provincia: t(80),
    distrito: t(80),
    rucInstancia: t(20),
    instanciaRegistra: t(200),
    propietario: t(250),
    propietarioDoc: t(60),
    propietarioDireccion: t(300),
    propietarioDepartamento: t(80),
    propietarioProvincia: t(80),
    propietarioDistrito: t(80),
    destinatario: t(250),
    destinatarioDoc: t(60),
    destinatarioDireccion: t(300),
    destinatarioDepartamento: t(80),
    destinatarioProvincia: t(80),
    destinatarioDistrito: t(80),
    transportista: t(250),
    transportistaDni: t(30),
    licenciaConducir: t(40),
    guiaRemision: t(60),
    tipoTransporte: t(60),
    tipoVehiculo: t(80),
    placa: t(30),
    listaTrozas: t(80),
    productos: z.array(productoSchema).max(100).default([]),
    trozas: z.array(trozaSchema).max(500, "Una guía trae hasta 500 trozas").default([]),
    volumenTotal: cifra,
    campos: z.record(z.string().max(120), z.string().max(2000)).optional().transform((v) => v ?? {}),
  })
  .transform((f) => f as GtfSerfor);

export const fuenteImportarSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("serfor"), numeroRegistro: z.string().trim().min(1, "Falta el N° de registro").max(30) }),
  z.object({ tipo: z.literal("ctp"), woodEntryId: z.string().trim().min(1).max(64) }),
  z.object({ tipo: z.literal("ficha"), ficha: fichaGtfSchema }),
]);

const textoPlan = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));

export const planNuevoSchema = z.object({
  planType: z.enum(["PLANTACION", "DEMA", "PMFI", "PO"]),
  planNumber: textoPlan(120),
  tituloHabilitante: textoPlan(120),
  titularName: z.string().trim().min(1, "Falta el titular del permiso").max(200),
  representanteLegal: textoPlan(200),
  resolucionNumber: textoPlan(160),
  region: textoPlan(80),
  provincia: textoPlan(80),
  distrito: textoPlan(80),
  arffs: textoPlan(200),
  contratoId: textoPlan(64),
});

export const planDestinoSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("existente"), planId: z.string().trim().min(1).max(64) }),
  z.object({ tipo: z.literal("nuevo"), plan: planNuevoSchema }),
]);

/** Cuántas fuentes de un pedido salen a SERFOR (las de N° de registro). */
export const consultasSerforDe = (fuentes: readonly { tipo: string }[]): number => fuentes.filter((f) => f.tipo === "serfor").length;

const mensajeTopeSerfor = `Hasta ${IMPORTAR_SERFOR_POR_PEDIDO} N° de registro por vez: cada uno es una consulta a SERFOR.`;

export const pedidoVistaPreviaSchema = z
  .object({
    fuentes: z.array(fuenteImportarSchema).min(1, "Elige al menos una guía").max(IMPORTAR_GUIAS_MAX, `Hasta ${IMPORTAR_GUIAS_MAX} guías por vista previa`),
    planes: z.array(z.string().trim().max(64).nullable()).max(IMPORTAR_GUIAS_MAX).optional(),
  })
  .refine((p) => consultasSerforDe(p.fuentes) <= IMPORTAR_SERFOR_POR_PEDIDO, { message: mensajeTopeSerfor, path: ["fuentes"] });

/**
 * Qué guardar en el directorio (02-10 noche). El navegador sólo dice QUÉ y,
 * al agregar, el nombre y el documento corregidos: los datos los vuelve a
 * sacar el servidor de la ficha, y vuelve a mirar el directorio antes de escribir.
 */
const accionDirectorio = z.enum(["agregar", "completar"]);
export const pedidoDirectorioSchema = z.object({
  partes: z
    .array(
      z.object({
        clave: z.enum(["titular", "propietario", "destinatario", "transportista"]),
        accion: accionDirectorio,
        nombre: z.string().trim().max(200).optional(),
        docTipo: z.enum(["RUC", "DNI"]).nullable().optional(),
        docNumero: z.string().trim().max(20).nullable().optional(),
      }),
    )
    .max(4)
    .default([]),
  vehiculo: z.object({ accion: accionDirectorio, placa: z.string().trim().max(15).optional() }).nullable().optional(),
  permiso: z.object({ accion: accionDirectorio }).nullable().optional(),
});

export const pedidoImportarSchema = z.object({
  items: z
    .array(
      z.object({
        fuente: fuenteImportarSchema,
        planDestino: planDestinoSchema,
        crearTala: z.boolean(),
        directorio: pedidoDirectorioSchema.optional(),
      }),
    )
    .min(1, "Elige al menos una guía")
    .max(IMPORTAR_GUIAS_POR_PEDIDO, `Hasta ${IMPORTAR_GUIAS_POR_PEDIDO} guías por pedido: mándalas de a pocas`),
});

/** `POST …/importar-guia/deshacer`: la guía (id del Libro TH) y el motivo, que queda en el libro. */
export const pedidoDeshacerSchema = z.object({
  gtfId: z.string().trim().min(1, "Falta la guía").max(64),
  motivo: motivoSchema({ max: 400, mensaje: "Escribe por qué se deshace (al menos 3 letras)." }),
});
