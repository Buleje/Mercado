/**
 * Catálogos del negocio maderero — cómo se llaman las cosas en un aserradero.
 *
 * ## De dónde salen (importa para saber cuánto confiar)
 *
 * - **Verificado contra un documento real**: la GTF `1-19-0313629` de SERFOR
 *   declara `tipoProducto: "MADERA EN ROLLO"`, `presentacion: "TROZAS"`,
 *   `unidad: "Metros Cúbicos"`. Ésa es la forma en que el SNIFFS nombra las
 *   cosas: MAYÚSCULAS, y el tipo con su variante entre paréntesis.
 * - **Tomado de un CTP en operación** (AppForestal, feb–mar 2026): las 16
 *   variantes de MADERA ASERRADA, las 19 presentaciones y las 4 líneas de
 *   producción. Son los valores con los que un aserradero real trabajaba.
 *   ⚠️ **No están contrastados contra el texto de la RDE D000025-2023**: si
 *   alguna vez se consigue el anexo oficial, hay que cotejarlos.
 *
 * Por eso los tres catálogos aceptan valor libre («Otro»): rechazar un producto
 * que la autoridad sí admite sería peor que aceptar uno de más.
 */

/**
 * Tipo de producto. El primero es materia prima (lo que ENTRA con la GTF); el
 * resto es lo que SALE del aserradero.
 */
export const TIPOS_PRODUCTO_LOCTP = [
  { valor: "MADERA EN ROLLO", label: "Madera en rollo", entrada: true },
  { valor: "MADERA ASERRADA", label: "Madera aserrada" },
  { valor: "MADERA ASERRADA (BLOQUES)", label: "Aserrada · bloques" },
  { valor: "MADERA ASERRADA (COMERCIAL)", label: "Aserrada · comercial" },
  { valor: "MADERA ASERRADA (CORTA)", label: "Aserrada · corta" },
  { valor: "MADERA ASERRADA (CUARTON)", label: "Aserrada · cuartón" },
  { valor: "MADERA ASERRADA (LARGA ANGOSTA)", label: "Aserrada · larga angosta" },
  { valor: "MADERA ASERRADA (LISTONES)", label: "Aserrada · listones" },
  { valor: "MADERA ASERRADA (PAQUETERIA CORTA)", label: "Aserrada · paquetería corta" },
  { valor: "MADERA ASERRADA (PAQUETERIA LARGA)", label: "Aserrada · paquetería larga" },
  { valor: "MADERA ASERRADA (POSTE)", label: "Aserrada · poste" },
  { valor: "MADERA ASERRADA (RIPAS)", label: "Aserrada · ripas" },
  { valor: "MADERA ASERRADA (TABLA)", label: "Aserrada · tabla" },
  { valor: "MADERA ASERRADA (TABLA CEBILLADA)", label: "Aserrada · tabla cepillada" },
  { valor: "MADERA ASERRADA (TABLA DE PULGADA)", label: "Aserrada · tabla de pulgada" },
  { valor: "MADERA ASERRADA (TABLILLAS)", label: "Aserrada · tablillas" },
  { valor: "MADERA ASERRADA (TACOS)", label: "Aserrada · tacos" },
  { valor: "CARBON VEGETAL", label: "Carbón vegetal" },
  { valor: "LEÑA", label: "Leña" },
  { valor: "OTRO", label: "Otro — especificar en observaciones" },
] as const;

/** Sólo los que salen del aserradero: es lo que ofrece producción y despacho. */
export const TIPOS_PRODUCTO_SALIDA = TIPOS_PRODUCTO_LOCTP.filter((t) => !("entrada" in t && t.entrada));

/**
 * Forma de presentación — cómo viene físicamente el producto.
 *
 * Es el campo que el ADR-311 dejó pendiente. La guía real declara `TROZAS`.
 */
export const PRESENTACIONES_LOCTP = [
  "TROZAS", "PIEZAS", "PAQUETES", "UNIDADES", "JABAS", "PLANCHAS", "ROLLOS",
  "SACOS", "FARDOS", "CAJAS", "CUARTONES", "COSTALES", "ENVASES", "LISTONES",
  "PANELES", "PARIHUELAS", "RIPAS", "TABLILLAS", "TACOS",
] as const;

export type PresentacionLoctp = (typeof PRESENTACIONES_LOCTP)[number];

/**
 * Qué presentación corresponde a cada producto, cuando es inequívoca.
 *
 * Sólo sugiere: el operador puede cambiarla. Un producto que se despacha
 * habitualmente en paquetes puede salir suelto una vez, y el libro tiene que
 * poder decirlo.
 */
