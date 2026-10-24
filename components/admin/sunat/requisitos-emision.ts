/**
 * Qué pasa al emitir un comprobante, dicho ANTES de confirmar (auditoría de
 * comprobantes F01/F02/F03/M54, 17-10).
 *
 * Con el modo oficial apagado `generate-invoice` responde 403 y no crea nada:
 * la pantalla decía «lo que emites queda como comprobante interno», y era falso.
 * Acá vive la única lectura del estado para la línea SUNAT y para la ventana de
 * emisión: tres requisitos distintos (sin repetir el mismo concepto como hacían
 * los bloqueos, donde `sin_config` arrastraba a los otros dos) y el modo.
 */
import type { SunatModoOficialState } from "@/lib/sunat/modo-oficial.types";

export interface RequisitoEmision {
  id: "ruc" | "conexion" | "activado";
  etiqueta: string;
  ok: boolean;
  /** Qué hacer para cumplirlo, en una frase. */
  queHacer: string;
}

export function requisitosDeEmision(estado: SunatModoOficialState): RequisitoEmision[] {
  const sinConfig = estado.bloqueos.includes("sin_config");
  return [
    {
      id: "ruc",
      etiqueta: "RUC del negocio activo y habido",
      ok: !sinConfig && !estado.bloqueos.includes("ruc_invalido"),
      queHacer: "Cárgalo y verifícalo en Configuración › Cobros y comprobantes.",
    },
    {
      id: "conexion",
      etiqueta: "Conexión con el facturador (Nubefact)",
      ok: !sinConfig && !estado.bloqueos.includes("sin_token"),
      queHacer: "Pega el token de Nubefact en Configuración › Cobros y comprobantes.",
    },
    {
      id: "activado",
      etiqueta: "Modo oficial activado por soporte",
      ok: estado.enabled,
      queHacer: "Con lo anterior listo, pídeselo a soporte de Buleje.",
    },
  ];
}

export type ModoEmision = "produccion" | "prueba" | "apagado" | "desconocido";

export interface LecturaModo {
  modo: ModoEmision;
  /** Se puede confirmar: con el modo apagado el servidor rechaza, así que ni se ofrece. */
  puedeEmitir: boolean;
  /** Título de la ventana. */
  titulo: string;
  /** Rótulo del botón que confirma. */
  accion: string;
  /** La frase que se lee antes de confirmar: qué se crea y qué vale. */
  aviso: string;
  tono: "ok" | "aviso" | "neutro";
}

/** `null` = no se pudo leer el estado: se deja confirmar y el servidor decide (y lo dice). */
export function modoDeEmision(estado: SunatModoOficialState | null): LecturaModo {
  if (estado === null) {
    return {
      modo: "desconocido",
      puedeEmitir: true,
      titulo: "Emitir comprobante",
      accion: "Emitir comprobante",
      aviso: "No pudimos leer el estado de SUNAT: al confirmar, el sistema lo revisa y te dice qué pasó.",
      tono: "neutro",
    };
  }
  if (!estado.enabled) {
    return {
      modo: "apagado",
      puedeEmitir: false,
      titulo: "Emitir comprobante electrónico",
      accion: "Emitir comprobante",
      aviso: "Hoy no se emiten comprobantes electrónicos: no se crea nada y tus ventas siguen con su ticket interno.",
      tono: "aviso",
    };
  }
  if (estado.ambiente === "beta") {
    return {
      modo: "prueba",
      puedeEmitir: true,
      titulo: "Emitir comprobante de prueba",
      accion: "Enviar de prueba",
      aviso: "Ambiente de prueba: el comprobante va al facturador de prueba y no vale ante SUNAT.",
      tono: "aviso",
    };
  }
  return {
    modo: "produccion",
    puedeEmitir: true,
    titulo: "Emitir comprobante electrónico",
    accion: "Emitir y enviar a SUNAT",
    aviso: "Comprobante oficial: viaja a SUNAT y no se borra; si sale mal, se corrige con una nota de crédito.",
    tono: "ok",
  };
}
