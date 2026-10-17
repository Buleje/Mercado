/**
 * Coherencia de un lote de aserrío consigo mismo: estado y fechas.
 *
 * Nació de un caso medido en `inversiones-agroforestales-blas-sociedad-anonima`
 * (2026-09-27). Cinco lotes de INVENTARIO (sin trozas, `crearInventario`) del
 * 08/09 con su corrida del 01/08 ya declarada:
 *
 *  - Los cinco decían `fechaApertura` 08/09 y `fechaConsumo` 01/08: el lote se
 *    «abrió» 38 días DESPUÉS de entrar a la sierra. `crearInventario` fijaba el
 *    consumo con la fecha del SNIFFS y dejaba la apertura en el `now()` de la
 *    base.
 *  - Tres (13, 15 y 16-2026) quedaron `abierto` con su corrida viva: el menú de
 *    lotes de Consumos reabre de un clic un lote aserrado (ADR-383) y a un lote
 *    de inventario también. Reabierto no tiene trozas que cargar, y si alguna
 *    vez se le cargaran y produjeran, `consumir()` pisaría `produccionEntryId`
 *    —el ÚNICO hilo que lo ata a su corrida— y la corrida de inventario
 *    quedaría suelta del lote.
 *
 * Funciones puras: las usan la DB class (al escribir y al reparar) y los tests.
 */

/**
 * La apertura de un lote nunca es posterior a su consumo: si la madera entró a
 * la sierra el 01/08, el lote existía el 01/08. Cuándo se CARGÓ el registro lo
 * sigue diciendo `createdAt` (y la auditoría), que no se toca.
 *
 * Devuelve la apertura que corresponde; `apertura` tal cual si el consumo no
 * existe o no es anterior.
 */
export function aperturaHasta(apertura: Date, consumo: Date | null | undefined): Date {
  if (!consumo || Number.isNaN(consumo.getTime())) return apertura;
  if (Number.isNaN(apertura.getTime())) return consumo;
  return consumo.getTime() < apertura.getTime() ? consumo : apertura;
}

/**
 * Lo mismo, como parche para el `data` de un `update`: `{}` si no hay nada que
 * mover. Así el campo sólo se escribe cuando cambia —y un llamador (o un test)
 * que no trae `fechaApertura` no recibe una columna de más.
 */
export function aperturaAlConsumir(
  apertura: Date | null | undefined,
  consumo: Date,
): { fechaApertura?: Date } {
  if (!(apertura instanceof Date) || Number.isNaN(apertura.getTime())) return {};
  const nueva = aperturaHasta(apertura, consumo);
  return nueva.getTime() === apertura.getTime() ? {} : { fechaApertura: nueva };
}

/**
 * ¿Su corrida lo ata SÓLO por el puntero? Un lote sin ninguna troza y con
 * `produccionEntryId` es de inventario: no hay `consumidaEnId` que lo vuelva a
 * encontrar (`corridasQueConsumieron` no tiene de dónde más sacarla). Reabrirlo
 * es dejarlo a un `consumir()` de perder su corrida.
 */
export function atadoSoloPorPuntero(l: {
  trozas: number;
  produccionEntryId: string | null;
}): boolean {
  return l.trozas === 0 && Boolean(l.produccionEntryId);
}

export interface LoteParaCoherencia {
  status: string;
  fechaApertura: Date;
  fechaConsumo: Date | null;
  produccionEntryId: string | null;
  /** Cuántas trozas tiene el lote (consumidas o no). */
  trozas: number;
  /** La corrida de `produccionEntryId` existe, no está borrada ni anulada. */
  corridaViva: boolean;
}

export interface ArregloDeLote {
  status?: "consumido";
  fechaApertura?: Date;
  /** Por qué, en palabras, para la auditoría y el reporte. */
  motivos: string[];
}

/**
 * Qué hay que corregir de un lote, o `null` si está bien.
 *
 * Estado: `abierto` + corrida viva + atado sólo por el puntero → `consumido`.
 * Un lote con trozas reabierto (ADR-383) NO entra: ahí `abierto` es el estado
 * que se pidió, esperando la tanda siguiente, y sus corridas siguen visibles
 * por sus piezas. Una corrida anulada tampoco: el lote vuelve a estar libre.
 */
export function arregloDeLote(l: LoteParaCoherencia): ArregloDeLote | null {
  const motivos: string[] = [];
  const arreglo: ArregloDeLote = { motivos };
  if (l.status === "abierto" && l.corridaViva && atadoSoloPorPuntero(l)) {
    arreglo.status = "consumido";
    motivos.push("ya tiene su corrida declarada y no tiene trozas que cargar");
  }
  const apertura = aperturaHasta(l.fechaApertura, l.fechaConsumo);
  if (apertura.getTime() !== l.fechaApertura.getTime()) {
    arreglo.fechaApertura = apertura;
    motivos.push("la apertura no puede ser posterior al consumo");
  }
  return motivos.length > 0 ? arreglo : null;
}
