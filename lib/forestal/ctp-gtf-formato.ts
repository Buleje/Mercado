/**
 * El cuerpo de la GTF con los casilleros numerados del formato de SERFOR.
 *
 * El que la recibe en un puesto de control busca por NÚMERO: pide el (21) y el
 * (28), no "el destinatario" y "la placa". Este módulo arma el bloque central
 * con la numeración del formato VIGENTE —(1) a (39), Anexo I de la RDE
 * D000014-2024-MIDAGRI-SERFOR-DE, que derogó la RDE 122-2015 (ADR-494)—.
 *
 * `CASILLEROS_GTF_2024` es el mapa: cada casillero 2024 dice qué claves de
 * `casillerosGtf` lo llenan, o por qué va vacío. Las CLAVES no cambiaron con el
 * formato (son el contrato del talonario de la matricial, que guarda el acomodo
 * por clave, y de la libreta): cambió dónde y con qué número se imprimen.
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
import { claveFilaGTF, filasGTF, textoGTF, totalizarGTF } from "@/lib/forestal/gtf-redondeo";
import { tituloDeGuia, type CtpFicha, type PermisoDeGuia } from "@/lib/forestal/ctp-ficha-types";
import { partidaImpresa, type GtfDatos } from "@/lib/forestal/ctp-gtf-datos";

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

/** Un valor del papel en texto: `null`/`undefined` → "" (lo mismo que imprime `esc`). */
const txt = (v: unknown): string => (v == null ? "" : String(v));

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
  // Sin número no se dibuja el paréntesis: un "()" vacío se lee como un
  // casillero que perdió su número.
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
 * Casillero (5) «Origen del recurso o procedencia»: un juego de casillas
 * marcadas, no un texto. Se dibujan TODAS y se cruza la que corresponde — así
 * se lee igual que el talonario, donde el fiscalizador ve de un vistazo cuáles
 * NO son. Son las diez del formato 2024, en su orden.
 */
export const ORIGENES: ReadonlyArray<{ clave: string; label: string }> = [
  { clave: "concesion", label: "Concesión" },
  { clave: "permiso", label: "Permiso" },
  { clave: "autorizacion", label: "Autorización" },
  { clave: "bosque_local", label: "Bosque local" },
  { clave: "desbosque", label: "Desbosque" },
  { clave: "cambio_uso", label: "Cambio de Uso" },
  { clave: "plantacion", label: "Plantación" },
  { clave: "varios_origenes", label: "Varios orígenes" },
  { clave: "ctp", label: "Centro de Transformación Primaria-CTP" },
  { clave: "cesion_uso", label: "Cesión en Uso" },
];

/**
 * Las casillas del formato 2015 que el de 2024 ya no tiene. Una guía vieja
 * puede traerlas guardadas: la hoja no cruza ninguna (no hay dónde, y cruzar
 * otra sería inventar), y el talonario conserva su campo para no perder el
 * acomodo de quien todavía imprime sobre el talonario 2015. El plan consolidado
 * en 2024 se declara con los códigos de todos los títulos en el (6).
 */
