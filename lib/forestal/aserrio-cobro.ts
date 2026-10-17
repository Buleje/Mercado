/**
 * Cómo se asienta en la cuenta del dueño el aserrío de una corrida (ADR-412 §4).
 *
 * La cotización (`tarifa-aserrio.ts`) dice CUÁNTO; esto decide QUÉ SE ESCRIBE:
 * qué le pasa a la corrida, qué le pasa al cargo en la cuenta corriente y cómo
 * se lee cada cosa. Vive aparte de la DB class para poder probar las decisiones
 * sin base de datos — son las que, si fallan, cobran dos veces o cobran cero.
 *
 * ## Una corrida, un cargo
 *
 * El cargo se identifica por la corrida (`ctpEntryId`), no por el monto ni por
 * la parte: ampliar, cambiar de dueño o de precio actualiza EL MISMO movimiento.
 * Crear uno nuevo en cada cambio dejaría dos deudas por el mismo aserrío.
 *
 * ## Sin precio no hay cargo
 *
 * Una cotización no cobrable no escribe nada, y si había un cargo lo da de baja:
 * dejar vivo el importe viejo diría que se debe algo que ya no se puede
 * explicar. Cargar S/ 0 tampoco — «no te debe nada» es mentira (ADR-322 §3).
 *
 * PURO: sin React, sin fetch, sin Prisma.
 */

import type { Cotizacion, ResultadoCobro } from "./tarifa-aserrio";

/** Qué se hace con el cargo de la corrida en la cuenta corriente. */
export type AccionMovimiento = NonNullable<ResultadoCobro["accion"]>;

/** Lo que tenía el cargo vivo antes de tocarlo: sin esto la auditoría no dice qué se cambió. */
export interface CargoAnterior {
  parteNombre: string;
  monto: number;
}

export function accionSobreMovimiento(cobrable: boolean, hayMovimientoVivo: boolean): AccionMovimiento {
  if (cobrable) return hayMovimientoVivo ? "actualizar" : "crear";
  return hayMovimientoVivo ? "baja" : "nada";
}

/** Lo que responde el servidor cuando se saca a la madera de la cuenta de alguien. */
export const MOTIVO_SIN_DUENO = "La madera no tiene a quién cobrarle.";

/** Lo que cita el cargo para volver al libro — el campo `referencia` existe para eso. */
export function referenciaDeCorrida(lineNo: number | null | undefined): string {
  return lineNo != null ? `Corrida N° ${lineNo}` : "Corrida sin número";
}

/* Precios de hasta 4 decimales sin ceros de relleno: «0.35», «0.3750» → «0.375».
   `toFixed` y no `toLocaleString`: la nota se guarda, y un separador que cambia
   con el locale del servidor la volvería ilegible al leerla desde otro lado. */
const precio = (n: number) => n.toFixed(4).replace(/(\.\d\d\d??)0+$/, "$1");
const soles = (n: number) => n.toFixed(2);

/**
 * La nota del cargo, legible por el dueño de la madera: cuánto, de qué y con
 * qué precio. Es lo que se discute al liquidar — un monto sin el camino no
 * convence a nadie. Tope 500: el del schema del movimiento.
 */
export function notasDelCobro(cotizacion: Cotizacion, especie: string | null | undefined): string {
  const que = [`Aserrío de ${soles(cotizacion.pt)} PT`, especie?.trim() ? `de ${especie.trim()}` : null]
    .filter(Boolean)
    .join(" ");
  const manual = cotizacion.manual ? cotizacion.lineas[0]?.basePt : null;
  const conQue =
    manual != null
      ? `precio a mano S/ ${precio(manual)} por PT`
      : cotizacion.clienteTarifaId
        ? delTratoDelCliente(cotizacion)
        : cotizacion.vigenteDesde
          ? `tarifa del ${cotizacion.vigenteDesde}`
          : null;
  return [que, conQue, ...cotizacion.avisos].filter(Boolean).join(" · ").slice(0, 500);
}

/**
 * «precio del cliente S/ 0.50 por PT (desde 2026-09-01)» — ADR-430. Si parte
 * de la madera salió de la tarifa de la planta, se dicen las dos: el cliente
 * tiene que poder ver por qué una línea no va a su precio.
 */
function delTratoDelCliente(c: Cotizacion): string {
  if (c.versionId) return `precio del cliente + tarifa del ${c.vigenteDesde ?? "—"}`;
  const precios = [...new Set(c.lineas.map((l) => l.precioPt))];
  const cuanto = precios.length === 1 ? ` S/ ${precio(precios[0])} por PT` : "";
  return `precio del cliente${cuanto}${c.vigenteDesde ? ` (desde ${c.vigenteDesde})` : ""}`;
}

