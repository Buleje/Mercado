/**
 * cubicacion-reparto — repartir el volumen de ROLLIZA sobre la ASERRADA que salió.
 *
 * La pregunta del aserradero: «entraron 20 m³ de Tornillo en troza, de los que
 * aprovecho un 55 %; ¿qué parte de lo aserrado ampara ese bloque, y qué me
 * queda sin amparar?».
 *
 * ── Cómo distribuye ─────────────────────────────────────────────────────────
 * Cada bloque de rolliza tiene una **capacidad**: `m³ × % aprovechable`. Esa es
 * la aserrada que ese bloque puede respaldar, y ni un metro más. Lo que no entra
 * en ningún bloque queda en la tabla de **faltante por distribuir** — la madera
 * que espera la próxima rolliza.
 *
 * El tope por capacidad no es negociable: un bloque de 20 m³ al 55 % ampara
 * 11 m³ y punto. El respaldo de volumen es lo que se declara, y declarar de más
 * es exactamente el hueco por donde se blanquea madera (misma lógica que I1–I5
 * del Libro).
 *
 * ⭐ **Dentro de esa capacidad el llenado es una MEZCLA, no una cola.** Una
 * troza no da primero toda la comercial y después toda la corta: de cada troza
 * salen las dos, y las tablas, y los retazos. Por eso cada bloque toma su
 * capacidad repartida entre TODOS los tipos que quedan pendientes, en la
 * proporción en que están. Llenar por orden —comercial hasta agotarla, después
 * la siguiente— daba bloques que ningún aserradero produce: uno íntegro de
 * comercial y el último con la basura.
 *
 * Puede faltar un tipo en un bloque (si ya se agotó antes), pero mientras haya
 * de varios, todos entran a la vez. Y el reparto baja hasta la MEDIDA: dentro
 * de cada tipo, las medidas se reparten igual, para poder decir qué 2×8×10
 * entraron en qué bloque.
 *
 * ⭐ **La unidad del reparto es la PIEZA ENTERA, no el m³.** Antes se repartía
 * volumen y el conteo salía prorrateado: «21.16 tablas de 2×8×10 entraron en la
 * GTF-0231». Eso no se puede declarar —una tabla no se parte en 0.16— y encima
 * el redondeo hacía que las piezas ni siquiera cerraran (40 en el lote → 40.01
 * repartidas). Ahora cada medida reparte piezas enteras: la proporción decide
 * cuántas van a cada bloque y el resto se completa por mayor residuo, siempre
 * que la pieza QUEPA en la capacidad. Consecuencia honesta: un bloque puede
 * quedar con unos litros libres —los de la pieza que ya no entraba— en vez de
 * amparar un pedazo de tabla que nadie aserró.
 *
 * PURO y client-safe: sin React, sin fetch, sin DOM.
 */
import { toFeet, type PiezaCubicada, type Unidad } from "./cubicacion";
import { agruparPor, claveYLabel, type DimensionResumen, type GrupoResumen, type PrecioPt } from "./cubicacion-resumen";

/**
 * Aprovechamiento supuesto cuando el bloque no lo trae.
 *
 * 55 % es el centro del rango normal del aserrío peruano (40–65 %) que ya usa
 * `juzgarRendimiento`. Es un SUPUESTO editable, no una medición: la pantalla lo
 * muestra en una columna propia para que se corrija con el dato del aserradero.
 */
export const APROVECHABLE_DEFAULT = 55;

/** Un bloque de rolliza: lo que entró, con su etiqueta para reconocerlo. */
export interface BloqueRolliza {
  id: string;
  /** GTF, N° de lote, «troza 14»… lo que el operario use para ubicarlo. */
  etiqueta: string;
  /** Vacío = sin especie declarada; sólo se cruza con aserrada sin especie. */
  especie: string;
  /**
   * El volumen del bloque. **Qué volumen es depende de `tipo`**: en un bloque
   * de rolliza son m³ (R) de troza —hay que pasarlos por el % aprovechable
   * para saber qué amparan—; en uno de aserrada directa son m³ (A) de madera
   * ya aserrada, que amparan ese mismo número y punto.
   */
  m3: number;
  /**
   * Qué se cargó en este bloque (Brandon, 2026-09-01: "otra función que me
   * permita crear bloques ya aserrada, sin necesidad de crear un bloque de
   * rolliza … pondré el m³ y piezas y se distribuirá con los demás").
   *
   * · `"rolliza"` (default, y lo que asume todo lo guardado antes de este
   *   campo): la forma tradicional — entró troza, se declara su m³ (R) y el
   *   % aprovechable, y el sistema calcula qué aserrada ampara.
   * · `"aserrada"`: la madera entró YA ASERRADA (comprada aserrada, saldo de
   *   inventario, un lote que nunca pasó por la sierra). No hay troza que
   *   convertir: su m³ ES el volumen amparado, sin porcentaje de por medio, y
   *   las piezas se declaran a mano en `piezasManual`.
   *
   * Los dos tipos conviven en la MISMA tabla y se reparten con el mismo motor
   * —cada uno con su capacidad—: lo único que cambia es de dónde sale esa
   * capacidad. Lo que NO se mezcla son los totales: un bloque de aserrada
   * directa no suma rolliza (`rollizaM3`) ni entra al rendimiento del
   * aserradero, porque no salió de ninguna troza y contarlo ahí ensuciaría
   * justo el número que mide la sierra.
   */
  tipo?: "rolliza" | "aserrada";
  /**
   * N° de permiso (título habilitante) de origen de este bloque, si se
   * conoce (Brandon, 2026-09-01). No cambia CÓMO se reparte —la aserrada
   * sigue sin poder decir de qué permiso salió cada tabla— pero permite
   * declarar el desglose `porPermiso` en `EspecieDistribucion` para que dos
   * permisos de la misma especie nunca se muestren como un bloque anónimo
   * único: ver la nota en `distribuirPorCapacidad`.
   */
  permiso?: string | null;
  /**
   * De dónde salió: el cubicador de trozas, cargado a mano, o el volumen
   * restante de un lote de aserrío ya creado (Brandon, 2026-09-01: "opción
   * si es de rolliza o si es de Lote creado"). `"lote"` no cambia CÓMO se
   * reparte —sigue siendo un `BloqueRolliza` más— sólo de dónde salió su m³.
   */
  origen: "trozas" | "manual" | "lote";
  /** Si `origen === "lote"`, el lote de donde salió — para no ofrecerlo dos veces. */
  loteId?: string | null;
  /**
   * Si el bloque salió de un PAQUETE ya declarado en el Libro, su referencia
   * (`paquete:<id>` o `corrida:<id>`) — para no ofrecerlo dos veces en el
   * buscador. No cambia nada del reparto: es sólo la marca de dónde vino, y
   * cargar el mismo paquete dos veces duplicaría su m³ dentro de la hoja.
   */
  paqueteId?: string | null;
  /** Costo por m³ de rolliza, si se conoce. `null` nunca se sustituye por 0. */
  costoM3?: number | null;
  /** % de la rolliza que se convierte en aserrada. Sin valor, `APROVECHABLE_DEFAULT`. */
  aprovechablePct?: number | null;
  /**
   * Lo que el bloque ampara, DICHO A MANO (m³).
   *
   * Con valor, manda sobre `m³ × % aprovechable`: el que estuvo en la sierra
   * sabe cuánto salió de esa troza y no tiene por qué pasarlo por un porcentaje
   * supuesto. `null` = se calcula como siempre.
   */
  amparaManualM3?: number | null;
  /**
   * Tope de PIEZAS del bloque, dicho a mano. Con valor, el bloque deja de
   * cargar al llegar a esa cantidad aunque le sobre capacidad — es la otra
   * forma de contar en el patio: «de esta troza salieron 40 tablas».
   */
  piezasManual?: number | null;
  /**
   * En cuántos días se aserró ese bloque. El Libro de Operaciones se registra
   * DÍA por día, así que una GTF que entró el lunes y se cortó en cinco días no
   * se declara de un saque: hay que saber qué le toca a cada jornada.
   * Sin valor (o 1) = todo en un día.
   */
  dias?: number | null;
  /**
   * Fecha (AAAA-MM-DD, date-only) en que se aserró este bloque — el día que
   * va al Libro de Operaciones para esa jornada (Brandon, 2026-09-02). Con
   * más de un día (`dias`), es el día en que ARRANCÓ; el papel no reparte
   * fechas individuales por jornada, sólo dice desde cuándo. `null`/vacío =
   * no se dijo.
   */
  fecha?: string | null;
  /**
   * Este bloque SÓLO ampara piezas de estos largos (en pies), y de cada uno
   * hasta el % que se le declare. `null`/vacío = cualquier largo entero,
   * como siempre.
   *
   * Sirve para separar el patio a mano: «esta troza va toda a 12 pies» (pct
   * 100, completo) —o, puesta en DOS bloques con el MISMO largo, «12 pies
   * se reparte entre estos dos» (cada uno se llena hasta SU capacidad, en
   * el orden en que están cargados; sin un pct explícito, el tamaño de cada
   * bloque ya decide cuánto le toca)— o, con `pct` < 100, «este bloque se
   * queda con sólo el 30 % de lo que hay pendiente de 12 pies, el resto
   * para otro lado». El % se aplica sobre el PENDIENTE en el momento en que
   * le toca el turno a este bloque (después de lo que ya consumieron los
   * bloques anteriores), no sobre el total original — así el reparto sigue
   * respetando el ORDEN de carga, como el resto del módulo. El filtro no
   * inventa una regla nueva de reparto: sólo recorta cuántas piezas de cada
   * medida puede VER `llenarBloque`, el resto de la lógica (mezcla
   * proporcional, sueltas, capacidad) sigue igual.
   */
  largoFiltro?: FiltroLargo[] | null;
  /**
   * Este bloque ampara SÓLO estos grupos de la vista vigente — «este bloque
   * lleva sólo Comercial, el de al lado sólo Corta» (Brandon, 2026-09-02:
   * "solo en ese bloque quiero poner un tipo, en el siguiente otros tipos").
   *
   * Clave: `claveOverrideLinea(dim, grupoClave)`, el MISMO formato que
   * `overridesLinea`, y por la misma razón: la clave de un grupo cambia según
   * cómo se agrupe la tabla, así que un filtro armado bajo «Por tipo» no
   * significa nada bajo «Por largo». Si se cambia la vista, el filtro queda
   * inactivo (no se borra, sólo no se aplica) y el bloque vuelve a tomar de
   * todo.
   *
   * ⛔ **Es EXCLUYENTE, no una prioridad** — y ahí se separa del hermano
   * `largoFiltro`, que sí reserva y después completa con lo que haya. Acá
   * completar sería exactamente lo que el filtro viene a impedir: un bloque
   * que dice «sólo Comercial» y termina con Corta adentro porque sobraba
   * capacidad no sirve para separar nada. Vacío/`null` = de todo, como
   * siempre.
   */
  gruposFiltro?: string[] | null;
  /**
   * Overrides manuales por LÍNEA del resultado ya distribuido: piezas y/o m³
   * dichos a mano para un tipo/medida puntual (ej. «de Comercial quiero 150
   * piezas»), editados desde el desglose de abajo en vez de desde la tabla de
   * entrada. Clave: `claveOverrideLinea(dim, grupoClave)` — el `dim` va adentro
   * porque la clave de un grupo cambia según cómo se agrupe (tipo/largo/
   * medida/…); un override armado bajo «Por tipo» no tiene sentido bajo «Por
   * largo», así que uno queda inactivo (no se borra, sólo no se aplica) si se
   * cambia la vista. `piezas`/`m3` en `null` = sin decir nada para ese campo,
   * que lo calcule el reparto proporcional como siempre.
   */
  overridesLinea?: Record<string, { piezas?: number | null; m3?: number | null }> | null;
}

/** Clave de un override de línea: el `dim` va adentro para no aplicar un override armado bajo otra vista. */
export const claveOverrideLinea = (dim: DimensionResumen, grupoClave: string): string => `${dim}|${grupoClave}`;

/** Un largo admitido por el bloque, y qué parte de su pendiente se lleva. */
export interface FiltroLargo {
  /** El largo en pies. */
  largo: number;
  /**
   * Qué % del pendiente ACTUAL de este largo puede tomar el bloque (1-100).
   * 100 = completo — es lo mismo que filtrar sólo por largo, sin recortar
   * cantidad. Fuera de ese rango se sanea al guardar (`sanearFiltroLargo`).
   */
  pct: number;
}

/** Una medida concreta dentro de un grupo: el «2×8×10» que entró al bloque. */
export interface AsignacionMedida {
  clave: string;
  /** "2×8×10" tal como se lee en el patio. */
  medida: string;
  espesor: number;
  ancho: number;
  largo: number;
  uEspesor: string;
  uAncho: string;
  uLargo: string;
  m3: number;
  pieTablar: number;
  /** Piezas ENTERAS de esta medida que ampara el bloque. */
  piezas: number;
}

/** Cuánto de un grupo de aserrada ampara un bloque, y con qué medidas. */
export interface AsignacionGrupo {
  clave: string;
  label: string;
  m3: number;
  pieTablar: number;
  /** Piezas ENTERAS del grupo que ampara el bloque. */
  piezas: number;
  /** El detalle que pide el papel: qué medidas se incorporaron acá. */
  medidas: AsignacionMedida[];
  /**
   * `m3` es lo que el operario DECLARÓ a mano para esta línea (Brandon,
   * 2026-09-02: "quiero poner piezas y m³ ... nada de automático"), no lo que
   * suman físicamente `medidas` — puede ser MÁS de lo que esas piezas dieron.
   * Decisión suya, a conciencia, sobre el bloqueo de la auditoría 2026-08-17
   * (ese bloqueo sigue activo por default: esto sólo se activa si el
   * operario tipeó un m³ Y no lo dejó vacío). El consumidor (UI, Excel,
   * Anexo 04) tiene que avisar que es declarado, no medido.
   */
  m3Declarado?: boolean;
}

/** Lo que le toca a UNA jornada del bloque: las mismas piezas, repartidas. */
export interface DiaDistribuido {
  /** 1…N, en el orden en que se aserró. */
  dia: number;
  piezas: number;
  pieTablar: number;
  m3: number;
  /** El desglose del día, con sus medidas: lo que se copia al Libro. */
  grupos: AsignacionGrupo[];
}

export interface BloqueDistribuido {
  bloque: BloqueRolliza;
  aprovechablePct: number;
  /** Aserrada que este bloque puede respaldar: `m³ × %`. */
  capacidadM3: number;
  usadoM3: number;
  libreM3: number;
  /**
   * Piezas del tope declarado a mano (`piezasManual`) que quedaron SIN usar.
   * `null` cuando el bloque no declaró conteo — ahí no hay resto que mostrar,
   * el bloque toma las que entren. Brandon (2026-09-02): «ver si resta o
   * queda»: un bloque cierra bien cuando no le sobra ni volumen ni piezas, y
   * hasta ahora sólo se veía lo primero.
   */
  piezasLibres: number | null;
  asignado: AsignacionGrupo[];
  /** Días declarados de aserrío (mínimo 1). */
  dias: number;
  /** Lo asignado partido por jornada. Siempre trae `dias` entradas. */
  porDia: DiaDistribuido[];
  /** Costo de la rolliza del bloque; `null` si no se cargó. */
  costoRolliza: number | null;
  /** Lo que cuesta cada m³ de aserrada amparada por este bloque. */
  costoPorM3Aserrada: number | null;
}

/** Aserrada que ningún bloque alcanzó a respaldar. */
export interface FaltanteGrupo {
  clave: string;
  label: string;
  m3: number;
  pieTablar: number;
  piezas: number;
  medidas: AsignacionMedida[];
  /** Rolliza que haría falta para ampararlo, al aprovechamiento vigente. */
  rollizaNecesariaM3: number;
}

export type EstadoEspecie = "ok" | "sin-rolliza" | "sin-aserrada";

