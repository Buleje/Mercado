"use client";

/**
 * ctp-gtf-print.ts — Guía de Transporte Forestal (GTF) de SALIDA imprimible.
 *
 * El CTP está habilitado a emitir su propia GTF para movilizar el producto que
 * despacha (D.S. 018-2015-MINAGRI art. 172 inciso c). El documento se arma con la
 * identidad legal del CTP (Ficha), el número serie+correlativo asignado
 * (`emitirGtf`), el detalle del producto, la cadena de custodia y —desde 2026-07—
 * los datos que pide un puesto de control: **propietario del producto,
 * destinatario, transportista, vehículo y conductor, títulos habilitantes y los
 * datos del traslado** (ver `ctp-gtf-datos.ts` para el mapeo a la norma).
 *
 * Reglas formales que sí están verificadas contra la RDE 122-2015-SERFOR-DE:
 * · art. 3 — **Arial**, prenumerada, **A4**;
 * · art. 4 — el talonario lo visa la ARFFS: se deja el recuadro del visado;
 * · art. 5 — se imprime **original + 2 copias**, y cada una dice a dónde va
 *   (el original viaja, una copia queda en el primer puesto de control, otra la
 *   conserva el emisor);
 * · Ley 29763 art. 124 — la guía es **declaración jurada**: va el texto y la firma.
 *
 * NO reemplaza el formato/talonario oficial de la ARFFS y no se presenta como tal:
 * los campos exactos viven en los anexos gráficos de la RDE. Esto imprime los
 * mismos datos, ordenados, para llenar o adjuntar al talonario visado.
 *
 * ── 2026-08: devuelve documento, no abre una ventana ─────────────────────────
 * Antes esto abría un pop-up y disparaba el diálogo del sistema de una: para
 * MIRAR la guía había que cancelar la impresión, el pop-up se bloqueaba solo en
 * la mitad de los navegadores, y no quedaba archivo. Ahora arma el mismo papel
 * con el armazón compartido (`ctp-documento-print`) y lo devuelve: la guía de
 * salida y la de ingreso se ven iguales, se revisan en el visor y se archivan
 * con un clic. Las tres copias son tres PARTES del documento — cada una en su
 * hoja, como manda el art. 5.
 */

