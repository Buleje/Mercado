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
  largoM?: number | null;
  volumenM3: number | null;
  /** La guía por la que entró — para agrupar y para el filtro. */
  gtfNumber?: string | null;
  proveedor?: string | null;
  /** Cuándo bajó la pieza del camión (ADR-336). */
  fechaRecepcion?: string | null;
  /** Fecha del asiento de la guía en el libro — NO es la recepción. */
  fechaIngreso?: string | null;
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
  /** Es un pedazo de otra troza (ADR-313). */
  trozaOrigenId?: string | null;
  /** Cuántos pedazos tiene: una madre partida ya no entra entera a la sierra. */
  retrozos?: number;
  /** El pedazo que no sirve: ocupa volumen pero no es producto. */
  descarte?: boolean | null;
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
  madre_retrozada: "Se cortó en pedazos: consumí los pedazos",
  sin_volumen: "Sin volumen registrado",
};

export function estaDisponible(t: TrozaConsumible): boolean {
  return motivoBloqueo(t) === null;
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

const norm = (v: string | null | undefined) =>
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

/** Lo que una guía puede aportar todavía, contra lo que la selección le pide. */
export interface CupoDeGuia {
  woodEntryId: string;
  gtfNumber: string | null;
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
  /**
   * El asiento declara MENOS de lo que suman sus propias piezas cargadas.
   *
   * No es que falte cupo: es que el ingreso está mal declarado y ninguna
   * combinación de piezas va a entrar. Se distingue porque el arreglo es otro —
   * corregir el ingreso, no elegir menos madera.
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
  const porGuia = new Map<string, CupoDeGuia & { piezasCargadas: number }>();
  for (const t of trozas) {
    const previa = porGuia.get(t.woodEntryId);
    const declarado = t.guiaVolumenM3 ?? null;
    const consumido = Number(t.guiaConsumidoM3 ?? 0);
    const fila =
      previa ??
      {
        woodEntryId: t.woodEntryId,
        gtfNumber: t.gtfNumber ?? null,
        especie: t.especieComun ?? null,
        declarado,
        consumido,
        disponible: declarado == null ? null : r4(declarado - consumido),
        pedido: 0,
        exceso: 0,
        descuadrado: false,
        piezasCargadas: 0,
      };
    if (!previa) porGuia.set(t.woodEntryId, fila);
    fila.pedido = r4(fila.pedido + Number(t.volumenM3 ?? 0));
    fila.piezasCargadas += 1;
  }

  return [...porGuia.values()].map((f) => {
    /* Tolerancia de un LITRO: el aserradero mide con cinta y tres decimales de
       redondeo no son un exceso (misma regla que el resto del libro). */
    const exceso = f.disponible == null ? 0 : Math.max(0, r4(f.pedido - f.disponible));
    return {
      woodEntryId: f.woodEntryId,
      gtfNumber: f.gtfNumber,
      especie: f.especie,
      declarado: f.declarado,
      consumido: f.consumido,
      disponible: f.disponible,
      pedido: f.pedido,
      exceso: exceso > 0.001 ? exceso : 0,
      /* Si NADA está consumido y aun así se pasa, el problema no es el cupo: es
         que el asiento declara menos de lo que miden sus piezas. */
      descuadrado: exceso > 0.001 && f.consumido === 0,
    };
  });
}

/** Las guías que no entran, con la frase que explica por qué. */
export function motivosDeCupo(cupos: readonly CupoDeGuia[]): string[] {
  return cupos.filter((c) => c.exceso > 0).map(motivoDeCupo);
}

/**
 * Por qué esta guía no deja consumir, en una frase.
 *
 * Separado del plural porque la pantalla necesita el cupo AL LADO del texto:
 * cuando el problema es que el documento no cuadra, el aviso lleva su propio
 * botón de cuadre y mandar al operador a otra pestaña sobra (ADR-353).
 */
export function motivoDeCupo(c: CupoDeGuia): string {
  if (c.descuadrado) {
    return (
      `La guía ${c.gtfNumber ?? "—"} declara ${fmtM3(c.declarado ?? 0)} m³ de ${c.especie ?? "esa especie"} ` +
      `en su cabecera, pero su lista de trozas suma ${fmtM3(c.pedido)} m³. La guía no cuadra consigo misma: ` +
      `hay que cuadrarla antes de llevar estas piezas a la sierra.`
    );
  }
  return (
    `De la guía ${c.gtfNumber ?? "—"} quedan ${fmtM3(c.disponible ?? 0)} m³ sin consumir ` +
    `(declara ${fmtM3(c.declarado ?? 0)} y ya se consumieron ${fmtM3(c.consumido)}), ` +
    `y estás pidiendo ${fmtM3(c.pedido)} m³. Sacá ${fmtM3(c.exceso)} m³ de esa guía.`
  );
}