/** Una corrida sin paquetes declarada en kg o en unidades: no hay de dónde sacar el PT. */
export const MOTIVO_SIN_PT = "Esta corrida no está en m³: el aserrío se cobra por pie tablar y no se puede calcular.";

/** Por qué no se cargó nada, en la lengua del patio. */
export function motivoSinCobro(cotizacion: Cotizacion, declarada: boolean, sinPt = false): string {
  if (!declarada) return "La corrida todavía no declaró producción: se cobra al declararla.";
  if (sinPt) return MOTIVO_SIN_PT;
  if (cotizacion.lineas.length === 0) return "La corrida no tiene volumen: no hay qué cobrar.";
  return cotizacion.avisos[0] ?? "La tarifa da S/ 0 para esta madera: no se carga un cargo en cero.";
}

/**
 * Lo que se congela en la corrida. Además de la cotización lleva el precio a
 * mano que se pidió: con una corrida sin paquetes ni volumen la cotización no
 * tiene líneas, y sin este campo recotizar al ampliar perdería el trato.
 */
export type DetalleAserrio = Cotizacion & { cotizadoEn: string; precioManualPt: number | null };

/**
 * El precio a mano con el que se cobró, para volver a cobrar igual al ampliar.
 * `null` = se cobró con la tarifa (o el detalle guardado no se entiende, y
 * entonces lo prudente es la tarifa: inventar un trato es peor).
 */
export function precioManualDelDetalle(detalle: unknown): number | null {
  const d = detalle as { manual?: unknown; precioManualPt?: unknown; lineas?: { basePt?: unknown }[] } | null;
  if (!d || typeof d !== "object") return null;
  if (typeof d.precioManualPt === "number" && d.precioManualPt > 0) return d.precioManualPt;
  if (d.manual !== true || !Array.isArray(d.lineas)) return null;
  const base = d.lineas[0]?.basePt;
  return typeof base === "number" && base > 0 ? base : null;
}

/**
 * Con qué precio a mano se cobra AHORA, según lo que pidió la pantalla.
 *
 *  · `undefined` (no vino) = mantener el trato que la corrida ya tiene, si ya
 *    se le cobraba a alguien. Ampliar o cambiar de dueño sin tocar el precio no
 *    puede pasar en silencio de «0.35 a mano» a la tarifa.
 *  · `null` = cobrar con la tarifa.
 *  · número = ese precio a mano.
 */
export function precioManualAUsar(
  pedido: number | null | undefined,
  corrida: { duenoParteId: string | null; aserrioDetalle: unknown },
): number | null {
  if (pedido === undefined) return corrida.duenoParteId ? precioManualDelDetalle(corrida.aserrioDetalle) : null;
  return pedido != null && pedido > 0 ? pedido : null;
}

/** A quién se le cobra, ya resuelto contra lo que la corrida tiene. */
export type DuenoPedido = { accion: "cobrar"; parteId: string } | { accion: "quitar" } | { accion: "nada" };

/**
 * A quién se le cobra, según lo que pidió la pantalla («ausente = mantener»).
 *
 *  · `undefined` (no vino) = el dueño que la corrida ya tiene. Hay pantallas
 *    —producción de lote, declarar desde el SNIFFS— que no lo conocen: si
 *    ausente fuera «quitar», tocar sólo el precio borraría el cargo.
 *  · `null` = dejar de cobrar.
 *  · id = ese dueño.
 *
 * Sin dueño pedido ni dueño en la corrida no hay a quién cobrarle: `nada`.
 */
export function duenoDelPedido(pedido: string | null | undefined, duenoActual: string | null): DuenoPedido {
  if (pedido === null) return { accion: "quitar" };
  const parteId = pedido === undefined ? duenoActual : pedido;
  return parteId ? { accion: "cobrar", parteId } : { accion: "nada" };
}

/**
 * ¿Esta parte puede ser la dueña a la que se cobra? `null` = sí; si no, el motivo.
 *
 * Un dueño NUEVO tiene que estar vivo y activo en el directorio: la pantalla lo
 * muestra «dado de baja», y abrirle una deuda nueva es cobrarle a alguien con
 * quien ya no se trabaja. El MISMO dueño se acepta igual: su deuda es anterior
 * a la baja, y negarse dejaría el cargo contando los paquetes viejos.
 */
