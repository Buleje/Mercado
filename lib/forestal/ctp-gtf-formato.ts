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

/**
 * Un casillero: número, rótulo y valor. El valor vacío queda en blanco.
 *
 * Rótulo y valor van en la MISMA línea. Apilados se leían cómodos pero cada
 * casillero medía 15 mm y la guía se iba a tres hojas: en un puesto de control
 * el papel se revisa de un vistazo, y tres hojas para una sola guía es peor que
 * una letra un punto más chica. `ancho` acepta el `colspan` para los campos que
 * no entran en un cuarto de fila (una razón social, una dirección).
 */
function box(n: string, label: string, valor: unknown, ancho = ""): string {
  // Sin número no se dibuja el paréntesis: el formato tiene campos que van
  // pegados al casillero anterior (el representante legal cuelga del (7)) y un
  // "()" vacío se lee como un casillero que perdió su número.
  const num = n ? `<span class="n">(${esc(n)})</span> ` : "";
  return `<td class="c" ${ancho}>${num}<span class="l">${esc(label)}:</span> <b>${esc(valor)}</b></td>`;
}

/** Casillero que ocupa media fila (dos de las cuatro columnas). */
const box2 = (n: string, label: string, valor: unknown) => box(n, label, valor, 'colspan="2"');
/** Casillero de fila entera. */
const box4 = (n: string, label: string, valor: unknown) => box(n, label, valor, 'colspan="4"');

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
      <th rowspan="2">(37a) N. Científico</th><th rowspan="2">(37b) N. Común</th>
      <th rowspan="2">(37c) Producto</th><th colspan="2">Embalaje / presentación</th>
      <th colspan="2">Cantidad</th>
    </tr><tr>
      <th>(37d) Descripción</th><th>(37e) Cant.</th><th>(37f) Unidad</th><th>(37g) Total</th>
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
    <tr>${box2("2", "Autoridad Regional Forestal (ARFFS)", f.arffs)}${box("3", "F. Expedición", fechaGtf(i.fechaExpedicion))}${box("4", "F. Vencimiento", fechaGtf(d.traslado?.fechaFin))}</tr>
    <tr><td class="c" colspan="4"><span class="n">(5)</span> <span class="l">Origen del Recurso:</span>${casillasOrigen(i.origenRecurso ?? titulo?.tipo)}</td></tr>
    <tr>${box2("6", "N° del título habilitante", titulo?.codigo)}${box2("7", "Nombre del Titular", f.razonSocial)}</tr>
    <tr>${box2("", "Representante Legal", f.representante)}${box2("8", "N° de Resolución", titulo?.resolucion)}</tr>
    <tr>${box2("9", "Plan de Manejo (Tipo)", titulo?.planManejo)}${box("10", "Depto.", f.region)}${box("11", "Prov.", f.provincia)}</tr>
    <tr>${box4("12", "Distrito", f.distrito)}</tr>
  </table>

  ${seccionDoc("Propietario del producto", "casilleros (13) a (21)")}
  <table class="cas">
    <tr>${box2("13", "Nombre o razón social", d.propietario?.nombre)}${box("14", "D.N.I.", dniDe(d.propietario))}${box("15", "R.U.C.", d.propietario?.docTipo === "RUC" ? d.propietario?.docNumero : "")}</tr>
    <tr>${box2("16", "Dirección", d.propietario?.direccion)}${box("17", "Depto.", d.propietario?.departamento)}${box("18", "Prov.", d.propietario?.provincia)}</tr>
    <tr>${box("19", "Distrito", d.propietario?.distrito)}${box("20", "Comprobante", comprobante)}${box2("21", "N° Comprobante", d.comprobante?.numero)}</tr>
  </table>

  ${seccionDoc("Destinatario", "casilleros (22) a (28)")}
  <table class="cas">
    <tr>${box2("22", "Nombre o razón social", d.destinatario?.nombre)}${box("23", "D.N.I.", dniDe(d.destinatario))}${box("24", "R.U.C.", d.destinatario?.docTipo === "RUC" ? d.destinatario?.docNumero : "")}</tr>
    <tr>${box2("25", "Dirección", d.destinatario?.direccion)}${box("26", "Depto.", d.destinatario?.departamento)}${box("27", "Prov.", d.destinatario?.provincia)}</tr>
    <tr>${box4("28", "Distrito", d.destinatario?.distrito)}</tr>
  </table>

  ${seccionDoc("Transportista, vehículo y conductor", "casilleros (29) a (34)")}
  <table class="cas">
    <tr>${box("29", "N° G. Remisión", d.comprobante?.tipo === "guia_remision" ? d.comprobante?.numero : "")}${box("30", "Transporte", MODO_LABEL[d.vehiculo?.modo ?? ""] ?? d.vehiculo?.modo)}${box("31", "Vehículo", d.vehiculo?.tipo)}${box("31", d.vehiculo?.modo === "fluvial" ? "Matrícula N°" : "Placa(s) N°", d.vehiculo?.placa)}</tr>
    <tr>${box2("32", d.vehiculo?.modo === "fluvial" ? "Patrón" : "Conductor", d.vehiculo?.conductor)}${box("33", "D.N.I.", d.vehiculo?.conductorDni)}${box("34", "Licencia", d.vehiculo?.licencia)}</tr>
  </table>

  ${seccionDoc("Detalle del producto que se moviliza", "casilleros (35) a (38)")}
  <table class="cas">
    <tr>${box2("35", "Lista(s) de Troza(s)", i.listasTrozas)}${box2("36", "N° GTF de Origen", i.gtfOrigen)}</tr>
  </table>

  ${tablaProductos(i.lineas)}

  <table class="cas">
    <tr>${box4("38", "Observaciones", d.observaciones)}</tr>
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
  .cas { width:100%; border-collapse:collapse; margin:0 0 .8mm; table-layout:fixed; }
  .cas td.c { border:.6pt solid #9aa5a0; padding:.9mm 1.2mm; vertical-align:top; line-height:1.25; }
  .cas .n { display:inline-block; min-width:4.2mm; margin-right:.6mm; padding:0 .4mm;
            border:.5pt solid var(--tinta); color:var(--tinta);
            font-size:5.6pt; font-weight:bold; text-align:center; vertical-align:.4mm; }
  .cas .l { font-size:6pt; letter-spacing:.2pt; text-transform:uppercase; color:var(--gris-suave); }
  .cas b { font-size:8pt; word-wrap:break-word; }
  /* Un casillero sin dato queda con renglón para llenar a mano, no como un hueco
     mudo que se confunde con un error de impresión. */
  .cas b:empty { display:inline-block; min-width:18mm; border-bottom:.5pt dotted #b6c0ba; }
  .sec { font-size:8pt; font-weight:bold; margin:4px 0 2px; }
  .ck { display:inline-block; margin:0 1.6mm 0 0; white-space:nowrap; }
  .ck .lb { font-size:5.6pt; }
  .ck .bx { display:inline-block; min-width:3.4mm; border:.6pt solid var(--linea); text-align:center;
            font-size:6.6pt; font-weight:bold; margin-left:.7mm; background:#fff; }
  .det { width:100%; border-collapse:collapse; margin:0; }
  .det th, .det td { border:.6pt solid #9aa5a0; padding:.6mm 1mm; font-size:6.4pt; line-height:1.18; }
  .det thead th { background:var(--tinta); color:#fff; border-color:#0d3b20; font-weight:bold;
                  font-size:6pt; letter-spacing:.2pt; text-transform:uppercase; text-align:center; }
  .det tbody tr:nth-child(even) td { background:#f4f8f6; }
  .det td.num { text-align:right; font-variant-numeric:tabular-nums; font-weight:bold; }
  .det .vacio { text-align:center; color:var(--gris-suave); font-style:italic; padding:4mm; background:#fafbfa; }
  .det tfoot td { background:#e7efea; border-color:#7f8f87; }
  .det .tot { font-weight:bold; letter-spacing:.3pt; }
  .pie { width:100%; border-collapse:collapse; margin-top:1.2mm; }
  .pie td { padding:0 0 0 5mm; font-size:7pt; vertical-align:top; }
  .pie .est { width:34%; padding:1.2mm; text-align:center; }
  .pie .est.ok { background:var(--tinta); color:#fff; }
  .pie .est.ok .reg { display:block; margin-top:.6mm; font-size:6.6pt; font-family:"Courier New",Courier,monospace; }
  .pie .est.sin { border:.8pt dashed #9ca3af; background:#f6f7f6; }
  .pie .est .sinreg { font-size:6.6pt; color:var(--gris); }
  .pie .firma { font-size:6.2pt; letter-spacing:.3pt; text-transform:uppercase; color:var(--gris); }
  .pie .firma .n { font-weight:bold; color:var(--tinta); }
  .pie .linea { border-bottom:.7pt solid var(--linea); height:4.5mm; }
  .legal { font-size:5.4pt; margin-top:1.2mm; line-height:1.25; color:var(--gris); }
`;