export const ORIGENES_SIN_CASILLA_2024: ReadonlyArray<{ clave: string; label: string }> = [
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

/**
 * (36) «Anexos que forman parte integrante de la GTF»: las cuatro casillas del
 * formato, SIN marcar. Cuál corresponde lo decide quien emite (la lista de
 * trozas es el Anexo 03 sólo si viaja como tal); marcarla desde acá sería
 * declarar por él.
 */
const ANEXOS_GTF_2024 = [
  "Anexo 01: Formato adicional para el detalle de productos",
  "Anexo 02: Formato para consignar varios orígenes",
  "Anexo 03: Lista de trozas",
  "Anexo 04: Lista de productos transformados",
] as const;

const casillasAnexos = (): string =>
  ANEXOS_GTF_2024.map((a) => `<span class="ck"><span class="lb">${esc(a)}</span><span class="bx">&nbsp;</span></span>`).join("");

export interface LineaProducto {
  cientifico: string;
  comun: string;
  tipoProducto: string;
  presentacion: string;
  cantidad: number;
  unidad: string;
  total: number;
}

/**
 * Las líneas como FILAS de la GTF (Brandon 2026-10-03): una por nombre
 * científico + tipo de producto, con su total = Σ exacta de las líneas que la
 * forman redondeada UNA vez a 3 decimales (HALF_UP). Una guía con dos asientos
 * de la misma especie y producto imprime una fila, como SERFOR.
 */
export function filasDeLaGuia(lineas: ReadonlyArray<LineaProducto>): LineaProducto[] {
  return filasGTF(
    lineas,
    (l) => claveFilaGTF({ cientifico: l.cientifico, comun: l.comun, tipo: l.tipoProducto, unidad: l.unidad }),
    (l) => l.total,
    (l) => l.cantidad,
  ).map((f) => ({ ...f.items[0], cantidad: f.piezas, total: f.m3 }));
}

/** El Volumen Total de la guía: la suma de sus filas YA redondeadas, nunca la del crudo. */
export const volumenTotalDeLaGuia = (lineas: ReadonlyArray<LineaProducto>): number =>
  totalizarGTF(filasDeLaGuia(lineas).map((l) => ({ m3: l.total }))).m3;

/** Una fila del detalle (34) como se imprime: ya formateada, columna por columna.
 *  Las claves son las del talonario (numeración 2015, «37a»…): (34a) ← 37a … (34g) ← 37g. */
export type FilaDetalleGtf = Record<"37a" | "37b" | "37c" | "37d" | "37e" | "37f" | "37g", string>;

/**
 * El detalle (34a–34g) y su (34h) Total movilizado, en texto. Single source de
 * la tabla del papel A4 (`tablaProductos`) y del talonario de la matricial
 * (`gtf-matricial-valores`): los dos imprimen ESTO.
 */
export function detalleGtf(lineasDeEntrada: ReadonlyArray<LineaProducto>): { filas: FilaDetalleGtf[]; total: string } {
  const lineas = filasDeLaGuia(lineasDeEntrada);
  // Se suman SOLO las filas, ya redondeadas: el total es de lo que se está
  // moviendo y cierra EXACTO con el detalle impreso (31,188 y no 31,185).
  const total = totalizarGTF(lineas.map((l) => ({ m3: l.total }))).m3;
  return {
    filas: lineas.map((l) => ({
      "37a": txt(l.cientifico), "37b": txt(l.comun), "37c": txt(l.tipoProducto), "37d": txt(l.presentacion),
      "37e": txt(l.cantidad), "37f": txt(l.unidad), "37g": textoGTF(l.total),
    })),
    total: textoGTF(total),
  };
}

/** Lo que recibe la identidad (2)–(11c) además de la Ficha. */
export interface ExtraIdentidadGtf {
  fechaExpedicion?: string;
  fechaVencimiento?: string;
  origenRecurso?: string;
  /** Código del título elegido EN LA GUÍA (`GtfDatos.titulos[0]`). Manda sobre
   *  el predeterminado de la Ficha: esa madera salió de ese permiso. */
  tituloElegido?: string;
  /**
   * Los permisos cargados (`ForestContrato`, ADR-421/425). Desde que el
   * select de la guía ofrece las dos listas, el elegido puede ser uno que la
   * Ficha no tiene: sin esto sus casilleros (5)(9)(10) salían en blanco
   * teniendo el dato cargado. La Ficha sigue mandando cuando está en las dos.
   */
  permisos?: readonly PermisoDeGuia[];
}

/**
 * Los casilleros de la identidad, en texto. Las claves son las del talonario
 * (numeración 2015) y NO se renombran: `CASILLEROS_GTF_2024` dice en qué
 * casillero 2024 cae cada una — "8" es el (9) N° Resolución, `rep` el (8).
 */
export type CasillerosIdentidadGtf = Record<"2" | "3" | "4" | "5" | "6" | "7" | "rep" | "8" | "9" | "10" | "11" | "12", string>;

/**
 * El VALOR de la identidad, ya formateado. El "5" es la CLAVE del origen
 * marcado (`ORIGENES`), en minúsculas; "" si ninguno. Lo leen
 * `bloqueIdentidadGtf` y `casillerosGtf`.
 */
export function casillerosIdentidad(f: CtpFicha, extra: ExtraIdentidadGtf = {}): CasillerosIdentidadGtf {
  const titulo = tituloDeGuia(f, extra.tituloElegido, extra.permisos);
  return {
    "2": txt(f.arffs),
    "3": fechaGtf(extra.fechaExpedicion),
    "4": fechaGtf(extra.fechaVencimiento),
    "5": txt(extra.origenRecurso ?? titulo?.tipo).trim().toLowerCase(),
    "6": txt(titulo?.codigo),
    "7": txt(f.razonSocial),
    rep: txt(f.representante),
    "8": txt(titulo?.resolucion),
    "9": txt(titulo?.planManejo),
    "10": txt(f.region),
    "11": txt(f.provincia),
    "12": txt(f.distrito),
  };
}

export interface CuerpoGtfInput {
  ficha: CtpFicha;
  datos: GtfDatos;
  lineas: LineaProducto[];
  /** N° de la guía que se está emitiendo (serie + correlativo del CTP) — casillero (1). */
  numeroGtf: string;
  /** Fecha de expedición, `YYYY-MM-DD`. */
  fechaExpedicion: string;
  /** Listas de trozas que amparan el despacho — casillero (33). */
  listasTrozas: string;
  /** GTF con la que la materia prima ENTRÓ al CTP — casillero (32). */
  gtfOrigen: string;
  /**
   * N° de registro que devolvió SERFOR al registrar la guía («N° de registro»
   * del encabezado). Vacío = el recuadro va en blanco: Buleje no registra ante
   * la autoridad y afirmar "REGISTRADA" sin serlo es fabricar la constancia de
   * un trámite.
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
   * en la Ficha imprime el código y deja (5)(9)(10) en blanco.
   */
  permisos?: readonly PermisoDeGuia[];
}

/**
 * Todos los casilleros con valor de la guía, por CLAVE del talonario. Las
 * claves numéricas son las de la RDE 122-2015 y se quedan así (el talonario
 * guarda el acomodo de cada campo por clave en `gtf-talonario:<tenantId>`):
 * qué casillero 2024 llena cada una lo dice `CASILLEROS_GTF_2024`.
 *
 * `31p` = las placas: el tracto y, si hay, el remolque («Placa (s)/ Matrícula
 * N.º», el (28)). `p17`…`p20d` = «Datos del punto de partida» (17)–(20d) y
 * `d22` = el (22) N° de autorización del destinatario: nacieron con el formato
 * 2024 y su clave lleva prefijo porque "17" ya era el departamento del
 * propietario.
 */
export type CasillerosGtf = CasillerosIdentidadGtf &
  Record<
    | "13" | "14" | "15" | "16" | "17" | "18" | "19" | "20" | "21"
    | "22" | "23" | "24" | "25" | "26" | "27" | "28"
    | "29" | "30" | "31" | "31p" | "32" | "33" | "34" | "35" | "36" | "38"
    | "p17" | "p18" | "p19" | "p20a" | "p20b" | "p20c" | "p20d" | "d22",
    string
  >;

/** El (15) se lee en el papel: "guia_remision" es el valor del enum, no algo que un puesto de control deba descifrar. */
const COMPROBANTE_LABEL: Record<string, string> = {
  factura: "Factura", boleta: "Boleta de venta",
  guia_remision: "Guía de remisión", otro: "Otro",
};

/**
 * El VALOR de cada casillero de la guía, ya formateado como lo imprime la hoja
 * (fechas `DD.MM.YYYY`, enums leídos, el DNI que corresponde a cada parte).
 * Single source del papel A4 (`cuerpoGtfOficial`) y del talonario de la
 * matricial (`gtf-matricial-valores`): un casillero no puede decir una cosa
 * en la hoja y otra en el talonario.
 */
export function casillerosGtf(i: CuerpoGtfInput): CasillerosGtf {
  const { ficha: f, datos: d } = i;
  const pi = partidaImpresa(d.traslado?.partida);
  const comprobante =
    d.comprobante?.tipo && d.comprobante.tipo !== "ninguno"
      ? (COMPROBANTE_LABEL[d.comprobante.tipo] ?? d.comprobante.tipo)
      : "";
  /* «Placa(s) N°»: el tracto y su remolque («ABC-123 / XYZ-456»); la embarcación, su matrícula. */
  const placas =
    d.vehiculo?.modo === "fluvial"
      ? txt(d.vehiculo?.placa)
      : [d.vehiculo?.placa, d.vehiculo?.placaRemolque].map((x) => txt(x).trim()).filter(Boolean).join(" / ");
  return {
    ...casillerosIdentidad(f, {
      fechaExpedicion: i.fechaExpedicion,
      fechaVencimiento: d.traslado?.fechaFin,
      origenRecurso: i.origenRecurso,
      // El que eligió el operador en el formulario de la guía. Antes se guardaba
      // y NO se imprimía: el papel declaraba siempre el primero de la Ficha.
      tituloElegido: d.titulos?.[0],
      permisos: i.permisos,
    }),
    "13": txt(d.propietario?.nombre),
    "14": dniDe(d.propietario),
    "15": d.propietario?.docTipo === "RUC" ? txt(d.propietario?.docNumero) : "",
    "16": txt(d.propietario?.direccion),
    "17": txt(d.propietario?.departamento),
    "18": txt(d.propietario?.provincia),
    "19": txt(d.propietario?.distrito),
    "20": comprobante,
    "21": txt(d.comprobante?.numero),
    "22": txt(d.destinatario?.nombre),
    "23": dniDe(d.destinatario),
    "24": d.destinatario?.docTipo === "RUC" ? txt(d.destinatario?.docNumero) : "",
    "25": txt(d.destinatario?.direccion),
    "26": txt(d.destinatario?.departamento),
    "27": txt(d.destinatario?.provincia),
    "28": txt(d.destinatario?.distrito),
    /* (25) la guía de remisión DEL TRANSPORTISTA, que se carga aparte del
       comprobante. Hasta el 16-10-2026 este casillero sólo leía el comprobante
       cuando era una guía de remisión, y el N° cargado en su campo no salía. */
    "29": txt(d.guia?.guiaRemisionNro).trim() || (d.comprobante?.tipo === "guia_remision" ? txt(d.comprobante?.numero) : ""),
    "30": txt(MODO_LABEL[d.vehiculo?.modo ?? ""] ?? d.vehiculo?.modo),
    "31": txt(d.vehiculo?.tipo),
    "31p": placas,
    "32": txt(d.vehiculo?.conductor),
    "33": txt(d.vehiculo?.conductorDni),
    "34": txt(d.vehiculo?.licencia),
    "35": txt(i.listasTrozas),
    "36": txt(i.gtfOrigen),
    "38": txt(d.observaciones),
    "p17": txt(pi?.nombre),
    "p18": txt(pi?.autorizacion),
    "p19": txt(pi?.tipo),
    "p20a": txt(pi?.direccion),
    "p20b": txt(pi?.departamento),
    "p20c": txt(pi?.provincia),
    "p20d": txt(pi?.distrito),
    "d22": txt(d.destinatario?.autorizacion),
  };
}

/** De dónde sale el valor de un casillero 2024: una clave de `casillerosGtf`, una columna del detalle, el N° de la guía o el total. */
export type FuenteGtf2024 = keyof CasillerosGtf | keyof FilaDetalleGtf | "numeroGtf" | "volumenTotal";

/** Los bloques del Anexo I, en su orden. */
export type BloqueGtf2024 =
  | "encabezado" | "origen" | "propietario" | "partida" | "destinatario" | "transportista" | "detalle" | "firmas";

/** Un casillero del formato 2024: lo llenan las fuentes de `de` (unidas por « / ») o va vacío por `vacio`. */
export interface Casillero2024 {
  /** Como lo imprime el formato: "1", "11a", "34h". */
  n: string;
  /** El rótulo del Anexo I. */
  rotulo: string;
  bloque: BloqueGtf2024;
  de?: readonly FuenteGtf2024[];
  /** Por qué ningún dato del sistema lo llena: queda con su número y en blanco. */
  vacio?: string;
}

/**
 * El mapa del formato vigente: los 58 casilleros del Anexo I de la RDE
 * D000014-2024-MIDAGRI-SERFOR-DE, en su orden, con la clave de `casillerosGtf`
 * que llena cada uno (ADR-494). La hoja toma de acá el número y el rótulo; el
 * test `forestal-gtf-formato-2024` comprueba que ninguna clave quede sin casillero.
 *
 * Dos casilleros juntan dos claves del 2015, que tenía uno para el DNI y otro
 * para el RUC: el (13) y el (23) son «DNI/RUC N.º» e imprimen el RUC y, si la
 * ficha trae también un DNI, los dos.
 */
export const CASILLEROS_GTF_2024 = [
  { n: "1", rotulo: "N°", bloque: "encabezado", de: ["numeroGtf"] },
  { n: "2", rotulo: "Autoridad Regional Forestal y de Fauna Silvestre (ARFFS)", bloque: "encabezado", de: ["2"] },
  { n: "3", rotulo: "Fecha de expedición", bloque: "encabezado", de: ["3"] },
  { n: "4", rotulo: "Fecha de vencimiento", bloque: "encabezado", de: ["4"] },
  { n: "5", rotulo: "Origen del recurso o procedencia", bloque: "origen", de: ["5"] },
  { n: "6", rotulo: "N°", bloque: "origen", de: ["6"] },
  { n: "7", rotulo: "Nombre del Titular", bloque: "origen", de: ["7"] },
  { n: "8", rotulo: "Rep. Legal", bloque: "origen", de: ["rep"] },
  { n: "9", rotulo: "N° Resolución", bloque: "origen", de: ["8"] },
  { n: "10", rotulo: "Plan de Manejo (Tipo)", bloque: "origen", de: ["9"] },
  { n: "11a", rotulo: "Departamento", bloque: "origen", de: ["10"] },
  { n: "11b", rotulo: "Provincia", bloque: "origen", de: ["11"] },
  { n: "11c", rotulo: "Distrito", bloque: "origen", de: ["12"] },
  { n: "12", rotulo: "Propietario del producto", bloque: "propietario", de: ["13"] },
  { n: "13", rotulo: "DNI/RUC N.º", bloque: "propietario", de: ["15", "14"] },
  { n: "14a", rotulo: "Dirección", bloque: "propietario", de: ["16"] },
  { n: "14b", rotulo: "Departamento", bloque: "propietario", de: ["17"] },
  { n: "14c", rotulo: "Provincia", bloque: "propietario", de: ["18"] },
  { n: "14d", rotulo: "Distrito", bloque: "propietario", de: ["19"] },
  { n: "15", rotulo: "Tipo de Comprobante de Compra o Venta", bloque: "propietario", de: ["20"] },
  { n: "16", rotulo: "N° de comprobante", bloque: "propietario", de: ["21"] },
  { n: "17", rotulo: "Punto de partida", bloque: "partida", de: ["p17"] },
  { n: "18", rotulo: "N° Autorización", bloque: "partida", de: ["p18"] },
  { n: "19", rotulo: "Tipo de Establecimiento", bloque: "partida", de: ["p19"] },
  { n: "20a", rotulo: "Dirección", bloque: "partida", de: ["p20a"] },
  { n: "20b", rotulo: "Departamento", bloque: "partida", de: ["p20b"] },
  { n: "20c", rotulo: "Provincia", bloque: "partida", de: ["p20c"] },
  { n: "20d", rotulo: "Distrito", bloque: "partida", de: ["p20d"] },
  { n: "21", rotulo: "Destinatario", bloque: "destinatario", de: ["22"] },
  { n: "22", rotulo: "N° Autorización", bloque: "destinatario", de: ["d22"] },
  { n: "23", rotulo: "DNI/RUC N.º", bloque: "destinatario", de: ["24", "23"] },
  { n: "24a", rotulo: "Dirección", bloque: "destinatario", de: ["25"] },
  { n: "24b", rotulo: "Departamento", bloque: "destinatario", de: ["26"] },
  { n: "24c", rotulo: "Provincia", bloque: "destinatario", de: ["27"] },
  { n: "24d", rotulo: "Distrito", bloque: "destinatario", de: ["28"] },
  { n: "25", rotulo: "N.º Guía de Remisión de Transportista", bloque: "transportista", de: ["29"] },
  { n: "26", rotulo: "Tipo de Transporte", bloque: "transportista", de: ["30"] },
  { n: "27", rotulo: "Tipo de vehículo", bloque: "transportista", de: ["31"] },
  { n: "28", rotulo: "Placa (s)/ Matrícula N.º", bloque: "transportista", de: ["31p"] },
  { n: "29", rotulo: "Nombre del conductor", bloque: "transportista", de: ["32"] },
  { n: "30", rotulo: "DNI N°", bloque: "transportista", de: ["33"] },
  { n: "31", rotulo: "Lic. Conducir N.º", bloque: "transportista", de: ["34"] },
  { n: "32", rotulo: "N.º GTF de origen", bloque: "detalle", de: ["36"] },
  { n: "33", rotulo: "Lista de Trozas/ Productos Transformados N°", bloque: "detalle", de: ["35"] },
  { n: "34", rotulo: "Cuadro detalle de productos", bloque: "detalle", vacio: "Es el título del cuadro: los datos van en (34a) a (34h)." },
  { n: "34a", rotulo: "Nombre Científico", bloque: "detalle", de: ["37a"] },
  { n: "34b", rotulo: "Nombre común o comercial", bloque: "detalle", de: ["37b"] },
  { n: "34c", rotulo: "Tipo de producto", bloque: "detalle", de: ["37c"] },
  { n: "34d", rotulo: "Descripción", bloque: "detalle", de: ["37d"] },
  { n: "34e", rotulo: "Cantidad", bloque: "detalle", de: ["37e"] },
  { n: "34f", rotulo: "Unidad de medida", bloque: "detalle", de: ["37f"] },
  { n: "34g", rotulo: "Total", bloque: "detalle", de: ["37g"] },
  { n: "34h", rotulo: "Total movilizado", bloque: "detalle", de: ["volumenTotal"] },
  { n: "35", rotulo: "Observaciones", bloque: "detalle", de: ["38"] },
  {
    n: "36", rotulo: "Anexos que forman parte integrante de la Guía de Transporte Forestal", bloque: "detalle",
    vacio: "Se marca a mano: qué anexo viaja con la guía lo declara quien la emite.",
  },
  { n: "37", rotulo: "Firma y sello del emisor", bloque: "firmas", vacio: "Se firma a mano." },
  { n: "38", rotulo: "Nombres y apellidos del emisor", bloque: "firmas", vacio: "Se escribe a mano junto a la firma." },
  {
    n: "39", rotulo: "Documento de Identidad del emisor", bloque: "firmas",
    vacio: "Nuevo en 2024; el sistema no guarda quién firma la guía.",
  },
] as const satisfies readonly Casillero2024[];

export type NumeroGtf2024 = (typeof CASILLEROS_GTF_2024)[number]["n"];

const CASILLERO = Object.fromEntries(CASILLEROS_GTF_2024.map((c) => [c.n, c])) as Record<NumeroGtf2024, Casillero2024>;

/**
 * El número 2024 que lleva en el papel el campo cuya clave interna es `clave`
 * ("13" → "12", "37a" → "34a", "p17" → "17"). Los formularios del panel rotulan
 * con esto, así que el número de la pantalla es el de la hoja (ADR-494). Una
 * clave que ninguna fuente nombra devuelve `undefined`: el campo no tiene casillero.
 */
const NUMERO_POR_CLAVE: ReadonlyMap<string, string> = new Map(
  CASILLEROS_GTF_2024.flatMap((c) =>
    ("de" in c ? (c.de as readonly string[]) : []).map((k): [string, string] => [k, c.n]),
  ),
);
export const casilleroGtf2024 = (clave: string): string | undefined => NUMERO_POR_CLAVE.get(clave);

/** Los valores con los que se dibuja la hoja: los de `casillerosGtf` más el N° de la guía. */
type ValoresHoja = Partial<Record<FuenteGtf2024, string>>;

/** Media fila, tres cuartos y fila entera (la hoja tiene cuatro columnas). */
const C2 = 'colspan="2"';
const C3 = 'colspan="3"';
const C4 = 'colspan="4"';

const numero = (n: NumeroGtf2024): string => `<span class="n">(${n})</span>`;

/** El casillero `n` con su número, su rótulo del Anexo I y el valor de sus fuentes. */
function celda(v: ValoresHoja, n: NumeroGtf2024, ancho = ""): string {
  const c = CASILLERO[n];
  const valor = (c.de ?? []).map((k) => txt(v[k]).trim()).filter(Boolean).join(" / ");
  return box(n, c.rotulo, valor, ancho);
}

/** Un casillero de casillas para marcar —el (5), el (36)—, a fila entera. */
const celdaCasillas = (n: NumeroGtf2024, casillas: string): string =>
  `<td class="c" ${C4}>${numero(n)} <span class="l">${esc(CASILLERO[n].rotulo)}:</span>${casillas}</td>`;

/** El detalle (34a–34g) con su fila del (34h) Total movilizado, como el formato oficial. */
export function tablaProductos(lineasDeEntrada: ReadonlyArray<LineaProducto>): string {
  const det = detalleGtf(lineasDeEntrada);
  const th = (n: NumeroGtf2024, attrs = ""): string => `<th ${attrs}>${numero(n)} ${esc(CASILLERO[n].rotulo)}</th>`;
  const filas = det.filas
    .map(
      (l) => `<tr>
        <td>${esc(l["37a"])}</td><td>${esc(l["37b"])}</td><td>${esc(l["37c"])}</td>
        <td>${esc(l["37d"])}</td><td class="num">${esc(l["37e"])}</td>
        <td>${esc(l["37f"])}</td><td class="num">${l["37g"]}</td>
      </tr>`,
    )
    .join("");
  return `<table class="det">
    <caption>${numero("34")} ${esc(CASILLERO["34"].rotulo)}</caption>
    <thead><tr>
      ${th("34a", 'rowspan="2"')}${th("34b", 'rowspan="2"')}${th("34c", 'rowspan="2"')}
      <th colspan="2">Forma de embalaje o presentación del producto</th><th colspan="2">Cantidad</th>
    </tr><tr>
      ${th("34d")}${th("34e")}${th("34f")}${th("34g")}
    </tr></thead>
    <tbody>${filas || `<tr><td colspan="7" class="vacio">Sin líneas declaradas</td></tr>`}</tbody>
    <tfoot><tr><td colspan="6" class="tot">${numero("34h")} ${esc(CASILLERO["34h"].rotulo)}:</td><td class="num tot">${det.total}</td></tr></tfoot>
  </table>`;
}

/**
 * El encabezado (2)–(4) y «Datos del origen del recurso o procedencia»
 * (5)–(11c): los únicos casilleros que salen de la Ficha del CTP y del título
 * habilitante. El resto de la guía depende del despacho.
 *
 * Vive aparte para que la Ficha pueda mostrar una VISTA PREVIA de cómo quedan
 * esos casilleros sin inventar un despacho — misma función que imprime la guía
 * de verdad, así que lo que se ve acá es exactamente lo que va a salir. Si se
 * duplicara el HTML, la vista previa mentiría en cuanto cambie el formato.
 *
 * `cabecera`: la fila del (1) N° y el N° de registro, que antepone la guía (la
 * vista previa de la Ficha no tiene número que mostrar).
 */
export function bloqueIdentidadGtf(f: CtpFicha, extra: ExtraIdentidadGtf = {}, cabecera = ""): string {
  const v = casillerosIdentidad(f, extra);
  return `<table class="cas cab">
    ${cabecera}<tr>${celda(v, "2", C2)}${celda(v, "3")}${celda(v, "4")}</tr>
  </table>
  ${seccionDoc("Datos del origen del recurso o procedencia", "casilleros (5) a (11c)")}
  <table class="cas">
    <tr>${celdaCasillas("5", casillasOrigen(v["5"]))}</tr>
    <tr>${celda(v, "6", C2)}${celda(v, "7", C2)}</tr>
    <tr>${celda(v, "8", C2)}${celda(v, "9", C2)}</tr>
    <tr>${celda(v, "10")}${celda(v, "11a")}${celda(v, "11b")}${celda(v, "11c")}</tr>
  </table>`;
}

/**
 * La guía entera, (1) a (39), en el orden del Anexo I de la RDE
 * D000014-2024-MIDAGRI-SERFOR-DE.
 *
 * Las guías emitidas antes del cambio también salen así: la RDE derogó la
 * 122-2015 sin régimen de transición para las ya emitidas (art. 2), y
 * reimprimir con el formato derogado sería imprimir un papel que ya no existe.
 * Ningún valor se pierde: cada clave tiene su casillero 2024 (ADR-494). Los
 * «Datos del punto de partida» y el (22) se imprimen SIEMPRE —el formato los
 * tiene—; en una guía que no eligió cómo arranca el transporte quedan en
 * blanco, para llenar a mano.
 */
export function cuerpoGtfOficial(i: CuerpoGtfInput): string {
  const { ficha: f, datos: d } = i;
  const v: ValoresHoja = { ...casillerosGtf(i), numeroGtf: txt(i.numeroGtf) };
  const registro = txt(i.registroSerfor).trim();
  /* «N° de registro» no lleva número en el formato: lo llena el SNIFFS al registrar. */
  const cabecera = `<tr>${celda(v, "1", C2)}<td class="c est ${registro ? "ok" : "sin"}" ${C2}><span class="l">N° de registro:</span> <b>${esc(registro)}</b>${
    registro
      ? ` <span class="estado">ESTADO: REGISTRADA</span>`
      : ` <span class="sinreg">Estado ante la ARFFS: pendiente de registro</span>`
  }</td></tr>`;

  return `
  ${bloqueIdentidadGtf(
    f,
    {
      fechaExpedicion: i.fechaExpedicion,
      fechaVencimiento: d.traslado?.fechaFin,
      origenRecurso: i.origenRecurso,
      tituloElegido: d.titulos?.[0],
      permisos: i.permisos,
    },
    cabecera,
  )}

  ${seccionDoc("Datos del propietario del producto", "casilleros (12) a (16)")}
  <table class="cas">
    <tr>${celda(v, "12", C3)}${celda(v, "13")}</tr>
    <tr>${celda(v, "14a", C2)}${celda(v, "14b")}${celda(v, "14c")}</tr>
    <tr>${celda(v, "14d")}${celda(v, "15")}${celda(v, "16", C2)}</tr>
  </table>

  ${seccionDoc("Datos del punto de partida", "casilleros (17) a (20d)")}
  <table class="cas">
    <tr>${celda(v, "17", C2)}${celda(v, "18")}${celda(v, "19")}</tr>
    <tr>${celda(v, "20a")}${celda(v, "20b")}${celda(v, "20c")}${celda(v, "20d")}</tr>
  </table>

  ${seccionDoc("Datos del destinatario", "casilleros (21) a (24d)")}
  <table class="cas">
    <tr>${celda(v, "21", C2)}${celda(v, "22", C2)}</tr>
    <tr>${celda(v, "23")}${celda(v, "24a", C3)}</tr>
    <tr>${celda(v, "24b")}${celda(v, "24c")}${celda(v, "24d", C2)}</tr>
  </table>

  ${seccionDoc("Datos del transportista", "casilleros (25) a (31)")}
  <table class="cas">
    <tr>${celda(v, "25")}${celda(v, "26")}${celda(v, "27")}${celda(v, "28")}</tr>
    <tr>${celda(v, "29", C2)}${celda(v, "30")}${celda(v, "31")}</tr>
  </table>

  ${seccionDoc("Detalle del producto", "casilleros (32) a (36)")}
  <table class="cas">
    <tr>${celda(v, "32", C2)}${celda(v, "33", C2)}</tr>
  </table>

  ${tablaProductos(i.lineas)}

  <table class="cas">
    <tr>${celda(v, "35", C4)}</tr>
    <tr>${celdaCasillas("36", casillasAnexos())}</tr>
  </table>

  <table class="pie">
    <tr>${(["37", "38", "39"] as const)
      .map((n) => `<td class="firma"><div class="linea"></div>${numero(n)} ${esc(CASILLERO[n].rotulo)}</td>`)
      .join("")}</tr>
  </table>

  <p class="legal">
    La GTF no es válida si contiene enmendaduras y/o alteraciones.<br>
    La presente GTF tiene carácter de declaración jurada y está sujeta a acciones penales contempladas
    en el numeral 34.3 del artículo N.º 34 de la Ley 27444 (Ley del Procedimiento Administrativo General).
  </p>`;
}

/**
 * Los estilos del formato: Arial y A4, como manda la RDE D000014-2024-MIDAGRI-SERFOR-DE
 * (art. 3).
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
 * · **columnas cortas del (34) sin partir** — «MADERA EN ROLLO» y «Metros
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
  /* La regla de la sección hace de borde superior: sin hilo doble. El encabezado
     (1)–(4) no tiene sección: va pegado a la cabecera del documento. */
  .doc-sec + .cas tr:first-child td.c, .cas.cab tr:first-child td.c { border-top:none; }
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

  /* ── (34) Cuadro detalle de productos ── */
  .det { width:100%; border-collapse:collapse; margin:0; }
  .det caption { caption-side:top; text-align:left; padding:.9mm 0 .6mm; font-size:6pt; letter-spacing:.25pt;
                 text-transform:uppercase; color:var(--gris); }
  .det .n { color:var(--gris-suave); font-weight:normal; font-variant-numeric:tabular-nums; text-transform:none; }
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

  /* ── N° de registro (lo asigna el SNIFFS) y estado ante la ARFFS ── */
  .cas td.est.ok b { font-family:"Courier New",Courier,monospace; }
  .cas td.est .estado { margin-left:1.5mm; font-size:6pt; font-weight:bold; letter-spacing:1pt; }
  .cas td.est .sinreg { margin-left:1.5mm; font-size:6pt; color:var(--gris); }

  /* ── Firmas (37)(38)(39): renglón arriba, rótulo debajo, como el formato ── */
  table.pie { width:100%; border-collapse:collapse; margin-top:2.2mm; table-layout:fixed; }
  table.pie td { padding:0 0 0 6mm; vertical-align:top; }
  table.pie td:first-child { padding-left:0; }
  table.pie .firma { font-size:6.2pt; letter-spacing:.4pt; text-transform:uppercase; color:var(--gris); }
  table.pie .firma .n { color:var(--gris-suave); }
  table.pie .linea { border-bottom:.6pt solid var(--linea); height:6mm; margin-bottom:.6mm; }
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

/**
 * Lo propio de la guía de salida: la tira de copia, el visado y el QR.
 *
 * La tira marcaba la copia con una banda verde rellena y letra blanca; ahora
 * es una línea fina arriba y abajo —borde y texto, como un `doc-sello`, sin
 * fondo— y el encabezado de `.gs` copia al `.det` de la GTF de ingreso:
 * `--tenue` de fondo, texto en `--tinta`, nunca tinta sólida con letra blanca.
 * (Vino de `ctp-gtf-print`, que es de cliente: 16-10.)
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
