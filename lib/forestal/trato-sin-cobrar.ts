/**
 * Corridas que el trato de un cliente debería cobrar y no cobró (ADR-430 §vigencia).
 *
 * Caso real (Blas, 23-09 03:33 Lima): Brandon creó al cliente WASACO con trato
 * global S/ 0,50 por PT **vigente desde el 14/09** y, 33 s después, declaró 6
 * corridas **del 07/09** con WASACO de dueño. El trato no regía ese día y la
 * planta no tiene tarifa: «sin precio», 0 cargos, 3 238,90 PT sin cobrar. No es
 * un error del cálculo — es la vigencia — y en ninguna pantalla se veía.
 *
 * Pidió (23-09): un aviso con arreglo de un clic, «Empezar el trato el 07/09»,
 * con la fecha de la corrida más vieja sin cobrar, que mueva la vigencia de esa
 * versión y recotice por el MISMO camino que ya usa la app (`cobrarCorrida`).
 *
 * Dos formas de quedar sin cobrar, un solo arreglo:
 *  · **antes del trato**: la corrida es anterior a la versión MÁS VIEJA del
 *    trato. Se adelanta esa versión. Si una versión anterior ya cubría esa
 *    fecha, la corrida no está acá: nunca se pisa una versión que ya regía.
 *  · **con el trato ya vigente**: la corrida se declaró y DESPUÉS se pactó (o
 *    se corrigió la fecha en el formulario). Guardar un trato no recotiza lo ya
 *    declarado, así que quedó sin cargo. Sólo hay que cobrarla. Es también lo
 *    que queda si un arreglo se corta a mitad: el reintento lo encuentra.
 *
 * Y lo que el adelanto CAMBIA sin que se vea: una corrida de ese cliente dentro
 * de la ventana que se mueve, cobrada con la tarifa de la planta, pasa al trato
 * (decisión 1 de ADR-430: el trato reemplaza a la planta). Se dice antes del
 * clic, con el antes y el después.
 *
 * PURO y client-safe: el servidor arma la propuesta con esto y la pantalla la
 * muestra tal cual — los importes los calcula el servidor con `cotizarAserrio`.
 */
import { z } from "zod";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { ResultadoDeTanda, ResumenDeTanda } from "./aserrio-cobro";
import { etiquetaCorta, etiquetaLarga } from "./semana-de-registro";
import {
  diaDelCalendario,
  tarifaVigente,
  type GrupoEspecies,
  type ServicioPrecio,
  type TarifaCliente,
} from "./precio-cliente";
import { cotizarAserrio, type BloqueACobrar } from "./tarifa-aserrio";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** «2025-01-10» → «10/01/2025»: los mensajes los lee el aserradero, no la base. */
const fechaCorta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Menos de medio céntimo no es una diferencia: es redondeo. */
const TOLERANCIA_SOLES = 0.005;

/** Una corrida de producción del cliente, ya evaluada por el servidor. */
export interface CorridaDelTrato {
  id: string;
  lineNo: number | null;
  /** `AAAA-MM-DD`, la fecha del asiento. */
  fecha: string;
  especie: string | null;
  /** Lo que se le cargó hoy (`aserrioImporte`). `null` = sin cargo. */
  importeActual: number | null;
  /** Se cobró con un precio puesto a mano: el trato no la toca. */
  manual: boolean;
  /** PT de la corrida según la cotización. */
  pt: number;
  /**
   * Lo que da `cotizarAserrio` con el trato que la cubriría (`tratoParaCotizar`)
   * y la tarifa de la planta de su fecha, sin precio a mano. `null` o 0 = el
   * trato no la cubre y no hay con qué cobrarla.
   */
  importeConTrato: number | null;
  /**
   * Con qué versión del trato se cobró lo que tiene hoy (el `clienteTarifaId`
   * de su cotización guardada). `null`/ausente = con la tarifa de la planta.
   * Decide si una ya cobrada DENTRO del trato tiene que pasar a él.
   */
  cobradaConTrato?: string | null;
}

