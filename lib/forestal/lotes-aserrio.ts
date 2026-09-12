/**
 * lotes-aserrio.ts — el lote de aserrío mirado desde la pantalla (ADR-334).
 *
 * El lote es la materia prima agrupada ANTES de la sierra: las trozas de una
 * misma especie que van juntas al carro. Es el «Lote» que el LO-CTP usa como
 * hilo entre Consumos, Producción y Salidas, y por eso tiene pestaña propia:
 * se arma una vez y lo reusan las demás.
 *
 * Acá vive lo que se puede DECIDIR sin base de datos: qué mide un lote, cuánto
 * lleva esperando, qué rindió y qué hay que mirarle. PURO y client-safe — sin
 * fetch, sin Prisma —, así que se testea de verdad.
 *
 * Las reglas de escritura (L-A1/L-A2/L-A3) viven en `forest-lote-aserrio.db.ts`:
 * una pantalla no es una garantía.
 */

import { PT_POR_M3 } from "./cubicacion";
import { juzgarRendimientoConsumo } from "./loctp-consumos-analisis";
import { corridasAMedioDeclarar, type CorridaAMedioDeclarar } from "./produccion-paquetes";
import type { SniffsRefLote } from "./sniffs-produccion-parse";

export type EstadoLoteAserrio = "abierto" | "consumido" | "cerrado";

/**
 * Marca de origen de un lote declarado como INVENTARIO (sin trozas reales).
 *
 * Va en `notes` y no en un campo nuevo del schema: es el mismo patrón que
 * `PROVEEDOR_INVENTARIO_APERTURA` para las guías — una existencia previa al
 * sistema no tiene trozas que registrar pieza por pieza, y forzarlas fabricaría
 * datos de patio que nunca existieron. El volumen consumido y lo producido SÍ
 * quedan en la corrida que este lote apunta (`produccionEntryId`), que es la
 * fuente real — acá sólo se guarda el motivo de por qué el lote nació sin ellas.
 */
export const ORIGEN_LOTE_INVENTARIO = "Inventario declarado directamente (sin trozas reales)";

/** Un lote nacido de una declaración de inventario, no del patio pieza por pieza. */
export function esLoteDeInventario(lote: Pick<LoteAserrio, "notes">): boolean {
  return (lote.notes ?? "").includes(ORIGEN_LOTE_INVENTARIO);
}

/**
 * La marca que el importador SERFOR le pone a lo que ya existía antes del libro.
 *
 * ⚠️ **Es texto libre haciendo de bandera estructural, y eso es una deuda.** La
 * escribe `ctp-serfor-a-libro.ts` en `observations`/`notes`, y hasta hoy la
 * leían TRES componentes con su propio `observations?.startsWith("Inventario de
 * apertura")` literal —`CtpEntriesTabla`, `CtpSeccionCardMobile`,
 * `CtpProductosDisponibles`—: tres copias de la misma cadena, y cualquiera de
 * ellas se desincroniza en cuanto el texto cambia una coma. Es el mismo patrón
 * que ya rompió cinco veces con la normalización de especies.
 *
 * Mientras no exista una columna de procedencia —lo correcto, y necesita ADR +
 * migración—, la cadena y su predicado viven ACÁ y en ningún otro lado.
 *
 * `includes` y no `startsWith`: `declararProduccion()` REEMPLAZA
 * `observations`, y el operador puede escribir adelante. Exigir que la marca
 * arranque la línea la hace desaparecer con un prefijo cualquiera, y con ella
 * la única señal de que esa madera no vino con guía.
 */
export const ORIGEN_INVENTARIO_APERTURA = "Inventario de apertura";

/** ¿Esta línea del libro vino del inventario de apertura, no de una guía? */
export function esInventarioDeApertura(observations: string | null | undefined): boolean {
  return (observations ?? "").includes(ORIGEN_INVENTARIO_APERTURA);
}

/** Una pieza guardada en el lote. */
export interface TrozaDelLote {
  id: string;
  codificacion: string | null;
  codigoPlanta: string | null;
  especieComun?: string | null;
  volumenM3: number | null;
  largoM?: number | null;
  d1Cm?: number | null;
  d2Cm?: number | null;
  diametroCm?: number | null;
  woodEntryId?: string;
  /** N° de permiso (título habilitante) del ingreso — viaja en `WoodEntry.originCode`. */
  permiso?: string | null;
  /** La guía por la que entró — también del ingreso, no de la pieza. */
  gtfNumber?: string | null;
  /**
   * La corrida que YA se comió esta pieza, o `null` si sigue libre.
   *
   * El endpoint lo manda en `null` cuando esa corrida está anulada o borrada
   * —la madera volvió al patio—, igual que las otras tres lecturas de una troza:
   * lo que bloquea es el ESTADO de la corrida, nunca el id pelado.
   */
  consumidaEnId?: string | null;
}

/**
 * Un paquete de la corrida (ADR-349): el detalle de producto que compone su
 * `quantity` total. Una corrida declarada con el formulario oficial casi
 * siempre trae más de un tipo de producto —comercial, larga/angosta, etc.—
 * y sin este detalle la Ficha del Lote sólo mostraba el total, no de qué
 * estaba hecho.
 */
export interface PaqueteDeCorrida {
  id: string;
  codigo: string;
  productType: string | null;
  presentacion: string | null;
  cantidad: number;
  volumenM3: number;
}

