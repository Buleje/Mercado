"use client";

/**
 * loth-guia-print — los dos papeles de la guía del bosque: la GTF con sus
 * casilleros (2)–(40) y la LISTA DE TROZAS O CUARTONES A MOVILIZAR.
 *
 * No hay formato propio: la GTF se arma con `cuerpoGtfOficial` —el mismo
 * cuerpo que imprime la guía de salida del CTP— y la lista con
 * `htmlListaTrozas`, la misma de los ingresos. Si el formato cambia, cambia
 * para los dos libros a la vez.
 *
 * Lo único propio es de dónde sale la identidad (2)–(12): la guía del bosque
 * no tiene Ficha de CTP, así que se arma una con lo que la guía GUARDÓ
 * (`gtfDatos.guia` + `titulos[0]`) — nunca con la carátula de hoy: si mañana
 * alguien la corrige, la guía que ya viajó sigue diciendo lo que dijo.
 */

import {
  cabeceraDoc,
  documentoHtml,
  esc,
  notaDoc,
  resumenDoc,
  selloDoc,
  tituloDoc,
  type FichaResumen,
} from "./ctp-documento-print";
import type { CtpFicha } from "./ctp-ficha-types";
import { COPIAS_GTF, type GtfDatos } from "./ctp-gtf-datos";
import { CSS_GTF_OFICIAL, cuerpoGtfOficial, fechaGtf } from "./ctp-gtf-formato";
import { CSS_GTF_SALIDA } from "./ctp-gtf-print";
import { CSS_LISTA_TROZAS, htmlListaTrozas } from "./ctp-lista-trozas";
import { fmtM3 } from "./cubicacion-formato";
import { detallePorEspecie, listaDeTrozas, totalM3, type PiezaGuia } from "./loth-guia-despacho";

/** Un documento listo para `CtpDocumentoVisor` (mismo shape que `DocumentoImprimible`). */
export interface HojaGuiaLoth {
  nombre: string;
  archivo: string;
  etiqueta: string;
  pieCorrido: string;
  html: string;
}

export interface GuiaLothParaImprimir {
  gtfNumber: string;
  /** `YYYY-MM-DD` — casillero (3). */
  gtfDate: string;
  /** (7) Nombre del titular. */
  titular: string;
  datos: GtfDatos;
  piezas: readonly PiezaGuia[];
  /** Completa el binomio que la troza no trae (catálogo de especies). */
  cientificoDe?: (comun: string) => string | null | undefined;
  /** Todavía no se registró: el papel lo dice en grande. */
  borrador?: boolean;
  /** Motivo, si la guía está anulada. */
  anulada?: string | null;
  logo?: string | null;
}

const t = (v: string | null | undefined) => (v ?? "").trim();

/**
 * La «ficha» que espera el formato, armada con lo que la guía guardó. Sólo
 * estos campos los lee el bloque (2)–(12): la autoridad, el titular y su
 * representante, la ubicación y el título.
 */
export function fichaDeGuiaLoth(titular: string, datos: GtfDatos): CtpFicha {
  const g = datos.guia;
  const codigo = t(datos.titulos[0]);
  return {
    razonSocial: t(titular),
    arffs: t(g.autoridad),
    representante: t(g.representanteLegal),
    region: t(g.departamento),
    provincia: t(g.provincia),
    distrito: t(g.distrito),
    titulos: codigo
      ? [{ tipo: t(g.origenRecurso), codigo, resolucion: t(g.resolucion), planManejo: t(g.planManejoTipo), vencimiento: "" }]
      : [],
  } as unknown as CtpFicha;
}

