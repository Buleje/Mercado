/**
 * ctp-gtf-datos — el cuerpo de la Guía de Transporte Forestal de salida.
 *
 * ## Qué dice la norma (verificado contra fuente primaria)
 *
 * · **Ley 29763 art. 124** — la guía de transporte ampara la movilización, tiene
 *   **carácter de declaración jurada** y la emite el titular del derecho o el
 *   regente. El SERFOR fija el formato único.
 * · **D.S. 018-2015-MINAGRI art. 172** — emisores. Inciso **c)** el titular del
 *   centro de transformación, para el traslado de productos de transformación
 *   primaria, "debiendo consignarse los datos establecidos en el formato que
 *   aprueba el SERFOR". Inciso **d)** la ARFFS, a pedido del **propietario del
 *   producto que no sea el titular** del título habilitante ni del centro de
 *   transformación — por eso propietario y emisor son campos DISTINTOS.
 * · **RDE 122-2015-SERFOR-DE** — art. 3: Arial, **prenumerada**, papel **A4**,
 *   autocopiativo. Art. 4: el talonario se remite a la ARFFS, que **consigna una
 *   marca (visado)** en cada guía antes de usarla. Art. 5: se imprime **original
 *   + 2 copias**: el original viaja con el producto y se muestra en cada puesto
 *   de control; una copia queda en el primer puesto de control para el registro
 *   de la ARFFS; una copia la conserva el emisor.
 * · **RDE D000014-2024-MIDAGRI-SERFOR-DE** — formato vigente: mismas reglas de
 *   impresión + una hoja adicional para el **registro de control** y 4 anexos.
 *
 * ## Qué NO hace este módulo
 *
 * Los campos exactos del formato viven en los anexos gráficos de la RDE, que no
 * son legibles desde acá. Así que se capturan los datos que la norma NOMBRA y
 * los que la práctica exige en un puesto de control, y el documento se imprime
 * con las reglas formales verificadas — pero **no se presenta como el formato
 * oficial**: el original se llena sobre el talonario visado por la ARFFS. Un
 * papel que se hace pasar por el oficial es peor que ninguno.
 *
 * PURO: sin React, sin fetch, sin Prisma.
 */

import { z } from "zod";

// ── Esquema ─────────────────────────────────────────────────────────────────

const texto = (max: number) => z.string().trim().max(max);
const docTipo = z.enum(["RUC", "DNI", "CE", "PASAPORTE"]);

/** Una persona/empresa que interviene en el traslado. */
const parteSchema = z.object({
  nombre: texto(200).default(""),
  docTipo: docTipo.default("RUC"),
  docNumero: texto(20).default(""),
  direccion: texto(250).default(""),
});

export const gtfDatosSchema = z.object({
  /**
   * Dueño de la madera que viaja. Puede NO ser el CTP: el art. 172 inciso d)
   * contempla al propietario del producto que no es titular del centro.
   */
  propietario: parteSchema.extend({
    /** El CTP es el dueño (caso más común): se copia su identidad y se marca. */
    esElCtp: z.boolean().default(true),
  }).default({ nombre: "", docTipo: "RUC", docNumero: "", direccion: "", esElCtp: true }),

  /** A quién se le entrega el producto en destino. */
  destinatario: parteSchema.default({ nombre: "", docTipo: "RUC", docNumero: "", direccion: "" }),

  /** Empresa o persona que transporta. */
  transportista: parteSchema.extend({
    /** Registro del MTC, cuando es empresa de transporte. */
    registroMtc: texto(40).default(""),
  }).default({ nombre: "", docTipo: "RUC", docNumero: "", direccion: "", registroMtc: "" }),

  vehiculo: z.object({
    placa: texto(15).default(""),
    marca: texto(40).default(""),
    tipo: texto(40).default(""),
    /** Conductor y su brevete: es lo que pide el puesto de control. */
    conductor: texto(120).default(""),
    conductorDni: texto(15).default(""),
    licencia: texto(30).default(""),
  }).default({ placa: "", marca: "", tipo: "", conductor: "", conductorDni: "", licencia: "" }),

  traslado: z.object({
    /** De dónde sale (la planta, normalmente) y a dónde va. */
    puntoPartida: texto(250).default(""),
    puntoLlegada: texto(250).default(""),
    /** Ruta declarada: los puestos de control la cotejan. */
    ruta: texto(400).default(""),
    /** `YYYY-MM-DD`. Fecha de inicio del traslado y hasta cuándo vale la guía. */
    fechaInicio: texto(10).default(""),
    fechaFin: texto(10).default(""),
  }).default({ puntoPartida: "", puntoLlegada: "", ruta: "", fechaInicio: "", fechaFin: "" }),

  /**
   * Títulos habilitantes que amparan el origen de ESTE despacho. Se copian de la
   * Ficha del CTP pero se guardan en la guía: si mañana la ficha cambia, la guía
   * emitida tiene que seguir diciendo con qué título salió.
   */
  titulos: z.array(texto(80)).max(10).default([]),

  /** Permiso CITES cuando la especie lo requiere. */
  citesPermiso: texto(60).default(""),

  observaciones: texto(600).default(""),
});