export function motivoParteNoAceptable(
  parte: { activo: boolean; deletedAt: Date | string | null } | null,
  mismoDueno: boolean,
): string | null {
  if (!parte) return "Esa parte no está en el directorio: elige otra.";
  if (mismoDueno) return null;
  if (parte.deletedAt != null || !parte.activo) return "Esa parte está dada de baja en el directorio: elige otra.";
  return null;
}

export interface PlanDeCobro {
  corrida: {
    duenoParteId: string;
    aserrioImporte: number | null;
    aserrioDetalle: DetalleAserrio;
    /** Sólo viajan cuando se tocan: en un período cerrado el libro no se reescribe. */
    duenoMadera?: "tercero";
    titularNombre?: string;
  };
  accion: AccionMovimiento;
  /** Lo que se escribe en el cargo cuando se crea o se actualiza. */
  movimiento: { parteId: string; parteNombre: string; monto: number; referencia: string; notas: string } | null;
  motivo: string | null;
}

/**
 * Qué se escribe al cobrarle a `parte` el aserrío de una corrida.
 *
 * El dueño del LIBRO (`duenoMadera`/`titularNombre`) se escribe sólo con el
 * período abierto: un mes cerrado es un acta y el cobro es un dato comercial
 * que no la reabre. Y el titular es acta también — se copia el nombre de la
 * parte cuando no había ninguno o cuando cambió el dueño, pero si ya decía
 * «CC.NN. San Luis» para esta misma parte no se pisa con cómo la escribe hoy
 * el directorio.
 */
export function planDeCobro(i: {
  corrida: {
    lineNo: number | null;
    speciesCommon: string | null;
    titularNombre: string | null;
    duenoParteId: string | null;
    /** `false` = la corrida todavía no dijo qué salió (`quantity` vacío). */
    declarada: boolean;
    /** `true` = declaró en kg o unidades sin paquetes (`corridaSinPt`): no hay PT. */
    sinPt?: boolean;
  };
  parte: { id: string; nombre: string };
  cotizacion: Cotizacion;
  precioManualPt: number | null;
  hayMovimientoVivo: boolean;
  periodoCerrado: boolean;
  /** ISO — se pasa para que el plan sea reproducible en un test. */
  ahora: string;
}): PlanDeCobro {
  const { cotizacion } = i;
  const accion = accionSobreMovimiento(cotizacion.cobrable, i.hayMovimientoVivo);

  const acta: Pick<PlanDeCobro["corrida"], "duenoMadera" | "titularNombre"> = {};
  if (!i.periodoCerrado) {
    acta.duenoMadera = "tercero";
    const titular = (i.corrida.titularNombre ?? "").trim();
    if (!titular || i.corrida.duenoParteId !== i.parte.id) acta.titularNombre = i.parte.nombre.trim();
  }

  return {
    corrida: {
      duenoParteId: i.parte.id,
      aserrioImporte: cotizacion.cobrable ? cotizacion.importe : null,
      aserrioDetalle: {
        ...cotizacion,
        cotizadoEn: i.ahora,
        precioManualPt: cotizacion.manual ? i.precioManualPt : null,
      },
      ...acta,
    },
    accion,
    movimiento: cotizacion.cobrable
      ? {
          parteId: i.parte.id,
          parteNombre: i.parte.nombre.trim(),
          monto: cotizacion.importe,
          referencia: referenciaDeCorrida(i.corrida.lineNo),
          notas: notasDelCobro(cotizacion, i.corrida.speciesCommon),
        }
      : null,
    motivo: cotizacion.cobrable ? null : motivoSinCobro(cotizacion, i.corrida.declarada, i.corrida.sinPt),
  };
}

/**
 * El renglón de auditoría: qué pasó con la plata, dicho entero.
 *
 * `anterior` es el cargo vivo ANTES de tocarlo. Al actualizar o dar de baja se
 * nombra lo que había —el monto y a quién—: pasar el cargo de una parte a otra
 * sin decir de quién era deja la deuda de la primera sin explicar.
 */
