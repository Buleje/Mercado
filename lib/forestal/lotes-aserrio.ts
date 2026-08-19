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

export type EstadoLoteAserrio = "abierto" | "consumido" | "cerrado";

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
  /**
   * La corrida que YA se comió esta pieza, o `null` si sigue libre.
   *
   * El endpoint lo manda en `null` cuando esa corrida está anulada o borrada
   * —la madera volvió al patio—, igual que las otras tres lecturas de una troza:
   * lo que bloquea es el ESTADO de la corrida, nunca el id pelado.
   */
  consumidaEnId?: string | null;
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
 * Cuánto rindió el lote: lo que salió de la corrida sobre lo que entró.
 *
 * Sólo cuando la corrida declaró en m³. Convertir pie tablar a m³ para poder
 * mostrar un porcentaje sería inventar el dato — es la misma regla que aplica
 * la vista de Consumos con `corridasOtraUnidad`.
 */
export function rendimientoLote(lote: LoteAserrio): number | null {
  const c = lote.produccion;
  if (!c || !c.viva) return null;
  if (c.unit !== "m3") return null;
  const producido = Number(c.quantity ?? 0);
  if (!(producido > 0) || !(lote.volumenM3 > 0)) return null;
  return Math.round((producido / lote.volumenM3) * 1000) / 10;
}

/** El veredicto del rendimiento — el MISMO que usa Consumos, no otro criterio. */
export const juzgarRendimientoLote = juzgarRendimientoConsumo;

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

export interface FiltroLotes {
  texto?: string;
  especie?: string;
  /** `""` o ausente = todos los estados. */
  estado?: EstadoLoteAserrio | "";
}

/** El texto busca por código, especie, nota Y código de pieza: se tipea lo que se tiene delante. */
export function filtrarLotes(lotes: readonly LoteAserrio[], f: FiltroLotes): LoteAserrio[] {
  const texto = norm(f.texto);
  const especie = norm(f.especie);
  return lotes.filter((l) => {
    if (f.estado && l.status !== f.estado) return false;
    if (especie && norm(l.speciesCommon) !== especie) return false;
    if (texto) {
      const campos = [l.code, l.speciesCommon, l.speciesScientific, l.notes];
      const enCampos = campos.some((c) => norm(c).includes(texto));
      const enPiezas = l.trozas.some(
        (t) => norm(t.codificacion).includes(texto) || norm(t.codigoPlanta).includes(texto),
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