/**
 * La regla del aserradero de Brandon (2026-08-08): **lo que sale atado se
 * declara en PAQUETES y lo que sale suelto, en PIEZAS**. Por eso las dos
 * paqueterías son `PAQUETES` y toda la madera aserrada que se cuenta pieza por
 * pieza —comercial, tabla, corta, larga angosta, bloques, listones, postes— es
 * `PIEZAS`, aunque el catálogo de presentaciones tenga una entrada homónima
 * (`LISTONES`): el producto ya dice qué es, la presentación dice cómo viene.
 *
 * Ripas, tablillas, tacos y cuartón conservan su presentación homónima porque
 * son bultos con nombre propio en la guía y nadie pidió cambiarlos.
 */
const PRESENTACION_POR_PRODUCTO: Record<string, PresentacionLoctp> = {
  "MADERA EN ROLLO": "TROZAS",
  "MADERA ASERRADA (BLOQUES)": "PIEZAS",
  "MADERA ASERRADA (COMERCIAL)": "PIEZAS",
  "MADERA ASERRADA (CORTA)": "PIEZAS",
  "MADERA ASERRADA (LARGA ANGOSTA)": "PIEZAS",
  "MADERA ASERRADA (LISTONES)": "PIEZAS",
  "MADERA ASERRADA (POSTE)": "PIEZAS",
  "MADERA ASERRADA (TABLA)": "PIEZAS",
  "MADERA ASERRADA (TABLA CEBILLADA)": "PIEZAS",
  "MADERA ASERRADA (TABLA DE PULGADA)": "PIEZAS",
  "MADERA ASERRADA (PAQUETERIA CORTA)": "PAQUETES",
  "MADERA ASERRADA (PAQUETERIA LARGA)": "PAQUETES",
  "MADERA ASERRADA (RIPAS)": "RIPAS",
  "MADERA ASERRADA (TABLILLAS)": "TABLILLAS",
  "MADERA ASERRADA (TACOS)": "TACOS",
  "MADERA ASERRADA (CUARTON)": "CUARTONES",
};

export function presentacionSugerida(tipoProducto: string | null | undefined): PresentacionLoctp | null {
  return PRESENTACION_POR_PRODUCTO[(tipoProducto ?? "").trim().toUpperCase()] ?? null;
}

/**
 * El tipo que usa el cubicador → el producto que nombra el libro.
 *
 * El patio dice «Comercial» y «Paq. corta»; el formato oficial escribe
 * «MADERA ASERRADA (COMERCIAL)». Sin esta traducción, una corrida declarada
 * desde una cubicación entraba al libro con el nombre del patio y sin
 * presentación —`presentacionSugerida("Comercial")` no encuentra nada—, así que
 * el casillero salía vacío en la guía y en el LO-CTP.
 *
 * Single source: lo usan el registro por jornadas y cualquier otro camino que
 * declare producción a partir de piezas medidas.
 */
const PRODUCTO_POR_TIPO_COMERCIAL: Record<string, string> = {
  comercial: "MADERA ASERRADA (COMERCIAL)",
  "paqueteria larga": "MADERA ASERRADA (PAQUETERIA LARGA)",
  "paqueteria corta": "MADERA ASERRADA (PAQUETERIA CORTA)",
  tabla: "MADERA ASERRADA (TABLA)",
  "larga angosta": "MADERA ASERRADA (LARGA ANGOSTA)",
  corta: "MADERA ASERRADA (CORTA)",
};

