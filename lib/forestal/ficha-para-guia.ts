/**
 * ficha-para-guia — qué le falta a la Ficha del CTP para que la guía de
 * transporte forestal de salida se pueda emitir, y con qué consecuencia.
 *
 * ## Por qué existe
 *
 * La pared del despacho se descubría al final. El operador cargaba la guía
 * entera —productos, destinatario, transportista, placa— y recién al apretar
 * «Emitir GTF» el servidor contestaba `serie_no_configurada`
 * (`ForestCtpDespachoDB.emitirGtf`): sin `gtfSerie` en la Ficha no hay número
 * que asignar, así que la guía se queda sin el casillero (4) y el camión sin
 * papel. Y aunque la serie estuviera, con la Ficha vacía el documento sale
 * **anónimo**: no dice qué centro lo emitió ni con qué RUC.
 *
 * Esto es lo que mira el aviso que aparece ARRIBA del formulario de la guía,
 * antes de cargar nada. `avisosDeFicha` (en `ctp-ficha-types`) es el panel
 * completo de la Ficha —títulos vencidos, CITES, RUC que no pasa SUNAT—; esto
 * es el subconjunto que frena UN despacho, con el motivo dicho en la
 * consecuencia y no en la regla.
 *
 * PURO: sin React, sin fetch, sin Prisma.
 */

import { CTP_FICHA_LABELS, type CtpFicha } from "./ctp-ficha-types";

/**
 * Qué tan grave es que falte.
 *
 * · `numero`    — la guía no se puede numerar. Es la pared dura.
 * · `identidad` — se numera, pero el papel no dice quién lo emitió.
 * · `casillero` — sale con ese casillero del formato en blanco.
 *
 * El orden del tipo es el orden en que se muestran: lo que frena primero.
 */
export type GravedadFicha = "numero" | "identidad" | "casillero";

const ORDEN: Record<GravedadFicha, number> = { numero: 0, identidad: 1, casillero: 2 };

/**
 * Los campos de la Ficha que la guía consume y que se pueden cargar de un
 * renglón. Deliberadamente NO incluye títulos habilitantes, permisos CITES ni
 * logo: son listas y una imagen, se cargan en la pestaña Ficha del CTP. El
 * título que ampara ESTE viaje ya se elige en el propio formulario de la guía.
 */
export const CAMPOS_FICHA_EN_GUIA = [
  "gtfSerie",
  "ruc",
  "razonSocial",
  "nombreCtp",
  "codigoCtp",
  "representante",
  "arffs",
  "direccion",
  "region",
  "provincia",
  "distrito",
] as const;

export type CampoFichaEnGuia = (typeof CAMPOS_FICHA_EN_GUIA)[number];

/** Qué pasa si ese campo sale vacío. La consecuencia, no la norma. */
const CONSECUENCIA: Record<CampoFichaEnGuia, { gravedad: GravedadFicha; motivo: string }> = {
  gtfSerie: {
    gravedad: "numero",
    motivo:
      "Sin la serie del talonario que autorizó la ARFFS, «Emitir GTF» no le puede dar número a la guía y el casillero (4) queda vacío.",
  },
  ruc: {
    gravedad: "identidad",
    motivo: "Es lo que el control cruza contra SUNAT para saber quién emitió la guía.",
  },
  razonSocial: {
    gravedad: "identidad",
    motivo: "Encabeza la guía y el certificado: sin esto el papel no dice qué empresa lo emite.",
  },
  nombreCtp: {
    gravedad: "identidad",
    motivo: "Es el nombre del centro que declara la transformación en el certificado de cadena de custodia.",
  },
  codigoCtp: {
    gravedad: "identidad",
    motivo: "El código que te asignó la ARFFS: es con lo que el fiscalizador ubica tu centro en su registro.",
  },
  representante: {
    gravedad: "casillero",
    motivo: "Es quien firma la guía por el centro; el casillero sale sin nombre.",
  },
  arffs: {
    gravedad: "casillero",
    motivo: "Casillero (2): la autoridad forestal regional que ampara el documento.",
  },
  direccion: {
    gravedad: "casillero",
    motivo: "Es el domicilio de la planta y el punto de partida que se propone en el traslado.",
  },
  region: { gravedad: "casillero", motivo: "Casillero (17) del propietario cuando la madera es del centro." },
  provincia: { gravedad: "casillero", motivo: "Casillero (18) del propietario cuando la madera es del centro." },
  distrito: { gravedad: "casillero", motivo: "Casillero (19) del propietario cuando la madera es del centro." },
};

/** Un dato de la Ficha que le falta a la guía, en el idioma del que lo carga. */
export interface FaltanteFicha {
  campo: CampoFichaEnGuia;
  /** Cómo se llama el campo en la Ficha (single source: `CTP_FICHA_LABELS`). */
  label: string;
  gravedad: GravedadFicha;
  motivo: string;
}

const vacio = (v: unknown): boolean => typeof v !== "string" || v.trim().length === 0;

/**
 * Lo que le falta a la Ficha para que esta guía salga numerada y con nombre.
 * Ordenado por gravedad: primero lo que impide numerarla.
 *
 * Tolera `null` y fichas a medio llenar: un CTP recién habilitado tiene todo
 * vacío y ese es justamente el caso que hay que mostrar.
 */
export function faltantesDeFichaParaGuia(ficha: Partial<CtpFicha> | null | undefined): FaltanteFicha[] {
  const f = ficha ?? {};
  return CAMPOS_FICHA_EN_GUIA.filter((campo) => vacio(f[campo]))
    .map((campo) => ({
      campo,
      label: CTP_FICHA_LABELS[campo],
      gravedad: CONSECUENCIA[campo].gravedad,
      motivo: CONSECUENCIA[campo].motivo,
    }))
    .sort((a, b) => ORDEN[a.gravedad] - ORDEN[b.gravedad]);
}

/**
 * ¿La guía se va a quedar sin número?
 *
 * Es la única condición dura: `emitirGtf` devuelve `serie_no_configurada` y no
 * escribe nada. El resto de los huecos deja emitir —con casilleros en blanco—
 * y por eso se avisa en vez de bloquear.
 */
export function faltaSerieDeTalonario(ficha: Partial<CtpFicha> | null | undefined): boolean {
  return vacio((ficha ?? {}).gtfSerie);
}

/** Resumen de una línea para el aviso plegado. Vacío = la Ficha alcanza. */
export function resumenFaltantesDeFicha(faltan: FaltanteFicha[]): string {
  if (faltan.length === 0) return "";
  const sinSerie = faltan.some((x) => x.gravedad === "numero");
  const otros = faltan.filter((x) => x.gravedad !== "numero").length;
  if (sinSerie && otros === 0) return "Falta la serie del talonario: sin ella la guía no se puede numerar.";
  if (sinSerie) {
    return `Falta la serie del talonario —sin ella la guía no se puede numerar— y ${otros} dato${otros === 1 ? "" : "s"} más del centro que emite.`;
  }
  return `La guía se va a emitir sin ${faltan.map((x) => x.label.toLowerCase()).join(", ")}.`;
}