/**
 * El `clienteTarifaId` de la cotización guardada en `aserrioDetalle`, o `null`
 * (se cobró con la planta, a mano, o antes de que existieran los tratos).
 */
export function tratoDelDetalle(detalle: unknown): string | null {
  if (!detalle || typeof detalle !== "object") return null;
  const id = (detalle as { clienteTarifaId?: unknown }).clienteTarifaId;
  return typeof id === "string" && id ? id : null;
}

/**
 * ¿El trato pone precio a ALGO de esta madera? Con la misma cotización que
 * cobra (sin la planta: sólo importa si alguna línea sale del trato). Un trato
 * sólo por especie que no nombra la que se declara no la cobraría: adelantarlo
 * por ella no sirve. Sin bloques todavía no se sabe qué se declara: sí.
 */
export function tratoCubre(
  tarifa: TarifaCliente,
  bloques: readonly BloqueACobrar[],
  grupos: readonly GrupoEspecies[],
): boolean {
  if (bloques.length === 0) return true;
  return cotizarAserrio(null, bloques, { cliente: tarifa, grupos }).clienteTarifaId != null;
}

/** La versión MÁS VIEJA del trato de ese servicio: la única que se puede adelantar. */
export function primeraVersion(
  tratos: readonly TarifaCliente[],
  servicio: ServicioPrecio = "aserrio",
): TarifaCliente | null {
  let primera: TarifaCliente | null = null;
  for (const t of tratos) {
    if (t.servicio !== servicio) continue;
    if (!primera || t.vigenteDesde < primera.vigenteDesde) primera = t;
  }
  return primera;
}

/**
 * Con qué versión se cotiza una corrida para saber qué cobraría el trato: la que
 * rige ese día, o —si la corrida es anterior a todo el trato— la más vieja,
 * que es la que el arreglo adelantaría. `antes: true` marca ese segundo caso.
 */
export function tratoParaCotizar(
  tratos: readonly TarifaCliente[],
  fecha: string,
  servicio: ServicioPrecio = "aserrio",
): { tarifa: TarifaCliente; antes: boolean } | null {
  const vigente = tarifaVigente(tratos, servicio, fecha);
  if (vigente) return { tarifa: vigente, antes: false };
  const primera = primeraVersion(tratos, servicio);
  return primera && fecha.slice(0, 10) < primera.vigenteDesde ? { tarifa: primera, antes: true } : null;
}

/** Una corrida tal como la muestra el aviso. */
export type CorridaAvisada = Pick<CorridaDelTrato, "id" | "lineNo" | "fecha" | "especie" | "pt" | "importeActual"> & {
  importeConTrato: number;
};

export interface ArregloDelTrato {
  parteId: string;
  servicio: "aserrio";
  /**
   * Adelantar el trato: la versión más vieja (`tarifaId`, hoy desde
   * `vigenteDesde`) pasa a regir desde `desde` = la corrida más vieja sin
   * cobrar. `null` = el trato ya rige esas fechas, sólo falta cobrarlas.
   */
  mover: { tarifaId: string; vigenteDesde: string; desde: string } | null;
  /** Desde qué día cubre el trato DESPUÉS del arreglo (`mover.desde` o el inicio de hoy). */
  corte: string;
  /** Las corridas sin cargo que el arreglo cobra, de la más vieja a la más nueva. */
  sinCobrar: CorridaAvisada[];
  /** Cuántas de `sinCobrar` son anteriores al trato (las que obligan a adelantarlo). */
  antesDelTrato: number;
  /**
   * Sin cobrar y más viejas que la fecha PEDIDA: el adelanto no las alcanza y
   * siguen sin precio. Siempre 0 cuando la fecha la propone esta función.
   */
  quedanAntes: number;
  /**
   * Cobradas con la tarifa de la planta que el trato cubre después del
   * arreglo: las de la ventana que se adelanta y las que ya estaban dentro
   * (un arreglo cortado a mitad, un trato pactado después de cobrarlas).
   * Pasan al trato: decisión 1 de ADR-430.
   */
  cambian: CorridaAvisada[];
  /** PT de las sin cobrar. */
  pt: number;
  /** S/ que se cargan por las sin cobrar. */
  importe: number;
  /** S/ que cambian las que ya estaban cobradas (después − antes; puede ser negativo). */
  diferencia: number;
}