/** La corrida de producción que se hizo con el lote. */
export interface CorridaDelLote {
  id: string;
  lineNo: number;
  entryDate: string;
  productType: string | null;
  speciesCommon?: string | null;
  quantity: number | null;
  /** La materia prima que entró: el denominador del rendimiento y del tope. */
  volumeInputM3?: number | null;
  unit: string | null;
  status: string;
  /** `false` = la corrida se anuló o se borró: el lote apunta a algo muerto. */
  viva: boolean;
  /** Cuánto de lo que produjo ya se despachó y cuánto se reprocesó. */
  despachadoQty?: number;
  reprocesadoQty?: number;
  /** El detalle de productos que compone `quantity` (ADR-349). Opcional como
   *  `despachadoQty`/`reprocesadoQty`: no todos los llamadores lo necesitan. */
  paquetes?: PaqueteDeCorrida[];
  /** Marcada a mano como "ya usada": sale de Productos disponibles (Brandon, 2026-09-01). */
  usadoAt?: string | null;
  usadoMotivo?: string | null;
}

export interface LoteAserrio {
  id: string;
  code: string;
  speciesCommon: string;
  speciesScientific: string | null;
  status: EstadoLoteAserrio;
  notes: string | null;
  /** Programación del lote (ADR-342): los campos del formulario oficial. */
  ordenProduccion?: string | null;
  tipoProductoConsumir?: string | null;
  /** El título habilitante que este lote consume (ADR-393). `null` = todos. */
  permiso?: string | null;
  inicioProceso?: string | null;
  finProceso?: string | null;
  fechaApertura: string;
  fechaConsumo: string | null;
  produccionEntryId: string | null;
  /** La corrida que CERRÓ el lote (sólo cuando entró entero a la sierra). */
  produccion?: CorridaDelLote | null;
  /**
   * TODAS las corridas vivas que se comieron piezas de este lote (ADR-365).
   *
   * Un lote aserrado en tandas tiene varias y `produccionEntryId` en null hasta
   * la última: sin esta lista, la pantalla no puede ofrecer terminar de declarar
   * lo que ya salió de la sierra.
   */
  corridas?: CorridaDelLote[];
  piezas: number;
  volumenM3: number;
  trozas: TrozaDelLote[];
  /** Lo que el SNIFFS declaró de este lote, si se armó desde su pantalla (ADR-398). */
  sniffs?: SniffsRefLote | null;
}

/** Cómo cuadra el lote con lo que el SNIFFS declaró de él (ADR-398). */
export interface CuadreSniffs {
  /** El N° de lote en el SNIFFS. */
  lote: string | null;
  /**
   * `pendiente` = el SNIFFS declaró producción y el libro todavía no;
   * `cuadra` = lo que el SNIFFS afirma coincide con el libro (a 1 litro);
   * `difiere` = algo no coincide, y `delta*` dice cuánto.
   */
  estado: "cuadra" | "difiere" | "pendiente";
  consumidoSniffsM3: number | null;
  consumidoLoteM3: number;
  producidoSniffsM3: number;
  producidoLoteM3: number;
  /** SNIFFS − libro. `null` si el SNIFFS no trajo el consumido. */
  deltaConsumidoM3: number | null;
  /**
   * SNIFFS − libro. **`null` cuando la referencia no trae productos** — la
   * LISTA de programaciones (ADR-398) no los lleva, y tomar su ausencia como
   * «declaró 0 m³» marcaría en rojo todo lote ya producido. Lo que el
   * documento no dice no se compara.
   */
  deltaProducidoM3: number | null;
  productosSniffs: number;
  /**
   * El lote tiene una corrida viva que todavía no declaró NADA.
   *
   * Es distinto de `estado`: un lote traído de la lista «cuadra» en lo único
   * comparable —el consumido— y sin embargo le falta declarar lo que salió.
   * Sin este dato la mesa lo dejaría afuera y la deuda quedaría invisible.
   */
  produccionPendiente: boolean;
}

/**
 * Un litro: el SNIFFS imprime tres decimales y el libro guarda cuatro. Una
 * tolerancia más fina que la del documento de origen sólo fabrica rojos falsos.
 */
export const TOLERANCIA_CUADRE_SNIFFS_M3 = 0.001;

export function cuadreSniffs(
  lote: Pick<LoteAserrio, "sniffs" | "volumenM3" | "produccion" | "corridas">,
): CuadreSniffs | null {
  const s = lote.sniffs;
  if (!s) return null;
  const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
  const corridas = (lote.corridas && lote.corridas.length > 0 ? lote.corridas : lote.produccion ? [lote.produccion] : []).filter(
    (c) => c.viva && (c.unit ?? "m3") === "m3",
  );
  const producidoLoteM3 = r4(corridas.reduce((a, c) => a + (Number(c.quantity) || 0), 0));
  const produccionPendiente = corridas.some((c) => c.quantity == null);
  const productos = s.productos ?? [];
  const producidoSniffsM3 = r4(productos.reduce((a, p) => a + (Number(p.volumenM3) || 0), 0));
  const consumidoLoteM3 = r4(Number(lote.volumenM3) || 0);
  const deltaConsumidoM3 = s.volumenConsumidoM3 != null ? r4(s.volumenConsumidoM3 - consumidoLoteM3) : null;
  const deltaProducidoM3 = productos.length > 0 ? r4(producidoSniffsM3 - producidoLoteM3) : null;
  const TOL = TOLERANCIA_CUADRE_SNIFFS_M3;
  const consumidoCuadra = deltaConsumidoM3 == null || Math.abs(deltaConsumidoM3) <= TOL;
  const estado: CuadreSniffs["estado"] =
    deltaProducidoM3 == null
      ? /* Sin productos que comparar, lo único que el documento afirma es el
           consumido. Un lote traído de la lista y todavía sin producir NO está
           «pendiente» contra el SNIFFS: allá tampoco se declaró nada. */
        consumidoCuadra
        ? "cuadra"
        : "difiere"
      : producidoLoteM3 === 0
        ? "pendiente"
        : Math.abs(deltaProducidoM3) <= TOL && consumidoCuadra
          ? "cuadra"
          : "difiere";
  return {
    lote: s.lote,
    estado,
    consumidoSniffsM3: s.volumenConsumidoM3,
    consumidoLoteM3,
    producidoSniffsM3,
    producidoLoteM3,
    deltaConsumidoM3,
    deltaProducidoM3,
    productosSniffs: productos.length,
    produccionPendiente,
  };
}