import {
  cabeceraDoc,
  esc,
  notaDoc,
  resumenDoc,
  seccionDoc,
  tituloDoc,
  type FichaResumen,
} from "@/lib/forestal/ctp-documento-print";
import type { CtpFicha, PermisoDeGuia } from "@/lib/forestal/ctp-ficha-types";
import { COPIAS_GTF, faltantesGtf, gtfDatosVacio, type GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { CSS_GTF_OFICIAL, cuerpoGtfOficial, fechaGtf, filasDeLaGuia, type LineaProducto } from "@/lib/forestal/ctp-gtf-formato";
import { revisarTiposGTF, type AvisoTipo } from "@/lib/forestal/gtf-validador-tipo";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { aplicarPiezasGuia } from "@/lib/extensiones/guia-impresa";

/** `unitLabel` no siempre es m³ (kg/pt/unidad, según la corrida): los tres
 *  decimales de SERFOR sólo aplican cuando de verdad se está declarando m³. */
const n4 = (v: number, unit?: string) => (unit === "m³" ? fmtM3(v) : v.toFixed(4));

export interface GtfDespacho {
  /** id del despacho — target del QR de verificación pública. */
  id: string;
  lineNo: number;
  entryDate: string;
  productType: string | null;
  speciesCommon: string | null;
  speciesScientific: string | null;
  cites: boolean;
  quantity: string | null;
  unitLabel: string;
  pieces: number | null;
  /** N° de GTF formal ya asignado (serie-correlativo). */
  gtfNumber: string | null;
  destino: string | null;
}

export interface GtfCadena {
  /** `lineNo: null` = el tramo no viene de una corrida: son trozas que salieron
   *  sin aserrar (ADR-363) y su origen es la guía de ingreso. */
  corridas: { lineNo: number | null; quantity: number; guias: string[] }[];
}

/** Las tres hojas de la guía de salida, listas para el visor. */
export interface DocumentoGtfSalida {
  /** Una parte por copia (original + 2), en el orden del art. 5. */
  cuerpos: string[];
  css: string;
  titulo: string;
  pieCorrido: string;
  /** Filas cuyo m³ por pieza dice otro tipo de producto (fase 3): se avisan en
   *  pantalla antes de emitir, nunca se imprimen en el papel. */
  avisosTipo: AvisoTipo[];
}

/**
 * El detalle (37) de la guía de salida: las líneas que vienen, o un único
 * renglón con lo que declara el despacho (una guía, un producto).
 */
export function lineasDeLaGuiaSalida(despacho: GtfDespacho, lineasDeLaGuia?: readonly LineaProducto[]): LineaProducto[] {
  return lineasDeLaGuia?.length ? [...lineasDeLaGuia] : [{
    cientifico: despacho.speciesScientific ?? "",
    comun: despacho.speciesCommon ?? "",
    tipoProducto: despacho.productType ?? "",
    // El formato pide la forma de presentación; el despacho no la lleva como
    // campo propio, así que va la unidad, que es lo que declara el detalle.
    presentacion: despacho.unitLabel ?? "",
    cantidad: despacho.pieces ?? 0,
    unidad: despacho.unitLabel ?? "",
    total: Number(despacho.quantity ?? 0) || 0,
  }];
}

/** Las filas de la guía cuyo m³ por pieza dice otro tipo de producto (fase 3). Se avisa ANTES de emitir. */
export const avisosTipoDeLaGuia = (despacho: GtfDespacho, lineasDeLaGuia?: readonly LineaProducto[]): AvisoTipo[] =>
  revisarTiposGTF(filasDeLaGuia(lineasDeLaGuiaSalida(despacho, lineasDeLaGuia)));

export async function documentoGtfSalida(
  despacho: GtfDespacho,
  /** Ficha del CTP; `Partial` porque una ficha a medio llenar igual imprime. */
  ficha: Partial<CtpFicha>,
  cadena: GtfCadena | null,
  datos: GtfDatos = gtfDatosVacio(),
  /**
   * El detalle (37) cuando la guía ampara VARIOS productos (ADR-362). Sin esto
   * se arma un único renglón con lo que declara el despacho — que es correcto
   * para una guía de un solo producto y una mentira para una de cinco.
   */
  lineasDeLaGuia?: readonly LineaProducto[],
  /**
   * Los permisos cargados del tenant (`ForestContrato`, ADR-421/425). El select
   * de la guía ofrece títulos de la Ficha **y** permisos; sin esta lista, un
   * despacho declarado con un permiso que no está en la Ficha imprimía el
   * código (6) y los casilleros (5)(8)(9) en blanco. Sin pasarla, el papel sale
   * como salía: se completa lo que hay, nunca se inventa lo que falta.
   */
  permisos?: readonly PermisoDeGuia[] | null,
): Promise<DocumentoGtfSalida> {
  if (!despacho.gtfNumber) {
    throw new Error("El despacho todavía no tiene GTF emitida. Emite la GTF antes de imprimirla.");
  }
  // El original es el papel que se muestra en un puesto de control: sin
  // transportista, placa o destinatario no sirve, así que no se imprime a medias.
  const faltan = faltantesGtf(datos);
  if (faltan.length > 0) {
    throw new Error(
      `Falta completar la guía antes de imprimirla: ${faltan.map((f) => f.campo).join(", ")}.`,
    );
  }

  const verifyUrl = `${window.location.origin}/verificar/despacho/${encodeURIComponent(despacho.id)}`;
  const QR = (await import("qrcode")).default;
  const qrDataUrl = await QR.toDataURL(verifyUrl, { margin: 1, width: 180, errorCorrectionLevel: "M" });

  const emitido = new Date();
  const fecha = emitido.toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });
  const hora = emitido.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  // timeZone UTC: entryDate es date-only a medianoche UTC (off-by-one Lima).

  const direccion =
    [ficha.direccion, ficha.distrito, ficha.provincia, ficha.region].filter(Boolean).map(esc).join(", ") || "";

  const filas = (cadena?.corridas ?? [])
    .map(
      (c) => `<tr>
        <td class="cod">${c.lineNo != null ? `#${c.lineNo}` : "Sin transformar"}</td>
        <td class="r vol">${n4(c.quantity, despacho.unitLabel)} ${esc(despacho.unitLabel)}</td>
        <td>${c.guias.length ? c.guias.map(esc).join(" · ") : "—"}</td>
      </tr>`,
    )
    .join("");

  const origenBox = cadena && cadena.corridas.length
    ? `${seccionDoc("Origen del producto", "cadena de custodia")}
      <table class="gs">
        <thead><tr><th>Corrida de producción</th><th class="r">Cantidad</th><th>Guías GTF de ingreso</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>`
    : "";

  // Declaración jurada: la guía LO ES por el art. 124 de la Ley 29763. Sin el
  // texto y la firma, el papel no dice bajo qué responsabilidad se emitió.
  const declaracion = notaDoc(
    `<b>Declaración jurada.</b> El emisor declara bajo juramento que los productos forestales descritos
     provienen de aprovechamiento autorizado y están amparados por los títulos habilitantes consignados,
     y que la información de esta guía es verdadera (Ley N° 29763, art. 124; D.S. N° 018-2015-MINAGRI, art. 172).
     ${datos.citesPermiso ? `Especie CITES amparada con el permiso N° <b>${esc(datos.citesPermiso)}</b>.` : ""}
     ${datos.observaciones ? `<br/><b>Observaciones:</b> ${esc(datos.observaciones)}` : ""}`,
  );

  // El talonario lo visa la ARFFS antes de usarse (art. 4): el recuadro va en el
  // papel para que la marca tenga dónde ir.
  const visado = `<div class="gs-visado">
      <div><span>Visado / marca de la ARFFS</span><i></i></div>
      <div><span>Sello del puesto de control</span><i></i></div>
    </div>`;

  // El cuerpo va con los casilleros numerados del formato de SERFOR: en un
  // puesto de control se pide "el (22)" y "el (31)", no "el destinatario".
  const lineasProducto = lineasDeLaGuiaSalida(despacho, lineasDeLaGuia);
  const cuerpoOficial = cuerpoGtfOficial({
    // La ficha llega parcial (se imprime aunque esté a medio llenar): los
    // casilleros sin dato quedan en blanco, que es el comportamiento correcto.
    ficha: ficha as CtpFicha,
    datos,
    lineas: lineasProducto,
    numeroGtf: despacho.gtfNumber ?? "",
    fechaExpedicion: despacho.entryDate ?? "",
    listasTrozas: despacho.gtfNumber ?? "",
    // (36) las GTF con las que ENTRÓ la materia prima: salen de la cadena, sin
    // repetir la misma guía dos veces si dos corridas comparten origen.
    gtfOrigen: [...new Set((cadena?.corridas ?? []).flatMap((c) => c.guias))].join(", "),
    // Buleje no registra ante la ARFFS: mientras el operador no cargue el N°
    // que devuelve el SNIFFS, el recuadro va en blanco para llenarlo a mano.
    registroSerfor: "",
    permisos: permisos ?? undefined,
  });

  const fichas: FichaResumen[] = [
    { k: "Destinatario", v: datos.destinatario?.nombre ?? despacho.destino ?? "" },
    { k: "Producto", v: despacho.speciesCommon ?? "", tono: despacho.cites ? "aviso" : undefined },
    { k: "Cantidad", v: despacho.quantity ? n4(Number(despacho.quantity), despacho.unitLabel) : "", u: despacho.unitLabel },
    { k: "Vehículo", v: datos.vehiculo?.placa ?? "" },
    { k: "Vence", v: fechaGtf(datos.traslado?.fechaFin) },
  ];

  const cuerpos = COPIAS_GTF.map((copia) => `
    <div class="gs-tira"><b>${esc(copia.titulo)}</b><span>${esc(copia.destino)}</span></div>

    ${cabeceraDoc({
      emisor: ficha.nombreCtp || ficha.razonSocial || "Centro de Transformación Primaria",
      logo: ficha.logo,
      meta: [
        [ficha.razonSocial, ficha.ruc ? `RUC ${ficha.ruc}` : ""].filter(Boolean).join(" · "),
        [ficha.codigoCtp ? `Código de CTP: ${ficha.codigoCtp}` : "", ficha.arffs].filter(Boolean).join(" · "),
        direccion,
      ],
      tipo: "Guía de Transporte Forestal",
      numero: despacho.gtfNumber ?? "",
      numeroNota: `Emitida ${fecha} · ${hora}`,
    })}

    ${tituloDoc(
      "Guía de Transporte Forestal",
      "Producto con transformación primaria · Salida del CTP · Declaración jurada",
    )}

    ${resumenDoc(fichas)}

    ${cuerpoOficial}

    ${origenBox}
    ${declaracion}
    ${visado}

    <div class="gs-qr">
      <img src="${qrDataUrl}" alt="QR de verificación" />
      <div>
        <b>Verificable en línea:</b> escanea el QR para contrastar el origen de este producto
        en vivo contra el Libro de Operaciones del CTP.
        <span class="url">${esc(verifyUrl)}</span>
      </div>
    </div>

    <div class="doc-pie">
      <span>${esc(copia.titulo)} · GTF ${esc(despacho.gtfNumber ?? "")}</span>
      <span>Despacho línea #${despacho.lineNo} · RDE N° 122-2015-SERFOR-DE, art. 5</span>
    </div>`);

  const documento: DocumentoGtfSalida = {
    cuerpos,
    css: CSS_GTF_OFICIAL + CSS_GTF_SALIDA,
    titulo: `GTF ${despacho.gtfNumber}`,
    pieCorrido: `GTF ${despacho.gtfNumber} · Emitida por el CTP desde su Libro de Operaciones · ${fecha}`,
    avisosTipo: avisosTipoDeLaGuia(despacho, lineasProducto),
  };

  // ADR-457 · enchufe `forestal.guia-impresa`: las piezas que el negocio tenga
  // prendidas SÓLO agregan hojas después de las tres copias, pie y CSS
  // encerrado. Reciben una copia congelada de lo que ya se imprimió y nunca
  // tocan `cuerpos[0..2]`; si fallan o tardan, la guía sale como siempre.
  return aplicarPiezasGuia(documento, {
    numeroGtf: despacho.gtfNumber ?? "",
    emitida: { fecha, hora },
    despacho,
    ficha: {
      nombreCtp: ficha.nombreCtp ?? "",
      razonSocial: ficha.razonSocial ?? "",
      ruc: ficha.ruc ?? "",
      codigoCtp: ficha.codigoCtp ?? "",
    },
    datos,
    lineas: lineasProducto,
    guiasDeIngreso: [...new Set((cadena?.corridas ?? []).flatMap((c) => c.guias))],
  });
}

/**
 * Lo propio de la guía de salida: la tira de copia, el visado y el QR.
 *
 * La tira marcaba la copia con una banda verde rellena y letra blanca; ahora
 * es una línea fina arriba y abajo —borde y texto, como un `doc-sello`, sin
 * fondo— y el encabezado de `.gs` copia al `.det` de la GTF de ingreso:
 * `--tenue` de fondo, texto en `--tinta`, nunca tinta sólida con letra blanca.
 */
export const CSS_GTF_SALIDA = `
  .gs-tira { display:flex; justify-content:space-between; align-items:center; gap:4mm;
             border-top:1pt solid var(--tinta); border-bottom:.5pt solid var(--linea-suave);
             padding:1.4mm 0; margin-bottom:3mm; color:var(--gris);
             font-size:7pt; letter-spacing:1.2pt; text-transform:uppercase; }
  .gs-tira b { color:var(--tinta); font-size:8.5pt; letter-spacing:1.6pt; }
  .gs { width:100%; border-collapse:collapse; margin:0; }
  .gs th, .gs td { border:.5pt solid var(--linea-suave); padding:1.2mm 1.5mm; font-size:7.4pt; }
  .gs thead th { background:var(--tenue); color:var(--tinta); border-color:var(--linea-suave); border-bottom-color:var(--linea);
                 font-weight:bold; font-size:6.8pt; letter-spacing:.3pt; text-transform:uppercase; text-align:left; }
  .gs td.r { text-align:right; }
  .gs td.cod { font-family:"Courier New",Courier,monospace; font-weight:bold; }
  .gs td.vol { font-variant-numeric:tabular-nums; font-weight:bold; }
  .gs-visado { display:flex; gap:6mm; margin-top:4mm; border:.6pt dashed var(--tinta); padding:2mm 3mm; }
  .gs-visado div { flex:1; }
  .gs-visado span { font-size:6.6pt; letter-spacing:.5pt; text-transform:uppercase; color:var(--gris); }
  .gs-visado i { display:block; height:16mm; border-bottom:.6pt solid var(--linea-suave); }
  .gs-qr { display:flex; align-items:center; gap:4mm; margin-top:4mm;
           border:.6pt solid var(--linea-suave); border-left:2pt solid var(--tinta); padding:2.4mm 3mm; }
  .gs-qr img { width:22mm; height:22mm; }
  .gs-qr div { font-size:7pt; line-height:1.45; color:var(--gris); }
  .gs-qr b { color:var(--tinta); }
  .gs-qr .url { display:block; margin-top:.8mm; font-family:"Courier New",Courier,monospace;
                font-size:6.2pt; color:var(--gris-suave); word-break:break-all; }
`;