const porFecha = (a: CorridaAvisada, b: CorridaAvisada) =>
  a.fecha.localeCompare(b.fecha) || (a.lineNo ?? 0) - (b.lineNo ?? 0);

const cobrable = (c: CorridaDelTrato): c is CorridaDelTrato & { importeConTrato: number } =>
  c.importeConTrato != null && c.importeConTrato > 0;

/**
 * Qué habría que hacer para que el trato cobre lo que le toca, o `null` si no
 * falta nada. Sólo el aserrío: el trato de venta sugiere precios, no carga
 * deuda.
 *
 * `corridas` son las de producción registradas y declaradas cuyo dueño es este
 * cliente; el servidor ya les puso `importeConTrato`.
 *
 * Tres formas de pedirlo, y el POST cobra exactamente lo que esto propone:
 *  · sin opciones (la ficha): se propone adelantar a la corrida más vieja sin cobrar;
 *  · `desde` (la línea del trato, con la fecha de la producción o la más vieja
 *    de la tanda): adelantar a ESA fecha;
 *  · `sinMover` (un POST sin `desde`): el trato no se mueve y sólo entra lo que
 *    ya cubre. Sin esto, un POST sin fecha mandaba a cobrar corridas ANTERIORES
 *    al trato, que `cobrarCorrida` cotizaba con la planta.
 */
export function proponerArreglo(
  parteId: string,
  tratos: readonly TarifaCliente[],
  corridas: readonly CorridaDelTrato[],
  opts: { desde?: string | null; sinMover?: boolean } = {},
): ArregloDelTrato | null {
  const primera = primeraVersion(tratos, "aserrio");
  if (!primera) return null;
  const pedida = !opts.sinMover && opts.desde ? opts.desde.slice(0, 10) : null;

  const avisada = (c: CorridaDelTrato & { importeConTrato: number }): CorridaAvisada => ({
    id: c.id,
    lineNo: c.lineNo,
    fecha: c.fecha.slice(0, 10),
    especie: c.especie,
    pt: c.pt,
    importeActual: c.importeActual,
    importeConTrato: r2(c.importeConTrato),
  });

  const todas = corridas
    .filter((c): c is CorridaDelTrato & { importeConTrato: number } => !c.manual && c.importeActual == null && cobrable(c))
    /* Una corrida sin trato que la cubra ni antes del trato no entra: el
       arreglo no sabría con qué versión cobrarla. */
    .filter((c) => tratoParaCotizar(tratos, c.fecha.slice(0, 10)) != null)
    .map(avisada)
    .sort(porFecha);

  /* A qué día se adelanta: el pedido (si es anterior al trato) o, sin pedido,
     la corrida más vieja que quedó antes del trato. `null` = no se mueve. */
  const masVieja = todas.find((c) => c.fecha < primera.vigenteDesde)?.fecha ?? null;
  const desde = opts.sinMover
    ? null
    : pedida != null
      ? pedida < primera.vigenteDesde
        ? pedida
        : null
      : masVieja;

  /* Lo que el trato cubre DESPUÉS del arreglo. Con una fecha pedida, lo más
     viejo que ella queda fuera: el trato adelantado tampoco regiría esos días. */
  const corte = desde ?? primera.vigenteDesde;
  const sinCobrar = todas.filter((c) => c.fecha >= corte);
  const quedanAntes = todas.length - sinCobrar.length;
  const antes = sinCobrar.filter((c) => c.fecha < primera.vigenteDesde);

  /* Lo que el arreglo recotiza además: las cobradas con la planta que el trato
     cubre DESPUÉS de arreglar. Las de [desde, inicio del trato) —las que el
     adelanto mete— y las que ya estaban dentro: si un arreglo anterior movió
     el trato y el cobro se cortó a mitad, el reintento las tiene que ver (sin
     esto quedaban con la planta para siempre). Las de a mano no — el precio a
     mano manda —, ni las ya cobradas con el trato: corregir un trato no
     recotiza lo cobrado con él. */
  const cambian = corridas
    .filter((c): c is CorridaDelTrato & { importeConTrato: number } => !c.manual && c.importeActual != null && cobrable(c))
    .filter((c) => {
      const dia = c.fecha.slice(0, 10);
      if (dia < corte) return false;
      return dia < primera.vigenteDesde || c.cobradaConTrato == null;
    })
    .filter((c) => Math.abs(r2(c.importeConTrato) - (c.importeActual ?? 0)) >= TOLERANCIA_SOLES)
    .map(avisada)
    .sort(porFecha);
  /* Con una fecha pedida se responde aunque no haya nada que cobrar si hay
     corridas más viejas que la fecha: la línea tiene que decir que siguen sin precio. */
  if (sinCobrar.length === 0 && cambian.length === 0 && !(pedida && quedanAntes > 0)) return null;

  return {
    parteId,
    servicio: "aserrio",
    mover: desde ? { tarifaId: primera.id, vigenteDesde: primera.vigenteDesde, desde } : null,
    corte,
    sinCobrar,
    antesDelTrato: antes.length,
    quedanAntes,
    cambian,
    pt: r2(sinCobrar.reduce((a, c) => a + c.pt, 0)),
    importe: r2(sinCobrar.reduce((a, c) => a + c.importeConTrato, 0)),
    diferencia: r2(cambian.reduce((a, c) => a + c.importeConTrato - (c.importeActual ?? 0), 0)),
  };
}