/** Los dos papeles de la guía, listos para el visor. */
export function papelesGuiaLoth(g: GuiaLothParaImprimir): { gtf: HojaGuiaLoth; lista: HojaGuiaLoth } {
  const d = g.datos;
  const numero = t(g.gtfNumber);
  const lineas = detallePorEspecie(g.piezas, g.cientificoDe);
  const filas = listaDeTrozas(g.piezas, g.cientificoDe);
  const total = totalM3(g.piezas);
  const nroLista = t(d.guia.listaTrozasNro) || numero;
  const ficha = fichaDeGuiaLoth(g.titular, d);
  const ubicacion = [t(d.guia.distrito), t(d.guia.provincia), t(d.guia.departamento)].filter(Boolean).join(" · ");
  const titulo = t(d.titulos[0]);

  /* Lo que el papel NO es, arriba de todo: un borrador que se imprime antes
     de registrar no puede salir a la carretera como si fuera la guía. */
  const sello = g.anulada
    ? selloDoc("Anulada", g.anulada, "rojo")
    : g.borrador
      ? selloDoc("Borrador", "Todavía no se registró en el libro: no sirve para movilizar", "rojo")
      : "";

  const fichas: FichaResumen[] = [
    { k: "Destinatario", v: t(d.destinatario.nombre) },
    { k: "Especies", v: lineas.length ? String(lineas.length) : "" },
    { k: "Trozas", v: filas.length ? String(filas.length) : "" },
    { k: "Volumen", v: filas.length ? fmtM3(total) : "", u: "m³", tono: "ok" },
    { k: "Vence", v: fechaGtf(d.traslado.fechaFin) },
  ];

  const declaracion = notaDoc(
    `<b>Declaración jurada.</b> El titular declara bajo juramento que las trozas descritas provienen del
     aprovechamiento autorizado por el título habilitante consignado, registradas en su Libro de Operaciones,
     y que la información de esta guía es verdadera (Ley N° 29763, art. 124; D.S. N° 018-2015-MINAGRI, art. 172).
     ${t(d.citesPermiso) ? `Especie CITES amparada con el permiso N° <b>${esc(d.citesPermiso)}</b>.` : ""}`,
  );
  const visado = `<div class="gs-visado">
      <div><span>Visado / marca de la ARFFS</span><i></i></div>
      <div><span>Sello del puesto de control</span><i></i></div>
    </div>`;

  const cuerpo = cuerpoGtfOficial({
    ficha,
    datos: d,
    lineas,
    numeroGtf: numero,
    fechaExpedicion: g.gtfDate,
    // (35) el N° de la lista que viaja con la guía; (36) vacío: madera del
    // bosque, no la ampara ninguna guía anterior.
    listasTrozas: nroLista,
    gtfOrigen: t(d.guia.gtfOrigenNro),
    origenRecurso: t(d.guia.origenRecurso),
    registroSerfor: "",
  });

  const cuerpos = COPIAS_GTF.map(
    (copia) => `
    <div class="gs-tira"><b>${esc(copia.titulo)}</b><span>${esc(copia.destino)}</span></div>
    ${cabeceraDoc({
      emisor: t(g.titular) || "Titular del título habilitante",
      logo: g.logo,
      meta: [
        t(d.propietario.docNumero) && d.propietario.esElCtp ? `${d.propietario.docTipo} ${t(d.propietario.docNumero)}` : "",
        titulo ? `Título habilitante N° ${titulo}` : "",
        ubicacion,
      ],
      tipo: "Guía de Transporte Forestal",
      numero,
      numeroNota: "Libro de Operaciones del título habilitante",
    })}
    ${tituloDoc("Guía de Transporte Forestal", "Madera en rollo · Salida del bosque · Declaración jurada")}
    ${sello}
    ${resumenDoc(fichas)}
    ${cuerpo}
    ${declaracion}
    ${visado}
    <div class="doc-pie">
      <span>${esc(copia.titulo)} · GTF ${esc(numero)}</span>
      <span>Lista de trozas N° ${esc(nroLista)} · RDE N° 122-2015-SERFOR-DE, art. 5</span>
    </div>`,
  );

  const pieGtf = `GTF ${numero} · Emitida por el titular desde su Libro de Operaciones`;
  const pieLista = `Lista de trozas N° ${nroLista} · Anexo de la GTF ${numero}`;

  return {
    gtf: {
      nombre: `GTF ${numero}`,
      archivo: `GTF ${numero}`,
      etiqueta: "Original + 2 copias (art. 5)",
      pieCorrido: pieGtf,
      html: documentoHtml({ titulo: `GTF ${numero}`, css: CSS_GTF_OFICIAL + CSS_GTF_SALIDA, cuerpo: cuerpos, pieCorrido: pieGtf }),
    },
    lista: {
      nombre: "Lista de trozas",
      archivo: `Lista de trozas ${nroLista}`,
      etiqueta: `${filas.length} troza${filas.length === 1 ? "" : "s"} · anexo del (35)`,
      pieCorrido: pieLista,
      html: documentoHtml({
        titulo: `Lista de trozas ${nroLista}`,
        css: CSS_LISTA_TROZAS,
        cuerpo: `${sello}${htmlListaTrozas({
          titular: t(g.titular) || "Titular del título habilitante",
          subtitulo: titulo ? `Título habilitante N° ${titulo}` : undefined,
          ubicacion,
          ruc: d.propietario.esElCtp && d.propietario.docTipo === "RUC" ? t(d.propietario.docNumero) : undefined,
          numero: nroLista,
          guia: numero,
          fecha: fechaGtf(g.gtfDate),
          trozas: filas,
          observaciones: t(d.observaciones),
        })}`,
        pieCorrido: pieLista,
      }),
    },
  };
}
