/**
 * consumo-trozas.ts — elegir QUÉ PIEZAS entran a la sierra (ADR-326).
 *
 * El consumo del libro es `ForestCtpConsumo`: ingreso → corrida, en m³. Ahí viven
 * las invariantes I1-I6 y el costeo, y así se queda. Lo que faltaba es decir
 * **cuáles trozas** se consumieron: un fiscalizador no cuenta metros cúbicos
 * abstractos, cuenta piezas en la pila.
 *
 * Del ERP forestal de referencia (AppForestal, módulo `consumo`), donde el
 * operador tilda las trozas de una tabla filtrable en vez de tipear un volumen.
 * En el patio eso es lo que pasa: se eligen los palos que entran al carro.
 *
 * PURO y client-safe.
 */

import { PT_POR_M3, pieTablarAserrableDe } from "./cubicacion";
import { fmtM3 } from "./cubicacion-formato";
import { RENDIMIENTO_META } from "./loctp-catalogos";

/** Una troza candidata a consumirse. */
export interface TrozaConsumible {
  id: string;
  woodEntryId: string;
  codificacion: string | null;
  codigoPlanta?: string | null;
  parcela?: string | null;
  especieComun: string | null;
  especieCientifica?: string | null;
  dimensiones?: string | null;
  /** Los dos extremos y el largo — como los publica SERFOR y como se cubica. */
  d1Cm?: number | null;
  d2Cm?: number | null;
  /**
   * El diámetro que la pieza declara como UN número (cubicación por diámetro
   * medio). Si falta, `diametroDe` promedia `d1Cm`/`d2Cm`; si tampoco hay, no
   * hay diámetro — no se inventa.
   */
  diametroCm?: number | null;
  largoM?: number | null;
  volumenM3: number | null;
  /**
   * La GUÍA declara especie CITES (`WoodEntry.speciesCites`). **Es un DERIVADO
   * de la guía, no de la troza**: una guía «Huayruro» puede traer trozas de
   * Panguana, así que el filtro se rotula «guía CITES», nunca «troza CITES».
   */
  guiaCites?: boolean;
  /** La guía por la que entró — para agrupar y para el filtro. */
  gtfNumber?: string | null;
  /** (1) N° de registro del asiento en el libro de operaciones (`WoodEntry.libroNro`). */
  libroNro?: number | null;
  /** N° de constancia de registro del SNIFFS de su guía (`1-19-0313629`). */
  constanciaSniffs?: string | null;
  proveedor?: string | null;
  /** Cuándo bajó la pieza del camión (ADR-336). */
  fechaRecepcion?: string | null;
  /** Fecha del asiento de la guía en el libro — NO es la recepción. */
  fechaIngreso?: string | null;
  /** Cuándo se recepcionó la GUÍA (la pieza puede no tener la suya). */
  guiaFechaRecepcion?: string | null;
  /** La guía ya se recibió (ADR-339): sólo esas piezas van a la sierra. */
  guiaRecepcionada?: boolean;
  /** (6) N° del título habilitante que ampara la madera — «el permiso». */
  permiso?: string | null;
  /** (8) N° de resolución que aprueba el plan de manejo. */
  resolucion?: string | null;
  /**
   * De dónde salió el dato de esta pieza. **Es un DERIVADO**, no un campo que
   * alguien declare: sale de si la guía que la trajo tiene su N° de constancia
   * del SNIFFS (`serfor`) o no (`manual`, alguien la tipeó).
   *
   * Se muestra como lo que es —una procedencia del dato, no un sello oficial—
   * porque en una fiscalización no pesa igual una troza que bajó del sistema
   * de SERFOR que una cargada a mano.
   */
  origenDato?: "serfor" | "manual";
  /**
   * El tope que impone I2: lo que el ASIENTO declara y lo que ya se le consumió
   * (ADR-353). El consumo de una guía no puede pasar de `declarado − consumido`,
   * y con estos dos números el acta lo puede decir **antes** de firmarse.
   */
  guiaVolumenM3?: number | null;
  guiaConsumidoM3?: number | null;
  /**
   * La especie de la FILA del libro de la que cuelga la pieza
   * (`WoodEntry.speciesCommonName`) — lo que declara `guiaVolumenM3`. Casi
   * siempre es la de la troza; cuando no, la troza quedó en la fila de otra
   * especie de su guía (ADR-435).
   */
  guiaEspecie?: string | null;
  /**
   * La fila de la MISMA guía que es de la especie de esta troza, cuando NO es
   * la fila de la que cuelga (ADR-435, `filaDeEspecie`). `null` = está en su
   * fila, o su guía no tiene otra: «Acomodar trozas» no tendría a dónde
   * llevarla.
   *
   * En Blas (27-09): 29 trozas de 8 guías, 76,7 m³. El acta leía el tope de la
   * fila equivocada y lo llamaba «la guía no cuadra consigo misma» — la guía
   * cuadraba; las trozas estaban en otra fila.
   */
  filaDeSuEspecieId?: string | null;
  /**
   * Ya consumida en otra corrida: no se puede volver a elegir.
   *
   * El endpoint lo manda en `null` cuando la corrida que la tomó está anulada o
   * borrada: esa madera volvió al patio. El servidor aplica el MISMO criterio al
   * guardar — si divergieran, la pantalla dejaría tildar algo que la base
   * rechaza, que es peor que no mostrarla.
   */
  consumidaEnId?: string | null;
  /**
   * Ya salió del patio SIN ASERRAR (ADR-363): la madera se vendió en rollo y ya
   * no está para la sierra. El endpoint lo manda en `null` cuando el despacho
   * que se la llevó está anulado — esa troza volvió al patio.
   */
  despachadaEnId?: string | null;
  /** Declarada en la guía pero nunca llegó (ADR-325): no se puede consumir. */
  noRecepcionada?: boolean | null;
  /**
   * El lote de aserrío donde está apartada (ADR-334).
   *
   * NO bloquea —la pieza está en la pila y se puede consumir a mano— pero se
   * muestra: elegir para una corrida madera que otro apartó para otra es la
   * clase de error que después aparece como un lote que rinde de menos.
   */
  loteAserrioId?: string | null;
  loteAserrioCode?: string | null;
  /**
   * El LOTE MIXTO donde está apartada (ADR-441). El servidor lo manda en `null`
   * si ese mixto ya no está abierto — mismo criterio que la corrida: se mira el
   * estado, no el id pelado.
   *
   * Como `loteAserrioId`, NO entra a `motivoBloqueo`: la pieza sigue en la pila
   * (el conteo físico la encuentra, la etiqueta se imprime). Lo que impide es
   * armarla en un lote o consumirla sin repartir el mixto (LM4):
   * `motivoFueraDeLaPila` y los selectores de lote la dejan afuera.
   */
  loteMixtoId?: string | null;
  loteMixtoCode?: string | null;
  /** Es un pedazo de otra troza (ADR-313). */
  trozaOrigenId?: string | null;
  /** Cuántos pedazos tiene: una madre partida ya no entra entera a la sierra. */
  retrozos?: number;
  /** El pedazo que no sirve: ocupa volumen pero no es producto. */
  descarte?: boolean | null;
  /**
   * Cuándo se imprimió por última vez su etiqueta QR (ADR-436), ISO. `null` =
   * nunca: la pieza está en la pila sin chapa.
   */
  etiquetadaEn?: string | null;
  /** Cuántas veces se imprimió su etiqueta. >1 = reimpresión (ADR-436). */
  etiquetasImpresas?: number;
  /**
   * Cubicación OXAPAMPA tomada en el patio (Brandon 2026-09-26): puntas en
   * pulgadas y largo en pies. Es el dato COMERCIAL (pago al dueño, flete,
   * servicio); el del libro sigue siendo `volumenM3`. `null` = no se midió.
   */
  oxD1Pulg?: number | null;
  oxD2Pulg?: number | null;
  oxLargoPies?: number | null;
  /** pt = Dp² × L / 24.5, calculado por el servidor al guardar y CONGELADO. */
  oxPt?: number | null;
  /** Cuándo se cubicó (ISO) y quién. */
  oxMedidoEn?: string | null;
  oxMedidoPor?: string | null;
  /**
   * `d1Cm`/`d2Cm` los cargó la planta porque la guía no los traía. `false` =
   * vienen de la guía (o no hay). El dato de SERFOR nunca se pisa.
   */
  d1d2MedidoEnPlanta?: boolean;
}