export const ESTADO_LOTE: Record<
  EstadoLoteAserrio,
  { label: string; hint: string; tono: "abierto" | "consumido" | "cerrado" }
> = {
  abierto: {
    label: "Abierto",
    hint: "Se le pueden agregar o sacar piezas. Todavía no entró a la sierra.",
    tono: "abierto",
  },
  consumido: {
    label: "Aserrado",
    hint: "Entró a la sierra: sus piezas están consumidas por una corrida de producción.",
    tono: "consumido",
  },
  cerrado: {
    label: "Cerrado",
    hint: "Se produjo y se despachó: no se toca más.",
    tono: "cerrado",
  },
};

/** Colores del badge de estado — single source para toda pantalla que lea un lote
 *  (tarjeta, ficha de sólo lectura, combos): el mismo estado se ve igual en todas. */
export const TONO_ESTADO_LOTE: Record<EstadoLoteAserrio, string> = {
  abierto: "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]",
  consumido:
    "border-[var(--data-success-500)]/50 bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]",
  cerrado: "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
};

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Pie tablar, como lo muestra el picker de piezas: la misma madera, un solo número. */
export function pieTablarDe(m3: number): number {
  return Math.round(m3 * PT_POR_M3);
}

/**
 * Las piezas del lote que todavía no se comió ninguna corrida.
 *
 * Un lote ABIERTO con piezas consumidas es un lote al que le sacaron madera por
 * fuera (alguien la consumió a mano en otra corrida): su volumen sigue diciendo
 * lo que se apartó, pero a la sierra sólo va a entrar esto.
 */
export function piezasLibres(lote: Pick<LoteAserrio, "trozas">): TrozaDelLote[] {
  return lote.trozas.filter((t) => !t.consumidaEnId);
}

export function volumenLibre(lote: Pick<LoteAserrio, "trozas">): number {
  return r4(piezasLibres(lote).reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0));
}

/**
 * Cuánto rindió el lote: TODO lo que salió sobre TODO lo que entró.
 *
 * ⛔ Antes dividía una sola corrida —`produccion`, la que cerró el lote— por el
 * volumen ENTERO. Mientras el lote se aserraba de una vez, esas dos mitades
 * hablaban de lo mismo. Desde que un lote se puede reabrir y aserrar en tandas
 * (ADR-383), no: con veinte trozas el lunes y quince el miércoles, el numerador
 * era lo que produjo la segunda tanda y el denominador las treinta y cinco. El
 * lote aparecía rindiendo la mitad de lo que rindió, y el rendimiento es
 * justamente lo que se mira para saber si la sierra está bien calibrada.
 *
 * `corridas` ya trae TODAS las vivas del lote —la que lo cerró incluida y sin
 * repetirla (ver `list()` en la DB class)— así que se suma esa lista y no se
 * agrega `produccion` aparte, que la contaría dos veces.
 *
 * Sólo cuando TODAS declararon en m³. Convertir pie tablar para poder mostrar un
 * porcentaje sería inventar el dato — misma regla que la vista de Consumos con
 * `corridasOtraUnidad`. Y basta UNA en otra unidad para que el total no se pueda
 * sumar: un porcentaje sobre una suma incompleta miente peor que no mostrarlo.
 */
/**
 * Cuánto SALIÓ de la sierra en este lote, en m³.
 *
 * `null` cuando no se puede sumar sin inventar: sin corridas vivas, o con
 * alguna declarada en otra unidad. Basta UNA en pie tablar para que el total no
 * exista — convertirla para poder mostrar un número sería fabricar el dato, que
 * es la misma regla que aplica Consumos con `corridasOtraUnidad`.
 *
 * Se extrajo de `rendimientoLote` para que la tabla de Saldos use ESTE número y
 * no otro: dos caminos al mismo total ya divergieron una vez en este proyecto
 * («47 vs 30»).
 */
export function producidoDelLote(lote: Pick<LoteAserrio, "corridas" | "produccion">): number | null {
  /* `corridas` es la fuente cuando está; `produccion` sola es el fallback para
     las vistas que no la traen (nunca las dos, o se cuenta doble). */
  const vivas = (lote.corridas ?? []).filter((c) => c.viva);
  const cuentan = vivas.length > 0 ? vivas : lote.produccion?.viva ? [lote.produccion] : [];
  if (cuentan.length === 0) return null;
  if (cuentan.some((c) => c.unit !== "m3")) return null;
  const producido = r4(cuentan.reduce((a, c) => a + Number(c.quantity ?? 0), 0));
  return producido > 0 ? producido : null;
}

