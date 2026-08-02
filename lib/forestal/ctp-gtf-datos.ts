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
  /**
   * Ubicación de la parte — casilleros (17)(18)(19) del propietario y
   * (26)(27)(28) del destinatario.
   *
   * Va desarmada y no dentro de `direccion` porque el formato tiene un casillero
   * por cada una: un puesto de control pide "el (27)", y una dirección que dice
   * "Jr. X, Puerto Bermúdez, Oxapampa, Pasco" obliga a leerla entera para
   * contestar. El directorio ya las guarda separadas — hasta ahora la guía las
   * aplanaba al elegir una parte y el dato se perdía.
   */
  departamento: texto(80).default(""),
  provincia: texto(80).default(""),
  distrito: texto(80).default(""),
});

/** Parte en blanco. Centralizado: repetir el literal en cada `.default()` hizo
 *  que agregar la ubicación rompiera el tipo en tres lugares a la vez. */
const PARTE_VACIA = {
  nombre: "", docTipo: "RUC" as const, docNumero: "", direccion: "",
  departamento: "", provincia: "", distrito: "",
};

export const gtfDatosSchema = z.object({
  /**
   * Dueño de la madera que viaja. Puede NO ser el CTP: el art. 172 inciso d)
   * contempla al propietario del producto que no es titular del centro.
   */
  propietario: parteSchema.extend({
    /** El CTP es el dueño (caso más común): se copia su identidad y se marca. */
    esElCtp: z.boolean().default(true),
  }).default({ ...PARTE_VACIA, esElCtp: true }),

  /** A quién se le entrega el producto en destino. */
  destinatario: parteSchema.default({ ...PARTE_VACIA }),

  /** Empresa o persona que transporta. */
  transportista: parteSchema.extend({
    /** Registro del MTC, cuando es empresa de transporte. */
    registroMtc: texto(40).default(""),
  }).default({ ...PARTE_VACIA, registroMtc: "" }),

  vehiculo: z.object({
    /**
     * Cómo viaja la madera. En la selva central NO es un detalle: buena parte
     * sale por río, y una guía fluvial no lleva placa sino matrícula de
     * embarcación. Un puesto de control fluvial pide otra cosa que uno de
     * carretera, y el formulario tiene que pedir lo que corresponde.
     */
    modo: z.enum(["terrestre", "fluvial", "multimodal"]).default("terrestre"),
    /** Placa del camión o MATRÍCULA de la embarcación, según el modo. */
    placa: texto(15).default(""),
    marca: texto(40).default(""),
    tipo: texto(40).default(""),
    /** Nombre de la embarcación / chata. Sólo aplica cuando viaja por río. */
    embarcacion: texto(80).default(""),
    /** Conductor y su brevete: es lo que pide el puesto de control. */
    conductor: texto(120).default(""),
    conductorDni: texto(15).default(""),
    licencia: texto(30).default(""),
  }).default({ modo: "terrestre", placa: "", marca: "", tipo: "", embarcacion: "", conductor: "", conductorDni: "", licencia: "" }),

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

  /**
   * El comprobante que ampara la VENTA de esta madera. La GTF ampara el
   * traslado; la factura, la operación. Van juntas en el control y hasta ahora
   * el número de la factura sólo vivía en observaciones.
   */
  comprobante: z.object({
    tipo: z.enum(["ninguno", "factura", "boleta", "guia_remision", "otro"]).default("ninguno"),
    numero: texto(40).default(""),
  }).default({ tipo: "ninguno", numero: "" }),

  observaciones: texto(600).default(""),
});

export type GtfDatos = z.infer<typeof gtfDatosSchema>;

/**
 * Los defaults del esquema, para arrancar un formulario vacío.
 *
 * `safeParse` y no `parse`, aunque la entrada sea un literal: si algún día se
 * agrega un campo requerido sin default, `.parse()` tiraría en tiempo de render
 * y rompería el formulario entero. Así devuelve el objeto vacío y el operador
 * ve un formulario en blanco en vez de una pantalla rota.
 */
export function gtfDatosVacio(): GtfDatos {
  const r = gtfDatosSchema.safeParse({});
  return r.success ? r.data : ({} as GtfDatos);
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
  // Cada modo pide lo suyo: un control fluvial no busca una placa, busca la
  // matrícula y el nombre de la embarcación. Pedir "placa" en una balsa haría
  // que el operador invente un dato para poder imprimir.
  const fluvial = d.vehiculo.modo === "fluvial";
  if (!d.vehiculo.placa.trim()) {
    faltan.push({
      seccion: "vehiculo",
      campo: fluvial ? "Matrícula de la embarcación" : "Placa del vehículo",
      motivo: "Es lo primero que compara un puesto de control con la carga",
    });
  }
  if (fluvial && !d.vehiculo.embarcacion.trim()) {
    faltan.push({
      seccion: "vehiculo",
      campo: "Nombre de la embarcación",
      motivo: "Es como se identifica la nave en el control fluvial",
    });
  }
  if (!d.vehiculo.conductor.trim()) {
    faltan.push({
      seccion: "vehiculo",
      campo: fluvial ? "Patrón de la embarcación" : "Conductor",
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