/** `GET …/tarifas-cliente/vigencia?parteId=[&desde=]` — el aviso de la ficha y la propuesta de la línea. */
export interface PropuestaDelTrato {
  parteId: string;
  parteNombre: string;
  /** La fecha pedida (`?desde=`), tal cual: la pantalla sabe a qué pedido responde. */
  desde: string | null;
  /** `null` = no falta nada. */
  arreglo: ArregloDelTrato | null;
}

/** `POST …/tarifas-cliente/vigencia` — lo que hizo el arreglo. */
export interface ResultadoDelArreglo {
  parteNombre: string;
  /** El trato se adelantó: rige desde `a` (antes desde `de`). `null` = no se movió. */
  movio: { tarifaId: string; de: string; a: string } | null;
  /** Lo que se mandó a cobrar, con la propuesta que lo explica. */
  arreglo: ArregloDelTrato | null;
  /** Corrida por corrida (`cobrarTanda`). `null` = no había nada que cobrar. */
  cobro: { resultados: ResultadoDeTanda[]; resumen: ResumenDeTanda } | null;
}

/** Los ids que el arreglo manda a cobrar, en el orden del aviso. */
export function idsACobrar(a: Pick<ArregloDelTrato, "sinCobrar" | "cambian">): string[] {
  return [...new Set([...a.sinCobrar, ...a.cambian].map((c) => c.id))];
}

/**
 * Cuerpo de `POST /api/admin/forestal/tarifas-cliente/vigencia`.
 *
 * `desde` + `tarifaId` = adelantar esa versión a ese día (lo que la pantalla
 * vio: si el trato cambió mientras tanto, el servidor responde 409 en vez de
 * mover otra cosa). Sin ellos, sólo se cobra lo que el trato ya cubre.
 */
export const arregloTratoInputSchema = z
  .object({
    parteId: z.string().trim().min(1).max(64),
    tarifaId: z.string().trim().min(1).max(64).nullable().optional(),
    desde: diaDelCalendario.nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (Boolean(v.desde) !== Boolean(v.tarifaId)) {
      ctx.addIssue({ code: "custom", message: "Para adelantar el trato hacen falta la versión y la fecha." });
    }
  });

export type ArregloTratoInput = z.infer<typeof arregloTratoInputSchema>;

/**
 * `GET …/vigencia?parteId=&desde=`. `desde` = la propuesta para adelantar a ESA
 * fecha (la de la línea del trato): lo que se muestra antes del botón es lo
 * que el POST con esa fecha va a cobrar.
 */
