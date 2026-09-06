"use client";

/**
 * loth-gtf-oficial — la guía del título habilitante, en la hoja de casilleros.
 *
 * La misma empresa emitía guías de dos calidades: el Libro CTP imprime el
 * formato oficial con casilleros (ADR-338, RDE 122-2015-SERFOR-DE) y el Libro TH
 * imprimía un HTML propio rotulado «no oficial» — justo la guía que ampara la
 * salida **del bosque**, que es la que más se controla en ruta.
 *
 * Esto no duplica el formato: adapta los datos del LO-TH a los tipos que ya
 * consume `ctp-gtf-formato` y reusa su cuerpo y su CSS. Si el formato cambia,
 * cambia para los dos libros a la vez.
 */

import { CSS_GTF_OFICIAL, cuerpoGtfOficial, type LineaProducto } from "./ctp-gtf-formato";
import { gtfDatosVacio, type GtfDatos } from "./ctp-gtf-datos";
import type { CtpFicha } from "./ctp-ficha-types";

/** Un ítem de la guía del LO-TH, tal como lo guarda la columna JSON. */
export interface LothGtfItem {
  code?: string | null;
  species?: string | null;
  scientific?: string | null;
  productType?: string | null;
  pieces?: number | null;
  volumeM3?: number | string | null;
  diamMayorM?: number | string | null;
  diamMenorM?: number | string | null;
  lengthM?: number | string | null;
}

export interface LothGtfDoc {
  gtfNumber: string;
  gtfDate: string | null;
  tipo: string;
  titularName: string | null;
  tituloHabilitante: string | null;
  parcelaCorta: string | null;
  transportista: string | null;
  transportistaDoc: string | null;
  conductor: string | null;
  conductorLicencia: string | null;
  placaVehiculo: string | null;
  origen: string | null;
  destino: string | null;
  observations: string | null;
  status: string;
  annulledReason: string | null;
  volumenTotalM3: string | number | null;
  items: LothGtfItem[] | null;
}

export interface LothGtfCaratula {
  titularName?: string | null;
  tituloHabilitante?: string | null;
  registroNumber?: string | null;
  ruc?: string | null;
  direccion?: string | null;
  departamento?: string | null;
  provincia?: string | null;
  distrito?: string | null;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Las líneas del detalle (37).
 *
 * Ojo con lo que el dato REALMENTE trae: los ítems del LO-TH suelen declarar
 * `pieces` y `productType` y **no** las medidas por troza. El formato viejo
 * imprimía cuatro columnas de diámetros vacías y escondía las piezas y el tipo
 * de producto, que era lo único que había.
 */
export function lineasDeGtf(doc: LothGtfDoc): LineaProducto[] {
  const items = doc.items ?? [];
  if (items.length === 0) {
    return [
      {
        cientifico: "",
        comun: "",
        tipoProducto: doc.tipo === "producto" ? "Producto terminado" : "Trozas",
        presentacion: "",
        cantidad: 0,
        unidad: "m³",
        total: num(doc.volumenTotalM3),
      },
    ];
  }
  return items.map((it) => ({
    cientifico: it.scientific ?? "",
    comun: it.species ?? "",
    tipoProducto: it.productType ?? (doc.tipo === "producto" ? "Producto terminado" : "Troza"),
    // La presentación del formato: el código de la pieza cuando existe.
    presentacion: it.code ?? "",
    cantidad: it.pieces ?? 1,
    unidad: "m³",
    total: num(it.volumeM3),
  }));
}

/** Los códigos de troza que ampara la guía — casillero (35). */
export function listasTrozasDe(doc: LothGtfDoc): string {
  const codes = (doc.items ?? []).map((i) => i.code).filter((c): c is string => !!c);
  return codes.join(", ");
}

/**
 * Mapea la identidad del título habilitante a la «ficha» que espera el formato.
 * El LO-TH no tiene ficha de CTP: su identidad es la carátula del libro más el
 * título, y eso es exactamente lo que piden los casilleros (6) y (7).
 */
export function fichaDesdeCaratula(caratula: LothGtfCaratula | null, doc: LothGtfDoc): CtpFicha {
  const razonSocial = caratula?.titularName ?? doc.titularName ?? "";
  const codigoTitulo = doc.tituloHabilitante ?? caratula?.tituloHabilitante ?? "";
  return {
    razonSocial,
    ruc: caratula?.ruc ?? "",
    direccion: caratula?.direccion ?? "",
    departamento: caratula?.departamento ?? "",
    provincia: caratula?.provincia ?? "",
    distrito: caratula?.distrito ?? "",
    titulos: codigoTitulo ? [{ codigo: codigoTitulo, tipo: "concesion" }] : [],
  } as unknown as CtpFicha;
}

/** Vuelca los datos de transporte de la guía del TH al esquema del formato. */
export function datosDesdeGtf(doc: LothGtfDoc): GtfDatos {
  const base = gtfDatosVacio();
  return {
    ...base,
    propietario: { ...base.propietario, nombre: doc.titularName ?? "", esElCtp: false },
    destinatario: { ...base.destinatario, nombre: doc.destino ?? "" },
    transportista: {
      ...base.transportista,
      nombre: doc.transportista ?? "",
      documento: doc.transportistaDoc ?? "",
    },
    vehiculo: {
      ...base.vehiculo,
      placa: doc.placaVehiculo ?? "",
      conductor: doc.conductor ?? "",
      licencia: doc.conductorLicencia ?? "",
    },
    traslado: {
      ...base.traslado,
      origen: doc.origen ?? "",
      destino: doc.destino ?? "",
    },
  } as GtfDatos;
}

export interface DocumentoGtfLoth {
  cuerpo: string;
  css: string;
  titulo: string;
}

/**
 * Arma la guía del título habilitante con la hoja oficial.
 *
 * Devuelve el documento en vez de abrir una ventana: quien llama decide si lo
 * muestra en el visor o lo manda a imprimir (misma decisión que tomó el CTP
 * cuando el pop-up disparaba el diálogo del sistema antes de poder mirar nada).
 */
export function documentoGtfLoth(doc: LothGtfDoc, caratula: LothGtfCaratula | null): DocumentoGtfLoth {
  const cuerpo = cuerpoGtfOficial({
    ficha: fichaDesdeCaratula(caratula, doc),
    datos: datosDesdeGtf(doc),
    lineas: lineasDeGtf(doc),
    numeroGtf: doc.gtfNumber,
    fechaExpedicion: (doc.gtfDate ?? "").slice(0, 10),
    listasTrozas: listasTrozasDe(doc),
    // La guía del título habilitante ampara madera que sale del BOSQUE: no hay
    // guía de origen previa que citar, a diferencia de la del CTP.
    gtfOrigen: "",
    registroSerfor: "",
  });
  return {
    cuerpo,
    css: CSS_GTF_OFICIAL,
    titulo: `GTF ${doc.gtfNumber}`,
  };
}