/**
 * La madera que YA entró a la sierra: el lote entero menos lo que sigue libre.
 *
 * No se cuenta sumando las trozas con `consumidaEnId`: una atada a una corrida
 * anulada volvió al patio, y la DB class ya deja ese id en `null` (ADR-326 §6).
 * Restarle lo libre al total respeta esa regla sin repetirla.
 */
export function consumidoDelLote(lote: Pick<LoteAserrio, "trozas" | "volumenM3">): number {
  return r4(Math.max(0, lote.volumenM3 - volumenLibre(lote)));
}

/** Los títulos habilitantes de la madera del lote. Más de uno = permisos mezclados. */
export function permisosDelLote(lote: Pick<LoteAserrio, "trozas">): string[] {
  return [...new Set(lote.trozas.map((t) => (t.permiso ?? "").trim()).filter(Boolean))];
}

export function rendimientoLote(lote: LoteAserrio): number | null {
  if (!(lote.volumenM3 > 0)) return null;
  const producido = producidoDelLote(lote);
  if (producido == null) return null;
  return Math.round((producido / lote.volumenM3) * 1000) / 10;
}

/** El veredicto del rendimiento — el MISMO que usa Consumos, no otro criterio. */
export const juzgarRendimientoLote = juzgarRendimientoConsumo;

/**
 * Cuánto más se le puede declarar a la corrida de este lote, bajo el techo del
 * 56 % (ADR-358/365).
 *
 * REUSA `corridasAMedioDeclarar` —la misma función que decide qué corridas
 * ofrece "Agregar producción" en Producción— en vez de recalcular el margen
 * acá con otra fórmula: dos caminos al mismo número ya divergieron una vez en
 * este proyecto («47 vs 30»). `null` = no hay margen que mostrar (corrida
 * anulada, en otra unidad, o ya en el tope).
 */
export function margenLote(lote: Pick<LoteAserrio, "produccion">): CorridaAMedioDeclarar | null {
  const c = lote.produccion;
  if (!c || !c.viva) return null;
  const [medio] = corridasAMedioDeclarar([
    {
      id: c.id,
      lineNo: c.lineNo,
      entryDate: c.entryDate,
      productType: c.productType,
      speciesCommon: c.speciesCommon,
      volumeInputM3: c.volumeInputM3,
      quantity: c.quantity,
      unit: c.unit,
      status: c.status,
    },
  ]);
  return medio ?? null;
}

/** Qué pasó con lo que salió del lote: sigue en el patio, salió a medias o se fue. */
export interface SalidaDelLote {
  producido: number;
  /** Despachado + reprocesado: las dos formas de que el producto deje de estar. */
  salido: number;
  enPatio: number;
  unidad: string | null;
}

/**
 * Cierra el círculo del lote: entró a la sierra, produjo, ¿y esa madera ya se
 * fue? Es la pregunta que la pestaña no podía contestar — la cadena moría en
 * Producción.
 *
 * Devuelve `null` cuando no hay corrida viva o no declaró cantidad: sin
 * producción no hay nada que haya salido, y un cero ahí se leería como «está
 * todo en patio», que es una afirmación distinta.
 */
export function salidaDelLote(lote: Pick<LoteAserrio, "produccion">): SalidaDelLote | null {
  const c = lote.produccion;
  if (!c || !c.viva) return null;
  const producido = Number(c.quantity ?? 0);
  if (!(producido > 0)) return null;
  const salido = Number(c.despachadoQty ?? 0) + Number(c.reprocesadoQty ?? 0);
  return {
    producido: r4(producido),
    salido: r4(salido),
    enPatio: r4(Math.max(0, producido - salido)),
    unidad: c.unit,
  };
}