export interface EspecieDistribucion {
  especie: string;
  estado: EstadoEspecie;
  bloques: BloqueDistribuido[];
  faltante: FaltanteGrupo[];
  /** m³ de ROLLIZA que entró — sólo los bloques de troza, nunca los de aserrada directa. */
  rollizaM3: number;
  /**
   * m³ de madera ya ASERRADA cargada directo (bloques `tipo: "aserrada"`).
   * Se lista aparte de `rollizaM3` a propósito: sumarlos daría un «entró» que
   * mezcla troza con tabla —dos cosas que no se miden igual— y arruinaría el
   * rendimiento, que es justamente aserrada ÷ rolliza.
   */
  aserradaDirectaM3: number;
  /** De `amparadaM3`, lo que respaldan los bloques de aserrada directa. */
  amparadaDirectaM3: number;
  capacidadM3: number;
  aserradaM3: number;
  aserradaPt: number;
  /** Aserrada efectivamente respaldada por algún bloque. */
  amparadaM3: number;
  /** Pie tablar de lo amparado — NO el del lote entero (ver `aserradaPt`). */
  amparadaPt: number;
  faltanteM3: number;
  /** Capacidad que sobró en los bloques: rolliza que todavía puede amparar. */
  libreM3: number;
  /** Rolliza que haría falta para cubrir el faltante. */
  rollizaFaltanteM3: number;
  /** Aserrada ÷ rolliza en %, el rendimiento REAL. `null` sin rolliza. */
  rendimientoPct: number | null;
  imposible: boolean;
  costoRolliza: number | null;
  /**
   * `bloques` agrupados por su `permiso` (Brandon, 2026-09-01) — SOLO para
   * mostrar. El llenado sigue siendo uno solo por especie, en el orden en
   * que se cargaron los bloques (misma regla de siempre, «no prorrateo»):
   * la aserrada no trae de qué permiso salió cada tabla, así que no hay
   * forma honesta de partir el pool. Lo que SÍ se puede — y lo que evita
   * que dos permisos queden combinados sin que se note en el papel — es
   * declarar por separado cuánto ampara cada uno. Un solo grupo con
   * `permiso: null` = todos los bloques sin dato (el caso de siempre).
   */
  porPermiso: {
    permiso: string | null;
    bloques: BloqueDistribuido[];
    rollizaM3: number;
    capacidadM3: number;
    amparadaM3: number;
    amparadaPt: number;
  }[];
}

