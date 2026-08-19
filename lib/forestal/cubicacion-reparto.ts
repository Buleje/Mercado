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
  m3: number;
  /** De dónde salió: el cubicador de trozas o cargado a mano. */
  origen: "trozas" | "manual";
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
  rollizaM3: number;
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
}

export interface Distribucion {
  especies: EspecieDistribucion[];
  totales: {
    rollizaM3: number;
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

/** El aprovechamiento vigente de un bloque, acotado a algo posible. */
export function aprovechableDe(b: Pick<BloqueRolliza, "aprovechablePct">): number {
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
  if (b.amparaManualM3 != null && Number.isFinite(Number(b.amparaManualM3))) {
    return r4(Math.min(rollizaM3, Math.max(0, Number(b.amparaManualM3))));
  }
  return r4(rollizaM3 * (aprovechableDe(b) / 100));
}

/** ¿Este bloque tiene su capacidad dicha a mano? */
export const esManual = (b: Pick<BloqueRolliza, "amparaManualM3">): boolean =>
  b.amparaManualM3 != null && Number.isFinite(Number(b.amparaManualM3));

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
    if (g.medidas.length === 0) {
      /* Línea en 0 por un override manual: no hay piezas que partir entre
         jornadas, pero el renglón se deja igual —en la primera— para que
         el resultado la siga mostrando y el override se pueda deshacer
         desde ahí (si desaparece, queda «atrapada» sin forma de editarla). */
      salida[0].grupos.push({ clave: g.clave, label: g.label, m3: 0, pieTablar: 0, piezas: 0, medidas: [] });
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
    const rollizaM3 = r4(b.bloques.reduce((a, x) => a + (Number(x.m3) || 0), 0));
    const resumen = agruparPor(b.piezas, dimInterna, precio);
    const aserradaM3 = r4(resumen.total.m3);
    const aserradaPt = r2(resumen.total.pieTablar);

    const estado: EstadoEspecie =
      rollizaM3 <= EPS ? "sin-rolliza" : aserradaM3 <= EPS ? "sin-aserrada" : "ok";
    if (estado === "sin-rolliza" && aserradaM3 > EPS) aserradaHuerfana.push({ especie: b.label, m3: aserradaM3 });
    if (estado === "sin-aserrada" && rollizaM3 > EPS) rollizaHuerfana.push({ especie: b.label, m3: rollizaM3 });

    // ── El llenado: bloque por bloque, en el orden cargado ────────────────
    const distribuidos: BloqueDistribuido[] = b.bloques.map((bl) => ({
      bloque: bl,
      aprovechablePct: aprovechableDe(bl),
      capacidadM3: capacidadDe(bl),
      usadoM3: 0,
      libreM3: capacidadDe(bl),
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
      if (d.libreM3 <= EPS) continue;
      llenarBloque(d, pendientes, dimInterna);
    }

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
    // El PT de lo amparado se suma de las asignaciones, no se toma del lote: en
    // una fila que dice «TOTAL AMPARADO 9 m³», poner el pie tablar de los 10
    // producidos es declarar de más justo en el renglón del respaldo.
    const amparadaPt = r2(distribuidos.reduce((a, d) => a + d.asignado.reduce((s, g) => s + g.pieTablar, 0), 0));
    const libreM3 = r4(distribuidos.reduce((a, d) => a + d.libreM3, 0));
    const faltanteM3 = r4(faltante.reduce((a, f) => a + f.m3, 0));
    const costoRolliza = b.bloques.some((x) => x.costoM3 == null)
      ? null
      : r2(b.bloques.reduce((a, x) => a + (Number(x.m3) || 0) * (x.costoM3 ?? 0), 0));
    const rendimientoPct = rollizaM3 > EPS ? r2((aserradaM3 / rollizaM3) * 100) : null;

    especies.push({
      especie: b.label,
      estado,
      bloques: distribuidos,
      faltante,
      rollizaM3,
      capacidadM3: r4(distribuidos.reduce((a, d) => a + d.capacidadM3, 0)),
      aserradaM3, aserradaPt, amparadaM3, amparadaPt, faltanteM3, libreM3,
      rollizaFaltanteM3: r4(faltante.reduce((a, f) => a + f.rollizaNecesariaM3, 0)),
      rendimientoPct,
      imposible: rendimientoPct != null && rendimientoPct > 100,
      costoRolliza,
    });
  }

  especies.sort((a, x) => {
    const orden = { ok: 0, "sin-rolliza": 1, "sin-aserrada": 2 } as const;
    return orden[a.estado] - orden[x.estado] || x.aserradaM3 - a.aserradaM3 || x.rollizaM3 - a.rollizaM3;
  });

  const sum = (f: (e: EspecieDistribucion) => number) => r4(especies.reduce((a, e) => a + f(e), 0));
  const totRolliza = sum((e) => e.rollizaM3);
  const totAserrada = sum((e) => e.aserradaM3);
  return {
    especies,
    totales: {
      rollizaM3: totRolliza,
      capacidadM3: sum((e) => e.capacidadM3),
      aserradaM3: totAserrada,
      aserradaPt: r2(especies.reduce((a, e) => a + e.aserradaPt, 0)),
      amparadaM3: sum((e) => e.amparadaM3),
      amparadaPt: r2(especies.reduce((a, e) => a + e.amparadaPt, 0)),
      faltanteM3: sum((e) => e.faltanteM3),
      libreM3: sum((e) => e.libreM3),
      rollizaFaltanteM3: sum((e) => e.rollizaFaltanteM3),
      rendimientoPct: totRolliza > EPS ? r2((totAserrada / totRolliza) * 100) : null,
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

/**
 * Una pasada de llenado: piso proporcional (1) + sueltas por mejor orden (2),
 * sobre lo que HOY está pendiente (ya descontado lo que se llevó una pasada
 * anterior, si la hubo). No decrementa `pendientes` ni arma `AsignacionGrupo`
 * —eso es tarea de quien llama, una sola vez, sobre la suma de TODAS las
 * pasadas— sólo decide cuánto le toca a cada medida EN ESTA pasada.
 */
function pasadaDeLlenado(
  pendientes: readonly Pendiente[],
  topeDeFiltro: (m: MedidaPendiente) => number | null,
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
      const tope = topeDeFiltro(m);
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

  const candidatos = [
    [...vivas].sort((a, b) => b.resto - a.resto || b.m.m3Unit - a.m.m3Unit),
    [...vivas].sort((a, b) => b.m.m3Unit - a.m.m3Unit || b.resto - a.resto),
    [...vivas].sort((a, b) => b.resto / b.m.m3Unit - a.resto / a.m.m3Unit),
  ];
  let mejor = llenarConOrden(candidatos[0]);
  for (let i = 1; i < candidatos.length; i++) {
    const candidato = llenarConOrden(candidatos[i]);
    if (candidato.usado > mejor.usado + EPS) mejor = candidato;
  }
  for (let i = 0; i < vivas.length; i++) vivas[i].asignadas += mejor.extra[i];
  return { vivas, usado: mejor.usado };
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
function llenarBloque(d: BloqueDistribuido, pendientes: readonly Pendiente[], dim: DimensionResumen): void {
  /* Tope de piezas dicho a mano: el bloque deja de cargar al llegar, aunque le
     sobre capacidad. `0` es un tope legítimo (un bloque que todavía no dio nada). */
  const topePiezas =
    d.bloque.piezasManual != null && Number.isFinite(Number(d.bloque.piezasManual))
      ? Math.max(0, Math.floor(Number(d.bloque.piezasManual)))
      : null;
  const filtroLargo = sanearFiltroLargo(d.bloque.largoFiltro);
  /** `null` = esta medida no pasa el filtro (no la ve la 1ª pasada). Con `pct`
   * parcial, recorta cuántas piezas del pendiente ACTUAL puede tomar. */
  const topeConFiltro = (m: MedidaPendiente): number | null => {
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
  const complemento = (m: MedidaPendiente): number | null => {
    if (!filtroLargo) return m.piezas;
    const largoM = toFeet(m.largo, m.uLargo as Unidad);
    const entrada = filtroLargo.find((f) => Math.abs(largoM - f.largo) < 0.05);
    if (entrada && entrada.pct < 100) return null;
    return m.piezas;
  };
  /** Una línea con override ve TODAS sus medidas — el filtro de largo es del bloque, no de la línea manual. */
  const sinFiltro = (m: MedidaPendiente): number | null => m.piezas;
  /** `null`/no-finito = «no dijo nada para este campo», que lo calcule el reparto. */
  const numOrNull = (v: number | null | undefined): number | null =>
    v != null && Number.isFinite(Number(v)) ? Number(v) : null;

  const cap = d.libreM3;
  const todasLasVivas: Viva[] = [];
  let usado = 0;

  const correrPasada = (
    pendientesPasada: readonly Pendiente[],
    topeDe: (m: MedidaPendiente) => number | null,
    topePiezasResto: number | null,
    /** Capacidad de ESTA pasada; por defecto, toda la que le queda al bloque. Menor en la fase 0 cuando la línea trae un `m3` dicho a mano. */
    capPasada: number = cap - usado,
  ) => {
    const { vivas, usado: usadoPasada } = pasadaDeLlenado(pendientesPasada, topeDe, Math.min(capPasada, cap - usado), topePiezasResto);
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
    const ovPiezas = numOrNull(ov?.piezas);
    const ovM3 = numOrNull(ov?.m3);
    if (!ov || (ovPiezas == null && ovM3 == null)) { pendientesLibres.push(p); continue; }
    const topeLinea = ovPiezas != null ? Math.max(0, Math.floor(ovPiezas)) : null;
    correrPasada([p], sinFiltro, topeLinea, ovM3 != null ? Math.max(0, ovM3) : undefined);
  }

  const puestasFase0 = todasLasVivas.reduce((a, v) => a + v.asignadas, 0);
  const topePiezasLibres = topePiezas != null ? Math.max(0, topePiezas - puestasFase0) : null;
  correrPasada(pendientesLibres, topeConFiltro, topePiezasLibres);
  if (filtroLargo && cap - usado > EPS) {
    const puestasHastaAhora = todasLasVivas.reduce((a, v) => a + v.asignadas, 0);
    const topeRestante = topePiezas != null ? Math.max(0, topePiezas - puestasHastaAhora) : null;
    correrPasada(pendientesLibres, complemento, topeRestante);
  }

  /* Con overrides activos NO se puede cortar acá aunque nada se haya asignado:
     una línea que un override dejó en 0 tiene que seguir apareciendo (en 0)
     para poder deshacerla — ver la Fase 0 y el volcado de abajo. Sin overrides
     (el caso de siempre), el atajo de salida se mantiene igual que antes. */
  if (todasLasVivas.length === 0 && !overridesLinea) return;

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
    if (!grupo) {
      /* Nada asignado de esta línea. Si tiene un override activo, se deja
         igual un renglón en 0 —si no, la línea desaparece del resultado en
         cuanto se la lleva a 0 y no queda forma de deshacerlo desde ahí—. */
      const ov = overridesLinea?.[claveOverrideLinea(dim, p.clave)];
      if (ov && (numOrNull(ov.piezas) != null || numOrNull(ov.m3) != null)) {
        d.asignado.push({ clave: p.clave, label: p.label, m3: 0, pieTablar: 0, piezas: 0, medidas: [] });
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
    d.asignado.push(g);
  }
  d.usadoM3 = r4(d.usadoM3 + usado);
  d.libreM3 = r4(cap - usado);
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
  const pct = bloques.length > 0 ? pctEfectivoDe(bloques[bloques.length - 1]) : APROVECHABLE_DEFAULT;
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
    "",
    fila(["Especie", "Bloque", "Rolliza (m3)", "% aprovechable", "Capacidad (m3)", "Grupo", "Piezas", "Aserrada amparada (m3)", "Pie tablar", "Costo rolliza"]),
  ];
  for (const e of d.especies) {
    for (const b of e.bloques) {
      if (b.asignado.length === 0) {
        lineas.push(fila([e.especie, b.bloque.etiqueta, num(b.bloque.m3), num(b.aprovechablePct, 1), num(b.capacidadM3), "(sin usar)", 0, num(0), num(0, 2), num(b.costoRolliza, 2)]));
        continue;
      }
      for (const a of b.asignado) {
        lineas.push(fila([e.especie, b.bloque.etiqueta, num(b.bloque.m3), num(b.aprovechablePct, 1), num(b.capacidadM3), a.label, a.piezas, num(a.m3), num(a.pieTablar, 2), num(b.costoRolliza, 2)]));
      }
      lineas.push(fila([`${e.especie} · ${b.bloque.etiqueta} · usado`, "", "", "", num(b.capacidadM3), "", b.asignado.reduce((a, g) => a + g.piezas, 0), num(b.usadoM3), "", ""]));
      lineas.push(fila([`${e.especie} · ${b.bloque.etiqueta} · libre`, "", "", "", "", "", "", num(b.libreM3), "", ""]));
    }
    if (e.faltante.length > 0) {
      lineas.push("");
      lineas.push(fila([`${e.especie} · FALTANTE POR DISTRIBUIR`, "", "", "", "", "Grupo", "Piezas", "Sin amparar (m3)", "Pie tablar", "Rolliza necesaria (m3)"]));
      for (const f of e.faltante) {
        lineas.push(fila([e.especie, "", "", "", "", f.label, f.piezas, num(f.m3), num(f.pieTablar, 2), num(f.rollizaNecesariaM3)]));
      }
    }
    lineas.push("");
  }
  const t = d.totales;
  lineas.push(fila(["TOTAL GENERAL", "", num(t.rollizaM3), "", num(t.capacidadM3), "", "", num(t.amparadaM3), num(t.amparadaPt, 2), num(t.costoRolliza, 2)]));
  lineas.push(fila(["FALTA POR DISTRIBUIR", "", "", "", "", "", "", num(t.faltanteM3), "", num(t.rollizaFaltanteM3)]));
  lineas.push(fila(["CAPACIDAD LIBRE", "", "", "", "", "", "", num(t.libreM3), "", ""]));
  lineas.push(fila(["RENDIMIENTO GENERAL", t.rendimientoPct == null ? "sin rolliza" : `${num(t.rendimientoPct, 2)} %`]));
  return lineas.join("\r\n");
}