/** Días entre la apertura del lote y hoy. `null` si la fecha no se entiende. */
export function diasDeEspera(lote: Pick<LoteAserrio, "fechaApertura">, ahora: Date): number | null {
  const abierto = new Date(lote.fechaApertura);
  if (Number.isNaN(abierto.getTime())) return null;
  const ms = ahora.getTime() - abierto.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/**
 * Una semana. Un lote armado y no aserrado en ese plazo casi siempre es un lote
 * que alguien se olvidó de deshacer: mientras tanto su madera figura apartada y
 * no se ofrece para ninguna otra corrida.
 */
export const DIAS_LOTE_ANEJO = 7;

export interface AlertaLote {
  tono: "warning" | "info";
  texto: string;
}

/**
 * El lote prometió terminar el proceso para una fecha (`finProceso`, ADR-342)
 * y esa fecha ya pasó sin que se cerrara ni se aserrara entero.
 *
 * Sólo aplica a lotes ABIERTOS: uno consumido o cerrado ya terminó su proceso,
 * pasó la fecha o no, y no hay nada "vencido" que avisar.
 */
export function loteVencido(lote: Pick<LoteAserrio, "status" | "finProceso">, ahora: Date): boolean {
  if (lote.status !== "abierto" || !lote.finProceso) return false;
  const fin = new Date(lote.finProceso);
  return !Number.isNaN(fin.getTime()) && fin.getTime() < ahora.getTime();
}

/** Qué hay que mirarle a este lote. Informan, no bloquean. */
export function alertasDeLote(lote: LoteAserrio, ahora: Date): AlertaLote[] {
  const alertas: AlertaLote[] = [];
  if (lote.status === "abierto") {
    if (lote.piezas === 0) {
      alertas.push({ tono: "info", texto: "Lote vacío: agregale piezas o deshacelo." });
    }
    const consumidasPorFuera = lote.trozas.filter((t) => t.consumidaEnId).length;
    if (consumidasPorFuera > 0) {
      alertas.push({
        tono: "warning",
        texto:
          `${consumidasPorFuera} pieza${consumidasPorFuera === 1 ? "" : "s"} del lote ya ` +
          "se consumió en otra corrida: a la sierra entra menos de lo que dice el volumen.",
      });
    }
    const dias = diasDeEspera(lote, ahora);
    if (dias != null && dias >= DIAS_LOTE_ANEJO && lote.piezas > 0) {
      alertas.push({
        tono: "warning",
        texto: `Esperando la sierra hace ${dias} días: esa madera figura apartada.`,
      });
    }
    if (loteVencido(lote, ahora)) {
      alertas.push({
        tono: "warning",
        texto: `El proceso tenía fecha de fin ${new Date(lote.finProceso!).toLocaleDateString("es-PE", { timeZone: "UTC" })} y ya pasó: cerralo o ponele una fecha nueva.`,
      });
    }
  }
  /* Un lote consumido cuya corrida ya no existe es un puntero a algo muerto: su
     madera volvió al patio y el lote se puede deshacer (lo permite la DB). */
  if (lote.status !== "abierto" && lote.produccion && !lote.produccion.viva) {
    alertas.push({
      tono: "warning",
      texto: "Su corrida de producción se anuló: el lote quedó apuntando a algo que ya no existe.",
    });
  }
  return alertas;
}

const norm = (v: string | null | undefined) =>
  (v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/**
 * Corrida → código del lote de aserrío que la alimentó.
 *
 * Es el casillero (10) de la Sección 2 del LO-CTP, «N° de lote consumido»: lo
 * que entra a la corrida ahora SÍ tiene lote (ADR-334), así que el casillero se
 * puede llenar con el dato real en vez de quedar vacío.
 *
 * Una corrida anulada no declara nada —su madera volvió al patio— y por eso no
 * entra al mapa. Dos lotes en la misma corrida se declaran los dos: pasa cuando
 * se aserraron juntos, y esconder uno sería declarar de menos.
 */
export function loteAserrioPorCorrida(
  /* Pide lo mínimo (no un `LoteAserrio` entero) para que también lo puedan usar
     los exportadores, que traen del endpoint sólo estas tres claves. */
  lotes: readonly { code: string; produccionEntryId: string | null; produccion?: { viva: boolean } | null }[],
): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const l of lotes) {
    if (!l.produccionEntryId) continue;
    if (l.produccion && !l.produccion.viva) continue;
    const previo = mapa.get(l.produccionEntryId);
    mapa.set(l.produccionEntryId, previo ? `${previo}, ${l.code}` : l.code);
  }
  return mapa;
}

/**
 * Cómo está el lote respecto de su fecha de fin de proceso.
 *
 * Es lo que el patio pregunta primero cuando hay varios lotes abiertos: «¿cuál
 * se me está pasando?». Separado del estado porque son ejes distintos — un lote
 * puede estar abierto y vencido, o abierto y sin fecha.
 */
export type SituacionLote = "vencido" | "por_vencer" | "en_fecha" | "sin_fecha";

export function situacionDeLote(lote: LoteAserrio, ahora: Date, ventanaDias = 3): SituacionLote {
  if (lote.status !== "abierto" || !lote.finProceso) return "sin_fecha";
  const fin = new Date(lote.finProceso);
  if (Number.isNaN(fin.getTime())) return "sin_fecha";
  /* En UTC: `finProceso` es date-only y en Lima la medianoche UTC son las 19:00
     del día anterior — el mismo off-by-one que ya mordió al aviso de plazos. */
  const a = new Date(ahora);
  a.setUTCHours(0, 0, 0, 0);
  const b = new Date(fin);
  b.setUTCHours(0, 0, 0, 0);
  const dias = Math.ceil((b.getTime() - a.getTime()) / 86_400_000);
  if (dias < 0) return "vencido";
  return dias <= ventanaDias ? "por_vencer" : "en_fecha";
}

export const ETIQUETA_SITUACION: Record<SituacionLote, string> = {
  vencido: "Vencido",
  por_vencer: "Por vencer",
  en_fecha: "En fecha",
  sin_fecha: "Sin fecha de fin",
};

/**
 * Los filtros de la pantalla de lotes.
 *
 * Multi-selección en todos los ejes, como el resto del libro: adentro de un eje
 * los valores suman (OR) y entre ejes se cruzan (AND). Se aceptan también los
 * strings sueltos de antes para no romper a quien todavía los pase.
 */
export interface FiltroLotes {
  texto?: string;
  especie?: string | readonly string[];
  /** `""` o ausente = todos los estados. */
  estado?: EstadoLoteAserrio | "" | readonly string[];
  /** Cuánto le queda: los mismos niveles que muestra la tarjeta. */
  sobra?: readonly string[];
  /** Cómo viene con su fecha de fin. */
  situacion?: readonly string[];
}

const comoLista = (v: string | readonly string[] | undefined): string[] =>
  v == null ? [] : Array.isArray(v) ? [...v].filter(Boolean) : String(v) ? [String(v)] : [];