/** Por qué una troza no se puede elegir. `null` = está disponible. */
export type MotivoBloqueo =
  | "ya_consumida"
  | "ya_despachada"
  | "no_recepcionada"
  | "descarte"
  | "madre_retrozada"
  | "sin_volumen";

/**
 * Qué impide consumir esta troza.
 *
 * **Una madre con pedazos NO se consume entera**: al cortarla dejó de existir
 * como pieza; lo que entra a la sierra son los pedazos. Consumir las dos cosas
 * contaría la misma madera dos veces, que es lo que I2 evita en el otro extremo.
 */
export function motivoBloqueo(t: TrozaConsumible): MotivoBloqueo | null {
  if (t.consumidaEnId) return "ya_consumida";
  if (t.despachadaEnId) return "ya_despachada";
  if (t.noRecepcionada) return "no_recepcionada";
  if (t.descarte) return "descarte";
  if ((t.retrozos ?? 0) > 0) return "madre_retrozada";
  if (!(Number(t.volumenM3) > 0)) return "sin_volumen";
  return null;
}

export const LABEL_BLOQUEO: Record<MotivoBloqueo, string> = {
  ya_consumida: "Ya entró a otra corrida",
  ya_despachada: "Ya salió despachada sin aserrar",
  no_recepcionada: "No llegó al patio",
  descarte: "Descarte del retrozado: no es producto",
  madre_retrozada: "Se cortó en pedazos: consume los pedazos",
  sin_volumen: "Sin volumen registrado",
};

