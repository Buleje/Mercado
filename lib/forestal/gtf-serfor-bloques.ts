/**
 * gtf-serfor-bloques.ts — la guía de SERFOR ordenada como el papel.
 *
 * El formato oficial de la GTF tiene 38 casilleros repartidos en cinco bloques
 * (la guía · el propietario del producto · el destinatario · el transportista ·
 * el detalle del producto). La consulta pública devuelve un objeto plano; lo que
 * falta es **el orden y los rótulos**, que son los que el fiscalizador tiene
 * delante cuando pregunta «¿qué dice el casillero 24?».
 *
 * Vive acá y no en el componente para que la pantalla y el papel
 * (`serfor-gtf-print`) no puedan divergir, y para poder testear qué casillero
 * sale de qué campo.
 *
 * ⚠️ **La consulta pública no publica todo el documento.** Cuatro casilleros del
 * papel no vienen en la respuesta (9, 14, 20-21 y 36). Se declaran igual, con la
 * marca `noPublicado`: un casillero ausente y uno vacío en el documento no son
 * lo mismo, y la pantalla tiene que poder decir cuál es cuál.
 *
 * PURO y client-safe.
 */

import type { GtfSerfor } from "./serfor-gtf";

/** Cuánto ocupa el casillero en la grilla de 12 del bloque. */
export type SpanCasillero = 3 | 4 | 6 | 12;

export interface CasilleroGtf {
  /** Su número en el papel: "13", "31", "10". Sin número los que no lo llevan. */
  n?: string;
  label: string;
  valor: string | null;
  /** SERFOR no lo publica en la consulta: no está vacío, está ausente. */
  noPublicado?: boolean;
  /** Se lee mejor en mono (documentos, RUC, placas, códigos). */
  mono?: boolean;
  span?: SpanCasillero;
}

export interface BloqueGtf {
  id: string;
  /** Como se titula en el papel. */
  titulo: string;
  casilleros: CasilleroGtf[];
}

const txt = (v: string | null | undefined): string | null => {
  const s = (v ?? "").trim();
  return s.length > 0 ? s : null;
};

/**
 * SERFOR publica el documento del destinatario en un solo campo, "RUC / DNI".
 * El papel tiene DOS casilleros —(23) D.N.I. y (24) R.U.C.— así que se parte una
 * vez acá y no en cada pantalla que lo muestre.
 */
export function documentosDestinatario(doc: string | null | undefined): { ruc: string | null; dni: string | null } {
  const partes = (doc ?? "").split("/").map((p) => p.trim());
  return { ruc: txt(partes[0]), dni: txt(partes[1]) };
}