/** El texto busca por código, especie, nota Y código de pieza: se tipea lo que se tiene delante. */
export function filtrarLotes(lotes: readonly LoteAserrio[], f: FiltroLotes, ahora = new Date()): LoteAserrio[] {
  const texto = norm(f.texto);
  const especies = comoLista(f.especie).map((e) => norm(e));
  const estados = comoLista(f.estado);
  const sobras = comoLista(f.sobra);
  const situaciones = comoLista(f.situacion);
  return lotes.filter((l) => {
    if (estados.length > 0 && !estados.includes(l.status)) return false;
    if (especies.length > 0 && !especies.includes(norm(l.speciesCommon))) return false;
    if (sobras.length > 0 && !sobras.includes(sobraDeLote(l).nivel)) return false;
    if (situaciones.length > 0 && !situaciones.includes(situacionDeLote(l, ahora))) return false;
    if (texto) {
      /* Se busca por lo que la persona TIENE delante cuando pregunta: el código
         del lote, la especie, la nota… y también el permiso y la guía, que es
         como llega media consulta («lo del permiso 2021-017», «lo que vino en
         la 0000013»). El permiso vive en el lote (ADR-393) y además en cada
         pieza, porque un lote puede juntar madera de varios ingresos.
         El PROVEEDOR todavía no: no viaja en el lote — habría que sumarlo al
         serializador del endpoint, que es una whitelist. */
      const campos = [l.code, l.speciesCommon, l.speciesScientific, l.notes, l.permiso];
      const enCampos = campos.some((c) => norm(c).includes(texto));
      const enPiezas = l.trozas.some(
        (t) =>
          norm(t.codificacion).includes(texto) ||
          norm(t.codigoPlanta).includes(texto) ||
          norm(t.permiso).includes(texto) ||
          norm(t.gtfNumber).includes(texto),
      );
      if (!enCampos && !enPiezas) return false;
    }
    return true;
  });
}

export interface ResumenLotes {
  /** Lotes abiertos CON madera adentro: los que representan trabajo en curso. */
  abiertos: number;
  /**
   * Abiertos y sin una sola pieza. Se cuentan aparte y no en `abiertos`: un lote
   * vacío es un rótulo esperando que le carguen madera, no una pila en el patio.
   * Mezclarlos infla el KPI de «lotes esperando la sierra» con trabajo que no
   * existe (medido en el tenant real: `LA-2026-001`, abierto, 0 trozas).
   */
  vacios: number;
  piezasApartadas: number;
  volumenApartado: number;
  pieTablarApartado: number;
  consumidos: number;
  volumenAserrado: number;
  /** Ponderado por volumen de entrada, y sólo sobre las corridas en m³. */
  rendimientoPct: number | null;
  /** Cuántos lotes aserrados no pudieron entrar al rendimiento (otra unidad). */
  sinRendimiento: number;
  especies: number;
  /**
   * Suma de lo que TODOS los lotes aserrados todavía pueden declarar bajo el
   * tope del 56 % (ADR-358/365) — el volumen que "quedó acumulado" esperando
   * una tanda más, sin tener que abrir cada tarjeta para sumarlo a mano.
   */
  margenTotalM3: number;
}

/**
 * Las cifras del tablero.
 *
 * El rendimiento se PONDERA por volumen: promediar porcentajes le da el mismo
 * peso a un lote de 40 m³ que a uno de 0.8 y el número deja de significar nada.
 */
export function resumenLotes(lotes: readonly LoteAserrio[]): ResumenLotes {
  let piezasApartadas = 0;
  let volumenApartado = 0;
  let abiertos = 0;
  let vacios = 0;
  let consumidos = 0;
  let volumenAserrado = 0;
  let entradaConRend = 0;
  let salidaConRend = 0;
  let sinRendimiento = 0;
  let margenTotalM3 = 0;

  for (const l of lotes) {
    if (l.status === "abierto") {
      const suyas = piezasLibres(l).length;
      if (suyas === 0) vacios += 1;
      else abiertos += 1;
      piezasApartadas += suyas;
      volumenApartado += volumenLibre(l);
      continue;
    }
    consumidos += 1;
    volumenAserrado += l.volumenM3;
    margenTotalM3 += margenLote(l)?.margenM3 ?? 0;
    const pct = rendimientoLote(l);
    if (pct == null) {
      sinRendimiento += 1;
      continue;
    }
    entradaConRend += l.volumenM3;
    salidaConRend += Number(l.produccion?.quantity ?? 0);
  }

  return {
    abiertos,
    vacios,
    piezasApartadas,
    volumenApartado: r4(volumenApartado),
    pieTablarApartado: pieTablarDe(volumenApartado),
    consumidos,
    volumenAserrado: r4(volumenAserrado),
    rendimientoPct: entradaConRend > 0 ? Math.round((salidaConRend / entradaConRend) * 1000) / 10 : null,
    sinRendimiento,
    especies: new Set(lotes.map((l) => norm(l.speciesCommon)).filter(Boolean)).size,
    margenTotalM3: r4(margenTotalM3),
  };
}

/**
 * Las piezas consumidas, agrupadas por el LOTE DE ASERRÍO del que salieron.
 *
 * Es el eslabón que faltaba en el certificado de cadena (ADR-136 + ADR-334): la
 * atribución por GTF prueba de qué documento vino la madera, pero entre la guía
 * y la corrida hay una pila de palos, y es la pila lo que un fiscalizador cuenta
 * y lo que la EUDR pide identificar.
 *
 * Las piezas SIN lote se agrupan bajo `code: null` en vez de descartarse: una
 * troza consumida antes de que existieran los lotes —o cargada suelta a la
 * sierra— sigue siendo materia prima del producto, y esconderla dejaría el
 * conteo de piezas del certificado corto justo donde tiene que cerrar.
 */
export interface PiezaConsumida {
  codificacion: string | null;
  codigoPlanta: string | null;
  volumenM3: number | string | null;
  loteAserrioCode: string | null;
}

