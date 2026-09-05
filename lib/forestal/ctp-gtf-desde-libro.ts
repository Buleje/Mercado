/**
 * ctp-gtf-desde-libro.ts — el papel de la guía cuando no vino de SERFOR (ADR-348).
 *
 * Los ingresos que se consultaron al SNIFFS traen su ficha y con ella se
 * reproduce la guía casillero por casillero (`ctp-gtf-desde-serfor`). Los demás
 * —los que se cargaron a mano, los importados de un inventario— no tenían papel:
 * el botón «Ver documento» ni siquiera aparecía.
 *
 * Pero el libro **sí** tiene con qué armarlo: el ingreso guarda el titular, el
 * origen, el título habilitante, y desde ADR-336 los tres bloques del cuerpo de
 * la guía (propietario, destinatario, transportista). Lo que falte va **vacío**,
 * como en el formato: un casillero en blanco dice «no lo tengo»; uno inventado
 * miente.
 *
 * La diferencia con el camino de SERFOR se DECLARA en el papel: esto reconstruye
 * lo asentado en el Libro de Operaciones, no reproduce el registro público.
 *
 * PURO y client-safe.
 */

import {
  cabeceraDoc,
  esc,
  notaDoc,
  resumenDoc,
  selloDoc,
  tituloDoc,
  type FichaResumen,
} from "./ctp-documento-print";
import type { CtpFicha } from "./ctp-ficha-types";
import { leerGtfDatos, type GtfDatos } from "./ctp-gtf-datos";
import { cuerpoGtfOficial, type LineaProducto } from "./ctp-gtf-formato";
import type { GuiaIngreso } from "./ingresos-por-guia";
import type { TrozaListada } from "./ctp-lista-trozas";
import { fmtM3 } from "./cubicacion-formato";

const t = (v: unknown): string => (v == null ? "" : String(v).trim());
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** La guía tal como la arma el listado, con lo que el papel le lee a cada asiento. */
export type GuiaConLineas = Pick<GuiaIngreso, "gtfNumber" | "gtfSeries" | "entryDate" | "gtfDate"> & {
  lineas: readonly LineaLibro[];
};

/** Lo que el papel necesita de cada asiento del libro. */
export interface LineaLibro {
  speciesCommonName: string;
  speciesScientificName?: string | null;
  productType: string;
  unit?: string | null;
  volumeM3: string | number | { toString(): string };
  pieces?: number | null;
  providerName: string;
  providerDocument?: string | null;
  providerDocumentType?: string | null;
  originType?: string | null;
  originCode?: string | null;
  originSourceNumber?: string | null;
  originRegion?: string | null;
  originDistrict?: string | null;
  gtfDatos?: unknown;
  notes?: string | null;
  /** La ficha del SNIFFS, si esta guía se consultó. Decide qué papel se arma. */
  serforGtf?: unknown;
}

/**
 * El emisor del papel es el **proveedor**, no el CTP.
 *
 * En una guía de ingreso el titular del recurso es quien la emitió —la comunidad,
 * la concesión— y el CTP es el destinatario. Poner acá la razón social del
 * aserradero convertiría el respaldo de una compra en una guía propia.
 */
export function insumosDesdeLibro(guia: GuiaConLineas): { ficha: CtpFicha; datos: GtfDatos } {
  const p = guia.lineas[0];
  const ficha = {
    razonSocial: t(p.providerName),
    ruc: t(p.providerDocumentType).toUpperCase() === "RUC" ? t(p.providerDocument) : "",
    /* La ARFFS no se guarda en el ingreso: va vacía. Deducirla de la región es
       exactamente el tipo de dato que después nadie puede defender. */
    arffs: "",
    representante: "",
    region: t(p.originRegion),
    provincia: "",
    distrito: t(p.originDistrict),
    direccion: "",
    titulos: [{
      tipo: t(p.originType),
      codigo: t(p.originCode),
      resolucion: t(p.originSourceNumber),
      planManejo: "",
      vencimiento: "",
    }],
  } as unknown as CtpFicha;

  /* Los bloques (13)-(34) los guarda el propio ingreso desde ADR-336; si nunca
     se cargaron, `leerGtfDatos` devuelve la estructura vacía y el papel sale con
     esos casilleros en blanco. */
  const datos = leerGtfDatos(p.gtfDatos);

  return { ficha, datos };
}

/**
 * El detalle (37): **una línea por asiento**, que es una por especie (ADR-312).
 *
 * No se agrupa ni se recalcula: el libro ya declaró un volumen por especie y el
 * papel lo repite. Sumar dos asientos de la misma especie escondería que el
 * libro los tiene separados.
 */
export function lineasDesdeLibro(guia: GuiaConLineas): LineaProducto[] {
  return guia.lineas.map((l) => ({
    cientifico: t(l.speciesScientificName),
    comun: t(l.speciesCommonName),
    tipoProducto: t(l.productType),
    /* (37d) Descripción del embalaje: en un ingreso de rolliza son trozas. Sin
       piezas declaradas va vacío en vez de un "0 trozas" que no ampara nada. */
    presentacion: l.pieces ? "Trozas" : "",
    cantidad: l.pieces ?? 0,
    unidad: t(l.unit) || "m3",
    total: num(typeof l.volumeM3 === "object" ? l.volumeM3.toString() : l.volumeM3),
  }));
}