export function productoDelTipoComercial(tipo: string | null | undefined): string | null {
  const k = (tipo ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  /* «Otro» y lo desconocido devuelven null a propósito: escribir un producto
     que el catálogo no tiene es peor que dejar que lo elija una persona. */
  return PRODUCTO_POR_TIPO_COMERCIAL[k] ?? null;
}

/**
 * Línea de producción — con cuál de las sierras se hizo la corrida.
 *
 * `LP` y `LRE` son las que ya usaba el Cuadro Resumen 3 y **no cambian de
 * código**: el resumen agrupa por este valor y renombrarlos partiría en dos las
 * corridas ya registradas. Las dos nuevas se suman con códigos propios.
 */
export const LINEAS_PRODUCCION = [
  { valor: "LP", label: "LP — Línea principal" },
  { valor: "LRE", label: "LRE — Línea de recuperación" },
  { valor: "LREM", label: "LREM — Recuperación de multiespecies" },
  { valor: "LPC", label: "LPC — Complemento de la línea principal" },
] as const;

export type LineaProduccion = (typeof LINEAS_PRODUCCION)[number]["valor"];

export function esLineaProduccion(v: unknown): v is LineaProduccion {
  return LINEAS_PRODUCCION.some((l) => l.valor === v);
}

/**
 * Rendimiento que un aserradero espera de una corrida: producido / consumido.
 *
 * **0.56 es la meta operativa** que usaba el CTP de referencia, no un mínimo
 * legal — la norma no fija un coeficiente. Sirve para que el operador vea rojo
 * cuando una corrida rinde mucho menos de lo normal, que suele significar un
 * error de carga antes que un problema de sierra.
 *
 * No entra en el score de cumplimiento: castigar un número que depende de la
 * especie y del equipo enseñaría a inflarlo.
 */
export const RENDIMIENTO_META = 0.56;

/**
 * Franja en la que un rendimiento de aserrío es CREÍBLE, en porcentaje.
 *
 * Distinto de la meta: la meta pregunta «¿llegué a lo que esperaba?» y esto
 * pregunta «¿este número puede ser cierto?». Por debajo de 40 se está yendo
 * demasiada madera en aserrín o descarte —o falta declarar producción—; por
 * encima de 75 lo declarado no cierra con lo que da una troza.
 *
 * Vive acá, junto a la meta, porque son dos lecturas del MISMO número: tenerlas
 * en archivos distintos las hizo divergir una vez (la hoja de Consumos juzgaba
 * con 40/75 mientras el formulario de producción juzgaba con 56) y el operador
 * veía dos veredictos para una sola corrida.
 */
export const RENDIMIENTO_PLAUSIBLE_MIN = 40;
export const RENDIMIENTO_PLAUSIBLE_MAX = 75;

/**
 * Cómo se lee un rendimiento contra la meta. `null` = todavía no se puede juzgar.
 *
 * **Recibe un PORCENTAJE** (56.25), no una fracción. La primera versión aceptaba
 * las dos y adivinaba por el tamaño; con `1.2` no hay forma de saber si son
 * 1.2% o 120%, así que la ambigüedad se elimina en vez de parchearse. Es la
 * unidad de `rendimientoPct` en la base y la que calculan los dos llamadores.
 */
export function juzgarRendimiento(pct: number | null | undefined): "bueno" | "bajo" | "sospechoso" | null {
  if (pct == null || !Number.isFinite(pct) || pct <= 0) return null;
  // Más de 100% no es un rendimiento excelente: es imposible. De 1 m³ de troza
  // no salen 1.2 m³ de tabla, así que casi siempre es un dato mal cargado.
  if (pct > 100) return "sospechoso";
  return pct >= RENDIMIENTO_META * 100 ? "bueno" : "bajo";
}

/**
 * Pie tablar: 1 m³ ≈ 424 pt.
 *
 * Es la unidad en que se vende la madera aserrada en Perú, pero el libro
 * calcula todo en m³ (ADR-311): esto convierte para MOSTRAR, nunca para guardar.
 */
export const PT_POR_M3 = 424;

export function aPieTablar(m3: number | null | undefined): number | null {
  if (m3 == null || !Number.isFinite(m3)) return null;
  return Number((m3 * PT_POR_M3).toFixed(1));
}

/**
 * Un código de paquete propuesto: `LP-260801-1423`.
 *
 * Es una SUGERENCIA, no un correlativo del sistema: el código lo pinta una
 * persona en el atado y muchas plantas ya tienen su propia forma de numerarlo.
 * Imponer un formato obligaría a que el papel y la pantalla digan cosas
 * distintas, que es exactamente lo que un fiscalizador cruza.
 *
 * Lleva la línea y la fecha porque es lo que se busca cuando el paquete aparece
 * en el patio tres semanas después sin que nadie recuerde de qué turno salió.
 */
export function sugerirCodigoPaquete(fechaIso: string, linea: string | null | undefined): string {
  const d = fechaIso ? new Date(fechaIso) : new Date();
  const valida = Number.isNaN(d.getTime()) ? new Date() : d;
  const yy = String(valida.getUTCFullYear()).slice(-2);
  const mm = String(valida.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(valida.getUTCDate()).padStart(2, "0");
  // Los últimos 4 dígitos del reloj: dos corridas del mismo día no chocan, y no
  // hace falta preguntarle al servidor por un correlativo para escribir un papel.
  const sufijo = String(Date.now()).slice(-4);
  return `${(linea || "LP").toUpperCase()}-${yy}${mm}${dd}-${sufijo}`;
}