export interface PiezasPorLoteAserrio {
  code: string | null;
  piezas: number;
  volumenM3: number;
  /** Lo que está pintado en el palo; si no tiene marca de planta, su codificación. */
  codigos: string[];
}

export function agruparPiezasPorLoteAserrio(
  piezas: readonly PiezaConsumida[],
): PiezasPorLoteAserrio[] {
  const porLote = new Map<string, PiezasPorLoteAserrio>();
  for (const p of piezas) {
    const code = p.loteAserrioCode ?? null;
    // Clave con espacio adelante: no puede chocar con un código real.
    const k = code ?? " sin-lote";
    const fila = porLote.get(k) ?? { code, piezas: 0, volumenM3: 0, codigos: [] };
    fila.piezas += 1;
    fila.volumenM3 = r4(fila.volumenM3 + Number(p.volumenM3 ?? 0));
    const codigo = p.codigoPlanta ?? p.codificacion;
    if (codigo) fila.codigos.push(codigo);
    porLote.set(k, fila);
  }
  // Los que tienen lote primero; el grupo «sin lote» al final, que es la excepción.
  return [...porLote.values()].sort((a, b) => {
    if (a.code == null) return 1;
    if (b.code == null) return -1;
    return a.code.localeCompare(b.code);
  });
}

/**
 * Cuánta madera le queda a un lote para usar — y si eso es mucho o poco.
 *
 * Pedido de Brandon (2026-09-12): «una etiqueta si no hay madera de ese lote
 * para consumir, otra si hay poco volumen restante, otra si hay mucho».
 *
 * El número solo no alcanza: 0.641 m³ es casi nada en un lote de 35 m³ y es
 * medio lote en uno de 1.2 m³. Por eso la escala es **relativa**, y el
 * denominador cambia según lo que signifique «restante» en cada estado:
 *
 * · **Lote abierto** → rolliza sin aserrar, sobre el volumen del lote. Es la
 *   madera que todavía puede entrar a la sierra.
 * · **Lote ya aserrado** → margen contra el tope del 56 % (ADR-358), sobre el
 *   tope. No es madera física: es cuánto más se puede declarar de esa misma
 *   materia prima. Medirlo contra el volumen del lote daría siempre «poco»,
 *   porque el techo son 56 puntos y no 100.
 */
export type NivelDeSobra = "sin_sobra" | "poco" | "bastante" | "casi_entero";

export interface SobraDeLote {
  nivel: NivelDeSobra;
  /** Los m³ que quedan (rolliza libre, o margen contra el tope). */
  m3: number;
  /** Cuánto es eso de lo que podría ser (0-100). */
  pct: number;
  /** Rolliza de verdad (abierto) o cupo para declarar (aserrado). */
  esRolliza: boolean;
}

/* Los cortes salen de cómo se decide en el patio, no de una escala redonda:
   por debajo del 2 % no alcanza ni para una tanda —son litros—; hasta el 20 %
   es un resto; pasado el 60 % el lote está prácticamente sin tocar. */
const CORTE_NADA_PCT = 2;
const CORTE_POCO_PCT = 20;
const CORTE_BASTANTE_PCT = 60;

export function sobraDeLote(lote: LoteAserrio): SobraDeLote {
  const abierto = lote.status === "abierto";
  if (abierto) {
    const m3 = volumenLibre(lote);
    const base = lote.volumenM3;
    return { ...nivelPorPct(m3, base), m3, esRolliza: true };
  }
  const margen = margenLote(lote);
  const m3 = margen?.margenM3 ?? 0;
  return { ...nivelPorPct(m3, margen?.topeM3 ?? 0), m3, esRolliza: false };
}

function nivelPorPct(m3: number, base: number): { nivel: NivelDeSobra; pct: number } {
  /* Sin base no hay proporción que calcular: un lote sin volumen declarado no
     tiene «poco» ni «mucho», tiene nada. */
  if (!(base > 0) || m3 <= TOLERANCIA_CUADRE_SNIFFS_M3) return { nivel: "sin_sobra", pct: 0 };
  const pct = Math.round((m3 / base) * 1000) / 10;
  if (pct < CORTE_NADA_PCT) return { nivel: "sin_sobra", pct };
  if (pct <= CORTE_POCO_PCT) return { nivel: "poco", pct };
  if (pct <= CORTE_BASTANTE_PCT) return { nivel: "bastante", pct };
  return { nivel: "casi_entero", pct };
}