export function detalleAuditCobro(
  plan: PlanDeCobro,
  parteNombre: string,
  lineNo: number | null,
  anterior: CargoAnterior | null = null,
  /**
   * El servidor comparó el cargo vivo con el nuevo por `parteId` y monto: es
   * el mismo. Se pasa, no se deduce del nombre — dos partes pueden llamarse
   * igual, y el rastro escondería un cambio de dueño.
   */
  sinCambio = false,
): string {
  const ref = referenciaDeCorrida(lineNo);
  const m = plan.movimiento;
  const antes = anterior ? `S/ ${soles(anterior.monto)} a ${anterior.parteNombre}` : null;
  switch (plan.accion) {
    case "crear":
      return `Cargó S/ ${soles(m?.monto ?? 0)} de aserrío a ${parteNombre} por la ${ref} (${m?.notas ?? ""})`;
    case "actualizar":
      if (sinCambio && m) {
        /* Un reintento o dos pedidos a la vez: no se recalculó nada, se revisó. */
        return `Revisó el cargo de aserrío de la ${ref}: sigue en S/ ${soles(m.monto)} a ${parteNombre}, sin cambios`;
      }
      return (
        `Recalculó el cargo de aserrío de la ${ref}: ` +
        `${antes ? `de ${antes} → ` : ""}S/ ${soles(m?.monto ?? 0)} a ${parteNombre} (${m?.notas ?? ""})`
      );
    case "baja":
      return `Dio de baja el cargo de aserrío de la ${ref} (${antes ?? `a ${parteNombre}`}): ${plan.motivo ?? "sin precio"}`;
    default:
      return `Anotó a ${parteNombre} como dueño de la madera de la ${ref}, sin cargo: ${plan.motivo ?? "sin precio"}`;
  }
}

// ── La corrida y la cuenta cuentan la misma historia ─────────────────────────

/**
 * ¿Una corrección del dueño en el libro obliga a dejar de cobrar?
 *
 * Sí cuando se escribió el dueño y ya no dice «de tercero»: madera del centro
 * no le debe aserrío a nadie, y dejar el cargo vivo haría que la corrida diga
 * «propia» mientras la cuenta de otro sigue debiendo por ella. Si sigue siendo
 * de tercero no se toca nada: cambiar a quién se le cobra es `cobrar_aserrio`,
 * no un campo del libro.
 */
export function debeDejarDeCobrar(i: {
  /** El write tocó `duenoMadera`: corregir sólo el titular no decide nada. */
  escribioDueno: boolean;
  duenoMadera: string | null | undefined;
  duenoParteId: string | null | undefined;
}): boolean {
  return i.escribioDueno && Boolean(i.duenoParteId) && i.duenoMadera !== "tercero";
}

export const MOTIVO_TITULAR_COBRADO = "El dueño de una madera que se cobra se cambia con “Cobrar aserrío”";

/**
 * ¿El titular del libro está atado al cobro?
 *
 * Sí mientras la corrida se le cobre a alguien y lo siga haciendo después de
 * esta corrección: escribir otro titular a mano dejaría al libro nombrando a
 * uno y a la cuenta cobrándole a otro. Se libera cuando la misma corrección
 * saca a la madera de «de tercero», porque eso suelta el cobro.
 *
 * `duenoMadera` es el dueño como queda DESPUÉS de la corrección.
 */
export function titularBloqueadoPorCobro(i: {
  escribioDueno: boolean;
  duenoMadera: string | null | undefined;
  duenoParteId: string | null | undefined;
}): boolean {
  return Boolean(i.duenoParteId) && !debeDejarDeCobrar(i);
}

/** «Corrida N° 7» → 7. Lo que el cargo cita cuando la corrida ya no se puede leer. */
export function lineNoDeReferencia(referencia: string | null | undefined): number | null {
  const m = /N°\s*(\d+)/.exec(referencia ?? "");
  return m ? Number(m[1]) : null;
}

export function mensajeCargoDeCorrida(lineNo: number | null | undefined): string {
  const de = lineNo != null ? `la corrida N° ${lineNo}` : "una corrida";
  return `Este cargo sale de ${de}: se corrige desde la corrida, con “Cobrar aserrío”.`;
}

/**
 * ¿Este movimiento se corrige SÓLO desde su corrida?
 *
 * Mientras la corrida está viva, sí: editarlo o borrarlo desde la cuenta
 * dejaría a la corrida diciendo un importe y a la cuenta otro, y la próxima
 * ampliación lo volvería a crear. Si la corrida ya se anuló o se borró, no:
 * su cargo debió caer con ella, y si quedó vivo la corrida ya no puede
 * corregirlo — bloquearlo en la cuenta lo dejaría huérfano para siempre.
 */
export function cargoSeCorrigeDesdeLaCorrida(
  mov: { ctpEntryId: string | null | undefined },
  corrida: { status: string; deletedAt: Date | string | null } | null,
): boolean {
  return Boolean(mov.ctpEntryId) && corrida != null && corrida.deletedAt == null && corrida.status === "registrado";
}

// ── Cobrar en tanda ──────────────────────────────────────────────────────────