/** Las piezas del libro, con las medidas que se les tomó en el patio. */
export function trozasDesdeLibro(
  trozas: readonly {
    codificacion?: string | null;
    codigoPlanta?: string | null;
    especieComun?: string | null;
    especieCientifica?: string | null;
    producto?: string | null;
    d1Cm?: number | null;
    d2Cm?: number | null;
    largoM?: number | null;
    volumenM3?: number | string | null;
  }[],
): TrozaListada[] {
  return trozas.map((x) => ({
    /* La del bosque manda: es la que viaja en la guía. La del patio es interna
       y no tiene por qué coincidir con el papel. */
    codificacion: t(x.codificacion) || t(x.codigoPlanta) || null,
    especieComun: t(x.especieComun) || null,
    especieCientifica: t(x.especieCientifica) || null,
    producto: t(x.producto) || null,
    d1Cm: x.d1Cm ?? null,
    d2Cm: x.d2Cm ?? null,
    largoM: x.largoM ?? null,
    cantidad: 1,
    volumenM3: x.volumenM3 == null ? null : num(x.volumenM3),
  }));
}

/**
 * La hoja completa de la guía, armada con el libro.
 *
 * Misma forma que la reproducción de SERFOR —el operador no tiene que aprender
 * dos papeles— pero con el sello que dice de dónde salen los datos. El recuadro
 * de estado va **vacío**: Buleje no registra ante la autoridad, y estampar
 * «REGISTRADA» sin serlo es fabricar la constancia de un trámite.
 */
export function documentoGtfDesdeLibro(
  guia: GuiaConLineas & { lineas: readonly LineaLibro[] },
  opts: { impresoEl?: string; logo?: string | null } = {},
): string {
  const { ficha, datos } = insumosDesdeLibro(guia);
  const lineas = lineasDesdeLibro(guia);
  const volumen = lineas.reduce((a, l) => a + l.total, 0);
  const piezas = lineas.reduce((a, l) => a + (l.cantidad ?? 0), 0);
  const especies = new Set(lineas.map((l) => l.comun.toLowerCase()).filter(Boolean)).size;
  /* (3) es la fecha de EXPEDICIÓN de la guía, no la del asiento: si el libro no
     la guardó va vacía. Poner la fecha del ingreso ahí sería fechar un documento
     de la autoridad con el día en que alguien lo cargó. */
  const dia = typeof guia.gtfDate === "string" ? guia.gtfDate.slice(0, 10) : "";

  const fichas: FichaResumen[] = [
    { k: "Fuente", v: "Libro de Operaciones" },
    { k: "Volumen declarado", v: volumen ? fmtM3(volumen) : "", u: "m³" },
    { k: "Piezas declaradas", v: piezas ? String(piezas) : "" },
    { k: "Especies", v: especies ? String(especies) : "" },
    { k: "Asientos", v: String(guia.lineas.length) },
  ];

  return `
  ${cabeceraDoc({
    emisor: t(guia.lineas[0].providerName) || "Proveedor no declarado",
    logo: opts.logo,
    meta: [
      t(ficha.ruc) ? `RUC ${t(ficha.ruc)}` : "",
      [t(ficha.distrito), t(ficha.region)].filter(Boolean).join(" · "),
      t(ficha.titulos?.[0]?.codigo) ? `Título habilitante N° ${t(ficha.titulos[0].codigo)}` : "",
    ],
    tipo: "Guía de Transporte Forestal",
    numero: t(guia.gtfNumber),
    numeroNota: t(guia.gtfSeries) ? `Serie ${t(guia.gtfSeries)}` : "Sin serie declarada",
  })}

  ${tituloDoc(
    "Guía de Transporte Forestal",
    "Documento de ingreso al CTP · Reconstruido de lo asentado en el Libro de Operaciones",
  )}

  ${resumenDoc(fichas)}

  <div class="gtf-proc">
    ${selloDoc("Reconstrucción", "Del libro, no del SNIFFS", "rojo")}
    <div class="txt">
      <b>De dónde salen estos datos.</b> De los asientos de esta guía en el Libro de Operaciones del CTP.
      Esta guía <b>no</b> se consultó en el registro público del SNIFFS, así que los casilleros que sólo
      publica la autoridad —N° de registro, instancia que registra, vencimiento— van en blanco.
      Para completarlos, consultá la guía desde el formulario de ingreso.
    </div>
  </div>

  ${cuerpoGtfOficial({
    ficha,
    datos,
    lineas,
    numeroGtf: t(guia.gtfNumber),
    fechaExpedicion: dia,
    listasTrozas: "",
    gtfOrigen: "",
    origenRecurso: t(ficha.titulos?.[0]?.tipo),
    /* Vacío a propósito: ver el comentario de arriba. */
    registroSerfor: "",
  })}

  ${notaDoc(
    `<b>Qué es este papel.</b> Un respaldo del expediente del CTP: repite, casillero por casillero, lo que el
     libro tiene asentado de esta guía. El original lo emite la ARFFS y viaja con el producto.`,
  )}

  <div class="doc-pie">
    <span>GTF ${esc(t(guia.gtfNumber) || "—")}</span>
    <span>${opts.impresoEl ? `Impreso ${esc(opts.impresoEl)} · ` : ""}Libro de Operaciones del CTP</span>
  </div>`;
}