/** Cómo se lee cada nivel, según lo que el lote tenga para dar. */
export function etiquetaDeSobra(s: SobraDeLote): { texto: string; ayuda: string } {
  if (s.esRolliza) {
    switch (s.nivel) {
      case "sin_sobra":
        return { texto: "Sin madera libre", ayuda: "No le quedan piezas para mandar a la sierra." };
      case "poco":
        return { texto: `Queda poco · ${s.pct}%`, ayuda: `Le quedan ${s.m3} m³ sin aserrar, el ${s.pct}% del lote.` };
      case "bastante":
        return { texto: `Queda bastante · ${s.pct}%`, ayuda: `Le quedan ${s.m3} m³ sin aserrar, el ${s.pct}% del lote.` };
      default:
        return { texto: `Casi entero · ${s.pct}%`, ayuda: `Casi no se tocó: ${s.m3} m³ de ${s.pct}% sin aserrar.` };
    }
  }
  switch (s.nivel) {
    case "sin_sobra":
      return { texto: "Nada por declarar", ayuda: "Este lote ya llegó al tope de producción que admite su materia prima." };
    case "poco":
      return { texto: `Cupo corto · ${s.pct}%`, ayuda: `Todavía admite ${s.m3} m³ más, el ${s.pct}% de su tope.` };
    case "bastante":
      return { texto: `Cupo amplio · ${s.pct}%`, ayuda: `Todavía admite ${s.m3} m³ más, el ${s.pct}% de su tope.` };
    default:
      return { texto: `Cupo casi entero · ${s.pct}%`, ayuda: `Casi no se declaró: admite ${s.m3} m³ más, el ${s.pct}% de su tope.` };
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Orden y facetas de la pantalla de lotes
 * ────────────────────────────────────────────────────────────────────────── */

export type OrdenLotes = "urgencia" | "codigo" | "volumen" | "sobra" | "espera";

export const ETIQUETA_ORDEN: Record<OrdenLotes, string> = {
  urgencia: "Lo que corre primero",
  codigo: "Código de lote",
  volumen: "Más volumen",
  sobra: "Más para usar",
  espera: "Más tiempo esperando",
};

/** Lo vencido antes que lo que vence pronto, y eso antes que lo demás. */
const PESO_SITUACION: Record<SituacionLote, number> = {
  vencido: 0,
  por_vencer: 1,
  en_fecha: 2,
  sin_fecha: 3,
};

/**
 * Ordenar los lotes por lo que el patio necesita mirar primero.
 *
 * El backend los devuelve por estado y fecha de creación, que es un orden de
 * base de datos, no de trabajo: con varios lotes abiertos no dice cuál se está
 * pasando de fecha. `urgencia` es el default por eso.
 *
 * Devuelve una copia: ordenar en el lugar mutaría el array del hook y React no
 * vería el cambio.
 */
export function ordenarLotes(
  lotes: readonly LoteAserrio[],
  orden: OrdenLotes,
  ahora = new Date(),
): LoteAserrio[] {
  const copia = [...lotes];
  switch (orden) {
    case "codigo":
      /* `localeCompare` con `numeric`: «9-2026» va antes que «13-2026», que es
         como los lee una persona — alfabéticamente sería al revés. */
      return copia.sort((a, b) => a.code.localeCompare(b.code, "es", { numeric: true }));
    case "volumen":
      return copia.sort((a, b) => b.volumenM3 - a.volumenM3);
    case "sobra":
      return copia.sort((a, b) => sobraDeLote(b).m3 - sobraDeLote(a).m3);
    case "espera": {
      /* El que hace más que espera: sin fecha de apertura va al final, porque
         «no sé desde cuándo» no es «desde siempre». */
      const desde = (l: LoteAserrio) => {
        const d = new Date(l.fechaApertura);
        return Number.isNaN(d.getTime()) ? Number.POSITIVE_INFINITY : d.getTime();
      };
      return copia.sort((a, b) => desde(a) - desde(b));
    }
    default:
      return copia.sort((a, b) => {
        const pa = PESO_SITUACION[situacionDeLote(a, ahora)];
        const pb = PESO_SITUACION[situacionDeLote(b, ahora)];
        if (pa !== pb) return pa - pb;
        /* A igual urgencia manda el que tiene más madera parada. */
        const sa = sobraDeLote(a).m3;
        const sb = sobraDeLote(b).m3;
        if (sb !== sa) return sb - sa;
        return a.code.localeCompare(b.code, "es", { numeric: true });
      });
  }
}

export interface FacetaLotes {
  value: string;
  label: string;
  count: number;
}

/**
 * Las opciones de cada filtro, con cuánto pesa cada una.
 *
 * **Cada faceta se cuenta sobre el resto de los filtros, no sobre sí misma.**
 * Si no, al elegir «Tornillo» el desplegable de especies mostraría sólo
 * Tornillo y no se podría agregar una segunda — el error clásico de las facetas
 * cruzadas, ya visto en Capacidad.
 */
export function facetasDeLotes(
  lotes: readonly LoteAserrio[],
  f: FiltroLotes,
  ahora = new Date(),
): { especie: FacetaLotes[]; estado: FacetaLotes[]; sobra: FacetaLotes[]; situacion: FacetaLotes[] } {
  const sin = (eje: keyof FiltroLotes) => filtrarLotes(lotes, { ...f, [eje]: undefined }, ahora);

  const contar = <T extends string>(
    fuente: readonly LoteAserrio[],
    clave: (l: LoteAserrio) => T | null,
    etiqueta: (v: T) => string,
  ): FacetaLotes[] => {
    const m = new Map<string, number>();
    for (const l of fuente) {
      const k = clave(l);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([value, count]) => ({ value, label: etiqueta(value as T), count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es"));
  };

  return {
    especie: contar(sin("especie"), (l) => l.speciesCommon?.trim() || null, (v) => v),
    estado: contar(sin("estado"), (l) => l.status, (v) => ESTADO_LOTE[v as EstadoLoteAserrio]?.label ?? v),
    sobra: contar(sin("sobra"), (l) => sobraDeLote(l).nivel, (v) => ETIQUETA_NIVEL_SOBRA[v as NivelDeSobra] ?? v),
    situacion: contar(sin("situacion"), (l) => situacionDeLote(l, ahora), (v) => ETIQUETA_SITUACION[v as SituacionLote] ?? v),
  };
}

/** El nivel, en corto — para el desplegable, donde no cabe la frase entera. */
export const ETIQUETA_NIVEL_SOBRA: Record<NivelDeSobra, string> = {
  sin_sobra: "Sin nada para usar",
  poco: "Queda poco",
  bastante: "Queda bastante",
  casi_entero: "Casi entero",
};