/** Lo que vuelve por cada corrida de una tanda. */
export interface ResultadoDeTanda {
  id: string;
  lineNo: number | null;
  cobrado: boolean;
  importe: number | null;
  parteNombre: string | null;
  motivo: string | null;
  /** Qué se hizo con el cargo, como en `ResultadoCobro`. */
  accion?: AccionMovimiento;
  /** El monto del cargo vivo que se dio de baja. */
  importeDadoDeBaja?: number | null;
  /** El monto del cargo vivo ANTES de tocarlo (`null` = no había). */
  importeAnterior?: number | null;
  /**
   * Se «actualizó» al mismo importe y a la misma parte: la corrida ya estaba
   * cobrada así. Sigue `cobrado` (tiene su cargo), pero no es un cobro nuevo.
   */
  sinCambio?: boolean;
}

export interface ResumenDeTanda {
  /** Cobros de verdad: cargos nuevos o que cambiaron. */
  cobradas: number;
  importeTotal: number;
  /**
   * Ya estaban cobradas al mismo importe (un reintento, dos pedidos a la vez):
   * no se cuentan como cobradas ni suman — 8 POST del mismo arreglo dejaban 8
   * renglones «1 cobrada(s) por S/ 53.37» de un solo cargo.
   */
  sinCambio: number;
  sinCobrar: number;
  /**
   * Cargos vivos que la tanda dio de baja, y cuánto sumaban. Van aparte de
   * `sinCobrar`: una corrida que nunca debió nada y una a la que se le borró
   * la deuda vuelven las dos «sin cobrar».
   */
  dadasDeBaja: number;
  importeDadoDeBaja: number;
}

/** Las corridas que no llegaron a empezar antes del tope de tiempo. */
export const MOTIVO_TANDA_SIN_TIEMPO = "No alcanzó el tiempo para esta corrida: vuelve a cobrarla en otra tanda.";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** El resumen se suma de los resultados, nunca se lleva aparte: dos cuentas se desincronizan. */
export function resumirTanda(resultados: readonly ResultadoDeTanda[]): ResumenDeTanda {
  const cobradas = resultados.filter((r) => r.cobrado && !r.sinCambio);
  const iguales = resultados.filter((r) => r.cobrado && r.sinCambio);
  const bajas = resultados.filter((r) => r.accion === "baja");
  return {
    cobradas: cobradas.length,
    importeTotal: r2(cobradas.reduce((a, r) => a + (r.importe ?? 0), 0)),
    sinCambio: iguales.length,
    sinCobrar: resultados.length - cobradas.length - iguales.length,
    dadasDeBaja: bajas.length,
    importeDadoDeBaja: r2(bajas.reduce((a, r) => a + (r.importeDadoDeBaja ?? 0), 0)),
  };
}

/* Hasta 20 por su N°: más que eso no se va a revisar de a una desde el log. */
const cuales = (rs: readonly ResultadoDeTanda[]) =>
  rs
    .slice(0, 20)
    .map((r) => (r.lineNo != null ? `N° ${r.lineNo}` : r.id))
    .join(", ") + (rs.length > 20 ? ", …" : "");

/**
 * El renglón resumen de la auditoría. Nombra a quién se le cobró, cuáles
 * quedaron sin cobrar y cuáles perdieron su cargo (hasta 20), porque «3 sin
 * cobrar» sin decir cuáles no se puede ir a revisar.
 */
export function detalleAuditTanda(resultados: readonly ResultadoDeTanda[], resumen: ResumenDeTanda): string {
  const partes = [
    ...new Set(resultados.filter((r) => r.cobrado && !r.sinCambio && r.parteNombre).map((r) => r.parteNombre as string)),
  ];
  const sinCobrar = resultados.filter((r) => !r.cobrado);
  const iguales = resultados.filter((r) => r.cobrado && r.sinCambio);
  const bajas = resultados.filter((r) => r.accion === "baja");
  return (
    `Cobró el aserrío en tanda: ${resultados.length} corrida(s) · ${resumen.cobradas} cobrada(s) por S/ ${resumen.importeTotal.toFixed(2)}` +
    (partes.length > 0 ? ` a ${partes.join(", ")}` : "") +
    (iguales.length > 0 ? ` · ${iguales.length} ya cobrada(s) sin cambio (${cuales(iguales)})` : "") +
    ` · ${resumen.sinCobrar} sin cobrar` +
    (sinCobrar.length > 0 ? ` (${cuales(sinCobrar)})` : "") +
    (resumen.dadasDeBaja > 0
      ? ` · ${resumen.dadasDeBaja} cargo(s) dado(s) de baja por S/ ${resumen.importeDadoDeBaja.toFixed(2)} (${cuales(bajas)})`
      : "")
  );
}