export const propuestaTratoQuerySchema = z.object({
  parteId: z.string().trim().min(1, "Falta decir de qué cliente.").max(64),
  desde: diaDelCalendario.nullable().optional(),
});

/** Por qué el servidor no adelanta el trato. El route lo traduce a su estado HTTP. */
export type MotivoNoAdelanta =
  /** No hay trato de aserrío con ese cliente. 404. */
  | "sin_trato"
  /** Esa versión ya no es la más vieja (o no existe): hay otra que ya regía antes. 409. */
  | "otra_version"
  /** La fecha pedida no es anterior al inicio del trato. 422. */
  | "no_es_antes";

/**
 * ¿Se puede adelantar `tarifaId` a `desde`? `null` = sí. Idempotente: si la
 * versión ya empieza ese día (un doble clic, un reintento), no hay nada que
 * mover y tampoco es un error — `yaEmpieza` lo dice.
 */
export function revisarAdelanto(
  tratos: readonly TarifaCliente[],
  tarifaId: string,
  desde: string,
): { motivo: MotivoNoAdelanta; mensaje: string } | { motivo: null; yaEmpieza: boolean; de: string } {
  const primera = primeraVersion(tratos, "aserrio");
  if (!primera) return { motivo: "sin_trato", mensaje: "Ese cliente no tiene trato de aserrío." };
  if (primera.id !== tarifaId) {
    return {
      motivo: "otra_version",
      mensaje: `El trato cambió: ahora empieza el ${fechaCorta(primera.vigenteDesde)}. Vuelve a mirar el aviso.`,
    };
  }
  if (desde === primera.vigenteDesde) return { motivo: null, yaEmpieza: true, de: primera.vigenteDesde };
  if (desde > primera.vigenteDesde) {
    return {
      motivo: "no_es_antes",
      mensaje: `El trato ya rige desde el ${fechaCorta(primera.vigenteDesde)}: sólo se puede adelantar a una fecha anterior.`,
    };
  }
  return { motivo: null, yaEmpieza: false, de: primera.vigenteDesde };
}

// ── Cómo se lee ──────────────────────────────────────────────────────────────

/** «07/09», o «16/12/2024» si no es de este año: un botón no puede ser ambiguo. */
export function diaDelBoton(iso: string, hoy: string): string {
  return iso.slice(0, 4) === hoy.slice(0, 4) ? etiquetaCorta(iso) : `${etiquetaCorta(iso)}/${iso.slice(0, 4)}`;
}

const corridas = (n: number) => `${n} ${n === 1 ? "corrida" : "corridas"}`;

/** «+S/ 20.00» · «−S/ 40.00»: una diferencia lleva su signo, nunca «+S/ -40». */
const firmado = (n: number) => `${n < 0 ? "−" : "+"}${formatCurrency(Math.abs(n))}`;

const minusculaInicial = (t: string) => (t ? t.charAt(0).toLowerCase() + t.slice(1) : t);

/** «del lunes 07/09», o «de antes (del 03/09 al 12/09)» si son de varios días. */
function deCuando(fechas: readonly string[], hoy: string): string {
  const unicas = [...new Set(fechas)].sort();
  if (unicas.length === 0) return "";
  if (unicas.length === 1) return `del ${etiquetaLarga(unicas[0], hoy)}`;
  return `de antes (del ${diaDelBoton(unicas[0], hoy)} al ${diaDelBoton(unicas[unicas.length - 1], hoy)})`;
}

export interface TextoDelAviso {
  /** Qué pasó, en una oración. */
  titulo: string;
  /** Qué hace el botón con la plata. */
  detalle: string;
  boton: string;
}

/**
 * Lo que el arreglo hace con la plata. La ficha (`textoDelAviso`) y la línea
 * del trato (`textoDelAdelanto`) dicen ESTO mismo: cuánto se carga, qué pasa
 * de la planta al trato —con su signo— y qué queda fuera.
 */
