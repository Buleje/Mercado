"use client";

/**
 * El cuerpo de la GTF con los casilleros numerados del formato de SERFOR.
 *
 * Hasta ahora la guía se imprimía con los mismos datos pero en un orden propio,
 * y el que la recibe en un puesto de control busca por NÚMERO: pide el (22) y el
 * (31), no "el destinatario" y "la placa". Este módulo arma el bloque central
 * respetando esa numeración —(2) a (40)— para que se lea igual que el talonario.
 *
 * ── Lo que NO hace, a propósito ──────────────────────────────────────────────
 * No imprime "ESTADO: REGISTRADA" ni un N° de registro propio. Ese estado y ese
 * número los asigna el SNIFFS cuando la guía se registra ante la autoridad;
 * ponerlos desde acá sería fabricar la constancia de un trámite que el sistema
 * de Buleje no hizo. Se imprimen SÓLO si el operador cargó el número que le
 * devolvió SERFOR, y si no, el recuadro va vacío para llenarlo a mano.
 *
 * Tampoco inventa datos: un casillero sin dato va vacío, nunca con un "—" que
 * parezca declarado ni con un valor por defecto. En un documento que es
 * declaración jurada (Ley 29763 art. 124), rellenar es peor que dejar en blanco.
 */

import type { CtpFicha } from "@/lib/forestal/ctp-ficha-types";
import type { GtfDatos } from "@/lib/forestal/ctp-gtf-datos";

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Fecha date-only a `DD.MM.YYYY`, como la imprime SERFOR. Vacía si no hay. */
export function fechaGtf(iso: string | null | undefined): string {
  const s = (iso ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return "";
  const [a, m, d] = s.slice(0, 10).split("-");
  return `${d}.${m}.${a}`;
}

/** Un casillero: número, rótulo y valor. El valor vacío queda en blanco. */
function box(n: string, label: string, valor: unknown, ancho = ""): string {
  // Sin número no se dibuja el paréntesis: el formato tiene campos que van
  // pegados al casillero anterior (el representante legal cuelga del (7)) y un
  // "()" vacío se lee como un casillero que perdió su número.
  const num = n ? `<span class="n">(${esc(n)})</span> ` : "";
  return `<td class="c" ${ancho}>${num}<span class="l">${esc(label)}:</span> <b>${esc(valor)}</b></td>`;
}

/** Cómo viaja la madera. En el papel se lee entero, no el valor del enum. */
const MODO_LABEL: Record<string, string> = {
  terrestre: "Terrestre",
  fluvial: "Fluvial",
  multimodal: "Multimodal (río + carretera)",
};

/**
 * Casillero (5): el origen del recurso es un juego de casillas marcadas, no un
 * texto. Se dibujan TODAS y se cruza la que corresponde — así se lee igual que
 * el talonario, donde el fiscalizador ve de un vistazo cuáles NO son.
 */
const ORIGENES: ReadonlyArray<{ clave: string; label: string }> = [
  { clave: "concesion", label: "Concesión" },
  { clave: "permiso", label: "Permiso" },
  { clave: "autorizacion", label: "Autorización" },
  { clave: "bosque_local", label: "Bosque Local" },
  { clave: "desbosque", label: "Desbosque" },
  { clave: "cambio_uso", label: "Cambio de Uso" },
  { clave: "plantacion", label: "Plantación" },
  { clave: "plan_consolidado", label: "Plan de Manejo Consolidado" },
  { clave: "otros", label: "Otros" },
];

export function casillasOrigen(marcado: string | null | undefined): string {
  const m = (marcado ?? "").trim().toLowerCase();
  return ORIGENES.map(
    (o) =>
      `<span class="ck"><span class="lb">${esc(o.label)}</span><span class="bx">${o.clave === m ? "X" : "&nbsp;"}</span></span>`,
  ).join("");
}

export interface LineaProducto {
  cientifico: string;
  comun: string;
  tipoProducto: string;
  presentacion: string;
  cantidad: number;
  unidad: string;
  total: number;
}

/** El detalle (37a–37g) con su fila de Volumen Total, como el formato oficial. */
export function tablaProductos(lineas: ReadonlyArray<LineaProducto>): string {
  const filas = lineas
    .map(
      (l) => `<tr>
        <td>${esc(l.cientifico)}</td><td>${esc(l.comun)}</td><td>${esc(l.tipoProducto)}</td>
        <td>${esc(l.presentacion)}</td><td class="num">${esc(l.cantidad)}</td>
        <td>${esc(l.unidad)}</td><td class="num">${l.total.toFixed(3)}</td>
      </tr>`,
    )
    .join("");
  // Se suman SOLO las líneas: el total es de lo que se está moviendo, y un
  // número que no cierra con el detalle es lo primero que se revisa.
  const total = lineas.reduce((a, l) => a + (Number(l.total) || 0), 0);
  return `<table class="det">
    <thead><tr>
      <th rowspan="2">(37a) Nombre Científico</th><th rowspan="2">(37b) Nombre Común o Comercial</th>
      <th rowspan="2">(37c) Tipo de Producto</th><th colspan="2">Forma de embalaje y/o presentación del producto</th>
      <th colspan="2">Cantidad</th>
    </tr><tr>
      <th>(37d) Descripción</th><th>(37e) Cantidad</th><th>(37f) Unidad de medida</th><th>(37g) Total</th>
    </tr></thead>
    <tbody>${filas || `<tr><td colspan="7" class="vacio">Sin líneas declaradas</td></tr>`}</tbody>
    <tfoot><tr><td colspan="6" class="tot">Volumen Total:</td><td class="num tot">${total.toFixed(3)}</td></tr></tfoot>
  </table>`;
}

export interface CuerpoGtfInput {
  ficha: CtpFicha;
  datos: GtfDatos;
  lineas: LineaProducto[];
  /** N° de la guía que se está emitiendo (serie + correlativo del CTP). */
  numeroGtf: string;
  /** Fecha de expedición, `YYYY-MM-DD`. */
  fechaExpedicion: string;
  /** Listas de trozas que amparan el despacho — casillero (35). */
  listasTrozas: string;
  /** GTF con la que la materia prima ENTRÓ al CTP — casillero (36). */
  gtfOrigen: string;
  /**
   * N° de registro que devolvió SERFOR al registrar la guía. Vacío = el recuadro
   * de estado va en blanco: Buleje no registra ante la autoridad y afirmar
   * "REGISTRADA" sin serlo es fabricar la constancia de un trámite.
   */
  registroSerfor?: string;
  /** Tipo de origen del recurso, para cruzar la casilla del (5). */
  origenRecurso?: string;
}

/** El bloque central del documento, de (2) a (40). */
export function cuerpoGtfOficial(i: CuerpoGtfInput): string {
  const { ficha: f, datos: d } = i;
  const titulo = f.titulos?.[0];
  const comprobante = d.comprobante?.tipo && d.comprobante.tipo !== "ninguno" ? d.comprobante.tipo : "";

  return `
  <table class="cas">
    <tr>${box("2", "Autoridad Regional Forestal y de Fauna Silvestre", f.arffs, 'colspan="2"')}</tr>
    <tr>${box("3", "Fecha de Expedición", fechaGtf(i.fechaExpedicion))}${box("4", "Fecha de Vencimiento", fechaGtf(d.traslado?.fechaFin))}</tr>
    <tr><td class="c" colspan="2"><span class="n">(5)</span> <span class="l">Origen del Recurso:</span>${casillasOrigen(i.origenRecurso)}</td></tr>
    <tr>${box("6", "Número", titulo?.codigo, 'colspan="2"')}</tr>
    <tr>${box("7", "Nombre del Titular", f.razonSocial)}${box("", "Representante Legal", f.representante)}</tr>
    <tr>${box("8", "N° de Resolución", titulo?.tipo)}${box("9", "Plan de Manejo (Tipo)", "")}</tr>
    <tr>${box("10", "Departamento", f.region)}${box("11", "Provincia", f.provincia)}</tr>
    <tr>${box("12", "Distrito", f.distrito, 'colspan="2"')}</tr>
  </table>

  <table class="cas">
    <tr>${box("13", "PROPIETARIO DEL PRODUCTO", d.propietario?.nombre)}${box("14", "D.N.I. N°", d.propietario?.docTipo === "DNI" ? d.propietario?.docNumero : "")}</tr>
    <tr>${box("15", "R.U.C. N°", d.propietario?.docTipo === "RUC" ? d.propietario?.docNumero : "")}${box("16", "Dirección", d.propietario?.direccion)}</tr>
    <tr>${box("17", "Departamento", "")}${box("18", "Provincia", "")}</tr>
    <tr>${box("19", "Distrito", "")}${box("20", "Tipo de Comprobante de Compra o venta", comprobante)}</tr>
    <tr>${box("21", "N° Comprobante", d.comprobante?.numero, 'colspan="2"')}</tr>
  </table>

  <table class="cas">
    <tr>${box("22", "DESTINATARIO", d.destinatario?.nombre)}${box("23", "D.N.I. N°", d.destinatario?.docTipo === "DNI" ? d.destinatario?.docNumero : "")}</tr>
    <tr>${box("24", "R.U.C. N°", d.destinatario?.docTipo === "RUC" ? d.destinatario?.docNumero : "")}${box("25", "Dirección", d.destinatario?.direccion)}</tr>
    <tr>${box("26", "Departamento", "")}${box("27", "Provincia", "")}</tr>
    <tr>${box("28", "Distrito", "", 'colspan="2"')}</tr>
  </table>

  <p class="sec">TRANSPORTISTA:</p>
  <table class="cas">
    <tr>${box("29", "N° Guía de Remisión", d.comprobante?.tipo === "guia_remision" ? d.comprobante?.numero : "")}${box("30", "Tipo de Transporte", MODO_LABEL[d.vehiculo?.modo ?? ""] ?? d.vehiculo?.modo)}</tr>
    <tr>${box("31", "Tipo de Vehículo", d.vehiculo?.tipo)}${box("31", d.vehiculo?.modo === "fluvial" ? "Matrícula N°" : "Placa(s) N°", d.vehiculo?.placa)}</tr>
    <tr>${box("32", d.vehiculo?.modo === "fluvial" ? "Patrón" : "Conductor", d.vehiculo?.conductor)}${box("33", "D.N.I. N°", d.vehiculo?.conductorDni)}</tr>
    <tr>${box("34", "N° Licencia de conducir", d.vehiculo?.licencia, 'colspan="2"')}</tr>
  </table>

  <p class="sec">DETALLE DEL PRODUCTO</p>
  <table class="cas">
    <tr>${box("35", "Lista(s) de Troza(s)", i.listasTrozas)}${box("36", "N° GTF de Origen", i.gtfOrigen)}</tr>
  </table>

  ${tablaProductos(i.lineas)}

  <table class="cas">
    <tr>${box("38", "Observaciones", d.observaciones, 'colspan="2"')}</tr>
  </table>

  <table class="pie">
    <tr>
      <td class="est">${
        i.registroSerfor?.trim()
          ? `<b>ESTADO: REGISTRADA</b><br>N° REGISTRO : ${esc(i.registroSerfor)}`
          : `<span class="sinreg">Estado ante la ARFFS: pendiente de registro</span>`
      }</td>
      <td class="firma"><span class="n">(39)</span> Firma y sello del emisor :<div class="linea"></div></td>
    </tr>
    <tr><td></td><td class="firma"><span class="n">(40)</span> Nombres y apellidos del emisor :<div class="linea"></div></td></tr>
  </table>

  <p class="legal">
    Se invalida la GTF cuando contiene enmendaduras y/o alteraciones.<br>
    La presente GTF tiene carácter de declaración jurada y está sujeta a acciones penales contempladas
    en el numeral 32.3 del artículo N° 32 de la Ley 27444 (Ley del Procedimiento Administrativo General).
  </p>`;
}

/** Los estilos del formato: Arial y A4, como manda la RDE 122-2015-SERFOR-DE. */
export const CSS_GTF_OFICIAL = `
  .cas { width:100%; border-collapse:collapse; margin:0 0 2px; }
  .cas td.c { border:1px solid #000; padding:2px 4px; font-size:8pt; vertical-align:top; }
  .cas .n { font-size:7pt; }
  .cas .l { font-size:7pt; }
  .cas b { font-size:8.5pt; }
  .sec { font-size:8pt; font-weight:bold; margin:4px 0 2px; }
  .ck { display:inline-block; margin:0 6px 0 0; white-space:nowrap; }
  .ck .lb { font-size:7pt; }
  .ck .bx { display:inline-block; min-width:16px; border:1px solid #000; text-align:center; font-size:8pt; font-weight:bold; margin-left:2px; }
  .det { width:100%; border-collapse:collapse; margin:2px 0; }
  .det th, .det td { border:1px solid #000; padding:2px 4px; font-size:7.5pt; }
  .det th { font-weight:normal; text-align:center; }
  .det td.num { text-align:right; }
  .det .vacio { text-align:center; color:#555; padding:12px; }
  .det .tot { font-weight:bold; }
  .pie { width:100%; border-collapse:collapse; margin-top:6px; }
  .pie td { padding:4px; font-size:8pt; vertical-align:top; }
  .pie .est { background:#000; color:#fff; text-align:center; width:38%; padding:8px; }
  .pie .est .sinreg { color:#fff; font-size:7.5pt; }
  .pie .linea { border-bottom:1px solid #000; height:22px; }
  .legal { font-size:6.5pt; margin-top:6px; line-height:1.3; }
`;