/** Los cinco bloques del documento, en el orden del papel. */
export function bloquesDeGuia(g: GtfSerfor): BloqueGtf[] {
  const dest = documentosDestinatario(g.destinatarioDoc);
  return [
    {
      id: "guia",
      titulo: "La guía",
      casilleros: [
        { n: "2", label: "Autoridad Regional Forestal y de Fauna Silvestre", valor: txt(g.instanciaRegistra), span: 12 },
        { n: "3", label: "Fecha de expedición", valor: txt(g.fechaExpedicion), span: 4 },
        { n: "4", label: "Fecha de vencimiento", valor: txt(g.fechaVencimiento), span: 4 },
        { n: "5", label: "Origen del recurso", valor: txt(g.origenRecurso), span: 4 },
        { n: "6", label: "Número del título habilitante", valor: txt(g.numeroTitulo), mono: true, span: 6 },
        { n: "8", label: "N° de resolución", valor: txt(g.numeroResolucion), mono: true, span: 6 },
        { n: "7", label: "Nombre del titular", valor: txt(g.titular), span: 6 },
        { label: "Representante legal", valor: txt(g.representanteLegal), span: 6 },
        { n: "9", label: "Plan de manejo (tipo)", valor: null, noPublicado: true, span: 6 },
        { label: "Dirección del titular", valor: txt(g.direccionTitular), span: 6 },
        { n: "10", label: "Departamento", valor: txt(g.departamento), span: 4 },
        { n: "11", label: "Provincia", valor: txt(g.provincia), span: 4 },
        { n: "12", label: "Distrito", valor: txt(g.distrito), span: 4 },
      ],
    },
    {
      id: "propietario",
      titulo: "Propietario del producto",
      casilleros: [
        { n: "13", label: "Propietario del producto", valor: txt(g.propietario), span: 6 },
        { n: "14", label: "D.N.I. N°", valor: null, noPublicado: true, mono: true, span: 3 },
        { n: "15", label: "R.U.C. N°", valor: txt(g.propietarioDoc), mono: true, span: 3 },
        { n: "16", label: "Dirección", valor: txt(g.propietarioDireccion), span: 12 },
        { n: "17", label: "Departamento", valor: txt(g.propietarioDepartamento), span: 4 },
        { n: "18", label: "Provincia", valor: txt(g.propietarioProvincia), span: 4 },
        { n: "19", label: "Distrito", valor: txt(g.propietarioDistrito), span: 4 },
        { n: "20", label: "Tipo de comprobante de compra o venta", valor: null, noPublicado: true, span: 6 },
        { n: "21", label: "N° de comprobante", valor: null, noPublicado: true, mono: true, span: 6 },
      ],
    },
    {
      id: "destinatario",
      titulo: "Destinatario",
      casilleros: [
        { n: "22", label: "Destinatario", valor: txt(g.destinatario), span: 6 },
        { n: "23", label: "D.N.I. N°", valor: dest.dni, mono: true, span: 3 },
        { n: "24", label: "R.U.C. N°", valor: dest.ruc, mono: true, span: 3 },
        { n: "25", label: "Dirección", valor: txt(g.destinatarioDireccion), span: 12 },
        { n: "26", label: "Departamento", valor: txt(g.destinatarioDepartamento), span: 4 },
        { n: "27", label: "Provincia", valor: txt(g.destinatarioProvincia), span: 4 },
        { n: "28", label: "Distrito", valor: txt(g.destinatarioDistrito), span: 4 },
      ],
    },
    {
      id: "transportista",
      titulo: "Transportista",
      casilleros: [
        { n: "29", label: "N° de guía de remisión", valor: txt(g.guiaRemision), mono: true, span: 6 },
        { n: "30", label: "Tipo de transporte", valor: txt(g.tipoTransporte), span: 6 },
        { n: "31", label: "Tipo de vehículo", valor: txt(g.tipoVehiculo), span: 6 },
        { n: "31", label: "Placa(s) N°", valor: txt(g.placa), mono: true, span: 6 },
        { n: "32", label: "Conductor", valor: txt(g.transportista), span: 6 },
        { n: "33", label: "D.N.I. N°", valor: txt(g.transportistaDni), mono: true, span: 3 },
        { n: "34", label: "Licencia de conducir N°", valor: txt(g.licenciaConducir), mono: true, span: 3 },
      ],
    },
    {
      id: "producto",
      titulo: "Detalle del producto",
      casilleros: [
        { n: "35", label: "Lista(s) de troza(s)", valor: txt(g.listaTrozas), mono: true, span: 6 },
        { n: "36", label: "N° GTF de origen", valor: null, noPublicado: true, mono: true, span: 6 },
      ],
    },
  ];
}

/** Qué tan completa vino la guía. Los ausentes NO cuentan como huecos. */
export interface CompletitudGuia {
  /** Casilleros que SERFOR sí publica. */
  publicables: number;
  conDato: number;
  /** Publicables sin valor: el documento los trae en blanco. */
  enBlanco: number;
  /** Casilleros del papel que la consulta pública no devuelve. */
  ausentes: number;
}

export function completitudGuia(bloques: readonly BloqueGtf[]): CompletitudGuia {
  let publicables = 0;
  let conDato = 0;
  let ausentes = 0;
  for (const b of bloques) {
    for (const c of b.casilleros) {
      if (c.noPublicado) { ausentes += 1; continue; }
      publicables += 1;
      if (c.valor) conDato += 1;
    }
  }
  return { publicables, conDato, enBlanco: publicables - conDato, ausentes };
}

/**
 * Lo que SERFOR publicó y ningún casillero está mostrando.
 *
 * `campos` es el volcado crudo de la respuesta: si mañana SERFOR agrega una
 * etiqueta, acá aparece en vez de perderse en silencio. Se ordena alfabético
 * porque el orden del scraping no significa nada.
 */
export function camposNoMapeados(g: GtfSerfor): { etiqueta: string; valor: string }[] {
  const yaMostrados = new Set(
    [
      g.instanciaRegistra, g.fechaExpedicion, g.fechaVencimiento, g.origenRecurso, g.numeroTitulo,
      g.numeroResolucion, g.titular, g.representanteLegal, g.direccionTitular, g.departamento,
      g.provincia, g.distrito, g.propietario, g.propietarioDoc, g.propietarioDireccion,
      g.propietarioDepartamento, g.propietarioProvincia, g.propietarioDistrito, g.destinatario,
      g.destinatarioDoc, g.destinatarioDireccion, g.destinatarioDepartamento, g.destinatarioProvincia,
      g.destinatarioDistrito, g.guiaRemision, g.tipoTransporte, g.tipoVehiculo, g.placa,
      g.transportista, g.transportistaDni, g.licenciaConducir, g.listaTrozas, g.gtfNumber,
      g.numeroRegistro, g.estado, g.registradoPor, g.fechaRegistro, g.rucInstancia,
    ]
      .map((v) => (v ?? "").trim())
      .filter(Boolean),
  );
  return Object.entries(g.campos ?? {})
    .map(([etiqueta, valor]) => ({ etiqueta: etiqueta.trim(), valor: (valor ?? "").trim() }))
    .filter((c) => c.valor.length > 0 && !yaMostrados.has(c.valor))
    .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es"));
}