/**
 * Desde cuándo está esta troza en el patio, para la regla 4 de la vinculación
 * («la madera no se asierra antes de entrar»): la recepción de la pieza; si no
 * la tiene, la de su guía; si la guía tampoco, el asiento. AAAA-MM-DD o `null`.
 *
 * Hasta el 25-09 ningún vinculador la pasaba y la regla estaba muerta: en Blas,
 * la corrida N° 32 del 07/09 recibía una troza de una guía recibida el 23/09.
 */
export function fechaIngresoDeTroza(
  t: Pick<TrozaConsumible, "fechaRecepcion" | "guiaFechaRecepcion" | "fechaIngreso">,
): string | null {
  /* La MISMA fuente y el mismo día UTC que la invariante T3 del servidor
     (ADR-433): si no coincidieran, la pantalla ofrecería lo que el servidor
     rechaza. Del JSON llega string; leída directo de la base, `Date` (y
     `String(date)` daba «Wed Sep 23»): los dos a AAAA-MM-DD en UTC. */
  const f: unknown = t.fechaRecepcion ?? t.guiaFechaRecepcion ?? t.fechaIngreso ?? null;
  if (f instanceof Date) return Number.isNaN(f.getTime()) ? null : f.toISOString().slice(0, 10);
  if (typeof f !== "string" || !f.trim()) return null;
  return /^\d{4}-\d{2}-\d{2}/.test(f) ? f.slice(0, 10) : null;
}

export function estaDisponible(t: TrozaConsumible): boolean {
  return motivoBloqueo(t) === null;
}

/**
 * La pieza no tiene código del bosque: vacío o sólo rayas/puntos.
 *
 * En Blas, 49 trozas de una guía guardaban «-» como codificación: un
 * `<> ''` las contaba como codificadas y una búsqueda por código ofrecía 49
 * «-» idénticos. «A-1» sí es un código.
 */
export function esSinCodigo(t: { codificacion?: string | null }): boolean {
  return /^[\s\u2013\u2014.-]*$/.test(t.codificacion ?? "");
}

