/**
 * bloque-de-lote-consumido — un lote YA consumido llevado a la Distribución de
 * rolliza, para repartir lo que salió y declarar su corrida desde el bloque
 * (ADR-521, Brandon 27-10: «llevar de frente al cubicador en distribución para
 * que se distribuyan en bloque y trabajen directamente mejor»).
 *
 * El lote importado del SNIFFS (ADR-520) queda consumido: sus trozas entraron
 * a UNA corrida abierta (sin producción). La Distribución no podía tomarlo
 * —sus piezas «ya entraron a una corrida»— y la corrida había que buscarla en
 * el Libro por su N°. Acá el bloque ADOPTA esa corrida: un bloque por lote, un
 * día, con la corrida anotada como jornada «abierta». Lo que falta (declarar)
 * lo hace el Recorrido del permiso con la aserrada repartida en el cubicador.
 *
 * Sólo se arma si es inequívoco: el lote consumido, UNA corrida abierta, y esa
 * corrida sin piezas de otro lote (si no, un bloque declararía madera que no
 * es suya). El servidor lo vuelve a mirar todo al declarar
 * (`ForestJornadaBloqueDB.declararJornadaAbierta`).
 *
 * PURO y client-safe: sin DB, sin React y sin `window`.
 */
import { MAX_OBSERVACION_BLOQUE, MAX_TROZAS_POR_BLOQUE, type BloqueRolliza } from "./cubicacion-reparto";
import { medidaDeTroza } from "./medida-cabe-en-troza";
import { permisoDeLasTrozas } from "./panel-lotes-reparto";
import { topeDeclarableM3 } from "./produccion-paquetes";
import type { BloqueSembrable } from "./sembrar-reparto";
import { trozasDelBloque } from "./trozas-para-bloque";

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Una troza del lote como la manda `ForestLoteAserrioDB.list` (Decimal ya en número). */
export interface TrozaDeLoteConsumido {
  id: string;
  codificacion: string | null;
  codigoPlanta: string | null;
  volumenM3: number | null;
  largoM?: number | null;
  d1Cm?: number | null;
  d2Cm?: number | null;
  diametroCm?: number | null;
  permiso?: string | null;
  /** La GTF de ingreso de la troza (`entry.gtfNumber`): va en la observación del bloque. */
  gtfNumber?: string | null;
  /** `null` si sigue libre o si su corrida se anuló (manda el ESTADO de la corrida). */
  consumidaEnId?: string | null;
}

/** Una corrida del lote. `entryDate` llega `Date` del servidor o ISO de la API. */
export interface CorridaDeLoteConsumido {
  id: string;
  lineNo: number;
  entryDate: Date | string;
  quantity: number | null;
  volumeInputM3?: number | null;
  viva: boolean;
}

export interface LoteConsumido {
  id: string;
  code: string;
  status: string;
  speciesCommon: string;
  permiso?: string | null;
  trozas: readonly TrozaDeLoteConsumido[];
  corridas?: readonly CorridaDeLoteConsumido[];
}

export type MotivoNoLlevable =
  | "LOTE_NO_CONSUMIDO"
  | "SIN_CORRIDA_ABIERTA"
  | "VARIAS_CORRIDAS_ABIERTAS"
  | "CORRIDA_CON_OTRAS_PIEZAS"
  | "DEMASIADAS_TROZAS";

/** La corrida que el bloque adopta, con el tope de lo que se le puede declarar. */
export interface CorridaParaDistribucion {
  id: string;
  lineNo: number;
  /** `AAAA-MM-DD`: el día de la corrida, que es el día 1 del bloque. */
  fecha: string;
  /** La materia prima que entró (el denominador del tope). */
  volumenM3: number;
  /** El 56 % de esa materia prima: lo máximo que la jornada puede declarar. */
  topeDeclarableM3: number;
}

export type BloqueParaDistribucion =
  | { ok: true; bloque: BloqueSembrable; corrida: CorridaParaDistribucion }
  | { ok: false; code: MotivoNoLlevable; message: string };

