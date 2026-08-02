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

import { esc, seccionDoc } from "@/lib/forestal/ctp-documento-print";
import type { CtpFicha } from "@/lib/forestal/ctp-ficha-types";
import type { GtfDatos } from "@/lib/forestal/ctp-gtf-datos";

/**
 * Fecha a `DD.MM.YYYY`, como la imprime el talonario. Vacía si no hay.
 *
 * Entran las dos formas que existen en el sistema y NINGUNA otra:
 * · `YYYY-MM-DD` — las fechas propias del libro (date-only de la BD);
 * · `DD/MM/YYYY` (o con `-` o `.`) — las que publica la consulta del SNIFFS.
 *
 * Lo segundo no es un detalle: la ficha de SERFOR guarda `"17/12/2024"`, y
 * mientras acá sólo se aceptó ISO, los casilleros (3) Fecha de Expedición y (4)
 * Fecha de Vencimiento se imprimían EN BLANCO teniendo el dato al lado. Un
 * puesto de control lee justamente esos dos para saber si la guía todavía
 * ampara la carga.
 *
 * Lo que no se entiende sigue saliendo vacío: un "Invalid Date" impreso invalida
 * la guía por enmendadura en cuanto alguien lo tacha.
 */
export function fechaGtf(valor: string | null | undefined): string {
  const s = (valor ?? "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  // Perú escribe día primero; SERFOR también. No se adivina el orden.
  const pe = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/.exec(s);
  if (!pe) return "";
  const [, d, m, a] = pe;
  if (Number(d) < 1 || Number(d) > 31 || Number(m) < 1 || Number(m) > 12) return "";
  return `${d.padStart(2, "0")}.${m.padStart(2, "0")}.${a}`;
}

/**
 * El DNI de una parte. Cuando el documento principal es el RUC, la ficha de
 * SERFOR suele traer también el DNI del representante: viaja en `dniExtra` y
 * llena el casillero que le corresponde en vez de perderse.
 */
function dniDe(p: { docTipo?: string; docNumero?: string; dniExtra?: string } | undefined): string {
  if (!p) return "";
  return p.docTipo === "DNI" ? (p.docNumero ?? "") : (p.dniExtra ?? "");
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
  /**
   * Tipo de origen del recurso para cruzar la casilla del (5). Si no se pasa,
   * sale del `tipo` del título habilitante: las casillas del formato son
   * exactamente ese enum (concesión, permiso, autorización, plantación…).
   */
  origenRecurso?: string;
}

/** El bloque central del documento, de (2) a (40). */
export function cuerpoGtfOficial(i: CuerpoGtfInput): string {
  const { ficha: f, datos: d } = i;
  const titulo = f.titulos?.[0];
  // El (20) se lee en el papel: "guia_remision" es el valor del enum, no algo
  // que un puesto de control deba descifrar.
  const COMPROBANTE_LABEL: Record<string, string> = {
    factura: "Factura", boleta: "Boleta de venta",
    guia_remision: "Guía de remisión", otro: "Otro",
  };
  const comprobante =
    d.comprobante?.tipo && d.comprobante.tipo !== "ninguno"
      ? (COMPROBANTE_LABEL[d.comprobante.tipo] ?? d.comprobante.tipo)
      : "";

  return `
  ${seccionDoc("Título habilitante y titular del recurso", "casilleros (2) a (12)")}
  <table class="cas">
    <tr>${box("2", "Autoridad Regional Forestal y de Fauna Silvestre", f.arffs, 'colspan="2"')}</tr>
    <tr>${box("3", "Fecha de Expedición", fechaGtf(i.fechaExpedicion))}${box("4", "Fecha de Vencimiento", fechaGtf(d.traslado?.fechaFin))}</tr>
    <tr><td class="c" colspan="2"><span class="n">(5)</span> <span class="l">Origen del Recurso:</span>${casillasOrigen(i.origenRecurso ?? titulo?.tipo)}</td></tr>
    <tr>${box("6", "Número", titulo?.codigo, 'colspan="2"')}</tr>
    <tr>${box("7", "Nombre del Titular", f.razonSocial)}${box("", "Representante Legal", f.representante)}</tr>
    <tr>${box("8", "N° de Resolución", titulo?.resolucion)}${box("9", "Plan de Manejo (Tipo)", titulo?.planManejo)}</tr>
    <tr>${box("10", "Departamento", f.region)}${box("11", "Provincia", f.provincia)}</tr>
    <tr>${box("12", "Distrito", f.distrito, 'colspan="2"')}</tr>
  </table>

  ${seccionDoc("Propietario del producto", "casilleros (13) a (21)")}
  <table class="cas">
    <tr>${box("13", "Nombre o razón social", d.propietario?.nombre)}${box("14", "D.N.I. N°", dniDe(d.propietario))}</tr>
    <tr>${box("15", "R.U.C. N°", d.propietario?.docTipo === "RUC" ? d.propietario?.docNumero : "")}${box("16", "Dirección", d.propietario?.direccion)}</tr>
    <tr>${box("17", "Departamento", d.propietario?.departamento)}${box("18", "Provincia", d.propietario?.provincia)}</tr>
    <tr>${box("19", "Distrito", d.propietario?.distrito)}${box("20", "Tipo de Comprobante de Compra o venta", comprobante)}</tr>
    <tr>${box("21", "N° Comprobante", d.comprobante?.numero, 'colspan="2"')}</tr>
  </table>

  ${seccionDoc("Destinatario", "casilleros (22) a (28)")}
  <table class="cas">
    <tr>${box("22", "Nombre o razón social", d.destinatario?.nombre)}${box("23", "D.N.I. N°", dniDe(d.destinatario))}</tr>
    <tr>${box("24", "R.U.C. N°", d.destinatario?.docTipo === "RUC" ? d.destinatario?.docNumero : "")}${box("25", "Dirección", d.destinatario?.direccion)}</tr>
    <tr>${box("26", "Departamento", d.destinatario?.departamento)}${box("27", "Provincia", d.destinatario?.provincia)}</tr>
    <tr>${box("28", "Distrito", d.destinatario?.distrito, 'colspan="2"')}</tr>
  </table>

  ${seccionDoc("Transportista, vehículo y conductor", "casilleros (29) a (34)")}
  <table class="cas">
    <tr>${box("29", "N° Guía de Remisión", d.comprobante?.tipo === "guia_remision" ? d.comprobante?.numero : "")}${box("30", "Tipo de Transporte", MODO_LABEL[d.vehiculo?.modo ?? ""] ?? d.vehiculo?.modo)}</tr>
    <tr>${box("31", "Tipo de Vehículo", d.vehiculo?.tipo)}${box("31", d.vehiculo?.modo === "fluvial" ? "Matrícula N°" : "Placa(s) N°", d.vehiculo?.placa)}</tr>
    <tr>${box("32", d.vehiculo?.modo === "fluvial" ? "Patrón" : "Conductor", d.vehiculo?.conductor)}${box("33", "D.N.I. N°", d.vehiculo?.conductorDni)}</tr>
    <tr>${box("34", "N° Licencia de conducir", d.vehiculo?.licencia, 'colspan="2"')}</tr>
  </table>

  ${seccionDoc("Detalle del producto que se moviliza", "casilleros (35) a (38)")}
  <table class="cas">
    <tr>${box("35", "Lista(s) de Troza(s)", i.listasTrozas)}${box("36", "N° GTF de Origen", i.gtfOrigen)}</tr>
  </table>

  ${tablaProductos(i.lineas)}

  <table class="cas">
    <tr>${box("38", "Observaciones", d.observaciones, 'colspan="2"')}</tr>
  </table>

  <table class="pie">
    <tr>
      <td class="est ${i.registroSerfor?.trim() ? "ok" : "sin"}">${
        i.registroSerfor?.trim()
          ? `<b>ESTADO: REGISTRADA</b><span class="reg">N° REGISTRO : ${esc(i.registroSerfor)}</span>`
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

/**
 * Los estilos del formato: Arial y A4, como manda la RDE 122-2015-SERFOR-DE.
 *
 * Dos decisiones de lectura que no son cosméticas:
 * · **el rótulo arriba y el dato abajo** — los valores reales (una dirección, una
 *   razón social) son largos y en línea corrida empujaban el casillero siguiente;
 *   apilados, todas las filas miden lo mismo y el dato se encuentra siempre en el
 *   mismo lugar del casillero;
 * · **`b:empty` con línea punteada** — un casillero sin dato queda con un renglón
 *   para llenar a mano, que es exactamente lo que se hace con él. Antes era un
 *   hueco mudo que se confundía con un error de impresión.
 *
 * Depende de los tokens de `CSS_DOCUMENTO` (`--tinta`, `--gris`…): estas reglas
 * se inyectan siempre DESPUÉS del armazón compartido.
 */
export const CSS_GTF_OFICIAL = `
  .cas { width:100%; border-collapse:collapse; margin:0 0 1mm; table-layout:fixed; }
  .cas td.c { border:.6pt solid #9aa5a0; padding:1.2mm 1.6mm; vertical-align:top; }
  .cas .n { display:inline-block; min-width:5mm; margin-bottom:.4mm; padding:0 .6mm;
            border:.5pt solid var(--tinta); color:var(--tinta);
            font-size:6pt; font-weight:bold; text-align:center; }
  .cas .l { display:block; font-size:6.4pt; letter-spacing:.4pt; text-transform:uppercase; color:var(--gris-suave); }
  .cas b { display:block; min-height:4.6mm; font-size:8.6pt; line-height:1.25; word-wrap:break-word; }
  .cas b:empty { border-bottom:.5pt dotted #b6c0ba; }
  .sec { font-size:8pt; font-weight:bold; margin:4px 0 2px; }
  .ck { display:inline-block; margin:.6mm 3mm .6mm 0; white-space:nowrap; }
  .ck .lb { font-size:6.6pt; }
  .ck .bx { display:inline-block; min-width:4mm; border:.6pt solid var(--linea); text-align:center;
            font-size:7.4pt; font-weight:bold; margin-left:1mm; background:#fff; }
  .det { width:100%; border-collapse:collapse; margin:0; }
  .det th, .det td { border:.6pt solid #9aa5a0; padding:1.1mm 1.4mm; font-size:7.2pt; }
  .det thead th { background:var(--tinta); color:#fff; border-color:#0d3b20; font-weight:bold;
                  font-size:6.6pt; letter-spacing:.3pt; text-transform:uppercase; text-align:center; }
  .det tbody tr:nth-child(even) td { background:#f4f8f6; }
  .det td.num { text-align:right; font-variant-numeric:tabular-nums; font-weight:bold; }
  .det .vacio { text-align:center; color:var(--gris-suave); font-style:italic; padding:6mm; background:#fafbfa; }
  .det tfoot td { background:#e7efea; border-color:#7f8f87; }
  .det .tot { font-weight:bold; letter-spacing:.4pt; }
  .pie { width:100%; border-collapse:collapse; margin-top:3mm; }
  .pie td { padding:0 0 0 6mm; font-size:7.6pt; vertical-align:top; }
  .pie .est { width:38%; padding:2.2mm; text-align:center; }
  .pie .est.ok { background:var(--tinta); color:#fff; }
  .pie .est.ok .reg { display:block; margin-top:.8mm; font-size:7pt; font-family:"Courier New",Courier,monospace; }
  .pie .est.sin { border:.8pt dashed #9ca3af; background:#f6f7f6; }
  .pie .est .sinreg { font-size:7pt; color:var(--gris); }
  .pie .firma { font-size:6.8pt; letter-spacing:.4pt; text-transform:uppercase; color:var(--gris); }
  .pie .firma .n { font-weight:bold; color:var(--tinta); }
  .pie .linea { border-bottom:.7pt solid var(--linea); height:9mm; }
  .legal { font-size:6.2pt; margin-top:3mm; line-height:1.4; color:var(--gris); }
`;
