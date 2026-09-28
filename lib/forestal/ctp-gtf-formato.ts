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
import { tituloDeGuia, type CtpFicha, type PermisoDeGuia } from "@/lib/forestal/ctp-ficha-types";
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
export const ORIGENES: ReadonlyArray<{ clave: string; label: string }> = [
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

/**
 * Los casilleros **(2) a (12)**: los únicos que salen de la Ficha del CTP y del
 * título habilitante. El resto de la guía depende del despacho.
 *
 * Vive aparte para que la Ficha pueda mostrar una VISTA PREVIA de cómo quedan
 * esos casilleros sin inventar un despacho — misma función que imprime la guía
 * de verdad, así que lo que se ve acá es exactamente lo que va a salir. Si se
 * duplicara el HTML, la vista previa mentiría en cuanto cambie el formato.
 */
export function bloqueIdentidadGtf(
  f: CtpFicha,
  extra: {
    fechaExpedicion?: string;
    fechaVencimiento?: string;
    origenRecurso?: string;
    /** Código del título elegido EN LA GUÍA (`GtfDatos.titulos[0]`). Manda sobre
     *  el predeterminado de la Ficha: esa madera salió de ese permiso. */
    tituloElegido?: string;
    /**
     * Los permisos cargados (`ForestContrato`, ADR-421/425). Desde que el
     * select de la guía ofrece las dos listas, el elegido puede ser uno que la
     * Ficha no tiene: sin esto sus casilleros (5)(8)(9) salían en blanco
     * teniendo el dato cargado. La Ficha sigue mandando cuando está en las dos.
     */
    permisos?: readonly PermisoDeGuia[];
  } = {},
): string {
  const titulo = tituloDeGuia(f, extra.tituloElegido, extra.permisos);
  return `${seccionDoc("Título habilitante y titular del recurso", "casilleros (2) a (12)")}
  <table class="cas">
    <tr>${box2("2", "Autoridad Regional Forestal (ARFFS)", f.arffs)}${box("3", "F. Expedición", fechaGtf(extra.fechaExpedicion))}${box("4", "F. Vencimiento", fechaGtf(extra.fechaVencimiento))}</tr>
    <tr><td class="c" colspan="4"><span class="n">(5)</span> <span class="l">Origen del Recurso:</span>${casillasOrigen(extra.origenRecurso ?? titulo?.tipo)}</td></tr>
    <tr>${box2("6", "N° del título habilitante", titulo?.codigo)}${box2("7", "Nombre del Titular", f.razonSocial)}</tr>
    <tr>${box2("", "Representante Legal", f.representante)}${box2("8", "N° de Resolución", titulo?.resolucion)}</tr>
    <tr>${box2("9", "Plan de Manejo (Tipo)", titulo?.planManejo)}${box("10", "Depto.", f.region)}${box("11", "Prov.", f.provincia)}</tr>
    <tr>${box4("12", "Distrito", f.distrito)}</tr>
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
  /**
   * Los permisos cargados, para resolver un título elegido que sólo vive ahí
   * (ADR-421/425). Sin ellos el comportamiento es el de siempre: lo que no está
   * en la Ficha imprime el código y deja (5)(8)(9) en blanco.
   */
  permisos?: readonly PermisoDeGuia[];
}

/** El bloque central del documento, de (2) a (40). */
export function cuerpoGtfOficial(i: CuerpoGtfInput): string {
  const { ficha: f, datos: d } = i;
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
  ${bloqueIdentidadGtf(f, {
    fechaExpedicion: i.fechaExpedicion,
    fechaVencimiento: d.traslado?.fechaFin,
    origenRecurso: i.origenRecurso,
    // El que eligió el operador en el formulario de la guía. Antes se guardaba
    // y NO se imprimía: el papel declaraba siempre el primero de la Ficha.
    tituloElegido: d.titulos?.[0],
    permisos: i.permisos,
  })}

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
 * Decisiones de lectura que no son cosméticas:
 * · **rótulo y dato en la misma línea**, rótulo gris y dato en negro — el
 *   fiscalizador busca por número de casillero y lee el valor; el rótulo sólo
 *   confirma que está en el lugar correcto, así que no compite con el dato;
 * · **`b:empty` con línea punteada** — un casillero sin dato queda con un renglón
 *   para llenar a mano, que es exactamente lo que se hace con él. Antes era un
 *   hueco mudo que se confundía con un error de impresión;
 * · **grilla de hilos grises, sin bordes laterales afuera** — la tabla se lee
 *   por filas; el marco exterior no informa nada y sí ensucia la hoja;
 * · **columnas cortas del (37) sin partir** — «MADERA EN ROLLO» y «Metros
 *   Cúbicos» en dos renglones duplicaban el alto de cada fila y una guía de
 *   cuatro especies se iba a dos hojas.
 *
 * Depende de los tokens de `CSS_DOCUMENTO` (`--tinta`, `--gris`…): estas reglas
 * se inyectan siempre DESPUÉS del armazón compartido.
 */
export const CSS_GTF_OFICIAL = `
  /* ── Casilleros ── */
  .cas { width:100%; border-collapse:collapse; margin:0; table-layout:fixed; }
  .cas td.c { border:.5pt solid var(--linea-suave); padding:.75mm 1.5mm; vertical-align:top; line-height:1.22; }
  .cas td.c:first-child { border-left:none; padding-left:0; }
  .cas td.c:last-child { border-right:none; }
  /* La regla de la sección hace de borde superior: sin hilo doble. */
  .doc-sec + .cas tr:first-child td.c { border-top:none; }
  .cas .n { color:var(--gris-suave); font-size:6pt; font-variant-numeric:tabular-nums; margin-right:.5mm; }
  .cas .l { font-size:6pt; letter-spacing:.25pt; text-transform:uppercase; color:var(--gris); }
  .cas b { font-size:8pt; word-wrap:break-word; }
  /* Un casillero sin dato queda con renglón para llenar a mano, no como un hueco
     mudo que se confunde con un error de impresión. */
  .cas b:empty { display:inline-block; min-width:18mm; border-bottom:.5pt dotted #9a9a9a; }
  .sec { font-size:8pt; font-weight:bold; margin:4px 0 2px; }
  /* (5) Origen del recurso: casillas cuadradas, la marcada con X en negro. */
  .ck { display:inline-block; margin:0 1.4mm 0 0; white-space:nowrap; }
  .cas .l + .ck { margin-left:1.4mm; }
  .ck .lb { font-size:6pt; color:var(--tinta-clara); }
  .ck .bx { display:inline-block; width:3mm; height:3mm; line-height:2.8mm; border:.6pt solid var(--tinta);
            text-align:center; font-size:6.6pt; font-weight:bold; margin-left:.7mm; vertical-align:middle; }

  /* ── (37) Detalle del producto ── */
  .det { width:100%; border-collapse:collapse; margin:0; }
  .det th, .det td { border-bottom:.5pt solid var(--linea-suave); padding:.7mm 1.2mm; font-size:6.8pt; line-height:1.2; }
  .det thead th { background:var(--tenue); color:var(--tinta); font-weight:bold; font-size:6.2pt; letter-spacing:.3pt;
                  text-transform:uppercase; text-align:center; vertical-align:bottom;
                  border:.5pt solid var(--linea-suave); border-bottom-color:var(--linea); }
  .det thead tr:first-child th { border-top:.6pt solid var(--linea); }
  .det thead th:first-child { border-left:none; }
  .det thead tr:first-child th:last-child, .det thead tr:last-child th:last-child { border-right:none; }
  /* Producto, presentación y unidad dicen casi siempre lo mismo y son cortos:
     en un renglón. El nombre científico se queda con el aire que sobra. */
  .det tbody td:nth-child(3), .det tbody td:nth-child(4), .det tbody td:nth-child(6) { white-space:nowrap; }
  .det td.num { text-align:right; font-variant-numeric:tabular-nums; font-weight:bold; }
  .det .vacio { text-align:center; color:var(--gris-suave); font-style:italic; padding:4mm; }
  .det tfoot td { border-top:.8pt solid var(--linea); border-bottom:none; padding-top:.9mm; }
  .det tfoot td.tot:first-child { text-align:right; font-size:6.4pt; letter-spacing:.8pt; text-transform:uppercase; color:var(--gris); }
  .det tfoot td.num.tot { font-size:9pt; }

  /* ── Estado ante la ARFFS y firmas (39)(40) ── */
  table.pie { width:100%; border-collapse:collapse; margin-top:2.2mm; }
  table.pie td { padding:0 0 0 6mm; font-size:7pt; vertical-align:top; }
  table.pie .est { width:34%; padding:1mm 2mm; text-align:left; }
  table.pie .est.ok { border:.8pt solid var(--tinta); }
  table.pie .est.ok b { font-size:6.8pt; letter-spacing:1pt; }
  table.pie .est.ok .reg { display:block; margin-top:.5mm; font-size:8pt; font-weight:bold;
                           font-family:"Courier New",Courier,monospace; }
  table.pie .est.sin { border:.6pt dashed #9a9a9a; }
  table.pie .est .sinreg { font-size:6.6pt; color:var(--gris); }
  table.pie .firma { font-size:6.2pt; letter-spacing:.4pt; text-transform:uppercase; color:var(--gris); }
  table.pie .firma .n { color:var(--gris-suave); }
  table.pie .linea { border-bottom:.6pt solid var(--linea); height:4.2mm; }
  .legal { font-size:6pt; margin:1.8mm 0 0; line-height:1.3; color:var(--gris); }

  /* ── De dónde salen los datos (reproducción del SNIFFS o reconstrucción del libro) ──
     Vive acá y no en la hoja de SERFOR: la reconstrucción del libro usa la
     misma franja y sólo carga este CSS — sin estas reglas su marca se montaba
     encima del texto. */
  .gtf-proc { margin:0; font-size:6.4pt; line-height:1.45; color:var(--gris); }
  /* La marca abre el párrafo y el texto corre a su lado y por debajo: una
     franja de dos renglones, no un recuadro con la marca flotando. */
  .gtf-proc .doc-sello { margin-right:1.8mm; vertical-align:.2mm; line-height:1.15; padding:.25mm 1.6mm; }
  .gtf-proc .txt { display:inline; }
  .gtf-proc .txt b { color:var(--tinta); }
`;