export function detalleDelArreglo(a: ArregloDelTrato, hoy: string): string {
  const partes: string[] = [];
  if (a.sinCobrar.length > 0) partes.push(`Con el trato se cargan ${formatCurrency(a.importe)} a su cuenta.`);
  const m = a.cambian.length;
  if (m > 0) {
    partes.push(
      `${m === 1 ? "Una corrida ya cobrada" : `${m} corridas ya cobradas`} con la tarifa de la planta ` +
        `${m === 1 ? "pasa" : "pasan"} al trato: ${firmado(a.diferencia)}.`,
    );
  }
  const q = a.quedanAntes;
  if (q > 0) {
    partes.push(
      `${q === 1 ? "Una corrida" : `${q} corridas`} de antes del ${diaDelBoton(a.corte, hoy)} ` +
        `${q === 1 ? "sigue" : "siguen"} sin precio: el trato no ${q === 1 ? "la" : "las"} alcanza.`,
    );
  }
  return partes.join(" ");
}

/**
 * El aviso en palabras del aserradero. Caso WASACO: «El trato de WASACO empieza
 * el lunes 14/09 y 6 corridas son del lunes 07/09: quedaron sin precio
 * (3 238,90 PT).» · botón «Empezar el trato el 07/09».
 */
export function textoDelAviso(a: ArregloDelTrato, nombre: string, hoy: string): TextoDelAviso {
  const pt = `${formatNumber(a.pt, 2)} PT`;
  const yaDentro = a.sinCobrar.length - a.antesDelTrato;
  const detalle = detalleDelArreglo(a, hoy);

  if (a.mover) {
    const antes = a.sinCobrar.filter((c) => c.fecha < a.mover!.vigenteDesde).map((c) => c.fecha);
    const cuantas = a.antesDelTrato;
    return {
      titulo:
        `El trato de ${nombre} empieza el ${etiquetaLarga(a.mover.vigenteDesde, hoy)}` +
        (cuantas > 0
          ? ` y ${corridas(cuantas)} ${cuantas === 1 ? "es" : "son"} ${deCuando(antes, hoy)}: ` +
            `${cuantas === 1 ? "quedó" : "quedaron"} sin precio (${pt}).`
          : ".") +
        (yaDentro > 0
          ? ` Además, ${corridas(yaDentro)} de cuando ya regía ${yaDentro === 1 ? "quedó" : "quedaron"} sin cobrar.`
          : ""),
      detalle,
      boton: `Empezar el trato el ${diaDelBoton(a.mover.desde, hoy)}`,
    };
  }
  const n = a.sinCobrar.length;
  const m = a.cambian.length;
  if (n === 0) {
    /* Sólo cobradas con la planta que el trato ya cubría (un arreglo cortado a
       mitad, un trato pactado después de cobrarlas). */
    return {
      titulo:
        `${corridas(m)} de ${nombre} ${m === 1 ? "se cobró" : "se cobraron"} con la tarifa de la planta ` +
        `aunque su trato ya regía.`,
      detalle,
      boton: `Pasar ${m === 1 ? "la corrida" : "las corridas"} al trato`,
    };
  }
  return {
    titulo:
      `${corridas(n)} de ${nombre} ${n === 1 ? "quedó" : "quedaron"} sin cobrar aunque su trato ya ` +
      `regía (${pt}): se ${n === 1 ? "declaró" : "declararon"} antes de pactarlo.`,
    detalle,
    boton: `Cobrar ${formatCurrency(a.importe)} con el trato`,
  };
}

/**
 * Lo que la línea del trato dice ANTES del botón «Empezar el trato el …»:
 * qué más cobra el adelanto, con la plata. `a` es la propuesta del servidor
 * para ESA fecha (`GET …?desde=`), la misma que el POST va a cobrar.
 */
export function textoDelAdelanto(a: ArregloDelTrato | null, hoy: string): string {
  if (!a || (a.sinCobrar.length === 0 && a.cambian.length === 0)) {
    return (
      "No hay otras corridas suyas sin cobrar desde ese día: adelantarlo no carga nada más." +
      (a && a.quedanAntes > 0 ? ` ${detalleDelArreglo(a, hoy)}` : "")
    );
  }
  const n = a.sinCobrar.length;
  const detalle = detalleDelArreglo(a, hoy);
  if (n === 0) return `Al adelantarlo, ${minusculaInicial(detalle)}`;
  return (
    `Si lo adelantas, también ${n === 1 ? "entra 1 corrida ya declarada" : `entran ${n} corridas ya declaradas`} ` +
    `(${formatNumber(a.pt, 2)} PT). ${detalle}`
  );
}