export interface Distribucion {
  especies: EspecieDistribucion[];
  totales: {
    rollizaM3: number;
    /** m³ cargados como aserrada directa (bloques sin troza de origen). */
    aserradaDirectaM3: number;
    /** De `amparadaM3`, lo que respaldan esos bloques de aserrada directa. */
    amparadaDirectaM3: number;
    capacidadM3: number;
    aserradaM3: number;
    aserradaPt: number;
    amparadaM3: number;
    amparadaPt: number;
    faltanteM3: number;
    libreM3: number;
    rollizaFaltanteM3: number;
    rendimientoPct: number | null;
    costoRolliza: number | null;
  };
  /** Rolliza que no encontró aserrada de su especie. */
  rollizaHuerfana: { especie: string; m3: number }[];
  /** Aserrada sin rolliza declarada de su especie. */
  aserradaHuerfana: { especie: string; m3: number }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
/** Debajo de esto un volumen es ruido de coma flotante, no madera. */
const EPS = 1e-6;

/** Clave de especie normalizada. Vacío = "sin especie", que es una categoría real. */
export function claveEspecie(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

const labelEspecie = (raw: string) => raw.trim() || "Sin especie";

/**
 * ¿Este bloque es madera YA ASERRADA cargada directo, sin troza de origen?
 *
 * Un bloque sin `tipo` es de rolliza: es lo que había antes de que existiera
 * este campo, y todo lo guardado en `localStorage` o en el servidor viene así.
 */
export const esAserradaDirecta = (b: Pick<BloqueRolliza, "tipo">): boolean => b.tipo === "aserrada";

/**
 * El aprovechamiento vigente de un bloque, acotado a algo posible.
 *
 * Un bloque de aserrada directa no convierte nada: lo que se cargó ya salió de
 * la sierra, así que su aprovechamiento es 100 % por definición — aplicarle un
 * 55 % supuesto le comería casi la mitad del volumen que el operario midió.
 */
export function aprovechableDe(b: Pick<BloqueRolliza, "aprovechablePct" | "tipo">): number {
  if (esAserradaDirecta(b)) return 100;
  const v = b.aprovechablePct;
  if (v == null || !Number.isFinite(v)) return APROVECHABLE_DEFAULT;
  // 0 es legítimo (una troza que no dio nada); más de 100 no: no sale más
  // madera aserrada que la troza de la que salió.
  return Math.min(100, Math.max(0, v));
}

/**
 * La aserrada que un bloque puede respaldar.
 *
 * Si el bloque declara a mano cuánto ampara, manda ese número: el porcentaje
 * aprovechable es un SUPUESTO y lo medido le gana a lo supuesto. Pero lo
 * medido NUNCA puede superar el m³ físico de la troza — el camino por %
 * ya está acotado a [0,100] vía `aprovechableDe`; sin el mismo tope acá, un
 * bloque de 10 m³ podía "amparar" 50 m³ tipeando cualquier número, inflando
 * la capacidad/libre en pantalla y en el papel que se le muestra al
 * fiscalizador (auditoría 2026-08-17).
 */
export function capacidadDe(b: BloqueRolliza): number {
  const rollizaM3 = Number(b.m3) || 0;
  /* Aserrada directa: el m³ cargado YA es el amparado. No hay porcentaje que
     aplicar ni un «ampara a mano» que pueda decir otra cosa — sería el mismo
     número dos veces, y con dos formas de contradecirse. */
  if (esAserradaDirecta(b)) return r4(Math.max(0, rollizaM3));
  if (b.amparaManualM3 != null && Number.isFinite(Number(b.amparaManualM3))) {
    return r4(Math.min(rollizaM3, Math.max(0, Number(b.amparaManualM3))));
  }
  return r4(rollizaM3 * (aprovechableDe(b) / 100));
}

/**
 * ¿Este bloque tiene su capacidad dicha a mano (en vez de calculada por %)?
 *
 * Un bloque de aserrada directa NO cuenta como manual aunque su capacidad
 * salga tal cual del m³ cargado: ahí no hay un supuesto que alguien esté
 * corrigiendo, es la única lectura posible del dato.
 */
export const esManual = (b: Pick<BloqueRolliza, "amparaManualM3" | "tipo">): boolean =>
  !esAserradaDirecta(b) && b.amparaManualM3 != null && Number.isFinite(Number(b.amparaManualM3));

/** Tope de jornadas: un bloque de un año de aserrío no existe, y 10 000 filas sí. */
const DIAS_MAX = 366;

/**
 * Identidad de una línea de la distribución, para marcarla como registrada.
 *
 * Vive acá y no en la pantalla porque el Excel y el PDF tienen que reconocer
 * exactamente la misma línea: si cada uno arma su clave, el archivo dice
 * «pendiente» sobre lo que la pantalla ya tiene tildado.
 */
export const claveMarca = (bloqueId: string, dia: number, grupoClave: string): string =>
  `${bloqueId}|d${dia}|${grupoClave}`;

/** Los días de aserrío del bloque, saneados. Sin dato o basura ⇒ 1. */
export function diasDe(b: Pick<BloqueRolliza, "dias">): number {
  const v = Number(b.dias);
  if (!Number.isFinite(v) || v < 1) return 1;
  return Math.min(DIAS_MAX, Math.floor(v));
}

/**
 * Un `largoFiltro` saneado: largos positivos, `pct` en 1-100 (sin dato o
 * basura ⇒ 100, completo), sin duplicar el mismo largo dos veces —se queda
 * con la ÚLTIMA entrada de cada uno, es la que el operario tocó último.
 */
export function sanearFiltroLargo(f: readonly FiltroLargo[] | null | undefined): FiltroLargo[] | null {
  if (!f || f.length === 0) return null;
  const porLargo = new Map<number, number>();
  for (const { largo, pct } of f) {
    if (!Number.isFinite(largo) || largo <= 0) continue;
    const pctSano = Number.isFinite(pct) && pct > 0 ? Math.min(100, Math.round(pct)) : 100;
    porLargo.set(largo, pctSano);
  }
  if (porLargo.size === 0) return null;
  return [...porLargo.entries()].map(([largo, pct]) => ({ largo, pct }));
}

/**
 * Las claves de grupo que este bloque admite BAJO LA VISTA VIGENTE, o `null`
 * si no filtra nada (sin lista, lista vacía, o una lista armada bajo otra
 * dimensión — ahí el filtro está inactivo, igual que un `overridesLinea` de
 * otra vista).
 */
export function gruposAdmitidos(
  b: Pick<BloqueRolliza, "gruposFiltro">,
  dim: DimensionResumen,
): Set<string> | null {
  const lista = b.gruposFiltro;
  if (!lista || lista.length === 0) return null;
  const prefijo = `${dim}|`;
  const claves = lista
    .filter((k) => typeof k === "string" && k.startsWith(prefijo))
    .map((k) => k.slice(prefijo.length))
    .filter((k) => k !== "");
  return claves.length > 0 ? new Set(claves) : null;
}

/**
 * Parte lo asignado a un bloque entre sus jornadas.
 *
 * Se reparten PIEZAS, no volumen: si de una medida hay 7 tablas en 3 días, salen
 * 3 · 2 · 2, no 2,33 cada día. El volumen y el pie tablar se derivan de esas
 * piezas, y **la última jornada se lleva el resto** para que la suma de los días
 * dé exactamente lo del bloque (si cada día se redondea por su cuenta, el total
 * de la pantalla y el del papel dejan de coincidir).
 *
 * Días de más son legítimos: una jornada sin piezas se lista igual —«ese día no
 * salió nada de este bloque»— en vez de desaparecer.
 */
export function repartirPorDia(asignado: readonly AsignacionGrupo[], dias: number): DiaDistribuido[] {
  const n = Math.max(1, Math.min(DIAS_MAX, Math.floor(dias) || 1));
  const salida: DiaDistribuido[] = Array.from({ length: n }, (_, i) => ({
    dia: i + 1, piezas: 0, pieTablar: 0, m3: 0, grupos: [],
  }));
  const porDiaGrupo = new Map<string, AsignacionGrupo>();

  for (const g of asignado) {
    if (g.m3Declarado || g.medidas.length === 0) {
      /*
       * Línea en 0 por un override manual, o declarada a mano (Brandon,
       * 2026-09-02): ninguna tiene piezas REALES que partir proporcional
       * entre jornadas —una es cero, la otra es un m³ que el operario tipeó
       * sin que las medidas de abajo den esa suma—, así que va ENTERA en la
       * primera jornada, no repartida. Sin este `+=` a `salida[0]`, un
       * bloque de un solo día con una línea declarada mostraría "Total del
       * día" en 0 mientras el bloque arriba dice "usa X" — el mismo
       * descuadre que motivó todo esto, reaparecido acá.
       */
      salida[0].grupos.push({
        clave: g.clave, label: g.label, m3: g.m3, pieTablar: g.pieTablar,
        piezas: g.piezas, medidas: g.medidas, m3Declarado: g.m3Declarado,
      });
      salida[0].m3 += g.m3;
      salida[0].pieTablar += g.pieTablar;
      salida[0].piezas += g.piezas;
      continue;
    }
    for (const m of g.medidas) {
      if (m.piezas <= 0) continue;
      const base = Math.floor(m.piezas / n);
      const extra = m.piezas - base * n;
      /** Con `base` 0 sólo cargan los primeros `extra` días; si no, todos. */
      const ultimoConPiezas = base > 0 ? n - 1 : extra - 1;
      // El redondeo de CADA día por separado (r4/r2) no cierra solo: redondear
      // 566.17008 → 566.17 y 564.47496 → 564.47 (dos veces) suma 1695.11,
      // 0.01 menos que el 1695.12 ya redondeado de la medida — "redondear las
      // partes no da la suma del todo redondeado" (auditoría 2026-08-17). La
      // ÚLTIMA jornada con piezas NO se redondea sobre su propio crudo: se
      // define como lo que falta para que la suma cierre CONTRA el total ya
      // redondeado de la medida (`m.m3`/`m.pieTablar`), así el cierre es exacto
      // por construcción y no por casualidad de cómo cayeron los redondeos.
      let sumM3 = 0;
      let sumPt = 0;

      for (let i = 0; i < n; i++) {
        // Los primeros `extra` días llevan una pieza más: el reparto entero más
        // parejo posible.
        const piezas = base + (i < extra ? 1 : 0);
        if (piezas <= 0) continue;
        let m3: number, pt: number;
        if (i === ultimoConPiezas) {
          m3 = r4(m.m3 - sumM3);
          pt = r2(m.pieTablar - sumPt);
        } else {
          m3 = r4((m.m3 / m.piezas) * piezas);
          pt = r2((m.pieTablar / m.piezas) * piezas);
          sumM3 += m3;
          sumPt += pt;
        }

        const k = `${i}|${g.clave}`;
        let dest = porDiaGrupo.get(k);
        if (!dest) {
          dest = { clave: g.clave, label: g.label, m3: 0, pieTablar: 0, piezas: 0, medidas: [] };
          porDiaGrupo.set(k, dest);
          salida[i].grupos.push(dest);
        }
        dest.medidas.push({ ...m, m3, pieTablar: pt, piezas });
        // Se suma el m3/pt YA redondeado de ESTE push (no se redondea la
        // suma parcial en cada vuelta): un grupo con más de una medida, o un
        // día con más de un grupo, volvía a compounding el mismo problema
        // que en `llenarBloque` — acá se detectó porque `porDia` sumado
        // dejaba de cuadrar con `asignado` en 0.01 PT (auditoría 2026-08-17,
        // fix de `llenarBloque` no alcanzaba: esta acumulación es aparte).
        dest.m3 += m3;
        dest.pieTablar += pt;
        dest.piezas += piezas;
        salida[i].m3 += m3;
        salida[i].pieTablar += pt;
        salida[i].piezas += piezas;
      }
    }
  }
  // Redondeo final, una sola vez por (grupo·día) y por día — recién acá,
  // sobre la suma cruda de los `m3`/`pt` que ya se guardaron por medida.
  for (const dia of salida) {
    for (const g of dia.grupos) {
      g.m3 = r4(g.m3);
      g.pieTablar = r2(g.pieTablar);
    }
    dia.m3 = r4(dia.m3);
    dia.pieTablar = r2(dia.pieTablar);
  }
  return salida;
}

/**
 * Distribuye la aserrada sobre los bloques de rolliza, por especie y por
 * capacidad.
 *
 * @param dim cómo agrupar la aserrada. Agrupar por "especie" no tendría sentido
 *   —la distribución ya separa por especie— así que en ese caso se usa "tipo".
 */
export function distribuirPorCapacidad(
  bloques: readonly BloqueRolliza[],
  piezas: readonly PiezaCubicada[],
  dim: DimensionResumen = "tipo",
  precio?: PrecioPt,
): Distribucion {
  const dimInterna: DimensionResumen = dim === "especie" ? "tipo" : dim;

  const porEspecie = new Map<string, { label: string; bloques: BloqueRolliza[]; piezas: PiezaCubicada[] }>();
  const bucket = (raw: string) => {
    const k = claveEspecie(raw);
    let b = porEspecie.get(k);
    if (!b) { b = { label: labelEspecie(raw), bloques: [], piezas: [] }; porEspecie.set(k, b); }
    return b;
  };
  for (const b of bloques) bucket(b.especie).bloques.push(b);
  for (const p of piezas) bucket(p.especie ?? "").piezas.push(p);

  const especies: EspecieDistribucion[] = [];
  const rollizaHuerfana: { especie: string; m3: number }[] = [];
  const aserradaHuerfana: { especie: string; m3: number }[] = [];

  for (const [, b] of porEspecie) {
    /* Los dos volúmenes de entrada se cuentan por separado: la troza que hay
       que aserrar y la madera que ya vino aserrada. Sumarlos sería declarar
       como rolliza algo que nunca pasó por la sierra. */
    const rollizaM3 = r4(b.bloques.filter((x) => !esAserradaDirecta(x)).reduce((a, x) => a + (Number(x.m3) || 0), 0));
    const aserradaDirectaM3 = r4(b.bloques.filter((x) => esAserradaDirecta(x)).reduce((a, x) => a + (Number(x.m3) || 0), 0));
    const respaldoM3 = r4(rollizaM3 + aserradaDirectaM3);
    const resumen = agruparPor(b.piezas, dimInterna, precio);
    const aserradaM3 = r4(resumen.total.m3);
    const aserradaPt = r2(resumen.total.pieTablar);

    /* «sin-rolliza» = sin NINGÚN respaldo declarado (ni troza ni aserrada
       directa): sólo ahí la aserrada queda realmente huérfana. Mirando sólo
       `rollizaM3`, un lote respaldado enteramente por bloques de aserrada
       directa se avisaba como «sin rolliza declarada» aunque estuviera
       cubierto pieza por pieza. */
    const estado: EstadoEspecie =
      respaldoM3 <= EPS ? "sin-rolliza" : aserradaM3 <= EPS ? "sin-aserrada" : "ok";
    if (estado === "sin-rolliza" && aserradaM3 > EPS) aserradaHuerfana.push({ especie: b.label, m3: aserradaM3 });
    if (estado === "sin-aserrada" && respaldoM3 > EPS) rollizaHuerfana.push({ especie: b.label, m3: respaldoM3 });

    // ── El llenado: bloque por bloque, en el orden cargado ────────────────
    const distribuidos: BloqueDistribuido[] = b.bloques.map((bl) => ({
      bloque: bl,
      aprovechablePct: aprovechableDe(bl),
      capacidadM3: capacidadDe(bl),
      usadoM3: 0,
      libreM3: capacidadDe(bl),
      piezasLibres: null,
      asignado: [],
      dias: diasDe(bl),
      porDia: [],
      costoRolliza: bl.costoM3 == null ? null : r2((Number(bl.m3) || 0) * bl.costoM3),
      costoPorM3Aserrada: null,
    }));

    // Lo que queda por asignar de cada grupo, con sus medidas. Se descuenta en
    // vez de acumularse: así asignado + faltante da EXACTO el m³ del grupo.
    const pendientes: Pendiente[] = resumen.grupos.map((g) => pendienteDeGrupo(g, b.piezas, dimInterna));

    for (const d of distribuidos) {
      /*
       * Un bloque con capacidad 0 (rolliza en blanco, "Rolliza nueva" recién
       * creada) igual tiene que correr `llenarBloque` si el operario ya le
       * puso un override de línea (Brandon, 2026-09-02: armar el bloque
       * directamente desde lo aserrado, sin cargar rolliza) — si no, el
       * override queda mudo: ni la línea declarada aparece, ni un piezas-only
       * (sin m³) llega a calcular su m³ real. `libreM3 <= EPS` sólo puede
       * saltear el bloque cuando NO hay overrides que procesar.
       */
      const tieneOverrides = Object.values(d.bloque.overridesLinea ?? {}).some(
        (ov) => ov?.piezas != null || ov?.m3 != null,
      );
      if (d.libreM3 <= EPS && !tieneOverrides) continue;
      llenarBloque(d, pendientes, dimInterna);
    }

    /*
     * REPESCA. El llenado va bloque por bloque en el orden cargado, así que el
     * primero se lleva su parte sin saber qué va a necesitar el último: al
     * terminar la vuelta pueden convivir un bloque con capacidad libre y madera
     * sin amparar que le entraba perfecto (Brandon, 2026-09-02: «0,587 m³
     * libres · 0,587 m³ sin amparar»). Una segunda vuelta le ofrece a cada
     * bloque con hueco lo que quedó pendiente DESPUÉS de que pasaron todos.
     *
     * Se repite mientras siga cerrando huecos, con un tope: cada vuelta sólo
     * puede asignar piezas que antes no entraban, así que converge sola —el
     * tope es una red, no el mecanismo.
     */
    for (let vuelta = 0; vuelta < REPESCA_MAX_VUELTAS; vuelta++) {
      if (!pendientes.some((p) => piezasDe(p) > 0)) break;
      const antes = distribuidos.reduce((a, d) => a + d.usadoM3, 0);
      for (const d of distribuidos) {
        if (d.libreM3 <= EPS) continue;
        llenarBloque(d, pendientes, dimInterna, true);
      }
      /* Y si con agregar no alcanza, INTERCAMBIAR: un bloque que llegó a su
         tope de piezas con volumen libre no necesita una pieza más, necesita
         que las que tiene sean más grandes. Después de cambiarlas, la vuelta
         siguiente reubica las chicas que quedaron sueltas. */
      /* El intercambio entre bloques es NEUTRO en volumen amparado —mueve una
         pieza de un lado al otro—, así que se le da la repesca inmediatamente
         después para que materialice lo que liberó. El progreso se mide al
         final de la vuelta: si el amparado no subió, no hay más que hacer. */
      if (intercambiarParaCerrar(distribuidos, pendientes, dimInterna)) {
        for (const d of distribuidos) {
          if (d.libreM3 <= EPS) continue;
          llenarBloque(d, pendientes, dimInterna, true);
        }
      }
      if (distribuidos.reduce((a, d) => a + d.usadoM3, 0) <= antes + EPS) break;
    }

    /* Y recién ahora, cuando repesca e intercambio ya no pueden más, el último
       recurso: la pieza que no entró en NINGÚN bloque dentro de su capacidad se
       ubica igual, si con pasarse unos litros alcanza. Va al FINAL a propósito
       —adentro del ciclo gastaba el margen de un bloque temprano y le cortaba
       el trabajo al intercambio—. El exceso queda a la vista en el bloque (su
       `libreM3` en negativo): dejar una tabla real fuera de todo papel por
       cuatro litros era peor. */
    cerrarConTolerancia(distribuidos, pendientes, dimInterna, aserradaM3);

    const faltante: FaltanteGrupo[] = pendientes
      .filter((p) => piezasDe(p) > 0)
      .map((p) => faltanteDePendiente(p, distribuidos));

    for (const d of distribuidos) {
      d.costoPorM3Aserrada =
        d.costoRolliza != null && d.usadoM3 > EPS ? r2(d.costoRolliza / d.usadoM3) : null;
      // La jornada se calcula una sola vez y acá: la pantalla, el Excel y el PDF
      // tienen que declarar EL MISMO día, no cada uno el suyo.
      d.porDia = repartirPorDia(d.asignado, d.dias);
    }

    const amparadaM3 = r4(distribuidos.reduce((a, d) => a + d.usadoM3, 0));
    /* Lo que se llevaron los bloques de aserrada directa: sale del numerador
       del rendimiento, porque esa madera no la produjo esta rolliza. */
    const amparadaDirectaM3 = r4(distribuidos.filter((d) => esAserradaDirecta(d.bloque)).reduce((a, d) => a + d.usadoM3, 0));
    // El PT de lo amparado se suma de las asignaciones, no se toma del lote: en
    // una fila que dice «TOTAL AMPARADO 9 m³», poner el pie tablar de los 10
    // producidos es declarar de más justo en el renglón del respaldo.
    const amparadaPt = r2(distribuidos.reduce((a, d) => a + d.asignado.reduce((s, g) => s + g.pieTablar, 0), 0));
    const libreM3 = r4(distribuidos.reduce((a, d) => a + d.libreM3, 0));
    const faltanteM3 = r4(faltante.reduce((a, f) => a + f.m3, 0));
    const costoRolliza = b.bloques.some((x) => x.costoM3 == null)
      ? null
      : r2(b.bloques.reduce((a, x) => a + (Number(x.m3) || 0) * (x.costoM3 ?? 0), 0));
    /**
     * Rendimiento = la aserrada que SALIÓ DE ESTA TROZA ÷ la troza que entró.
     * Lo amparado por bloques de aserrada directa se descuenta del numerador:
     * esa madera ya venía aserrada y contarla ahí inflaría el rendimiento de
     * la sierra con volumen que la sierra nunca cortó. Sin bloques de aserrada
     * directa el término es 0 y la cuenta es exactamente la de siempre.
     */
    const rendimientoPct = rollizaM3 > EPS ? r2(((aserradaM3 - amparadaDirectaM3) / rollizaM3) * 100) : null;

    // Agrupado SOLO para mostrar (ver el comentario en `EspecieDistribucion.
    // porPermiso`) — el `Map` conserva el orden de inserción, que es el orden
    // en que se cargaron los bloques, así que el primer permiso listado es
    // el mismo que se llenó primero.
    const permisos = new Map<string | null, BloqueDistribuido[]>();
    for (const d of distribuidos) {
      const k = (d.bloque.permiso ?? "").trim() || null;
      const arr = permisos.get(k);
      if (arr) arr.push(d); else permisos.set(k, [d]);
    }
    const porPermiso = [...permisos.entries()].map(([permiso, ds]) => ({
      permiso,
      bloques: ds,
      rollizaM3: r4(ds.reduce((a, d) => a + (Number(d.bloque.m3) || 0), 0)),
      capacidadM3: r4(ds.reduce((a, d) => a + d.capacidadM3, 0)),
      amparadaM3: r4(ds.reduce((a, d) => a + d.usadoM3, 0)),
      amparadaPt: r2(ds.reduce((a, d) => a + d.asignado.reduce((s, g) => s + g.pieTablar, 0), 0)),
    }));

    especies.push({
      especie: b.label,
      estado,
      bloques: distribuidos,
      faltante,
      rollizaM3,
      aserradaDirectaM3,
      amparadaDirectaM3,
      capacidadM3: r4(distribuidos.reduce((a, d) => a + d.capacidadM3, 0)),
      aserradaM3, aserradaPt, amparadaM3, amparadaPt, faltanteM3, libreM3,
      rollizaFaltanteM3: r4(faltante.reduce((a, f) => a + f.rollizaNecesariaM3, 0)),
      rendimientoPct,
      imposible: rendimientoPct != null && rendimientoPct > 100,
      costoRolliza,
      porPermiso,
    });
  }

  especies.sort((a, x) => {
    const orden = { ok: 0, "sin-rolliza": 1, "sin-aserrada": 2 } as const;
    return orden[a.estado] - orden[x.estado] || x.aserradaM3 - a.aserradaM3 || x.rollizaM3 - a.rollizaM3;
  });

  const sum = (f: (e: EspecieDistribucion) => number) => r4(especies.reduce((a, e) => a + f(e), 0));
  const totRolliza = sum((e) => e.rollizaM3);
  const totAserrada = sum((e) => e.aserradaM3);
  const totAmparadaDirecta = sum((e) => e.amparadaDirectaM3);
  return {
    especies,
    totales: {
      rollizaM3: totRolliza,
      aserradaDirectaM3: sum((e) => e.aserradaDirectaM3),
      amparadaDirectaM3: totAmparadaDirecta,
      capacidadM3: sum((e) => e.capacidadM3),
      aserradaM3: totAserrada,
      aserradaPt: r2(especies.reduce((a, e) => a + e.aserradaPt, 0)),
      amparadaM3: sum((e) => e.amparadaM3),
      amparadaPt: r2(especies.reduce((a, e) => a + e.amparadaPt, 0)),
      faltanteM3: sum((e) => e.faltanteM3),
      libreM3: sum((e) => e.libreM3),
      rollizaFaltanteM3: sum((e) => e.rollizaFaltanteM3),
      rendimientoPct: totRolliza > EPS ? r2(((totAserrada - totAmparadaDirecta) / totRolliza) * 100) : null,
      costoRolliza: especies.some((e) => e.costoRolliza == null && e.rollizaM3 > EPS)
        ? null
        : r2(especies.reduce((a, e) => a + (e.costoRolliza ?? 0), 0)),
    },
    rollizaHuerfana,
    aserradaHuerfana,
  };
}

/** Una medida pendiente dentro de un grupo, con su saldo de PIEZAS por asignar. */
interface MedidaPendiente {
  clave: string;
  medida: string;
  espesor: number; ancho: number; largo: number;
  uEspesor: string; uAncho: string; uLargo: string;
  /** Piezas enteras que faltan repartir. Se descuenta a medida que se asignan. */
  piezas: number;
  /** m³ y pie tablar de UNA pieza: la unidad indivisible del reparto. */
  m3Unit: number;
  ptUnit: number;
}

/** Un grupo con su saldo por asignar, partido en medidas. */
interface Pendiente {
  clave: string;
  label: string;
  medidas: MedidaPendiente[];
}

/** Piezas que le quedan a un grupo por repartir. */
const piezasDe = (p: Pendiente): number => p.medidas.reduce((a, m) => a + m.piezas, 0);
/** Volumen que le queda a un grupo por repartir. */
const m3De = (p: Pendiente): number => p.medidas.reduce((a, m) => a + m.piezas * m.m3Unit, 0);
/** Pie tablar que le queda a un grupo por repartir. */
const ptDe = (p: Pendiente): number => p.medidas.reduce((a, m) => a + m.piezas * m.ptUnit, 0);

/**
 * Llena un bloque con PIEZAS ENTERAS, conservando la mezcla del pendiente.
 *
 * Dos pasos: (1) cada medida recibe el piso de su proporción —eso reparte el
 * grueso manteniendo el mix del lote—; (2) las piezas sueltas que sobraron se
 * reparten por mayor residuo, **una por una y sólo si entran** en lo que le
 * queda de capacidad al bloque. Nunca se supera la capacidad: declarar de más es
 * el hueco por donde se blanquea madera.
 *
 * Muta los pendientes (son saldos que se consumen) y el bloque.
 */
type Viva = { p: Pendiente; m: MedidaPendiente; asignadas: number; resto: number; tope: number };

/** Piezas que el bloque todavía puede tomar por su tope declarado. */
function cupoDeBloque(d: BloqueDistribuido): number {
  const tope = d.bloque.piezasManual;
  if (tope == null || !Number.isFinite(Number(tope))) return Number.POSITIVE_INFINITY;
  return Math.max(0, Number(tope) - d.asignado.reduce((a, g) => a + g.piezas, 0));
}

/** ¿Este bloque admite esa medida? (filtros de grupo y de largo, overrides). */
function admisorDeBloque(d: BloqueDistribuido, dim: DimensionResumen) {
  const gruposOk = gruposAdmitidos(d.bloque, dim);
  const filtroLargo = sanearFiltroLargo(d.bloque.largoFiltro);
  return (claveGrupo: string, largo: number, uLargo: string): boolean => {
    if (gruposOk && !gruposOk.has(claveGrupo)) return false;
    if (d.bloque.overridesLinea?.[claveOverrideLinea(dim, claveGrupo)]) return false;
    if (!filtroLargo) return true;
    const pies = toFeet(largo, uLargo as Unidad);
    return filtroLargo.some((f) => Math.abs(pies - f.largo) < 0.05);
  };
}

/** Vuelve a calcular lo que el bloque ampara después de tocarle las filas. */
function recalcularBloque(d: BloqueDistribuido): void {
  d.asignado = d.asignado.filter((x) => x.piezas > 0 || x.m3Declarado);
  for (const g of d.asignado) g.medidas = g.medidas.filter((x) => x.piezas > 0);
  d.usadoM3 = r4(d.asignado.reduce((a, x) => a + x.m3, 0));
  const sobra = d.capacidadM3 - d.usadoM3;
  d.libreM3 = r4(sobra < 0 && sobra >= -TOL_REDONDEO_M3 * 2 ? 0 : sobra);
  const tope = d.bloque.piezasManual;
  d.piezasLibres =
    tope != null && Number.isFinite(Number(tope))
      ? Math.round(Number(tope) - d.asignado.reduce((a, g) => a + g.piezas, 0))
      : null;
}

/** Mete UNA pieza de esa medida en el bloque (creando la fila si hace falta). */
function ponerPieza(
  d: BloqueDistribuido,
  grupo: { clave: string; label: string },
  base: { clave: string; medida: string; espesor: number; ancho: number; largo: number; uEspesor: string; uAncho: string; uLargo: string },
  m3Unit: number,
  ptUnit: number,
): void {
  let g = d.asignado.find((x) => x.clave === grupo.clave);
  if (!g) {
    g = { clave: grupo.clave, label: grupo.label, m3: 0, pieTablar: 0, piezas: 0, medidas: [] };
    d.asignado.push(g);
  }
  let m = g.medidas.find((x) => x.clave === base.clave);
  if (!m) {
    m = { ...base, m3: 0, pieTablar: 0, piezas: 0 };
    g.medidas.push(m);
  }
  m.piezas += 1;
  m.m3 = r4(m.m3 + m3Unit);
  m.pieTablar = r2(m.pieTablar + ptUnit);
  g.piezas += 1;
  g.m3 = r4(g.m3 + m3Unit);
  g.pieTablar = r2(g.pieTablar + ptUnit);
}

/**
 * El último recurso: meter la pieza que quedó suelta aunque el bloque se pase
 * por unos litros, y AVISARLO.
 *
 * Pedido explícito de Brandon (2026-09-02, con una pieza de 0,011 m³ sin
 * amparar): «si hace falta 0,001 o 0,002, tanto en negativo como de más,
 * ponerlo así normal, sólo un aviso que falta o sobra». Tiene razón: la
 * alternativa era dejar una tabla real fuera de todo papel porque el paquete
 * declaraba 8,271 m³ y la pieza lo llevaba a 8,275. En el patio eso son cuatro
 * litros —la mitad de lo que se pierde en el aserrín de un corte—, y la
 * diferencia se ve en pantalla: el bloque muestra su exceso.
 *
 * El tope (`TOL_CIERRE_M3`) es chico a propósito: es una diferencia de
 * medición, no una licencia para amparar de más. Y sólo entra por acá lo que
 * NINGÚN bloque pudo tomar dentro de su capacidad.
 */
function cerrarConTolerancia(
  distribuidos: readonly BloqueDistribuido[],
  pendientes: readonly Pendiente[],
  dim: DimensionResumen,
  /** Todo lo aserrado de la especie: la referencia para saber si el resto es ruido. */
  aserradaM3: number,
): boolean {
  /*
   * SÓLO para el resto final: **a lo sumo tres piezas sueltas**. Más que eso no
   * es una diferencia de medición, es madera que necesita otro bloque, y hay
   * que verla en «Falta por distribuir» en vez de taparla estirando
   * capacidades.
   *
   * El otro límite —el que de verdad protege— es POR BLOQUE: ninguno se pasa
   * más de 50 litros ni más del 1 % de lo que declaró. Medir el resto contra el
   * lote entero no servía: una tabla de 75 litros es el 0,25 % de un camión de
   * 30 m³ y el 0,6 % de uno de 12, y en los dos casos es exactamente lo mismo
   * —una tabla— para quien la tiene que declarar.
   */
  const pendienteM3 = pendientes.reduce((a, p) => a + m3De(p), 0);
  const pendientePz = pendientes.reduce((a, p) => a + piezasDe(p), 0);
  if (pendienteM3 <= EPS) return false;
  if (pendientePz > TOL_CIERRE_PIEZAS) return false;
  void aserradaM3;

  const admisores = new Map(distribuidos.map((d) => [d, admisorDeBloque(d, dim)] as const));
  /* Un largo con `pct` PARCIAL tiene una reserva a propósito («llevate el 30 %,
     el resto es para otro lado»): el cierre no se la puede comer. */
  const reservados = new Map(
    distribuidos.map((d) => [d, (sanearFiltroLargo(d.bloque.largoFiltro) ?? []).filter((f) => f.pct < 100)] as const),
  );
  let hubo = false;
  for (const p of pendientes) {
    for (const m of p.medidas) {
      while (m.piezas > 0) {
        let mejor: { d: BloqueDistribuido; exceso: number } | null = null;
        for (const d of distribuidos) {
          if (cupoDeBloque(d) <= 0) continue;
          if (!admisores.get(d)!(p.clave, m.largo, m.uLargo)) continue;
          const pies = toFeet(m.largo, m.uLargo as Unidad);
          if (reservados.get(d)!.some((f) => Math.abs(pies - f.largo) < 0.05)) continue;
          /* Cuánto se le permite pasarse a ESTE bloque: 50 litros, pero nunca
             más del 1 % de lo que declara. Un paquete chico no puede estirarse
             lo mismo que un camión — ahí la diferencia deja de ser de medición
             y pasa a ser otra cosa. */
          const exceso = d.usadoM3 + m.m3Unit - d.capacidadM3;
          if (exceso > TOL_CIERRE_M3) continue;
          // Y jamás una fracción grande del propio bloque: 50 litros sobre un
          // paquete de medio metro cúbico ya no es «diferencia de medición».
          if (d.capacidadM3 > EPS && exceso > d.capacidadM3 * TOL_CIERRE_PCT_BLOQUE) continue;
          // El que menos se pasa; a igualdad, el primero cargado.
          if (!mejor || exceso < mejor.exceso - EPS) mejor = { d, exceso };
        }
        if (!mejor) break;
        m.piezas -= 1;
        ponerPieza(mejor.d, p, m, m.m3Unit, m.ptUnit);
        recalcularBloque(mejor.d);
        hubo = true;
      }
    }
  }
  return hubo;
}

/**
 * Cambia piezas CHICAS ya asignadas por piezas GRANDES que quedaron sin
 * amparar, sin tocar el conteo del bloque.
 *
 * POR QUÉ (Brandon, 2026-09-02, con la pantalla a la vista): dos paquetes que
 * sumaban EXACTO el lote —30,721 m³ y 1.151 piezas entre los dos— terminaban
 * con 11 piezas sin distribuir. El primero había llegado a su tope de 787
 * piezas dejando 0,580 m³ de capacidad libre: se había llenado con piezas
 * demasiado chicas, y las 11 grandes que faltaban ya no le entraban porque el
 * conteo estaba completo. La repesca no lo resuelve —sólo AGREGA— y acá no
 * sobra lugar: sobra volumen y falta tamaño.
 *
 * Cada intercambio saca una pieza de una medida ya asignada y mete una de una
 * medida más grande que sigue pendiente, siempre que entre en la capacidad. El
 * conteo del bloque no se mueve, y el volumen amparado sube exactamente la
 * diferencia entre las dos: **todo intercambio que se acepta es una mejora
 * estricta**, así que el bucle no puede oscilar. La pieza chica que sale queda
 * pendiente y la repesca siguiente la ubica en el bloque al que sí le entra.
 */
function intercambiarParaCerrar(
  distribuidos: readonly BloqueDistribuido[],
  pendientes: readonly Pendiente[],
  dim: DimensionResumen,
): boolean {
  /** Saca UNA pieza de una fila ya asignada. Devuelve su volumen unitario. */
  const sacar = (d: BloqueDistribuido, g: AsignacionGrupo, m: AsignacionMedida): { m3: number; pt: number } => {
    const m3Unit = m.m3 / m.piezas;
    const ptUnit = m.pieTablar / m.piezas;
    m.piezas -= 1;
    m.m3 = r4(m.m3 - m3Unit);
    m.pieTablar = r2(m.pieTablar - ptUnit);
    g.piezas -= 1;
    g.m3 = r4(g.m3 - m3Unit);
    g.pieTablar = r2(g.pieTablar - ptUnit);
    return { m3: m3Unit, pt: ptUnit };
  };
  /** El grupo del que salió una fila asignada, en la lista de pendientes. */
  const pendienteDe = (clave: string) => pendientes.find((x) => x.clave === clave);
  /** La pieza más grande que hay en juego (asignada o pendiente). */
  let unitMax = 0;
  for (const p of pendientes) for (const m of p.medidas) unitMax = Math.max(unitMax, m.m3Unit);
  for (const d of distribuidos) {
    for (const g of d.asignado) {
      for (const m of g.medidas) if (m.piezas > 0) unitMax = Math.max(unitMax, m.m3 / m.piezas);
    }
  }

  /**
   * ¿Este bloque describe un paquete REAL, donde el conteo declarado podría
   * llenar el volumen declarado?
   *
   * Es la línea que separa los dos casos que se parecen desde afuera:
   *
   * · «22,45 m³ y 787 piezas» — el m³ y las piezas describen el MISMO paquete.
   *   Si queda hueco es porque las piezas que entraron son demasiado chicas, y
   *   cambiarlas por las grandes que quedaron afuera es exactamente lo que hace
   *   el operario a mano.
   * · «una troza de 100 m³ de la que salieron 30 piezas» — ni con las 30 más
   *   grandes del lote se llega a la capacidad. Ahí no hay nada que cerrar: lo
   *   que falta es madera, no tamaño, y desarmar la mezcla dejaría el bloque
   *   con un solo tipo, algo que ninguna troza produce.
   *
   * Sin conteo declarado no se intercambia: el bloque puede seguir tomando
   * piezas, y agregar (la repesca) siempre es preferible a intercambiar.
   */
  const puedeCerrar = (d: BloqueDistribuido): boolean => {
    const tope = d.bloque.piezasManual;
    if (tope == null || !Number.isFinite(Number(tope))) return false;
    if (d.capacidadM3 <= EPS || unitMax <= 0) return false;
    return Number(tope) * unitMax >= d.capacidadM3 * SWAP_CIERRE_MIN;
  };

  /** La pieza más chica que sigue sin amparar (para saber si liberar sirve). */
  let menorPendiente = Number.POSITIVE_INFINITY;
  for (const p of pendientes) {
    for (const m of p.medidas) if (m.piezas > 0) menorPendiente = Math.min(menorPendiente, m.m3Unit);
  }

  let hubo = false;

  // ── (1) Cambiar una pieza del bloque por una MÁS GRANDE que quedó afuera ──
  //
  // Un bloque que llegó a su tope de piezas con volumen libre no necesita una
  // pieza más: necesita que las que tiene sean más grandes. El conteo no se
  // mueve y el volumen amparado sube exactamente la diferencia, así que todo
  // intercambio aceptado es una mejora estricta y el bucle no puede oscilar.
  for (const d of distribuidos) {
    if (d.libreM3 < 0) continue; // ya declara de más: no se toca
    /* Sólo bloques SIN cupo de piezas. Uno que todavía puede recibir no
       necesita cambiar nada: le alcanza con que la repesca le agregue. Además
       deja este movimiento y el (3) —que hace lo contrario— en conjuntos
       disjuntos de bloques, así no pueden deshacerse mutuamente. */
    if (cupoDeBloque(d) > 0 || !puedeCerrar(d)) continue;
    const admite = admisorDeBloque(d, dim);
    for (let intento = 0; intento < SWAP_MAX_POR_BLOQUE; intento++) {
      let mejor: { g: AsignacionGrupo; m: AsignacionMedida; p: Pendiente; f: MedidaPendiente; gana: number } | null = null;
      for (const g of d.asignado) {
        if (g.m3Declarado || d.bloque.overridesLinea?.[claveOverrideLinea(dim, g.clave)]) continue;
        for (const m of g.medidas) {
          if (m.piezas <= 0 || m.m3 <= 0) continue;
          const unitSale = m.m3 / m.piezas;
          for (const p of pendientes) {
            for (const f of p.medidas) {
              if (f.piezas <= 0 || f.m3Unit <= unitSale + EPS) continue;
              if (!admite(p.clave, f.largo, f.uLargo)) continue;
              if (d.usadoM3 - unitSale + f.m3Unit > d.capacidadM3 + TOL_REDONDEO_M3) continue;
              const gana = f.m3Unit - unitSale;
              if (!mejor || gana > mejor.gana) mejor = { g, m, p, f, gana };
            }
          }
        }
      }
      if (!mejor) break;
      const claveGrupoSale = mejor.g.clave;
      const claveMedidaSale = mejor.m.clave;
      sacar(d, mejor.g, mejor.m);
      const pSale = pendienteDe(claveGrupoSale);
      const mSale = pSale?.medidas.find((x) => x.clave === claveMedidaSale);
      if (mSale) mSale.piezas += 1;
      mejor.f.piezas -= 1;
      ponerPieza(d, mejor.p, mejor.f, mejor.f.m3Unit, mejor.f.ptUnit);
      recalcularBloque(d);
      hubo = true;
    }
  }

  // ── (2) Intercambiar piezas ENTRE bloques ────────────────────────────────
  //
  // El caso que ni la repesca ni (1) resuelven: un bloque con volumen libre y
  // el conteo completo, y otro con cupo de piezas pero sin volumen. No sobra
  // lugar en ninguno para lo que falta — sobra volumen en uno y cupo en el
  // otro. Pasarle al primero una pieza grande del segundo (y devolverle una
  // chica) es neutro en el total amparado, pero **libera volumen justo donde
  // hay cupo**, y la repesca siguiente lo llena con lo que estaba afuera.
  //
  // Sólo se hace si el volumen liberado alcanza para meter algo que hoy está
  // sin amparar: si no, sería mover madera de un lado a otro sin ganar nada.
  if (Number.isFinite(menorPendiente)) {
    for (let intento = 0; intento < SWAP_MAX_ENTRE_BLOQUES; intento++) {
      let hecho = false;
      for (const a of distribuidos) {
        // El que tiene volumen para gastar y NO puede recibir más piezas. Ese
        // «sin cupo» no es un detalle: es lo que hace el intercambio
        // DIRECCIONAL. Sin él, el mismo par se intercambia en los dos sentidos
        // —A le pasa una chica a B y en el intento siguiente B se la devuelve—
        // y las 400 pasadas se consumían oscilando, avanzando una sola pieza.
        // Un bloque con cupo no necesita intercambiar: le alcanza con recibir.
        if (a.libreM3 <= EPS || cupoDeBloque(a) > 0 || !puedeCerrar(a)) continue;
        const admiteA = admisorDeBloque(a, dim);
        for (const b of distribuidos) {
          if (a === b || cupoDeBloque(b) <= 0) continue; // el que tiene cupo de piezas
          const admiteB = admisorDeBloque(b, dim);
          for (const gb of b.asignado) {
            if (gb.m3Declarado || b.bloque.overridesLinea?.[claveOverrideLinea(dim, gb.clave)]) continue;
            for (const mb of gb.medidas) {
              if (mb.piezas <= 0 || mb.m3 <= 0) continue;
              const unitB = mb.m3 / mb.piezas;
              if (!admiteA(gb.clave, mb.largo, mb.uLargo)) continue;
              for (const ga of a.asignado) {
                if (ga.m3Declarado || a.bloque.overridesLinea?.[claveOverrideLinea(dim, ga.clave)]) continue;
                for (const ma of ga.medidas) {
                  if (ma.piezas <= 0 || ma.m3 <= 0) continue;
                  const unitA = ma.m3 / ma.piezas;
                  if (unitB <= unitA + EPS) continue; // tiene que ser MÁS grande
                  if (!admiteB(ga.clave, ma.largo, ma.uLargo)) continue;
                  const dif = unitB - unitA;
                  if (a.usadoM3 + dif > a.capacidadM3 + TOL_REDONDEO_M3) continue;
                  /* Sólo vale la pena si lo que se libera en `b` deja entrar algo
                     real. La comparación va con la tolerancia del redondeo: el
                     `libreM3` de un bloque que cerró clavado puede figurar como
                     -0,0001 y por esa cienmilésima se descartaba el intercambio
                     que destrababa 88 piezas. */
                  if (b.libreM3 + dif < menorPendiente - TOL_REDONDEO_M3 * 2) continue;
                  const baseA = { clave: ma.clave, medida: ma.medida, espesor: ma.espesor, ancho: ma.ancho, largo: ma.largo, uEspesor: ma.uEspesor, uAncho: ma.uAncho, uLargo: ma.uLargo };
                  const baseB = { clave: mb.clave, medida: mb.medida, espesor: mb.espesor, ancho: mb.ancho, largo: mb.largo, uEspesor: mb.uEspesor, uAncho: mb.uAncho, uLargo: mb.uLargo };
                  const grupoA = { clave: ga.clave, label: ga.label };
                  const grupoB = { clave: gb.clave, label: gb.label };
                  const unitPtA = ma.pieTablar / ma.piezas;
                  const unitPtB = mb.pieTablar / mb.piezas;
                  sacar(a, ga, ma);
                  sacar(b, gb, mb);
                  ponerPieza(a, grupoB, baseB, unitB, unitPtB);
                  ponerPieza(b, grupoA, baseA, unitA, unitPtA);
                  recalcularBloque(a);
                  recalcularBloque(b);
                  hubo = true;
                  hecho = true;
                  break;
                }
                if (hecho) break;
              }
              if (hecho) break;
            }
            if (hecho) break;
          }
          if (hecho) break;
        }
        if (hecho) break;
      }
      if (!hecho) break;
    }
  }

  // ── (3) Deshacer una pieza GRANDE en varias chicas ───────────────────────
  //
  // El simétrico del (1), y el que faltaba: un bloque al que le sobra CUPO de
  // piezas pero no volumen. No puede recibir nada más —lo que falta no le
  // entra— pero sí puede soltar una tabla grande y traer en su lugar varias
  // chicas que ocupan lo mismo. El conteo sube (que es lo que le falta) y el
  // volumen no baja.
  //
  // Sin esto, un reparto quedaba con 11 piezas afuera y un bloque con 11 de
  // cupo y 9 litros libres: la partición existía, pero llegar a ella pedía
  // cambiar una pieza por siete, no una por una.
  for (const d of distribuidos) {
    if (d.libreM3 < 0 || cupoDeBloque(d) <= 0 || !puedeCerrar(d)) continue;
    const admite = admisorDeBloque(d, dim);
    for (let intento = 0; intento < SWAP_MAX_POR_BLOQUE; intento++) {
      const cupo = cupoDeBloque(d);
      if (cupo <= 0) break;
      let mejor: { g: AsignacionGrupo; m: AsignacionMedida; p: Pendiente; f: MedidaPendiente; k: number } | null = null;
      for (const g of d.asignado) {
        if (g.m3Declarado || d.bloque.overridesLinea?.[claveOverrideLinea(dim, g.clave)]) continue;
        for (const m of g.medidas) {
          if (m.piezas <= 0 || m.m3 <= 0) continue;
          const unitSale = m.m3 / m.piezas;
          for (const p of pendientes) {
            for (const f of p.medidas) {
              if (f.piezas <= 0 || f.m3Unit >= unitSale - EPS) continue; // tiene que ser MÁS chica
              if (!admite(p.clave, f.largo, f.uLargo)) continue;
              // Cuántas chicas entran en el hueco que deja la grande.
              const espacio = d.libreM3 + unitSale;
              const k = Math.min(f.piezas, cupo + 1, Math.floor((espacio + TOL_REDONDEO_M3) / f.m3Unit));
              // Tiene que ganar piezas y no perder volumen.
              if (k < 2 || k * f.m3Unit < unitSale - EPS) continue;
              if (!mejor || k > mejor.k) mejor = { g, m, p, f, k };
            }
          }
        }
      }
      if (!mejor) break;
      const claveGrupoSale = mejor.g.clave;
      const claveMedidaSale = mejor.m.clave;
      const unitPtSale = mejor.m.pieTablar / mejor.m.piezas;
      sacar(d, mejor.g, mejor.m);
      const pSale = pendienteDe(claveGrupoSale);
      const mSale = pSale?.medidas.find((x) => x.clave === claveMedidaSale);
      if (mSale) mSale.piezas += 1;
      else void unitPtSale; // la medida ya no existe en el pendiente: la pieza se pierde de vista, no se duplica
      for (let i = 0; i < mejor.k; i++) {
        mejor.f.piezas -= 1;
        ponerPieza(d, mejor.p, mejor.f, mejor.f.m3Unit, mejor.f.ptUnit);
      }
      recalcularBloque(d);
      hubo = true;
    }
  }

  return hubo;
}

/**
 * Cuánto trabajo de DP se acepta antes de volver al greedy. 30M actualizaciones
 * de un `Int32Array` corren en decenas de ms; más arriba no vale la pena
 * bloquear el hilo del navegador por unos litros.
 */
const DP_TRABAJO_MAX = 30_000_000;

/** Cuántos volúmenes candidatos se prueban antes de darse por vencido. */
const RELLENO_INTENTOS = 64;

/**
 * Cuántas piezas por medida se le devuelven a la DP para que reacomode el
 * tramo final. Con 0 la DP casi nunca encuentra nada (el piso ya llenó); con
 * mucho más, el resultado deja de parecerse a la mezcla proporcional que hace
 * que un bloque se parezca a lo que sale de una troza. Dos es lo que alcanzó
 * para cerrar el peor caso medido sin desarmar el mix.
 */
const MARGEN_MEZCLA = 2;

/**
 * Rellena el hueco que dejó el piso proporcional **exprimiendo la capacidad al
 * máximo**: bounded knapsack exacto (el valor de una pieza ES su volumen)
 * resuelto por programación dinámica sobre milésimas de m³.
 *
 * POR QUÉ (Brandon, 2026-09-02: «se tiene que aprovechar al máximo, al 100 o
 * similar»): las sueltas se repartían probando tres órdenes greedy y quedándose
 * con el mejor. Alcanza para el caso «una grande contra muchas chicas», pero
 * una búsqueda numérica sobre 200 lotes al azar mostró que **168 dejaban
 * capacidad sin usar pudiendo llenarse mejor** —el peor, 31 litros: capacidad
 * 0,558 m³ con 7 piezas de 3×6×12 y 11 de 2×10×10 amparaba 0,527 cuando la
 * combinación exacta existía—. Ningún orden fijo encuentra esas combinaciones;
 * la DP sí, y de forma determinista.
 *
 * Qué NO cambia: el **piso proporcional** (la mezcla de tipos que hace que un
 * bloque se parezca a lo que sale de una troza) se decide antes y no se toca.
 * Esto sólo reparte el hueco que quedaba, que antes se llenaba a dentelladas.
 *
 * El tope de piezas entra en la MISMA DP: `minPiezas[v]` = la menor cantidad de
 * piezas con la que se alcanza el volumen `v`, así que basta buscar el mayor
 * volumen alcanzable cuyo costo en piezas quepa en el tope. Sin tope, es el
 * mayor volumen alcanzable a secas.
 *
 * Las unidades se redondean **hacia arriba** al milímetro cúbico (`ceil` sobre
 * milésimas) y la capacidad hacia abajo: así la DP nunca cree que entra algo que
 * en m³ reales no entraría. Devuelve `null` si el problema es demasiado grande
 * (ahí manda el greedy de siempre) — nunca una respuesta peor que la de él,
 * porque quien llama se queda con el máximo de los dos.
 */
function rellenoOptimo(
  vivas: readonly Viva[],
  /** Cuántas piezas más puede tomar cada medida (`tope` menos lo ya fijado). */
  disponibles: readonly number[],
  capRestante: number,
  topePiezasRestante: number | null,
): number[] | null {
  if (topePiezasRestante != null && topePiezasRestante <= 0) return null;
  const C = Math.floor(capRestante * 1000 + 1e-6);
  if (C <= 0) return null;

  /** Grupos del binary splitting: (índice de la medida, piezas, milésimas). */
  const grupos: { i: number; k: number; peso: number }[] = [];
  /** Piezas de volumen ~0: no compiten por capacidad, sólo por el tope de piezas. */
  const gratis: { i: number; disp: number }[] = [];
  for (let i = 0; i < vivas.length; i++) {
    const v = vivas[i];
    const disp = disponibles[i];
    if (disp <= 0) continue;
    const unit = Math.ceil(v.m.m3Unit * 1000 - 1e-9);
    if (unit <= 0) { gratis.push({ i, disp }); continue; }
    if (unit > C) continue; // ni una pieza entra
    let resto = Math.min(disp, Math.floor(C / unit));
    for (let k = 1; resto > 0; k *= 2) {
      const usar = Math.min(k, resto);
      grupos.push({ i, k: usar, peso: usar * unit });
      resto -= usar;
    }
  }
  if (grupos.length === 0) return null;
  if (C * grupos.length > DP_TRABAJO_MAX) return null;

  /*
   * La tabla marca qué volúmenes son alcanzables y de qué grupo vino cada uno,
   * **sólo la primera vez** que la celda se vuelve alcanzable.
   *
   * Antes se guardaba el camino de la mejor solución en piezas, actualizando la
   * celda cada vez que aparecía una combinación con menos piezas. Eso corrompe
   * la reconstrucción: una celda intermedia puede quedar apuntando a un grupo
   * procesado DESPUÉS del que la usa, y al recorrer hacia atrás el camino
   * termina usando la misma medida más veces de las disponibles. En la práctica
   * apareció como un bloque que amparaba 5 piezas de una medida con 4 en el
   * lote —madera fabricada, el peor bug posible acá— en 10 de 2.000 escenarios
   * al azar. Con la disciplina «se escribe una sola vez», el grupo de la celda
   * anterior siempre es anterior al de la celda actual y el camino es válido.
   */
  const deGrupo = new Int32Array(C + 1).fill(0); // 0 = inalcanzable · -1 = origen · g+1
  deGrupo[0] = -1;
  const desde = new Int32Array(C + 1).fill(-1);
  for (let g = 0; g < grupos.length; g++) {
    const { peso } = grupos[g];
    for (let v = C; v >= peso; v--) {
      if (deGrupo[v] !== 0) continue;
      if (deGrupo[v - peso] === 0) continue;
      deGrupo[v] = g + 1;
      desde[v] = v - peso;
    }
  }

  /** Las piezas por medida del camino que llega a `v`. */
  const caminoHasta = (v0: number): { extra: number[]; piezas: number } => {
    const extra = vivas.map(() => 0);
    let piezas = 0;
    let v = v0;
    while (v > 0) {
      const g = deGrupo[v];
      if (g <= 0) break;
      extra[grupos[g - 1].i] += grupos[g - 1].k;
      piezas += grupos[g - 1].k;
      v = desde[v];
    }
    return { extra, piezas };
  };

  /* El mayor volumen que entra; con tope de piezas, el mayor cuyo camino quepa
     en ese tope (se prueban unos cuantos antes de darlo por perdido). */
  let extra: number[] | null = null;
  let probados = 0;
  for (let v = C; v >= 1 && probados < RELLENO_INTENTOS; v--) {
    if (deGrupo[v] === 0) continue;
    probados++;
    const camino = caminoHasta(v);
    if (topePiezasRestante != null && camino.piezas > topePiezasRestante) continue;
    extra = camino.extra;
    break;
  }
  if (!extra) return null;

  /* Red de seguridad en m³ REALES: el `ceil` de arriba es conservador, pero si
     por lo que fuera el conjunto elegido se pasara, se sacan piezas de la medida
     más grande hasta que entre — nunca se ampara de más. */
  let usadoReal = 0;
  for (let i = 0; i < vivas.length; i++) usadoReal += extra[i] * vivas[i].m.m3Unit;
  while (usadoReal > capRestante + EPS) {
    let peor = -1;
    for (let i = 0; i < vivas.length; i++) {
      if (extra[i] <= 0) continue;
      if (peor < 0 || vivas[i].m.m3Unit > vivas[peor].m.m3Unit) peor = i;
    }
    if (peor < 0) break;
    extra[peor] -= 1;
    usadoReal -= vivas[peor].m.m3Unit;
  }

  // Las de volumen ~0 entran después: no ocupan capacidad, sólo tope de piezas.
  if (gratis.length > 0) {
    let cupo = topePiezasRestante == null ? Number.POSITIVE_INFINITY : topePiezasRestante - extra.reduce((a, n) => a + n, 0);
    for (const { i, disp } of gratis) {
      if (cupo <= 0) break;
      const pone = Math.min(disp, cupo);
      extra[i] += pone;
      cupo -= pone;
    }
  }
  return extra;
}

/**
 * Cuántas celdas de la tabla 2D se aceptan antes de bajar la resolución del
 * volumen. 20M enteros ≈ 80 MB: el techo de lo razonable en un navegador.
 */
const DP2D_CELDAS_MAX = 8_000_000;

/**
 * Y el techo del TRABAJO: la tabla se recorre una vez por grupo, así que las
 * celdas solas no acotan el tiempo. 50M actualizaciones ≈ 150 ms — el límite de
 * lo que se puede gastar sin que la pantalla se sienta trabada (la lección del
 * freeze con lotes grandes: lo que se calcula en el render se nota).
 */
const DP2D_TRABAJO_MAX = 50_000_000;

/**
 * Margen de candidatos, además de la franja incierta, que se reconstruyen y
 * miden por cada cantidad de piezas antes de darla por perdida. Una
 * reconstrucción cuesta el largo del camino (decenas de operaciones), así que
 * ser generoso acá es barato y es lo que hace que la combinación exacta se
 * encuentre.
 */
const DP2D_VERIF_EXTRA = 16;

/**
 * Cuánto puede pasarse la combinación por el REDONDEO del propio dato, sin que
 * cuente como amparar de más: medio diezmilésimo de m³ = 0,05 litros, la mitad
 * del último decimal con el que se declara un volumen. Sin esta tolerancia, un
 * paquete que cierra EXACTO contra el m³ escrito en la pantalla se rompía
 * porque la suma real daba siete mililitros más que el número redondeado.
 */
const TOL_REDONDEO_M3 = 5e-5;

/**
 * Cuánto de la capacidad tiene que llenar la combinación exacta para que valga
 * la pena romper la mezcla proporcional: 98 %. Por debajo de eso el bloque no
 * se está "cerrando", y una mezcla realista vale más que unos litros.
 */
const CIERRE_MIN = 0.98;

/**
 * Vueltas de repesca/intercambio. El ciclo corta solo en cuanto una vuelta no
 * ampara más que la anterior, así que este número es una red, no el mecanismo:
 * está alto porque acomodar decenas de piezas por intercambio lleva varias
 * vueltas, y con 4 el reparto se quedaba a mitad de camino.
 */
const REPESCA_MAX_VUELTAS = 25;

/**
 * Tope de intercambios por bloque en cada ronda. Cada uno recorre las medidas
 * asignadas contra las pendientes, así que conviene acotarlo; con lotes reales
 * (11 piezas por reubicar) sobra de lejos.
 */
const SWAP_MAX_POR_BLOQUE = 200;

/**
 * Tope de intercambios ENTRE bloques por ronda. Cada uno es neutro en volumen
 * amparado —mueve una pieza de acá para allá— así que necesita su propio
 * límite: sin él, dos bloques podrían pasarse piezas sin que el total avance.
 */
const SWAP_MAX_ENTRE_BLOQUES = 400;

/**
 * Cuánto de la capacidad tiene que poder cubrir el conteo declarado (con las
 * piezas más grandes en juego) para que el bloque cuente como «un paquete que
 * se puede cerrar» y se le permita intercambiar piezas. Con 90 % alcanza para
 * distinguir un paquete real de una troza cuya capacidad sobra de lejos.
 */
const SWAP_CIERRE_MIN = 0.9;

/**
 * Cuánto se le permite a un bloque pasarse de lo declarado para no dejar una
 * pieza real sin ningún papel que la ampare: 20 litros. Es la precisión con la
 * que se mide en el patio —una cinta métrica sobre madera húmeda no da más—, y
 * el exceso se MUESTRA, no se esconde.
 */
const TOL_CIERRE_M3 = 0.05;

/**
 * Techo de sensatez sobre el propio bloque: nunca más del 20 % de lo que
 * declara. Los 50 litros mandan en cualquier paquete de tamaño normal; esto
 * sólo evita el caso patológico de estirar un bloque diminuto.
 */
const TOL_CIERRE_PCT_BLOQUE = 0.2;

/**
 * Cuántas piezas sueltas, como mucho, se cierran así. Tres es «lo que sobró del
 * redondeo»; a partir de ahí ya es madera que le falta un bloque, y eso hay que
 * verlo en «Falta por distribuir», no taparlo estirando capacidades.
 */
const TOL_CIERRE_PIEZAS = 3;

/**
 * La combinación que cierra **las dos cosas**: el m³ del bloque y su cantidad
 * de piezas.
 *
 * POR QUÉ (Brandon, 2026-09-02: «no encuentra las medidas para que ocupen bien
 * los m³ y piezas; yo las encontré, el sistema no»). Un bloque de aserrada
 * directa declara volumen Y cantidad —«este paquete son 1,4544 m³ y 30
 * piezas»—. El llenado repartía esas 30 piezas en la proporción del lote y
 * amparaba 1,2476 m³: 30 piezas puestas, pero 0,207 m³ de capacidad tirados,
 * existiendo la combinación exacta (20 tablas de 2×8×10 + 10 de 3×10×14). El
 * conteo es un OBJETIVO, no sólo un techo, y hay que resolver los dos juntos.
 *
 * Es una DP de dos dimensiones —piezas × volumen— que marca qué pares (p, v)
 * son alcanzables con piezas enteras, y se queda con el mayor volumen; a igual
 * volumen, con el que use MÁS piezas (lo que más se acerca a lo declarado).
 * Guarda de qué grupo vino cada celda para poder reconstruir qué medidas son.
 *
 * La resolución del volumen baja sola (milésimas → centésimas → …) si la tabla
 * no entra en memoria: 10 litros es la precisión con la que se mide en el
 * patio, así que perderla no cambia ninguna decisión. Devuelve `null` cuando ni
 * así entra — ahí siguen mandando el piso proporcional y la DP de una
 * dimensión, que no necesitan tabla.
 */
function combinacionObjetivo(
  vivas: readonly Viva[],
  disponibles: readonly number[],
  capM3: number,
  topePiezas: number,
): number[] | null {
  if (topePiezas <= 0 || capM3 <= EPS) return null;

  for (const escala of [10_000, 1000, 100]) {
    const C = Math.floor(capM3 * escala + 1e-6);
    if (C <= 0) continue;
    /*
     * El ancho de la tabla llega a `C + topePiezas`, no a `C`.
     *
     * Las unidades se redondean HACIA ARRIBA (una combinación nunca puede
     * parecer más chica de lo que es), y ese redondeo suma hasta una unidad de
     * escala POR PIEZA: una solución real de p piezas que entra en la
     * capacidad puede aparecer en la tabla valiendo hasta `C + p`. Cortar en
     * `C` descartaba justamente la combinación exacta —el paquete de 75 piezas
     * que cerraba clavado se perdía por 30 milésimas de escala—. La franja
     * entre `C` y `C + p` es incierta, así que ahí cada candidato se
     * RECONSTRUYE y se mide en m³ reales antes de aceptarlo.
     */
    const vMax = C + topePiezas;
    const ancho = vMax + 1;
    const celdas = (topePiezas + 1) * ancho;
    if (celdas > DP2D_CELDAS_MAX) continue;

    /** Grupos del binary splitting: (medida, piezas, volumen en la escala). */
    const grupos: { i: number; k: number; peso: number }[] = [];
    for (let i = 0; i < vivas.length; i++) {
      const disp = disponibles[i];
      if (disp <= 0) continue;
      const unit = Math.ceil(vivas[i].m.m3Unit * escala - 1e-9);
      if (unit <= 0 || unit > vMax) continue;
      let resto = Math.min(disp, topePiezas, Math.floor(vMax / unit));
      for (let k = 1; resto > 0; k *= 2) {
        const usar = Math.min(k, resto);
        grupos.push({ i, k: usar, peso: usar * unit });
        resto -= usar;
      }
    }
    if (grupos.length === 0) return null;
    if (celdas * grupos.length > DP2D_TRABAJO_MAX) continue; // probá con menos resolución

    // 0 = inalcanzable · -1 = el origen (0 piezas, 0 volumen) · g+1 = vino del grupo g.
    const padre = new Int32Array(celdas);
    padre[0] = -1;
    for (let g = 0; g < grupos.length; g++) {
      const { k, peso } = grupos[g];
      for (let p = topePiezas; p >= k; p--) {
        const fila = p * ancho;
        const filaPrev = (p - k) * ancho;
        for (let v = vMax; v >= peso; v--) {
          if (padre[fila + v] !== 0) continue;
          if (padre[filaPrev + v - peso] === 0) continue;
          padre[fila + v] = g + 1;
        }
      }
    }

    /** Las piezas por medida del camino que llega a (p, v). */
    const reconstruir = (p0: number, v0: number): number[] => {
      const extra = vivas.map(() => 0);
      let p = p0;
      let v = v0;
      while (p > 0 || v > 0) {
        const g = padre[p * ancho + v];
        if (g <= 0) break;
        const { i, k, peso } = grupos[g - 1];
        extra[i] += k;
        p -= k;
        v -= peso;
      }
      return extra;
    };
    const m3RealDe = (extra: readonly number[]): number => {
      let t = 0;
      for (let i = 0; i < vivas.length; i++) t += extra[i] * vivas[i].m.m3Unit;
      return t;
    };

    /*
     * Qué par (piezas, volumen) es "el mejor": el que deja menos afuera de las
     * DOS cosas declaradas. Ordenar sólo por volumen elegía 27 piezas y 1,4427
     * m³ sobre 30 piezas y 1,4395 —mejor en m³ por 3 litros, peor en 3 piezas—,
     * y el operario declaró las dos. El residuo se mide en proporción de cada
     * objetivo, así que ninguno se come al otro.
     */
    let mejorExtra: number[] | null = null;
    let mejorResiduo = Infinity;
    for (let p = topePiezas; p >= 1; p--) {
      const fila = p * ancho;
      /* Cuántos candidatos de la franja incierta se prueban en esta fila. La
         franja mide `p` unidades (una por pieza, el error del redondeo hacia
         arriba), así que hay que poder recorrerla entera: con un tope corto se
         perdía la combinación exacta detrás de un puñado de valores inflados. */
      const maxVerif = 2 * p + DP2D_VERIF_EXTRA;
      let verificados = 0;
      for (let v = Math.min(vMax, C + p); v >= 1 && verificados < maxVerif; v--) {
        if (padre[fila + v] === 0) continue;
        verificados++;
        const extra = reconstruir(p, v);
        const real = m3RealDe(extra);
        if (real > capM3 + TOL_REDONDEO_M3) continue; // la franja incierta: no entra de verdad
        const residuo = Math.max(0, 1 - real / capM3) + (1 - p / topePiezas);
        if (residuo < mejorResiduo - 1e-12) {
          mejorResiduo = residuo;
          mejorExtra = extra;
        }
        break; // por fila alcanza con el mayor volumen que verifica
      }
    }
    if (!mejorExtra) return null;
    return mejorExtra;
  }
  return null;
}

/**
 * Qué piezas de una lista de medidas entran en `capM3`, exprimiéndola al
 * máximo. Es el mismo motor que usa el reparto para el tramo final (DP exacta,
 * con greedy de respaldo), expuesto para poder RESPONDER la pregunta del
 * operario: «¿qué le pongo a este bloque para que no le quede volumen libre?».
 *
 * No reparte ni muta nada — sólo dice qué combinación cabe.
 */
export function medidasQueEntran(
  candidatas: ReadonlyArray<{ clave: string; medida: string; m3Unit: number; piezas: number }>,
  capM3: number,
  topePiezas: number | null = null,
): { clave: string; medida: string; piezas: number; m3: number }[] {
  if (capM3 <= EPS) return [];
  const utiles = candidatas.filter((c) => c.piezas > 0 && c.m3Unit > 0);
  if (utiles.length === 0) return [];
  const vivas: Viva[] = utiles.map((c) => ({
    p: { clave: c.clave, label: c.medida, medidas: [] },
    m: {
      clave: c.clave, medida: c.medida, espesor: 0, ancho: 0, largo: 0,
      uEspesor: "pulg", uAncho: "pulg", uLargo: "pies",
      piezas: c.piezas, m3Unit: c.m3Unit, ptUnit: 0,
    },
    asignadas: 0,
    resto: 0,
    tope: c.piezas,
  }));
  const disponibles = utiles.map((c) => c.piezas);
  let elegidas = rellenoOptimo(vivas, disponibles, capM3, topePiezas);
  if (!elegidas) {
    /* Respaldo cuando la DP no corre (problema demasiado grande): las más
       grandes primero, que es lo que más cierra el hueco por pieza. */
    elegidas = utiles.map(() => 0);
    const orden = utiles.map((c, i) => i).sort((a, b) => utiles[b].m3Unit - utiles[a].m3Unit);
    let libre = capM3;
    let cupo = topePiezas ?? Number.POSITIVE_INFINITY;
    for (const i of orden) {
      const cabenPorVolumen = Math.floor((libre + EPS) / utiles[i].m3Unit);
      const pone = Math.max(0, Math.min(utiles[i].piezas, cabenPorVolumen, cupo));
      elegidas[i] = pone;
      libre -= pone * utiles[i].m3Unit;
      cupo -= pone;
    }
  }
  const out: { clave: string; medida: string; piezas: number; m3: number }[] = [];
  for (let i = 0; i < utiles.length; i++) {
    if (elegidas[i] <= 0) continue;
    out.push({
      clave: utiles[i].clave,
      medida: utiles[i].medida,
      piezas: elegidas[i],
      m3: r4(elegidas[i] * utiles[i].m3Unit),
    });
  }
  return out.sort((a, b) => b.m3 - a.m3);
}

/**
 * Una pasada de llenado: piso proporcional (1) + sueltas por mejor orden (2),
 * sobre lo que HOY está pendiente (ya descontado lo que se llevó una pasada
 * anterior, si la hubo). No decrementa `pendientes` ni arma `AsignacionGrupo`
 * —eso es tarea de quien llama, una sola vez, sobre la suma de TODAS las
 * pasadas— sólo decide cuánto le toca a cada medida EN ESTA pasada.
 */
function pasadaDeLlenado(
  pendientes: readonly Pendiente[],
  /* Recibe también el PENDIENTE: el filtro de grupo («este bloque sólo lleva
     Comercial») vive a nivel de grupo, no de medida — una 2×8×10 puede existir
     en dos grupos distintos y hay que poder aceptarla en uno y no en el otro. */
  topeDeFiltro: (m: MedidaPendiente, p: Pendiente) => number | null,
  capDisponible: number,
  topePiezasDisponible: number | null,
): { vivas: Viva[]; usado: number } {
  const vacio = { vivas: [] as Viva[], usado: 0 };
  if (capDisponible <= EPS) return vacio;
  if (topePiezasDisponible === 0) return vacio;

  const vivas: Viva[] = [];
  for (const p of pendientes) {
    for (const m of p.medidas) {
      if (m.piezas <= 0) continue;
      const tope = topeDeFiltro(m, p);
      if (tope != null && tope > 0) vivas.push({ p, m, asignadas: 0, resto: 0, tope });
    }
  }
  if (vivas.length === 0) return vacio;

  const cap = capDisponible;
  const totalPendiente = vivas.reduce((a, v) => a + v.tope * v.m.m3Unit, 0);
  if (totalPendiente <= EPS) return vacio;

  // (1) El piso proporcional: la MEZCLA. Llenar de a un tipo por vez daba un
  // bloque íntegro de comercial y el último con la basura — algo que ninguna
  // troza produce.
  /* El tope de piezas entra en la MISMA proporción que el de volumen: recortar
     después, sacando de a una, dejaba el bloque con un solo tipo —justo lo que
     la mezcla evita—. Con los dos ratios el bloque baja parejo en las dos
     dimensiones. */
  const totalPiezas = vivas.reduce((a, v) => a + v.tope, 0);
  const ratio = Math.min(
    1,
    cap / totalPendiente,
    topePiezasDisponible != null && totalPiezas > 0 ? topePiezasDisponible / totalPiezas : 1,
  );
  let usado = 0;
  for (const v of vivas) {
    const exacto = v.tope * ratio;
    // El +1e-9 evita que un 3.0000000004 se caiga a 2 por el float.
    v.asignadas = Math.min(v.tope, Math.floor(exacto + 1e-9));
    v.resto = exacto - v.asignadas;
    usado += v.asignadas * v.m.m3Unit;
  }

  /* Red dura del tope: el piso proporcional puede pasarse por una pieza cuando
     los redondeos caen todos para arriba. Se saca de las que menos «merecían»
     entrar (menor residuo), que es una pieza, no un tipo entero. */
  if (topePiezasDisponible != null) {
    let sobran = vivas.reduce((a, v) => a + v.asignadas, 0) - topePiezasDisponible;
    const porResto = [...vivas].sort((a, b) => a.resto - b.resto);
    for (const v of porResto) {
      if (sobran <= 0) break;
      const quita = Math.min(v.asignadas, sobran);
      v.asignadas -= quita;
      usado -= quita * v.m.m3Unit;
      sobran -= quita;
    }
  }

  /**
   * (2) Las sueltas: llenar el hueco que deja el piso proporcional, con
   * piezas ENTERAS — maximizando el m³ TOTAL amparado, no sólo por orden de
   * turno.
   *
   * Hasta acá había UN único orden fijo (mayor residuo, tamaño como
   * desempate) y una ronda que daba 1 pieza por turno: con MUCHAS piezas
   * chicas de alta prioridad compitiendo contra POCAS piezas grandes de
   * menor prioridad, las chicas se comían el hueco de a poco, pasada tras
   * pasada, ANTES de que la grande tuviera su turno — y el bloque terminaba
   * amparando MENOS m³ en total de lo que cabía. Una pieza entera (a veces
   * Comercial, el producto premium) quedaba en «faltante» pese a que
   * dejarla entrar PRIMERO amparaba MÁS, no menos (auditoría 2026-08-17,
   * reproducido con búsqueda numérica: cap=0.336 con 25 medidas chicas de
   * Tabla + 1 pieza de Comercial — el orden fijo amparaba 0.320 m³ dejando
   * Comercial afuera; reservarle el lugar primero ampara 0.334 — ver test
   * "no deja una pieza grande en faltante pudiendo entrar con más m³ total").
   *
   * El fix: probar VARIOS órdenes candidatos —por prioridad (el de
   * siempre), por tamaño (la grande primero, para que la chica no le gane
   * el lugar a dentelladas) y por densidad (residuo por unidad de tamaño)—
   * y quedarse con el que ampare MÁS m³; a igualdad, gana el de prioridad
   * (el criterio de negocio: mayor residuo "merece" más el lugar). No es un
   * knapsack óptimo para cualquier entrada posible —eso es
   * desproporcionado para lo que hace falta acá—, pero resuelve el caso
   * documentado y cualquier variante de "pocas grandes contra muchas
   * chicas" con la misma forma, sin tocar el resultado en los casos donde
   * el orden de siempre ya era el mejor (ahí gana por ser el primer
   * candidato, `mejor.usado` sólo se reemplaza con una mejora estricta).
   */
  const llenarConOrden = (orden: readonly Viva[]): { extra: number[]; usado: number } => {
    const extra = vivas.map(() => 0);
    const indice = new Map(vivas.map((v, i) => [v, i] as const));
    let usadoOrden = usado;
    let puestasOrden = vivas.reduce((a, v) => a + v.asignadas, 0);
    let cambio = true;
    while (cambio) {
      cambio = false;
      for (const v of orden) {
        const i = indice.get(v) as number;
        if (v.asignadas + extra[i] >= v.tope) continue;
        if (usadoOrden + v.m.m3Unit > cap + EPS) continue;
        if (topePiezasDisponible != null && puestasOrden >= topePiezasDisponible) break;
        extra[i] += 1;
        usadoOrden += v.m.m3Unit;
        puestasOrden += 1;
        cambio = true;
      }
    }
    return { extra, usado: usadoOrden };
  };

  /**
   * Cómo se comparan dos llenados. Con un tope de piezas declarado NO alcanza
   * el volumen: el operario dijo cuánto Y cuántas, así que gana el que deje
   * menos afuera de las dos cosas, cada una medida contra su propio objetivo.
   * Sin tope declarado (el caso de siempre) manda el volumen, como antes.
   */
  const puntaje = (cand: { extra: number[]; usado: number }): number => {
    if (topePiezasDisponible == null || topePiezasDisponible <= 0 || cap <= EPS) return cand.usado;
    const piezas = vivas.reduce((a, v, i) => a + v.asignadas + cand.extra[i], 0);
    const faltaVol = Math.max(0, 1 - cand.usado / cap);
    const faltaPz = Math.max(0, 1 - piezas / topePiezasDisponible);
    return -(faltaVol + faltaPz); // menos residuo = mejor
  };

  const candidatos = [
    [...vivas].sort((a, b) => b.resto - a.resto || b.m.m3Unit - a.m.m3Unit),
    [...vivas].sort((a, b) => b.m.m3Unit - a.m.m3Unit || b.resto - a.resto),
    [...vivas].sort((a, b) => b.resto / b.m.m3Unit - a.resto / a.m.m3Unit),
  ];
  let mejor: { extra: number[]; usado: number; fuente?: string } = { ...llenarConOrden(candidatos[0]), fuente: "greedy0" };
  let mejorPuntaje = puntaje(mejor);
  for (let i = 1; i < candidatos.length; i++) {
    const candidato = { ...llenarConOrden(candidatos[i]), fuente: `greedy${i}` };
    const p = puntaje(candidato);
    if (p > mejorPuntaje + EPS) { mejor = candidato; mejorPuntaje = p; }
  }

  /**
   * La CUOTA: el reparto proporcional de toda la vida (Hare/mayor residuo).
   *
   * El piso deja a cada medida con la parte entera de su cuota y las piezas que
   * sobran van, **de a UNA por medida**, a las de mayor residuo. Es distinto de
   * los tres órdenes de arriba, que repiten rondas y por eso se llevan varias
   * piezas de la misma medida: con un paquete que declara 75 piezas y su m³,
   * eso metía 11 tablas grandes, agotaba la capacidad y dejaba el conteo en 71.
   * La cuota da 20·15·30·10 —la partición que hace el operario a mano— y cierra
   * las dos cosas.
   *
   * Se compara contra la capacidad con la tolerancia del REDONDEO del dato: el
   * m³ declarado tiene 4 decimales, y la suma exacta de la cuota puede caer
   * unas cienmilésimas por encima de ese número truncado.
   */
  const porCuota = (): { extra: number[]; usado: number } => {
    const extra = vivas.map(() => 0);
    let usadoCuota = usado;
    let puestas = vivas.reduce((a, v) => a + v.asignadas, 0);
    const orden = [...vivas].sort((a, b) => b.resto - a.resto || b.m.m3Unit - a.m.m3Unit);
    const indice = new Map(vivas.map((v, i) => [v, i] as const));
    for (const v of orden) {
      if (topePiezasDisponible != null && puestas >= topePiezasDisponible) break;
      const i = indice.get(v) as number;
      if (v.asignadas + extra[i] >= v.tope) continue;
      if (usadoCuota + v.m.m3Unit > cap + TOL_REDONDEO_M3) continue;
      extra[i] += 1;
      usadoCuota += v.m.m3Unit;
      puestas += 1;
    }
    return { extra, usado: usadoCuota };
  };
  const cuota = { ...porCuota(), fuente: "cuota" };
  const puntajeCuota = puntaje(cuota);
  if (puntajeCuota > mejorPuntaje + EPS) { mejor = cuota; mejorPuntaje = puntajeCuota; }

  /**
   * Y por último la combinación EXACTA (DP), que es donde se gana la precisión.
   *
   * No se le da sólo el hueco sobrante: sobre el piso ya fijado, casi nunca
   * entra nada más (en el caso medido el hueco era 0,031 m³ y la pieza más
   * chica 0,039). Se le devuelven `MARGEN_MEZCLA` piezas por medida —el piso
   * baja un escalón— y la DP decide de nuevo ESE tramo. Con eso el caso peor
   * de la búsqueda numérica pasó de amparar 0,527 a 0,533 m³ sobre una
   * capacidad de 0,558, y el reparto sigue siendo una mezcla: ninguna medida
   * puede quedar más de dos piezas por debajo de su proporción.
   */
  const base = vivas.map((v) => Math.max(0, v.asignadas - MARGEN_MEZCLA));
  const usadoBase = base.reduce((a, n, i) => a + n * vivas[i].m.m3Unit, 0);
  const piezasBase = base.reduce((a, n) => a + n, 0);
  const extraDp = rellenoOptimo(
    vivas,
    vivas.map((v, i) => v.tope - base[i]),
    cap - usadoBase,
    topePiezasDisponible != null ? topePiezasDisponible - piezasBase : null,
  );
  if (extraDp) {
    const cand = {
      extra: vivas.map((v, i) => base[i] + extraDp[i] - v.asignadas),
      usado: usadoBase + extraDp.reduce((a, n, i) => a + n * vivas[i].m.m3Unit, 0),
      fuente: "dp-margen",
    };
    const p = puntaje(cand);
    if (p > mejorPuntaje + EPS) { mejor = cand; mejorPuntaje = p; }
  }

  /**
   * Última vía: la DP sobre TODO el bloque (sin piso previo). Ampara el máximo
   * posible, pero puede armar un bloque que ninguna troza produce —todo de una
   * medida—, así que se acepta sólo si respeta la mezcla: cada medida que el
   * piso proporcional tocaba conserva al menos una pieza.
   */
  const extraTodo = rellenoOptimo(vivas, vivas.map((v) => v.tope), cap, topePiezasDisponible);
  if (extraTodo) {
    const cand = {
      extra: vivas.map((v, i) => extraTodo[i] - v.asignadas),
      usado: extraTodo.reduce((a, n, i) => a + n * vivas[i].m.m3Unit, 0),
      fuente: "dp-total",
    };
    const mezclaOk = vivas.every((v, i) => v.asignadas === 0 || extraTodo[i] > 0);
    const p = puntaje(cand);
    if (mezclaOk && p > mejorPuntaje + EPS) { mejor = cand; mejorPuntaje = p; }
  }

  /**
   * Y si el bloque declaró CUÁNTAS piezas, el conteo deja de ser un techo y
   * pasa a ser objetivo: se busca la combinación que cierre volumen y piezas a
   * la vez (DP 2D). Acá la mezcla proporcional cede a propósito — el operario
   * ya dijo exactamente cuánto y cuántas, y respetar una proporción calculada
   * por encima de un dato declarado a mano es lo que tiraba 0,207 m³ de
   * capacidad en un paquete de 30 piezas.
   */
  if (topePiezasDisponible != null) {
    const extraObj = combinacionObjetivo(vivas, vivas.map((v) => v.tope), cap, topePiezasDisponible);
    if (extraObj) {
      const usadoObj = extraObj.reduce((a, n, i) => a + n * vivas[i].m.m3Unit, 0);
      /* Sólo si CIERRA el bloque. Cuando la capacidad sobra de lejos —una troza
         de 100 m³ con un tope de 30 piezas— no hay ningún volumen que ajustar:
         el tope es el que corta y ahí manda la mezcla, porque de una troza no
         salen sólo las 30 tablas más grandes. La combinación exacta se usa
         donde tiene sentido: cuando el m³ declarado y las piezas declaradas
         describen el MISMO paquete. */
      const cand = {
        extra: vivas.map((v, i) => extraObj[i] - v.asignadas),
        usado: usadoObj,
        fuente: "dp-objetivo",
      };
      const p = puntaje(cand);
      if (usadoObj >= cap * CIERRE_MIN && p > mejorPuntaje + EPS) { mejor = cand; mejorPuntaje = p; }
    }
  }
  /*
   * Red dura antes de aplicar: **ninguna medida puede llevarse más piezas de
   * las que hay**. Es el invariante más caro de romper de todo el módulo —una
   * pieza de más es madera fabricada, declarada ante una autoridad— y depende
   * de que cinco estrategias distintas (tres greedy, la cuota y tres DP) sean
   * todas correctas. Un error de reconstrucción en una de ellas ya lo rompió
   * una vez; esto lo vuelve imposible, cueste lo que cueste en volumen.
   */
  let usadoFinal = mejor.usado;
  for (let i = 0; i < vivas.length; i++) {
    const total = vivas[i].asignadas + mejor.extra[i];
    if (total > vivas[i].tope) {
      usadoFinal -= (total - vivas[i].tope) * vivas[i].m.m3Unit;
      mejor.extra[i] = vivas[i].tope - vivas[i].asignadas;
    }
    if (total < 0) {
      usadoFinal += -total * vivas[i].m.m3Unit;
      mejor.extra[i] = -vivas[i].asignadas;
    }
  }
  for (let i = 0; i < vivas.length; i++) vivas[i].asignadas += mejor.extra[i];
  return { vivas, usado: usadoFinal };
}

/**
 * Llena un bloque con PIEZAS ENTERAS, conservando la mezcla del pendiente.
 *
 * Sin filtro de largo, es UNA pasada. Con filtro, son DOS: la primera respeta
 * el filtro (con su `pct`); si a esa capacidad le sobra margen, una SEGUNDA
 * pasada —sin filtro— completa con lo que haya (otros largos, otros tipos)
 * para no dejar capacidad sin usar. El filtro reserva prioridad para esos
 * largos, no bloquea el resto de la capacidad del bloque (pedido de Brandon
 * 2026-08-17: «fijo 12 y 11 pies pero el bloque tiene para más, que se
 * complemente con lo demás para aprovechar el volumen»).
 *
 * Antes de todo eso corre una FASE 0 con las líneas que tienen un override
 * manual (`overridesLinea`, editado desde el resultado): cada una toma SU
 * propia capacidad, no la del bloque entero, y el resto se reparte con lo
 * que queda — ver el comentario de esa fase más abajo.
 *
 * Muta los pendientes (son saldos que se consumen) y el bloque.
 */
function llenarBloque(
  d: BloqueDistribuido,
  pendientes: readonly Pendiente[],
  dim: DimensionResumen,
  /**
   * Segunda vuelta: el bloque ya se llenó una vez y vuelve a mirar lo que
   * quedó pendiente después de que pasaron TODOS los bloques. No repite la
   * fase de overrides (ya se aplicaron) y su tope de piezas descuenta lo que
   * ya tiene. Lo asignado se FUSIONA con lo de la primera vuelta, no se
   * agrega como filas nuevas.
   */
  repesca = false,
): void {
  /* Tope de piezas dicho a mano: el bloque deja de cargar al llegar, aunque le
     sobre capacidad. `0` es un tope legítimo (un bloque que todavía no dio nada). */
  const yaPuestas = d.asignado.reduce((a, g) => a + g.piezas, 0);
  const topePiezas =
    d.bloque.piezasManual != null && Number.isFinite(Number(d.bloque.piezasManual))
      ? Math.max(0, Math.floor(Number(d.bloque.piezasManual)) - (repesca ? yaPuestas : 0))
      : null;
  const filtroLargo = sanearFiltroLargo(d.bloque.largoFiltro);
  /**
   * Los grupos que este bloque admite («sólo Comercial»). EXCLUYENTE: si el
   * grupo no está en la lista, el bloque no lo ve en NINGUNA pasada —ni en la
   * de complemento—, porque completar con lo que el filtro excluyó es
   * justamente lo que el filtro viene a impedir. `null` = de todo.
   */
  const gruposOk = gruposAdmitidos(d.bloque, dim);
  const pasaGrupo = (p: Pendiente): boolean => !gruposOk || gruposOk.has(p.clave);
  /** `null` = esta medida no pasa el filtro (no la ve la 1ª pasada). Con `pct`
   * parcial, recorta cuántas piezas del pendiente ACTUAL puede tomar. */
  const topeConFiltro = (m: MedidaPendiente, p: Pendiente): number | null => {
    if (!pasaGrupo(p)) return null;
    if (!filtroLargo) return m.piezas;
    const largoM = toFeet(m.largo, m.uLargo as Unidad);
    const entrada = filtroLargo.find((f) => Math.abs(largoM - f.largo) < 0.05);
    if (!entrada) return null;
    if (entrada.pct >= 100) return m.piezas;
    return Math.min(m.piezas, Math.floor((m.piezas * entrada.pct) / 100 + 1e-9));
  };
  /**
   * La 2ª pasada (complemento, sin filtro) puede tomar CUALQUIER medida que
   * no esté en el filtro — ahí no había reserva, así que no dejar esa
   * capacidad sin usar. Pero una medida con `pct` PARCIAL sí tenía una
   * reserva a propósito («llevate el 30 %, el resto es para otro lado»): si
   * el complemento se comiera ese resto sólo porque no había nada más que
   * lo compitiera, el `pct` no serviría para nada — cualquier lote de un
   * solo largo lo volvería a completar igual. Por eso una medida con `pct`
   * parcial queda excluida (`null`) de la pasada de complemento, no
   * disponible con `m.piezas` completo.
   */
  const complemento = (m: MedidaPendiente, p: Pendiente): number | null => {
    if (!pasaGrupo(p)) return null;
    if (!filtroLargo) return m.piezas;
    const largoM = toFeet(m.largo, m.uLargo as Unidad);
    const entrada = filtroLargo.find((f) => Math.abs(largoM - f.largo) < 0.05);
    if (entrada && entrada.pct < 100) return null;
    return m.piezas;
  };
  /**
   * Una línea con override ve TODAS sus medidas: los filtros del bloque (largo
   * y grupo) son reglas de reparto AUTOMÁTICO, y un override es el operario
   * diciendo a mano qué va en esa línea. Lo dicho a mano gana.
   */
  const sinFiltro = (m: MedidaPendiente): number | null => m.piezas;
  /** `null`/no-finito = «no dijo nada para este campo», que lo calcule el reparto. */
  const numOrNull = (v: number | null | undefined): number | null =>
    v != null && Number.isFinite(Number(v)) ? Number(v) : null;

  const cap = d.libreM3;
  const todasLasVivas: Viva[] = [];
  let usado = 0;

  const correrPasada = (
    pendientesPasada: readonly Pendiente[],
    topeDe: (m: MedidaPendiente, p: Pendiente) => number | null,
    topePiezasResto: number | null,
    /** Capacidad de ESTA pasada; por defecto, toda la que le queda al bloque. Menor en la fase 0 cuando la línea trae un `m3` dicho a mano. */
    capPasada: number = cap - usado,
    /**
     * Ignora el `cap - usado` del bloque (Brandon, 2026-09-02): un override
     * de SÓLO piezas (sin m³ declarado) en un bloque que nunca declaró
     * capacidad propia (`cap` en 0, "Rolliza nueva" sin m³) no puede fabricar
     * volumen —mueve piezas REALES, con el m³ que esas piezas ya tenían—, así
     * que no tiene sentido toparlo contra una capacidad que el bloque nunca
     * reclamó. Sin este bypass, el pase quedaba en 0 (capacidad 0 manda) y la
     * línea caía a la rama "sin grupo real" con el conteo de piezas
     * FABRICADO —doble conteo real: "Falta por distribuir" seguía mostrando
     * esas mismas piezas como pendientes—. Con capacidad real declarada (>0)
     * esto NUNCA se usa: ahí la capacidad sigue mandando, sin excepción.
     */
    ignorarCapacidadBloque = false,
  ) => {
    const capEfectiva = ignorarCapacidadBloque ? capPasada : Math.min(capPasada, cap - usado);
    const { vivas, usado: usadoPasada } = pasadaDeLlenado(pendientesPasada, topeDe, capEfectiva, topePiezasResto);
    // Descontar YA lo que usó esta pasada: la siguiente (si hay) tiene que
    // ver el pendiente REAL, no el de antes de repartir.
    for (const v of vivas) {
      if (v.asignadas <= 0) continue;
      v.m.piezas -= v.asignadas;
      todasLasVivas.push(v);
    }
    usado += usadoPasada;
  };

  /**
   * Fase 0 — líneas con override manual: piezas y/o m³ dichos a mano para ESE
   * tipo/medida puntual, editado en el resultado ya distribuido en vez de en
   * la tabla de entrada. Van PRIMERO y cada una toma SU capacidad —«de
   * Comercial quiero 150 piezas» manda sobre la mezcla proporcional para esa
   * línea—; lo que sobra de capacidad queda para el resto, que se reparte
   * DESPUÉS con la lógica de siempre (misma idea que `amparaManualM3`/
   * `piezasManual` a nivel de bloque, acotada acá a una línea). Si dos
   * overrides compiten por la misma capacidad, gana el que aparece primero
   * en la tabla — la capacidad física del bloque nunca se negocia.
   */
  const overridesLinea = d.bloque.overridesLinea;
  const pendientesLibres: Pendiente[] = [];
  for (const p of pendientes) {
    const ov = overridesLinea?.[claveOverrideLinea(dim, p.clave)];
    /* En la repesca las líneas con override ya dijeron lo suyo: si volvieran a
       entrar por la vía automática, el bloque tomaría MÁS de lo que el operario
       declaró para esa línea. */
    if (repesca) {
      if (!ov || (ov.piezas == null && ov.m3 == null)) pendientesLibres.push(p);
      continue;
    }
    const ovPiezas = numOrNull(ov?.piezas);
    const ovM3 = numOrNull(ov?.m3);
    if (!ov || (ovPiezas == null && ovM3 == null)) { pendientesLibres.push(p); continue; }
    const topeLinea = ovPiezas != null ? Math.max(0, Math.floor(ovPiezas)) : null;
    if (ovM3 != null) {
      correrPasada([p], sinFiltro, topeLinea, Math.max(0, ovM3));
    } else if (cap <= EPS) {
      // Sólo piezas, bloque sin capacidad propia declarada: ver el comentario de `ignorarCapacidadBloque`.
      correrPasada([p], sinFiltro, topeLinea, Number.POSITIVE_INFINITY, true);
    } else {
      correrPasada([p], sinFiltro, topeLinea);
    }
  }

  const puestasFase0 = todasLasVivas.reduce((a, v) => a + v.asignadas, 0);
  const topePiezasLibres = topePiezas != null ? Math.max(0, topePiezas - puestasFase0) : null;
  /* En la repesca la pasada va con `complemento`, no con el filtro: la reserva
     de un largo con `pct` PARCIAL ya se respetó en la primera vuelta, y volver
     a aplicar el porcentaje sobre el pendiente que quedó se la iría comiendo de
     a un 30 % por vuelta —el `pct` dejaría de reservar nada—. */
  correrPasada(pendientesLibres, repesca ? complemento : topeConFiltro, topePiezasLibres);
  if (filtroLargo && !repesca && cap - usado > EPS) {
    const puestasHastaAhora = todasLasVivas.reduce((a, v) => a + v.asignadas, 0);
    const topeRestante = topePiezas != null ? Math.max(0, topePiezas - puestasHastaAhora) : null;
    correrPasada(pendientesLibres, complemento, topeRestante);
  }

  /* Con overrides activos NO se puede cortar acá aunque nada se haya asignado:
     una línea que un override dejó en 0 tiene que seguir apareciendo (en 0)
     para poder deshacerla — ver la Fase 0 y el volcado de abajo. Sin overrides
     (el caso de siempre), el atajo de salida se mantiene igual que antes. */
  if (todasLasVivas.length === 0 && (repesca || !overridesLinea)) return;

  // Volcar al bloque respetando el orden de los grupos (el del resumen).
  //
  // Dos pasadas pueden tocar la MISMA medida (ej. 40 piezas de 12": la 1ª
  // pasada se lleva el 30 % por el filtro, la 2ª —complemento, sin filtro—
  // se lleva más de esa misma medida si todavía compite bien): eso NO puede
  // salir como dos filas de "2×8×12" separadas —además de leerse mal en el
  // papel, `claveMarca` usa la clave de la MEDIDA/grupo como identidad del
  // check «ya lo registré», y dos filas con la misma clave rompen ese
  // marcado—. Se acumula CRUDO por medida entre pasadas y se redondea una
  // sola vez al cerrar, mismo patrón que ya resolvió el bug de compounding
  // de `repartirPorDia` (auditoría 2026-08-17): redondear y sumar en cada
  // pasada, en vez de sumar crudo y redondear al final, es el mismo bug de
  // «las partes redondeadas no dan la suma del todo».
  const porGrupo = new Map<string, { clave: string; label: string; piezas: number; medidas: Map<string, { base: Viva["m"]; piezas: number; m3Raw: number; ptRaw: number }> }>();
  for (const v of todasLasVivas) {
    let g = porGrupo.get(v.p.clave);
    if (!g) { g = { clave: v.p.clave, label: v.p.label, piezas: 0, medidas: new Map() }; porGrupo.set(v.p.clave, g); }
    const existente = g.medidas.get(v.m.clave);
    if (existente) {
      existente.piezas += v.asignadas;
      existente.m3Raw += v.asignadas * v.m.m3Unit;
      existente.ptRaw += v.asignadas * v.m.ptUnit;
    } else {
      g.medidas.set(v.m.clave, { base: v.m, piezas: v.asignadas, m3Raw: v.asignadas * v.m.m3Unit, ptRaw: v.asignadas * v.m.ptUnit });
    }
    g.piezas += v.asignadas;
  }
  for (const p of pendientes) {
    const grupo = porGrupo.get(p.clave);
    const ov = overridesLinea?.[claveOverrideLinea(dim, p.clave)];
    const ovM3Declarado = numOrNull(ov?.m3);
    if (!grupo) {
      if (repesca) continue; // su renglón (aunque sea en 0) ya se volcó en la 1ª vuelta
      /* Nada asignado de esta línea. Si tiene un override activo, se deja
         igual un renglón en 0 —si no, la línea desaparece del resultado en
         cuanto se la lleva a 0 y no queda forma de deshacerlo desde ahí—.
         Con `m3` declarado a mano y NADA real detrás (Brandon, 2026-09-02:
         armar el bloque a mano, "nada de automático"), ese m³ manda igual:
         es una línea 100% declarada, sin una sola medida real que la respalde. */
      const ovPiezasDeclaradas = numOrNull(ov?.piezas);
      if (ov && (ovPiezasDeclaradas != null || ovM3Declarado != null)) {
        d.asignado.push({
          clave: p.clave, label: p.label,
          m3: ovM3Declarado != null ? r4(ovM3Declarado) : 0,
          pieTablar: 0,
          piezas: ovPiezasDeclaradas != null ? Math.max(0, Math.floor(ovPiezasDeclaradas)) : 0,
          medidas: [],
          m3Declarado: ovM3Declarado != null,
        });
      }
      continue;
    }
    const g: AsignacionGrupo = { clave: grupo.clave, label: grupo.label, m3: 0, pieTablar: 0, piezas: grupo.piezas, medidas: [] };
    for (const { base, piezas, m3Raw, ptRaw } of grupo.medidas.values()) {
      const m3 = r4(m3Raw);
      const pt = r2(ptRaw);
      g.medidas.push({
        clave: base.clave, medida: base.medida,
        espesor: base.espesor, ancho: base.ancho, largo: base.largo,
        uEspesor: base.uEspesor, uAncho: base.uAncho, uLargo: base.uLargo,
        m3, pieTablar: pt, piezas,
      });
      g.m3 += m3;
      g.pieTablar += pt;
    }
    g.m3 = r4(g.m3);
    g.pieTablar = r2(g.pieTablar);
    g.medidas.sort((a, b) => b.m3 - a.m3);
    /*
     * El m³ DECLARADO manda sobre el físico de `medidas` (Brandon, 2026-09-02,
     * a conciencia del riesgo — reabre a propósito el hueco que la auditoría
     * 2026-08-17 había cerrado: "sí, lo quiero así, asumo el riesgo"). Las
     * medidas de abajo siguen mostrando lo que esas piezas dieron de verdad;
     * `m3Declarado` avisa al consumidor (UI/Excel/Anexo 04) que el total de
     * la línea NO es la suma de su propio detalle.
     */
    if (ovM3Declarado != null) {
      g.m3 = r4(ovM3Declarado);
      g.m3Declarado = true;
    }
    /* Repesca: lo nuevo se SUMA a la fila que ya existe. Dos filas con la misma
       clave romperían el marcado de «ya lo registré» (`claveMarca`) además de
       leerse mal en el papel. */
    const previo = d.asignado.find((x) => x.clave === g.clave);
    if (previo) {
      previo.piezas += g.piezas;
      previo.m3 = r4(previo.m3 + g.m3);
      previo.pieTablar = r2(previo.pieTablar + g.pieTablar);
      for (const m of g.medidas) {
        const antes = previo.medidas.find((x) => x.clave === m.clave);
        if (antes) {
          antes.piezas += m.piezas;
          antes.m3 = r4(antes.m3 + m.m3);
          antes.pieTablar = r2(antes.pieTablar + m.pieTablar);
        } else {
          previo.medidas.push(m);
        }
      }
      if (g.m3Declarado) previo.m3Declarado = true;
      continue;
    }
    d.asignado.push(g);
  }
  /*
   * `usadoM3`/`libreM3` del bloque salen de sumar `d.asignado` YA con los
   * declarados aplicados — no del `usado` físico que acumularon las pasadas
   * de arriba. Si lo declarado por el operario supera la capacidad real del
   * bloque, `libreM3` da negativo a propósito: es la única señal honesta de
   * que se declaró más de lo que ese bloque puede amparar.
   */
  const usadoFinal = r4(d.asignado.reduce((a, gr) => a + gr.m3, 0));
  d.usadoM3 = r4(usadoFinal);
  /* El sobrante negativo por REDONDEO no es un descuadre: el m³ del bloque se
     declara con 4 decimales y la suma exacta de las piezas que lo cierran puede
     caer unas cienmilésimas por encima de ese número. Un «-0.0001 libres» en un
     paquete que cerró clavado sólo confunde. Un exceso de verdad —lo declarado
     a mano por encima de la capacidad— es mucho mayor y se sigue mostrando. */
  /* Contra la CAPACIDAD del bloque, no contra el hueco con el que entró esta
     pasada: en la repesca `cap` es lo que quedaba libre, y restarle todo lo
     asignado (que incluye la primera vuelta) daba un «libre» absurdamente
     negativo. */
  const sobra = d.capacidadM3 - usadoFinal;
  d.libreM3 = r4(sobra < 0 && sobra >= -TOL_REDONDEO_M3 * 2 ? 0 : sobra);
  /* Mismo criterio que `libreM3` para el conteo: si el bloque declaró cuántas
     piezas trae, cuántas de ésas quedaron sin ubicar. Negativo si se declararon
     más de las que el bloque terminó amparando — la señal honesta, igual que
     arriba. */
  const topeDeclarado = d.bloque.piezasManual;
  d.piezasLibres =
    topeDeclarado != null && Number.isFinite(Number(topeDeclarado))
      ? Math.round(Number(topeDeclarado) - d.asignado.reduce((a, gr) => a + gr.piezas, 0))
      : null;
}

/**
 * Arma el pendiente de un grupo bajando hasta la medida.
 *
 * Se recorren las piezas de la especie y se quedan las del grupo: es el único
 * modo de saber qué 2×8×10 hay dentro de «Comercial», que es justo lo que el
 * papel tiene que declarar.
 */
function pendienteDeGrupo(g: GrupoResumen, piezasEspecie: readonly PiezaCubicada[], dim: DimensionResumen): Pendiente {
  const mias = piezasEspecie.filter((p) => claveYLabel(p, dim).clave === g.clave);
  const mapa = new Map<string, { m3: number; pt: number; piezas: number; p: PiezaCubicada }>();
  for (const p of mias) {
    const k = `${p.espesor}${p.uEspesor}x${p.ancho}${p.uAncho}x${p.largo}${p.uLargo}`;
    const acc = mapa.get(k) ?? { m3: 0, pt: 0, piezas: 0, p };
    acc.m3 += p.m3;
    acc.pt += p.pieTablar;
    acc.piezas += p.cantidad;
    mapa.set(k, acc);
  }
  // Los unitarios salen del total del renglón dividido sus piezas: así
  // `asignado + faltante` reconstruye EXACTAMENTE el m³ y el PT del lote, sin
  // arrastrar el redondeo de una tasa por m³.
  const medidas: MedidaPendiente[] = [...mapa.entries()]
    .map(([clave, v]) => ({
      clave,
      medida: `${v.p.espesor}×${v.p.ancho}×${v.p.largo}`,
      espesor: v.p.espesor, ancho: v.p.ancho, largo: v.p.largo,
      uEspesor: v.p.uEspesor, uAncho: v.p.uAncho, uLargo: v.p.uLargo,
      piezas: v.piezas,
      m3Unit: v.piezas > 0 ? v.m3 / v.piezas : 0,
      ptUnit: v.piezas > 0 ? v.pt / v.piezas : 0,
    }))
    // Sin piezas no hay nada que repartir (un renglón con cantidad 0).
    .filter((m) => m.piezas > 0)
    .sort((a, b) => b.piezas * b.m3Unit - a.piezas * a.m3Unit);

  return { clave: g.clave, label: g.label, medidas };
}

/**
 * El % efectivo de un bloque: capacidad ÷ m³ propio.
 *
 * Da lo mismo que `aprovechablePct` en el camino automático (es cómo se
 * calculó `capacidadM3`), pero en el camino MANUAL (`amparaManualM3`) el
 * campo `aprovechablePct` puede haber quedado en blanco —o decir cualquier
 * cosa— mientras lo medido manda sobre `capacidadM3`. Usar el campo crudo
 * ahí ignoraba el rendimiento REAL y podía errar la rolliza a comprar hasta
 * 5× (auditoría 2026-08-17: bloque con 10 % real, campo % en blanco →
 * default 55 % falso).
 */
const pctEfectivoDe = (d: Pick<BloqueDistribuido, "bloque" | "capacidadM3" | "aprovechablePct">): number =>
  d.bloque.m3 > 0 ? (d.capacidadM3 / d.bloque.m3) * 100 : d.aprovechablePct;

/**
 * Lo que quedó sin asignar de un grupo, con la rolliza que haría falta.
 *
 * El aprovechamiento que se usa es el EFECTIVO del ÚLTIMO bloque de la
 * especie: es el supuesto vigente y el que se aplicaría al comprar la
 * próxima troza. Sin bloques (especie sin rolliza) cae al default, que es lo
 * único que se puede afirmar.
 */
function faltanteDePendiente(p: Pendiente, bloques: readonly BloqueDistribuido[]): FaltanteGrupo {
  /* Sólo los bloques de ROLLIZA dicen algo sobre cuánta troza pide el
     faltante: uno de aserrada directa rinde 100 % por definición, y tomarlo
     como referencia diría que 5 m³ sin amparar se cubren con 5 m³ de troza. */
  const deRolliza = bloques.filter((d) => !esAserradaDirecta(d.bloque));
  const pct = deRolliza.length > 0 ? pctEfectivoDe(deRolliza[deRolliza.length - 1]) : APROVECHABLE_DEFAULT;
  const m3 = m3De(p);
  return {
    clave: p.clave,
    label: p.label,
    m3: r4(m3),
    pieTablar: r2(ptDe(p)),
    piezas: piezasDe(p),
    medidas: p.medidas
      .filter((m) => m.piezas > 0)
      .map((m) => ({
        clave: m.clave, medida: m.medida,
        espesor: m.espesor, ancho: m.ancho, largo: m.largo,
        uEspesor: m.uEspesor, uAncho: m.uAncho, uLargo: m.uLargo,
        m3: r4(m.piezas * m.m3Unit),
        pieTablar: r2(m.piezas * m.ptUnit),
        piezas: m.piezas,
      })),
    // Con 0 % de aprovechamiento no hay rolliza que alcance: se informa 0 en vez
    // de dividir por cero y mostrar Infinity.
    rollizaNecesariaM3: pct > 0 ? r4(m3 / (pct / 100)) : 0,
  };
}

/** Rangos del aserrío peruano, para juzgar un rendimiento sin inventar precisión. */
export function juzgarRendimiento(pct: number | null): { label: string; tono: "success" | "warning" | "error" | "neutral" } {
  if (pct == null) return { label: "sin rolliza que comparar", tono: "neutral" };
  if (pct > 100) return { label: "imposible: salió más de lo que entró", tono: "error" };
  if (pct < 40) return { label: "bajo para aserrío", tono: "error" };
  if (pct <= 65) return { label: "normal de aserrío (40–65 %)", tono: "success" };
  return { label: "alto — ¿reaserrado o poco escuadrado?", tono: "warning" };
}

/**
 * Los bloques que salen del cubicador de trozas, agrupados por especie.
 *
 * Una troza por fila serían cincuenta bloques que dicen lo mismo; agrupadas por
 * especie el conteo va en la etiqueta para no perder de cuántas trozas salió.
 */
export function bloquesDesdeTrozas(
  trozas: ReadonlyArray<{ especie?: string; m3: number }>,
): BloqueRolliza[] {
  const mapa = new Map<string, { label: string; m3: number; n: number }>();
  for (const t of trozas) {
    const k = claveEspecie(t.especie);
    const acc = mapa.get(k) ?? { label: labelEspecie(t.especie ?? ""), m3: 0, n: 0 };
    acc.m3 += Number(t.m3) || 0;
    acc.n += 1;
    mapa.set(k, acc);
  }
  return [...mapa.entries()].map(([k, v]) => ({
    id: `trozas-${k || "sin-especie"}`,
    etiqueta: `Cubicador de trozas · ${v.n} ${v.n === 1 ? "troza" : "trozas"}`,
    especie: v.label === "Sin especie" ? "" : v.label,
    m3: r4(v.m3),
    origen: "trozas" as const,
    tipo: "rolliza" as const,
  }));
}

/** La distribución en CSV, con las mismas reglas del resto del libro (`;` y coma decimal). */
export function distribucionACsv(d: Distribucion, etiquetaDim: string): string {
  const cel = (v: unknown) => { const s = v == null ? "" : String(v); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const fila = (c: unknown[]) => c.map(cel).join(";");
  const num = (v: number | null, dec = 4) => (v == null ? "" : v.toFixed(dec).replace(".", ","));

  const lineas: string[] = [
    fila(["Distribucion de rolliza sobre aserrada", etiquetaDim]),
    fila(["Cada bloque ampara hasta su capacidad (m3 x % aprovechable). Lo que no entra queda como faltante."]),
    fila(["Los bloques cargados como ASERRADA DIRECTA no traen troza: su m3 ya es el amparado y no cuenta como rolliza."]),
    "",
    fila(["Especie", "Bloque", "Cargado como", "Rolliza (m3)", "% aprovechable", "Capacidad (m3)", "Grupo", "Piezas", "Aserrada amparada (m3)", "Pie tablar", "Costo rolliza"]),
  ];
  for (const e of d.especies) {
    for (const b of e.bloques) {
      /* Un bloque de aserrada directa deja en blanco la rolliza y el %: no
         tiene troza de origen, y poner su m3 en la columna «Rolliza» sería
         declarar como troza algo que entró ya aserrado. */
      const directa = esAserradaDirecta(b.bloque);
      const comoSeCargo = directa ? "Aserrada directa" : "Rolliza";
      const rollizaCel = directa ? "" : num(b.bloque.m3);
      const apCel = directa ? "" : num(b.aprovechablePct, 1);
      if (b.asignado.length === 0) {
        lineas.push(fila([e.especie, b.bloque.etiqueta, comoSeCargo, rollizaCel, apCel, num(b.capacidadM3), "(sin usar)", 0, num(0), num(0, 2), num(b.costoRolliza, 2)]));
        continue;
      }
      for (const a of b.asignado) {
        lineas.push(fila([e.especie, b.bloque.etiqueta, comoSeCargo, rollizaCel, apCel, num(b.capacidadM3), a.label, a.piezas, num(a.m3), num(a.pieTablar, 2), num(b.costoRolliza, 2)]));
      }
      lineas.push(fila([`${e.especie} · ${b.bloque.etiqueta} · usado`, "", "", "", "", num(b.capacidadM3), "", b.asignado.reduce((a, g) => a + g.piezas, 0), num(b.usadoM3), "", ""]));
      lineas.push(fila([`${e.especie} · ${b.bloque.etiqueta} · libre`, "", "", "", "", "", "", "", num(b.libreM3), "", ""]));
    }
    if (e.faltante.length > 0) {
      lineas.push("");
      lineas.push(fila([`${e.especie} · FALTANTE POR DISTRIBUIR`, "", "", "", "", "", "Grupo", "Piezas", "Sin amparar (m3)", "Pie tablar", "Rolliza necesaria (m3)"]));
      for (const f of e.faltante) {
        lineas.push(fila([e.especie, "", "", "", "", "", f.label, f.piezas, num(f.m3), num(f.pieTablar, 2), num(f.rollizaNecesariaM3)]));
      }
    }
    lineas.push("");
  }
  const t = d.totales;
  lineas.push(fila(["TOTAL GENERAL", "", "", num(t.rollizaM3), "", num(t.capacidadM3), "", "", num(t.amparadaM3), num(t.amparadaPt, 2), num(t.costoRolliza, 2)]));
  if (t.aserradaDirectaM3 > EPS) {
    lineas.push(fila(["ASERRADA DIRECTA CARGADA", "", "", "", "", num(t.aserradaDirectaM3), "", "", num(t.amparadaDirectaM3), "", ""]));
  }
  lineas.push(fila(["FALTA POR DISTRIBUIR", "", "", "", "", "", "", "", num(t.faltanteM3), "", num(t.rollizaFaltanteM3)]));
  lineas.push(fila(["CAPACIDAD LIBRE", "", "", "", "", "", "", "", num(t.libreM3), "", ""]));
  lineas.push(fila(["RENDIMIENTO GENERAL", t.rendimientoPct == null ? "sin rolliza" : `${num(t.rendimientoPct, 2)} %`, t.aserradaDirectaM3 > EPS ? "(sin contar la aserrada directa)" : ""]));
  return lineas.join("\r\n");
}