export type GtfDatos = z.infer<typeof gtfDatosSchema>;

/** Los defaults del esquema, para arrancar un formulario vacío. */
export function gtfDatosVacio(): GtfDatos {
  return gtfDatosSchema.parse({});
}

/**
 * Lee lo guardado en la columna JSON con desconfianza: puede venir de una versión
 * anterior del formulario o estar a medio llenar. Nunca tira — devuelve los
 * defaults para lo que no entienda (un formulario que no abre es peor que uno
 * con un campo vacío).
 */
export function leerGtfDatos(raw: unknown): GtfDatos {
  const parsed = gtfDatosSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : gtfDatosVacio();
}

// ── Completitud ─────────────────────────────────────────────────────────────

export interface FaltanteGtf {
  /** Sección donde está el campo, para llevar al operador ahí. */
  seccion: "propietario" | "destinatario" | "transportista" | "vehiculo" | "traslado" | "titulos";
  campo: string;
  /** Por qué lo pide un puesto de control (no "es obligatorio"). */
  motivo: string;
}

/**
 * Qué le falta a la guía para poder viajar. No bloquea guardar (el operador llena
 * en dos ratos y a veces el transportista se define a última hora): bloquea
 * IMPRIMIR el original, que es el papel que se muestra en un puesto de control.
 *
 * Mismo criterio que el resto del libro: guardar admite huecos, el documento que
 * se presenta ante la autoridad no.
 */
export function faltantesGtf(d: GtfDatos): FaltanteGtf[] {
  const faltan: FaltanteGtf[] = [];

  if (!d.propietario.nombre.trim()) {
    faltan.push({
      seccion: "propietario",
      campo: "Propietario del producto",
      motivo: "La guía declara de quién es la madera que viaja",
    });
  }
  if (!d.destinatario.nombre.trim()) {
    faltan.push({
      seccion: "destinatario",
      campo: "Destinatario",
      motivo: "Sin destinatario no se puede verificar la entrega en el destino",
    });
  }
  if (!d.destinatario.direccion.trim()) {
    faltan.push({
      seccion: "destinatario",
      campo: "Dirección del destinatario",
      motivo: "Es el punto de llegada que cotejan los puestos de control",
    });
  }
  if (!d.transportista.nombre.trim()) {
    faltan.push({
      seccion: "transportista",
      campo: "Transportista",
      motivo: "Responde por el producto durante el traslado",
    });
  }
  if (!d.vehiculo.placa.trim()) {
    faltan.push({
      seccion: "vehiculo",
      campo: "Placa del vehículo",
      motivo: "Es lo primero que compara un puesto de control con la carga",
    });
  }
  if (!d.vehiculo.conductor.trim()) {
    faltan.push({
      seccion: "vehiculo",
      campo: "Conductor",
      motivo: "La guía viaja con él y la muestra en cada control",
    });
  }
  if (!d.traslado.puntoPartida.trim() || !d.traslado.puntoLlegada.trim()) {
    faltan.push({
      seccion: "traslado",
      campo: "Punto de partida y de llegada",
      motivo: "Definen la ruta que se está autorizando",
    });
  }
  if (!d.traslado.fechaInicio.trim()) {
    faltan.push({
      seccion: "traslado",
      campo: "Fecha de inicio del traslado",
      motivo: "Sin fecha no se puede saber si la guía está vigente",
    });
  }
  if (d.titulos.filter((t) => t.trim()).length === 0) {
    faltan.push({
      seccion: "titulos",
      campo: "Título habilitante",
      motivo: "Es lo que acredita el origen legal de la madera",
    });
  }
  return faltan;
}

/** `true` cuando la guía puede imprimirse como original. */
export const gtfCompleta = (d: GtfDatos): boolean => faltantesGtf(d).length === 0;

/**
 * ¿Está vigente el traslado al día `hoy`? Sin `fechaFin` no se juzga (la vigencia
 * la fija la ARFFS por ruta y distancia; el módulo no la inventa).
 */
export function trasladoVigente(d: GtfDatos, hoy: Date): boolean | null {
  const fin = d.traslado.fechaFin.trim();
  if (!fin) return null;
  const f = new Date(`${fin}T23:59:59.999Z`);
  if (Number.isNaN(f.getTime())) return null;
  return f.getTime() >= Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
}

/**
 * Las tres impresiones que manda el art. 5 de la RDE 122-2015, con su destino.
 * Van en el pie de cada copia: sin eso, tres papeles iguales no le dicen a nadie
 * cuál se queda en el puesto de control.
 */
export const COPIAS_GTF = [
  { clave: "original", titulo: "ORIGINAL", destino: "Acompaña el transporte · se muestra en cada puesto de control" },
  { clave: "control", titulo: "COPIA 1", destino: "Se entrega en el primer puesto de control (registro ARFFS)" },
  { clave: "emisor", titulo: "COPIA 2", destino: "La conserva el emisor para el control posterior" },
] as const;