/** Lo que el servidor HIZO, separado: lo que no tenía cargo y lo que cambió de importe. */
export interface ResumenDelArreglo {
  /** Corridas que no tenían cargo y ahora sí, y cuánto suman. */
  creadas: number;
  importeCreado: number;
  /** Corridas ya cobradas que cambiaron de importe al pasar al trato, y cuánto cambió (con signo). */
  recotizadas: number;
  diferencia: number;
  /** Las que se mandaron a cobrar y no se pudieron. */
  faltan: number;
  /** Cuánto cambió la deuda en total: puede ser negativo. */
  total: number;
}

/**
 * Desde los resultados del servidor, no desde la propuesta. El importe de antes
 * sale del servidor (`importeAnterior`, leído con el lock); si no vino, del
 * aviso. Una actualización al mismo importe (un reintento, dos pestañas) no
 * es un cobro: no se cuenta.
 */
export function resumenDelResultado(r: ResultadoDelArreglo): ResumenDelArreglo {
  const antes = new Map((r.arreglo?.cambian ?? []).map((c) => [c.id, c.importeActual ?? 0]));
  let creadas = 0;
  let importeCreado = 0;
  let recotizadas = 0;
  let diferencia = 0;
  for (const x of r.cobro?.resultados ?? []) {
    if (!x.cobrado || x.importe == null || x.sinCambio) continue;
    if (x.accion === "crear") {
      creadas += 1;
      importeCreado += x.importe;
      continue;
    }
    const d = x.importe - (x.importeAnterior ?? antes.get(x.id) ?? x.importe);
    if (Math.abs(d) < TOLERANCIA_SOLES) continue;
    recotizadas += 1;
    diferencia += d;
  }
  return {
    creadas,
    importeCreado: r2(importeCreado),
    recotizadas,
    diferencia: r2(diferencia),
    faltan: r.cobro?.resumen.sinCobrar ?? 0,
    total: r2(importeCreado + diferencia),
  };
}

/** Cuánto cambió la deuda con el arreglo (lo creado entero + la diferencia de lo recotizado). */
export function cuantoSubio(r: ResultadoDelArreglo): number {
  return resumenDelResultado(r).total;
}

/**
 * El «Listo» en palabras, compartido por la ficha y la línea. `cobros` = qué
 * se cobró y qué pasó al trato, cada cosa con su signo (`null` = nada nuevo);
 * `cuenta` = cómo quedó la deuda: «subió», «bajó» o «no cambió».
 */
export function textoDelResultado(r: ResultadoDelArreglo): { cobros: string | null; cuenta: string } {
  const s = resumenDelResultado(r);
  const partes: string[] = [];
  if (s.creadas > 0) {
    partes.push(
      s.creadas === 1
        ? `se cobró 1 corrida que había quedado sin precio (${firmado(s.importeCreado)})`
        : `se cobraron ${s.creadas} corridas que habían quedado sin precio (${firmado(s.importeCreado)})`,
    );
  }
  if (s.recotizadas > 0) {
    partes.push(
      `${s.recotizadas === 1 ? "1 corrida ya cobrada con la tarifa de la planta pasó" : `${s.recotizadas} corridas ya cobradas con la tarifa de la planta pasaron`} ` +
        `al trato (${firmado(s.diferencia)})`,
    );
  }
  const cuenta =
    s.total > 0
      ? `la cuenta de ${r.parteNombre} subió ${formatCurrency(s.total)}`
      : s.total < 0
        ? `la cuenta de ${r.parteNombre} bajó ${formatCurrency(-s.total)}`
        : `la cuenta de ${r.parteNombre} no cambió`;
  return { cobros: partes.length > 0 ? partes.join(" y ") : null, cuenta };
}