/** `Date` o ISO → `AAAA-MM-DD` (date-only en UTC: el libro guarda mediodía UTC). */
export function diaDeCorrida(f: Date | string | null | undefined): string | null {
  if (!f) return null;
  const iso = typeof f === "string" ? f : Number.isNaN(f.getTime()) ? "" : f.toISOString();
  return /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null;
}

/**
 * «Guía 019-001-0000012» o «Guías 019-001-0000012, 019-001-0000013»: las GTF
 * de las trozas, sin repetir y en orden, para la observación del bloque
 * (Brandon 28-10: «en observación se pondrá su guía a cuál pertenece ese
 * lote»). Si no caben en `tope` caracteres, las que entran + «y N más».
 * `null` si ninguna troza trae guía (un lote de inventario).
 */
export function observacionDeGuias(
  gtfs: readonly (string | null | undefined)[],
  tope: number = MAX_OBSERVACION_BLOQUE,
): string | null {
  const unicas = [...new Set(gtfs.map((g) => (g ?? "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "es", { numeric: true }),
  );
  if (unicas.length === 0) return null;
  const rotulo = unicas.length === 1 ? "Guía" : "Guías";
  const entera = `${rotulo} ${unicas.join(", ")}`;
  if (entera.length <= tope) return entera;
  for (let n = unicas.length - 1; n >= 1; n--) {
    const corta = `${rotulo} ${unicas.slice(0, n).join(", ")} y ${unicas.length - n} más`;
    if (corta.length <= tope) return corta;
  }
  return `${unicas.length} guías`;
}

/** Las corridas vivas y SIN producción que se comieron piezas de este lote, por N°. */
export function abiertasDelLote(lote: Pick<LoteConsumido, "trozas" | "corridas">): CorridaDeLoteConsumido[] {
  const consumio = new Set(lote.trozas.map((t) => t.consumidaEnId).filter((c): c is string => Boolean(c)));
  return (lote.corridas ?? [])
    .filter((c) => c.viva && c.quantity == null && consumio.has(c.id))
    .sort((a, b) => a.lineNo - b.lineNo);
}

/**
 * ¿La corrida consumió EXACTAMENTE las trozas del bloque (en su lote)? Es la
 * marca del bloque que adoptó un lote consumido: sus trozas son las de la
 * corrida, ni una más ni una menos. Las piezas de OTROS lotes no se ven acá
 * (el servidor las cuenta al declarar).
 */
export function corridaEsDelBloqueEntero(
  b: Pick<BloqueRolliza, "trozaIds" | "trozasElegidas">,
  trozasDelLote: readonly Pick<TrozaDeLoteConsumido, "id" | "consumidaEnId">[],
  corridaId: string,
): boolean {
  const ids = new Set(trozasDelBloque(b));
  if (ids.size === 0) return false;
  const suyas = trozasDelLote.filter((t) => t.consumidaEnId === corridaId);
  return suyas.length === ids.size && suyas.every((t) => ids.has(t.id));
}

/**
 * El bloque de la Distribución para un lote consumido, o por qué no se arma.
 * `piezasDeLaCorrida`: TODAS las piezas que consumió la corrida abierta, de
 * cualquier lote (lo lee el servidor); las de otro lote frenan.
 */
export function bloqueDeLoteConsumido(lote: LoteConsumido, piezasDeLaCorrida: readonly string[]): BloqueParaDistribucion {
  const nombre = `El lote ${lote.code}`;
  if (lote.status !== "consumido") {
    return {
      ok: false,
      code: "LOTE_NO_CONSUMIDO",
      message:
        lote.status === "cerrado"
          ? `${nombre} ya está cerrado: su producción está declarada en el Libro y no queda nada que declarar desde la Distribución.`
          : `${nombre} todavía no entró a la sierra: llévalo a la Distribución como lote abierto («Lotes» del cubicador) y registra sus jornadas desde el Recorrido del permiso.`,
    };
  }
  const abiertas = abiertasDelLote(lote);
  if (abiertas.length === 0) {
    const declaradas = (lote.corridas ?? []).filter((c) => c.viva && c.quantity != null);
    return {
      ok: false,
      code: "SIN_CORRIDA_ABIERTA",
      message:
        declaradas.length > 0
          ? `${nombre} ya declaró su producción (corrida N° ${declaradas.map((c) => c.lineNo).join(", ")}): no queda corrida por declarar. Mírala en Consumos del Libro.`
          : `Las trozas del lote ${lote.code} ya no están en una corrida viva (se anuló): vuelve a consumirlo antes de llevarlo a la Distribución.`,
    };
  }
  if (abiertas.length > 1) {
    return {
      ok: false,
      code: "VARIAS_CORRIDAS_ABIERTAS",
      message: `${nombre} tiene ${abiertas.length} corridas sin declarar (N° ${abiertas.map((c) => c.lineNo).join(", ")}): un bloque adopta una sola. Declara cada una desde la tabla del Libro.`,
    };
  }
  const c = abiertas[0]!;
  const suyas = lote.trozas.filter((t) => t.consumidaEnId === c.id);
  const ids = suyas.map((t) => t.id);
  const delLote = new Set(ids);
  const ajenas = piezasDeLaCorrida.filter((id) => !delLote.has(id));
  if (ajenas.length > 0) {
    return {
      ok: false,
      code: "CORRIDA_CON_OTRAS_PIEZAS",
      message: `La corrida N° ${c.lineNo} también consumió ${plural(ajenas.length, "troza de otro lote", "trozas de otros lotes")}: un bloque declara sólo su madera. Declárala desde la tabla del Libro.`,
    };
  }
  if (ids.length > MAX_TROZAS_POR_BLOQUE) {
    return {
      ok: false,
      code: "DEMASIADAS_TROZAS",
      message: `La corrida N° ${c.lineNo} consumió ${ids.length} trozas y un bloque admite hasta ${MAX_TROZAS_POR_BLOQUE}: declárala desde la tabla del Libro.`,
    };
  }

  const rollizaM3 = r4(suyas.reduce((a, t) => a + (Number(t.volumenM3) || 0), 0));
  /* El tope lo mide el servidor contra la materia prima de la CORRIDA: se
     muestra el mismo número que va a usar. */
  const entradaM3 = Number(c.volumeInputM3) > 0 ? r4(Number(c.volumeInputM3)) : rollizaM3;
  const fecha = diaDeCorrida(c.entryDate) ?? "";
  const permiso = lote.permiso?.trim() || permisoDeLasTrozas(suyas);
  const medidas = suyas.map((t) => medidaDeTroza(t)).filter((m): m is NonNullable<typeof m> => m !== null);

  const observacion = observacionDeGuias(suyas.map((t) => t.gtfNumber));
  const bloque: BloqueSembrable = {
    etiqueta: `Lote ${lote.code}`,
    /* La etiqueta sigue siendo el lote; la guía (o guías) de sus trozas va en
       la observación de la fila (28-10). */
    ...(observacion ? { observacion } : {}),
    especie: lote.speciesCommon,
    m3: rollizaM3,
    permiso,
    origen: "lote",
    loteId: lote.id,
    tipo: "rolliza",
    trozaIds: ids,
    /* El bloque ampara justo las trozas de la corrida (paso «Trozas» del
       Recorrido): sin esto el Recorrido pedía elegirlas y no llegaba a declarar. */
    trozasElegidas: [...ids],
    ...(medidas.length > 0 ? { trozasMedidas: medidas } : {}),
    costoM3: null,
    aprovechablePct: null,
    /* Un día: la corrida es una jornada (una troza no se parte entre dos). */
    fecha,
    dias: 1,
    corridaIds: [c.id],
    jornadasLibro: [{ dia: 1, corridaId: c.id, lineNo: c.lineNo, estado: "abierta", fecha }],
  };
  return {
    ok: true,
    bloque,
    corrida: { id: c.id, lineNo: c.lineNo, fecha, volumenM3: entradaM3, topeDeclarableM3: topeDeclarableM3(entradaM3) },
  };
}