/** Un número de medida utilizable: finito y mayor que cero. Un 0 no es una medida. */
export const medidaPositiva = (v: unknown): number | null => {
  const n = v == null ? Number.NaN : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * El diámetro de la pieza en cm: el declarado (`diametroCm`) y, si falta, el
 * promedio de los extremos que haya (`d1Cm`/`d2Cm`). Sin ninguno, `null`: un
 * diámetro que no se midió no se inventa.
 */
export function diametroDe(t: { diametroCm?: number | null; d1Cm?: number | null; d2Cm?: number | null }): number | null {
  const declarado = medidaPositiva(t.diametroCm);
  if (declarado != null) return declarado;
  const extremos = [medidaPositiva(t.d1Cm), medidaPositiva(t.d2Cm)].filter((x): x is number => x != null);
  if (extremos.length === 0) return null;
  return Math.round((extremos.reduce((a, b) => a + b, 0) / extremos.length) * 100) / 100;
}

/**
 * ¿La GUÍA de esa troza llegó al patio? (ADR-325/ADR-339)
 *
 * Es la derivación que `TrozaConsumible.guiaRecepcionada` publica, escrita UNA
 * vez: la leen la lectura del patio (`trozasComoConsumibles`) y el escritor que
 * arma y consume lotes (`motivoNoElegible`). Estaban copiadas, y una copia que
 * se queda corta del lado que ESCRIBE es la que deja pasar madera que nunca
 * bajó del camión.
 *
 * Tres señales, cualquiera alcanza: la guía quedó **validada** (o `procesado`,
 * que es una validada que ya se trabajó — el mismo par que usa el resto del
 * módulo), la guía tiene fecha de recepción, o la pieza tiene la suya (una guía
 * de sesenta trozas se descarga en dos viajes, ADR-336).
 *
 * `pendiente` ⇒ **false**: la madera está declarada, no recibida. De ahí no
 * sale una tabla.
 */
const GUIA_VALIDADA = ["validado", "procesado"];

export function guiaRecibida(g: {
  estado: string | null | undefined;
  fechaRecepcionGuia: Date | string | null | undefined;
  fechaRecepcionTroza: Date | string | null | undefined;
}): boolean {
  return (
    (g.estado != null && GUIA_VALIDADA.includes(g.estado)) ||
    Boolean(g.fechaRecepcionGuia) ||
    Boolean(g.fechaRecepcionTroza)
  );
}

/** Filtros de la tabla — los mismos que usa el operador en el patio. */
export interface FiltroTrozas {
  texto?: string;
  especie?: string;
  gtf?: string;
  proveedor?: string;
  /** `true` = esconder las que no se pueden elegir. */
  soloDisponibles?: boolean;
}

/** min\u00fasculas + sin tildes + trim: dos graf\u00edas de la misma especie/gu\u00eda son
 *  la misma clave. Exportado para que los pickers que arman su propio
 *  autofiltro de columna (ADR filtros-en-cabecera) comparen igual que ac\u00e1. */
export const norm = (v: string | null | undefined) =>
  (v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/**
 * Aplica los filtros. El texto busca por las DOS codificaciones —la del bosque y
 * la que marcó el patio— porque el operador tipea la que tiene delante.
 */
export function filtrarTrozas(
  trozas: readonly TrozaConsumible[],
  f: FiltroTrozas,
): TrozaConsumible[] {
  const texto = norm(f.texto);
  const especie = norm(f.especie);
  const gtf = norm(f.gtf);
  const proveedor = norm(f.proveedor);

  return trozas.filter((t) => {
    if (f.soloDisponibles && !estaDisponible(t)) return false;
    if (especie && norm(t.especieComun) !== especie) return false;
    if (gtf && norm(t.gtfNumber) !== gtf) return false;
    if (proveedor && norm(t.proveedor) !== proveedor) return false;
    if (texto) {
      const campos = [t.codificacion, t.codigoPlanta, t.parcela, t.especieComun, t.gtfNumber];
      if (!campos.some((c) => norm(c).includes(texto))) return false;
    }
    return true;
  });
}

/** Totales de una selección. El pie tablar va porque acá la madera se habla en PT. */
export interface TotalesSeleccion {
  piezas: number;
  volumenM3: number;
  pieTablar: number;
  /** Cuántas guías distintas alimenta la selección. */
  guias: number;
  /** Cuántas especies distintas: mezclar dos en una corrida es una decisión. */
  especies: number;
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

export function totalesSeleccion(trozas: readonly TrozaConsumible[]): TotalesSeleccion {
  const volumenM3 = r4(trozas.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0));
  return {
    piezas: trozas.length,
    volumenM3,
    pieTablar: Math.round(volumenM3 * PT_POR_M3),
    guias: new Set(trozas.map((t) => t.woodEntryId)).size,
    especies: new Set(trozas.map((t) => norm(t.especieComun)).filter(Boolean)).size,
  };
}

/** Lo que se consume de CADA guía — es lo que alimenta `ForestCtpConsumo`. */
export interface ConsumoPorGuia {
  woodEntryId: string;
  gtfNumber: string | null;
  proveedor: string | null;
  especie: string | null;
  piezas: number;
  volumenM3: number;
  pieTablar: number;
  trozaIds: string[];
}

/**
 * Agrupa la selección por guía de ingreso.
 *
 * Es el puente entre las dos formas de mirar el consumo: el operador elige
 * piezas, el libro registra m³ por guía. El volumen de cada consumo se DERIVA de
 * las trozas elegidas — nadie tipea un número que después no cuadre con la pila.
 */
export function agruparPorGuia(trozas: readonly TrozaConsumible[]): ConsumoPorGuia[] {
  const porGuia = new Map<string, ConsumoPorGuia>();
  for (const t of trozas) {
    const previa = porGuia.get(t.woodEntryId);
    const fila =
      previa ??
      {
        woodEntryId: t.woodEntryId,
        gtfNumber: t.gtfNumber ?? null,
        proveedor: t.proveedor ?? null,
        especie: t.especieComun ?? null,
        piezas: 0,
        volumenM3: 0,
        pieTablar: 0,
        trozaIds: [],
      };
    if (!previa) porGuia.set(t.woodEntryId, fila);
    fila.piezas += 1;
    fila.volumenM3 = r4(fila.volumenM3 + Number(t.volumenM3 ?? 0));
    fila.trozaIds.push(t.id);
  }
  for (const f of porGuia.values()) f.pieTablar = Math.round(f.volumenM3 * PT_POR_M3);
  return [...porGuia.values()].sort((a, b) => b.volumenM3 - a.volumenM3);
}

export type AgrupacionPatio = "ninguna" | "especie" | "guia" | "permiso";

/** Un grupo de la pila del patio, para mirarla sin contar troza por troza. */
export interface GrupoTrozas {
  /** Con qué se agrupó (especie, N° de guía, N° de permiso…). */
  clave: string;
  trozas: TrozaConsumible[];
  piezas: number;
  volumenM3: number;
}

/**
 * Agrupa la pila del patio para leerla de un vistazo (Brandon, 2026-09-01):
 * mismo patrón que `agruparConsumos` (Sección 2) — subtotal arriba, detalle
 * plegado — aplicado a lo que TODAVÍA no se consumió. "Por N° de permiso" es
 * el mismo agrupador que ya existe en Consumos, ahora también acá.
 */
export function agruparTrozas(trozas: readonly TrozaConsumible[], por: AgrupacionPatio): GrupoTrozas[] {
  if (por === "ninguna") return [];
  const clave = (t: TrozaConsumible): string =>
    por === "especie" ? t.especieComun || "—" : por === "guia" ? t.gtfNumber || "—" : t.permiso || "Sin permiso";

  const mapa = new Map<string, TrozaConsumible[]>();
  for (const t of trozas) {
    const k = clave(t);
    const arr = mapa.get(k);
    if (arr) arr.push(t);
    else mapa.set(k, [t]);
  }

  return [...mapa.entries()]
    .map(([k, ts]) => ({
      clave: k,
      trozas: ts,
      piezas: ts.length,
      volumenM3: r4(ts.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0)),
    }))
    .sort((a, b) => b.volumenM3 - a.volumenM3 || a.clave.localeCompare(b.clave, "es"));
}

/** El desglose por especie de UN permiso — piezas, m³ y el pie tablar aserrable. */
export interface EspecieDeTrozas {
  especie: string;
  piezas: number;
  volumenM3: number;
  /** Aproximado (tope de rendimiento 56%): nunca se declara como el dato real. */
  ptAserrable: number;
}

/**
 * Especie por especie de un grupo de trozas — típicamente las de UN permiso
 * (Brandon, 2026-09-01): «especie, piezas (trozas), m³, pt tablas» tal como se
 * pidió, sin combinar dos permisos en la misma fila.
 */
export function especiesDe(trozas: readonly TrozaConsumible[]): EspecieDeTrozas[] {
  const mapa = new Map<string, { piezas: number; volumenM3: number }>();
  for (const t of trozas) {
    const k = t.especieComun || "—";
    const acc = mapa.get(k) ?? { piezas: 0, volumenM3: 0 };
    acc.piezas += 1;
    acc.volumenM3 += Number(t.volumenM3 ?? 0);
    mapa.set(k, acc);
  }
  return [...mapa.entries()]
    .map(([especie, v]) => ({
      especie,
      piezas: v.piezas,
      volumenM3: r4(v.volumenM3),
      ptAserrable: pieTablarAserrableDe(v.volumenM3, RENDIMIENTO_META),
    }))
    .sort((a, b) => b.volumenM3 - a.volumenM3 || a.especie.localeCompare(b.especie, "es"));
}

/** Un bloque de rolliza por guía+especie — lo que el Libro YA sabe. */
export interface BloqueDeGuia {
  etiqueta: string;
  especie: string;
  m3: number;
  /** El permiso de la troza — una GTF entra siempre bajo el mismo, así que
   *  alcanza con leerlo de cualquiera de sus trozas (Brandon, 2026-09-01). */
  permiso: string | null;
}

/**
 * Arma los bloques de «Distribución de rolliza sobre lo aserrado» (Herramientas
 * → Resúmenes → Rolliza) a partir de las trozas reales de un permiso, para no
 * tipear a mano la GTF y el m³ que el Libro ya tiene registrados.
 */
export function bloquesDeGuiaDe(trozas: readonly TrozaConsumible[]): BloqueDeGuia[] {
  const mapa = new Map<string, BloqueDeGuia>();
  for (const t of trozas) {
    const etiqueta = t.gtfNumber || "Sin guía";
    const especie = t.especieComun || "";
    const k = `${etiqueta}::${especie}`;
    const acc = mapa.get(k) ?? { etiqueta, especie, m3: 0, permiso: t.permiso || null };
    acc.m3 += Number(t.volumenM3 ?? 0);
    mapa.set(k, acc);
  }
  return [...mapa.values()]
    .map((v) => ({ ...v, m3: r4(v.m3) }))
    .sort((a, b) => b.m3 - a.m3);
}

/**
 * Avisos de la selección tal como quedó. No bloquean: informan.
 *
 * Mezclar especies en una corrida es legal y pasa —se asierra lo que hay— pero
 * el rendimiento de esa corrida deja de ser comparable, y el Cuadro Resumen 3 la
 * va a mostrar con una especie sola. Que el operador lo sepa antes, no después.
 */
export function avisosSeleccion(trozas: readonly TrozaConsumible[]): string[] {
  if (trozas.length === 0) return [];
  const t = totalesSeleccion(trozas);
  const avisos: string[] = [];
  if (t.especies > 1) {
    avisos.push(`La selección mezcla ${t.especies} especies: el rendimiento de la corrida no será comparable.`);
  }
  if (t.guias > 1) {
    avisos.push(`Sale de ${t.guias} guías distintas: el consumo se va a repartir entre ellas.`);
  }
  return avisos;
}

/**
 * Por qué una guía frena el acta (ADR-353 · afinado 27-09).
 *
 *  · `otra_fila` — las trozas elegidas cuelgan de la fila de OTRA especie de su
 *    guía (ADR-435). La guía está bien; el arreglo es «Acomodar trozas».
 *  · `descuadre` — la fila declara menos que sus propias piezas de su especie,
 *    sin nada consumido: el documento se contradice. El arreglo es cuadrarla.
 *  · `sin_cupo` — ya se consumió parte y no alcanza: el arreglo es elegir menos.
 *
 * Antes las dos primeras eran una sola («la guía no cuadra consigo misma») y en
 * Blas mandaba a cambiar cifras oficiales que estaban bien: 0000009 declara
 * 10,677 m³ de Cachimbo y 8,309 de Yacuchapana, pero sus 7 trozas colgaban de
 * la fila de Yacuchapana.
 */
export type CausaDeCupo = "otra_fila" | "descuadre" | "sin_cupo";

/** Trozas elegidas de una fila que son de otra especie con fila propia en la guía. */
export interface TrozasEnOtraFila {
  especie: string;
  piezas: number;
  m3: number;
}

/** Lo que una guía puede aportar todavía, contra lo que la selección le pide. */
export interface CupoDeGuia {
  woodEntryId: string;
  gtfNumber: string | null;
  /**
   * La especie de la FILA (lo que el asiento declara). Antes se leía de la
   * primera troza, y el aviso decía «declara 8,309 m³ de Cachimbo» con el
   * volumen de la fila de Yacuchapana.
   */
  especie: string | null;
  /** m³ que el asiento del libro declara. */
  declarado: number | null;
  /** m³ ya consumidos por corridas vivas. */
  consumido: number;
  /** `declarado − consumido`. `null` si el asiento no declara volumen. */
  disponible: number | null;
  /** m³ que suman las piezas elegidas de esa guía. */
  pedido: number;
  /** Cuánto se pasa. 0 = entra. */
  exceso: number;
  /** Las elegidas que están en la fila de otra especie de su guía, por especie. */
  enOtraFila: TrozasEnOtraFila[];
  /** Qué la frena; `null` = entra y está en su fila. */
  causa: CausaDeCupo | null;
  /**
   * El asiento declara MENOS de lo que suman sus propias piezas cargadas
   * (`causa === "descuadre"`). Se conserva para quien sólo pregunta «¿hay que
   * cuadrar?»: una troza en la fila de otra especie NO lo enciende.
   */
  descuadrado: boolean;
}

/**
 * Cuánto le pide la selección a cada guía y cuánto puede dar (ADR-353).
 *
 * La invariante I2 —«no se consume más de lo que la guía declara»— se validaba
 * sólo al guardar: el operador elegía seis trozas, abría el acta, firmaba y
 * recién ahí el servidor le decía que no, con un mensaje de m³ que no explicaba
 * la causa. Esta función deja decirlo antes.
 */
export function cuposDeGuia(trozas: readonly TrozaConsumible[]): CupoDeGuia[] {
  type Acc = Omit<CupoDeGuia, "enOtraFila" | "causa"> & { otra: Map<string, TrozasEnOtraFila> };
  const porGuia = new Map<string, Acc>();
  for (const t of trozas) {
    const previa = porGuia.get(t.woodEntryId);
    const declarado = t.guiaVolumenM3 ?? null;
    const consumido = Number(t.guiaConsumidoM3 ?? 0);
    const fila: Acc =
      previa ??
      {
        woodEntryId: t.woodEntryId,
        gtfNumber: t.gtfNumber ?? null,
        especie: t.guiaEspecie ?? t.especieComun ?? null,
        declarado,
        consumido,
        disponible: declarado == null ? null : r4(declarado - consumido),
        pedido: 0,
        exceso: 0,
        descuadrado: false,
        otra: new Map(),
      };
    if (!previa) porGuia.set(t.woodEntryId, fila);
    const m3 = Number(t.volumenM3 ?? 0);
    fila.pedido = r4(fila.pedido + m3);
    if (t.filaDeSuEspecieId && t.filaDeSuEspecieId !== t.woodEntryId) {
      const especie = t.especieComun?.trim() || "otra especie";
      const acc = fila.otra.get(especie) ?? { especie, piezas: 0, m3: 0 };
      acc.piezas += 1;
      acc.m3 = r4(acc.m3 + m3);
      fila.otra.set(especie, acc);
    }
  }

  return [...porGuia.values()].map(({ otra, ...f }) => {
    /* Tolerancia de un LITRO: el aserradero mide con cinta y tres decimales de
       redondeo no son un exceso (misma regla que el resto del libro). */
    const bruto = f.disponible == null ? 0 : Math.max(0, r4(f.pedido - f.disponible));
    const exceso = bruto > 0.001 ? bruto : 0;
    const enOtraFila = [...otra.values()].sort((a, b) => b.m3 - a.m3);
    /* La troza en la fila de otra especie va PRIMERO, aunque todavía entre en
       el tope: consumida así, su m³ se anota en la fila equivocada y
       «Acomodar» ya no la puede mover (su consumo quedó en esa fila). */
    const causa: CausaDeCupo | null =
      enOtraFila.length > 0 ? "otra_fila" : exceso === 0 ? null : f.consumido === 0 ? "descuadre" : "sin_cupo";
    return { ...f, exceso, enOtraFila, causa, descuadrado: causa === "descuadre" };
  });
}

/** ¿Esta guía impide firmar el acta? Pasarse del tope, o trozas en otra fila. */
export const frenaElActa = (c: CupoDeGuia): boolean => c.causa != null;

/** Las guías que no entran, con la frase que explica por qué. */
export function motivosDeCupo(cupos: readonly CupoDeGuia[]): string[] {
  return cupos.filter((c) => c.exceso > 0).map(motivoDeCupo);
}

/** «Cachimbo», «Cachimbo y Copal», «Cachimbo, Copal y Tornillo». */
function enLista(xs: readonly string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
}

/**
 * La frase de una guía trabada en la fila de otra especie. La usan el acta y
 * el mensaje del servidor (`forest-ctp-consumo.db.ts`): la misma madera se
 * explica con las mismas palabras en los dos lados.
 */
export function fraseTrozasEnOtraFila(gtf: string | null, especies: readonly string[], fila: string | null): string {
  return (
    `Las trozas de ${enLista(especies) || "otra especie"} de la guía ${gtf ?? "—"} están en la fila de ` +
    `${fila ?? "otra especie"}. La guía está bien: solo hay que acomodarlas.`
  );
}

/**
 * Por qué esta guía no deja consumir, en una o dos frases cortas.
 *
 * Es la versión suelta (la usan la vinculación desde un lote mixto y los
 * mensajes que viajan como texto). El acta agrupa con `avisosDeCupo`.
 */
export function motivoDeCupo(c: CupoDeGuia): string {
  const gtf = c.gtfNumber ?? "—";
  if (c.causa === "otra_fila") return fraseTrozasEnOtraFila(gtf, c.enOtraFila.map((o) => o.especie), c.especie);
  if (c.descuadrado) {
    return (
      `La guía ${gtf} no cuadra consigo misma: declara ${fmtM3(c.declarado ?? 0)} m³ de ${c.especie ?? "esa especie"} ` +
      `y sus trozas suman ${fmtM3(c.pedido)} m³. Hay que cuadrarla.`
    );
  }
  return (
    `La guía ${gtf} no alcanza: saca ${fmtM3(c.exceso)} m³. ` +
    `Quedan ${fmtM3(c.disponible ?? 0)} de ${fmtM3(c.declarado ?? 0)} m³ y pides ${fmtM3(c.pedido)}.`
  );
}

/** Un aviso del acta: UNA caja por causa, con la lista de guías que la tienen. */
export interface AvisoDeCupo {
  causa: CausaDeCupo;
  /** Corto (≤ 12 palabras): qué pasa. */
  titulo: string;
  /** Segunda línea: qué hacer. */
  detalle: string;
  /** Una línea por guía, con sus cifras (sin el N° de guía: va aparte). */
  guias: { woodEntryId: string; gtfNumber: string | null; linea: string }[];
}

const ORDEN_CAUSA: readonly CausaDeCupo[] = ["otra_fila", "descuadre", "sin_cupo"];

/**
 * Los avisos del acta, agrupados (Brandon, 27-09: «explica de manera sencilla»).
 *
 * Tres guías con el mismo problema son UN aviso con la lista y UN botón, no
 * tres cajas rojas con párrafos de tres renglones. Primero lo que se arregla
 * con un clic (acomodar), después cuadrar, al final lo que pide elegir menos.
 */
export function avisosDeCupo(cupos: readonly CupoDeGuia[]): AvisoDeCupo[] {
  const avisos: AvisoDeCupo[] = [];
  for (const causa of ORDEN_CAUSA) {
    const de = cupos.filter((c) => c.causa === causa);
    if (de.length === 0) continue;
    const una = de.length === 1;
    const gtf = de[0]!.gtfNumber ?? "—";
    const guias = de.map((c) => ({ woodEntryId: c.woodEntryId, gtfNumber: c.gtfNumber, linea: lineaDeCupo(c) }));
    if (causa === "otra_fila") {
      avisos.push({
        causa,
        titulo: una ? `La guía ${gtf} tiene sus trozas en otra fila` : `${de.length} guías tienen sus trozas en otra fila`,
        detalle: una
          ? "La guía está bien: solo hay que acomodar sus trozas."
          : "Las guías están bien: solo hay que acomodar sus trozas.",
        guias,
      });
    } else if (causa === "descuadre") {
      avisos.push({
        causa,
        titulo: una ? `La guía ${gtf} no cuadra consigo misma` : `${de.length} guías no cuadran consigo mismas`,
        detalle: una
          ? "Declara menos de lo que suman sus trozas: hay que cuadrarla."
          : "Declaran menos de lo que suman sus trozas: hay que cuadrarlas.",
        guias,
      });
    } else {
      avisos.push({
        causa,
        titulo: una ? `La guía ${gtf} no alcanza para lo que elegiste` : `${de.length} guías no alcanzan para lo que elegiste`,
        detalle: una ? "Saca trozas de esa guía o elige de otra." : "Saca trozas de esas guías o elige de otras.",
        guias,
      });
    }
  }
  return avisos;
}

/**
 * La línea de UNA guía dentro de su aviso: las cifras que deciden, SIN el N° de
 * guía (la pantalla lo pone al lado, en su tipografía de código).
 */
function lineaDeCupo(c: CupoDeGuia): string {
  if (c.causa === "otra_fila") {
    const trozas = c.enOtraFila
      .map((o) => `${o.piezas} ${o.piezas === 1 ? "troza" : "trozas"} de ${o.especie} (${fmtM3(o.m3)} m³)`)
      .join(" y ");
    return `${trozas} en la fila de ${c.especie ?? "otra especie"}`;
  }
  if (c.causa === "descuadre") {
    return `declara ${fmtM3(c.declarado ?? 0)} m³ de ${c.especie ?? "esa especie"}; sus trozas suman ${fmtM3(c.pedido)}`;
  }
  return `saca ${fmtM3(c.exceso)} m³ (quedan ${fmtM3(c.disponible ?? 0)} de ${fmtM3(c.declarado ?? 0)})`;
}
