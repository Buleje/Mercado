/**
 * forest-ctp-consumo.db — atribución N:M de materia prima a las líneas del
 * Libro CTP, y el costeo que se deriva de ella (ADR-134).
 *
 * POR QUÉ ESTE ARCHIVO EXISTE, Y POR QUÉ LAS VALIDACIONES VIVEN ACÁ:
 * el ensayo de la migración probó empíricamente que Postgres acepta un consumo
 * cross-tenant y acepta consumir 999.999 m³ de un ingreso de 8.45. El aislamiento
 * de Buleje es app-level (no RLS) y las invariantes I1/I2 son agregadas — un
 * CHECK de Postgres no puede expresarlas. Si no se aplican acá, no se aplican en
 * ningún lado. Ver ADR-134 D3/D7.
 *
 *   I1 · Σ consumos(línea)   ≤ ForestCtpEntry.volumeInputM3   (coherencia)
 *   I2 · Σ consumos(ingreso) ≤ WoodEntry.volumeM3             (CRÍTICO: un
 *        ingreso consumido dos veces es el patrón de blanqueo que fiscaliza
 *        SERFOR — legitimar madera sin origen contra una guía real)
 *
 * Ambas son `≤`, no `==`: exigir atribución total obligaría al operador a
 * inventar un origen para poder guardar, o sea la regla fabricaría el fraude
 * que intenta prevenir. El faltante se reporta como `sinAtribuirM3`, explícito.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { auditCtp, auditCtpEsperando, m3 } from "@/lib/forestal/ctp-audit";
import { ForestCtpCierreDB } from "./forest-ctp-cierre.db";
import { closedPeriodOf, type CtpCierrePeriodo } from "@/lib/forestal/ctp-cierre-types";
import {
  diaDelLibro,
  mensajeEntroDespues,
  trozasQueEntraronDespues,
} from "@/lib/forestal/recepcion-antes-de-la-sierra";
import { claveDeLaGuia, filaDeEspecie } from "@/lib/forestal/acomodar-trozas";
import { fraseTrozasEnOtraFila } from "@/lib/forestal/consumo-trozas";

const CACHE_PREFIX = "forest-ctp";

/** Redondeo a 4 decimales — precisión forestal (m³). */
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Timeout de las transacciones del libro. El default de Prisma para
 * transacciones interactivas es **5s**, y estos guards hacen ~6 round-trips
 * dentro de la tx (lock FOR UPDATE + findMany + groupBy + delete + createMany +
 * findMany). Contra un pooler remoto eso pasa los 5s con datos reales: visto
 * 2026-07-15 con "A commit cannot be executed on an expired transaction ...
 * 5253 ms passed".
 *
 * No se puede achicar el trabajo sin perder la garantía: los round-trips SON la
 * validación (leer el saldo bajo lock y escribir en el mismo instante). Así que
 * se le da margen. `maxWait` cubre la espera por una conexión del pool cuando
 * hay varias transacciones peleando por las mismas filas.
 */
export const CTP_TX_OPTS = { timeout: 20_000, maxWait: 10_000 } as const;

/**
 * Un consumo sólo "cuenta" si su LÍNEA sigue viva (registrada y no borrada).
 *
 * SINGLE SOURCE — sin esto, el consumo de una línea anulada/borrada seguía
 * comiendo el ingreso para siempre: `saldos()` (que filtra por el estado de la
 * línea) decía "5.2 m³ libres" mientras I2 y `availableSource()` (que agregaban
 * sobre ForestCtpConsumo sin mirar al padre) decían "no queda nada", del mismo
 * ingreso y en el mismo momento. Dos capas dando números distintos del mismo
 * hecho ⇒ era bug, no política. Anular una corrida secuestraba su materia prima.
 *
 * El soft-delete NO dispara el `onDelete: Cascade` del FK (eso es sólo para
 * borrado físico), así que el filtro tiene que ser explícito acá.
 * Encontrado 2026-07-15 al planear ADR-135.
 */
export const CONSUMO_VIGENTE = {
  ctpEntry: { deletedAt: null, status: "registrado" },
} as const;
/** Redondeo a 2 decimales — plata. */
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface ConsumoInput {
  woodEntryId: string;
  volumeM3: number | string;
}

/** Un consumo como lo devuelve `setConsumos`: con la guía y la especie del ingreso. */
export type ConsumoConGuia = Prisma.ForestCtpConsumoGetPayload<{
  include: { woodEntry: { select: { gtfNumber: true; speciesCommonName: true } } };
}>;

/** Lo que `setConsumosEnTx` escribió, y el renglón que `despuesDeConsumos` narra tras el commit. */
export interface ConsumosEscritos {
  consumos: ConsumoConGuia[];
  auditoria: string;
}

/** Error de invariante: el caller lo mapea a 422, no a 500. */
export class CtpInvariantError extends Error {
  constructor(
    message: string,
    readonly code: // ── Entrada: ingreso → producción (ADR-134) ──
      | "I1_SOBRE_ATRIBUCION"
      | "I2_SOBRE_CONSUMO"
      /** Dato del usuario que no cuadra fuera de un invariante numérico (ADR-395). */
      | "VALIDACION"
      /** Una foto de la carga que no se puede guardar: sin firma del servidor,
       *  datos cambiados después de subirla, o ya usada en otra guía. Va 400. */
      | "FOTO_NO_VALIDA"
      /**
       * La materia prima propuesta no alcanza para lo que la corrida declara
       * (ADR-417). Se rechaza en vez de vincular de a poco: `sumar-corrida`
       * admite una sola pasada, así que una vinculación corta queda imposible
       * de completar después.
       */
      | "VOLUMEN_INSUFICIENTE"
      /** Despachar producto que no se produjo — el acta, agregado por producto. */
      | "I3_SOBRE_DESPACHO"
      // ── Salida: producción → despacho (ADR-135) ──
      /** Atribuir a corridas más de lo que el despacho declara (≅ I1). */
      | "I4_SOBRE_ATRIBUCION_DESPACHO"
      /** Una corrida despachada dos veces (≅ I2). Lo que I3 no puede ver. */
      | "I5_SOBRE_SALIDA_PRODUCCION"
      /** El paquete ya viaja en otra guía viva (borrador o emitida). Un bulto
       *  físico sube a un solo camión: se anula esa guía antes de volver a
       *  usarlo (ADR-444). Va 409: choca con un despacho que ya existe. */
      | "PAQUETE_YA_DESPACHADO"
      | "TENANT_MISMATCH"
      | "CONGELADO"
      /** Se quiso corregir un ingreso que ya no está pendiente: ahí el camino
       *  es anular con motivo y registrar de nuevo (queda el rastro). */
      | "ESTADO_NO_EDITABLE"
      /** La guía de un asiento cambió entre la lectura y el candado de la
       *  plata de la guía (`ForestCuentaDB.bloquearGuiasEnTx`): no se toma un
       *  segundo candado fuera de orden (40P01), se pide reintentar. Va 409. */
      | "CAMBIO_DE_GUIA"
      // ── Cierre de período fiscal (ADR-139) ──
      /** La línea cae en un mes cerrado: el acta es inmutable hasta reabrir. */
      | "PERIODO_CERRADO"
      // ── Alta desde SERFOR (ADR-312) ──
      /** La guía ya está en el libro: se corrige anulando y recargando, no
       *  registrándola dos veces (dejaría el saldo duplicado). */
      | "GTF_DUPLICADA"
      // ── Lista de trozas (ADR-320) ──
      /** El agregado de piezas pasaría el tope por ingreso. Casi siempre es un
       *  pegado accidental, no una guía de mil trozas. */
      | "TOPE_TROZAS"
      // ── Paquetes de producción (ADR-349) ──
      /** Los paquetes no suman lo que declara la corrida: la misma cantidad
       *  contada de dos maneras da distinto y no se puede saber cuál vale. */
      | "PAQUETES_NO_CUADRAN"
      /** Dos paquetes con el mismo código: es lo que se busca en la pila y lo
       *  que se cita en la guía de salida — no puede repetirse. */
      | "PAQUETE_DUPLICADO"
      // ── Código de planta (ADR-336) ──
      /** Dos piezas con la misma marca pintada: el patio no las distingue y el
       *  inventario deja de probar nada. Se rechaza antes de escribir. */
      | "CODIGO_PLANTA_DUPLICADO"
      // ── Lote de aserrío (ADR-334) ──
      /** El lote necesita una especie: la sierra se calibra por especie. */
      | "LOTE_SIN_ESPECIE"
      /** Se pidió un lote que no existe (o ya se deshizo). */
      | "LOTE_NO_ENCONTRADO"
      /** El lote ya se consumió: sus piezas entraron a la sierra y no se mueven. */
      | "LOTE_NO_EDITABLE"
      /** El lote de inventario (`crearInventario`) no trae un volumen o un
       *  paquete válido: no hay trozas reales que puedan contradecirlo después. */
      | "LOTE_INVENTARIO_INVALIDO"
      /** El código de lote pedido a mano ya lo tiene otro lote del tenant. */
      | "LOTE_CODIGO_DUPLICADO"
      /** Deshacer un lote cuya corrida ya tiene despacho/reproceso: hace falta
       *  `forzar` explícito — no es un error normal, es una confirmación. */
      | "LOTE_CON_SALIDA_REGISTRADA"
      /** Falta el motivo de una acción que lo exige (ej. marcar "ya usado"). */
      | "MOTIVO_REQUERIDO"
      // ── Retrozado (ADR-313) ──
      /** De una troza no salen pedazos más grandes que ella, ni más volumen del
       *  que tiene. Es física, no una preferencia de negocio. */
      | "R1_SOBRE_RETROZADO"
      /** Revisión ADR-450: la madre no llegó, ya se aserró o despachó, o es
       *  descarte — sus pedazos serían madera que no está en el patio. 409. */
      | "TROZA_NO_RETROZABLE"
      // ── Reproceso (ADR-316) ──
      /** No se reprocesa más de lo que la corrida tiene disponible, contando
       *  lo ya despachado Y lo ya reprocesado. */
      | "I6_SOBRE_REPROCESO"
      // ── Consumo por troza (ADR-326) ──
      /** La pieza no puede entrar a la sierra: ya la comió otra corrida, no
       *  llegó al patio, es descarte, o se partió en pedazos (van los pedazos). */
      | "T1_TROZA_NO_CONSUMIBLE"
      /** T3 (ADR-433): la troza entró al patio DESPUÉS de la fecha de la
       *  corrida. El libro diría que se aserró madera que todavía no llegó. */
      | "T3_ASERRADA_ANTES_DE_LLEGAR"
      /** ADR-447: el lote (o la guía de la troza) es de OTRO título
       *  habilitante que la corrida. Vincularla diría que la madera de un
       *  permiso salió de otro: el saldo de los dos queda mal ante SERFOR. */
      | "PERMISO_DISTINTO"
      /** ADR-434 §Vencimiento: la llegada cae después del vencimiento de la
       *  guía y nadie lo confirmó con motivo. No es un «no»: con
       *  `aceptaVencida` + motivo se guarda y queda auditado. */
      | "GUIA_VENCIDA"
      // ── Salida de trozas sin aserrar (ADR-363) ──
      /** La pieza no puede subir al camión entera: ya la comió una corrida, ya
       *  salió en otro despacho, no llegó al patio, es descarte o es la madre
       *  de un retrozado (van los pedazos, no ella). */
      | "T2_TROZA_NO_DESPACHABLE"
      // ── Corrida abierta en el patio (ADR-340) ──
      /** Se quiso declarar producción sobre una línea que no es una corrida, o
       *  sobre una que ya la declaró (para corregir se anula y se rehace). */
      | "LINEA_NO_EDITABLE"
      /** La sección de la línea no admite la operación pedida. */
      | "SECCION_INVALIDA"
      /** Una producción sin cantidad no es una producción. */
      | "CANTIDAD_INVALIDA"
      // ── Cuadre de una guía que se contradice a sí misma (ADR-353) ──
      /** La pieza a corregir ya entró a la sierra: cambiarle el volumen
       *  reescribiría una corrida cerrada. Primero se corrige la corrida. */
      | "TROZA_CONSUMIDA"
      /** La pieza está partida en pedazos: cuadrar su volumen sin cuadrar el
       *  retrozado dejaría a los hijos sumando más que la madre (R1). */
      | "TROZA_RETROZADA"
      /** La pieza que se quiere corregir es de OTRO ingreso. Es un error de
       *  negocio con nombre, no un 500: la pantalla tiene que poder decirlo. */
      | "TROZA_AJENA"
      /** No hay contra qué cuadrar: el ingreso no tiene lista de piezas, o sus
       *  piezas no declaran volumen. */
      | "CUADRE_SIN_LISTA"
      // ── Tope de rendimiento (ADR-358) ──
      /** Se declaró más producto del que sale físicamente de lo que entró. */
      | "RENDIMIENTO_SOBRE_TOPE"
      // ── Guías registradas desde su Anexo 04 (ADR-446) ──
      /** Sólo un paquete de montón (0 piezas, sin medidas) se parte; uno con
       *  piezas o medidas es un bulto con etiqueta y sale entero (ADR-444). */
      | "PAQUETE_NO_SE_PARTE"
      /** El libro cambió entre la propuesta y el registro: se vuelve a proponer. */
      | "PROPUESTA_DESACTUALIZADA"
      /** El anexo no se puede registrar (no existe, sin guía, reemplazado). */
      | "ANEXO_NO_REGISTRABLE"
      /** El anexo respalda despachos vivos: no se edita ni se borra. */
      | "ANEXO_REGISTRADO"
      /** La bandeja de anexos la tiene otra tanda (o un guardado): reintentar en segundos. */
      | "TANDA_EN_CURSO"
      /** Otra operación tiene tomadas las corridas o los paquetes (lock_timeout o deadlock): reintentar. */
      | "LIBRO_OCUPADO",
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CtpInvariantError";
  }
}

export interface CostoDeLinea {
  /** null = no se puede saber (falta factura o hay monedas mezcladas). NUNCA 0. */
  costoMateriaPrima: number | null;
  costoProceso: number | null;
  costoTotal: number | null;
  /** Costo por unidad producida — el número que el dueño realmente quiere. */
  costoUnitario: number | null;
  moneda: string | null;
  /** Por qué el costo es null, para que la UI lo explique en vez de mostrar "—". */
  /* `madera_de_servicio` (ADR-437 §1): la corrida comió madera ajena — no se
     compró, no hay factura que esperar ni costo de materia prima que calcular. */
  /* `mixto_servicio` (revisión 26-09): comió madera propia (con factura) Y de
     servicio — no hay faltante, pero el costo por unidad no se separa por dueño. */
  motivo: "ok" | "sin_consumos" | "falta_factura" | "monedas_mezcladas" | "sin_produccion" | "madera_de_servicio" | "mixto_servicio";
  congelado: boolean;
  atribuidoM3: number;
  sinAtribuirM3: number;
  /**
   * Con `falta_factura`: las guías propias consumidas sin costo cargado (ADR-485).
   * Para que el costo por PT diga CUÁL falta, en vez de «el costo de la madera».
   */
  guiasSinCosto?: string[];
}

/** Una troza como la leen los escritores de consumo por pieza: sus fechas y las de su guía. */
export interface TrozaConGuiaFechada {
  id: string;
  codigoPlanta?: string | null;
  codificacion?: string | null;
  fechaRecepcion: Date | null;
  entry: { gtfNumber: string; fechaRecepcion: Date | null; entryDate: Date };
}

/**
 * T3 (ADR-433): ninguna troza entra a una corrida con fecha ANTERIOR a su
 * ingreso al patio (su recepción → la de su guía → el asiento de la guía).
 *
 * Vale para escrituras NUEVAS: cada escritor la llama sólo con las piezas que
 * AGREGA. Soltar piezas, anular una corrida o deshacer no pasan por acá, así
 * que un consumo viejo que ya la viola no traba ninguna corrección.
 */
export function exigirIngresoAntesDeLaCorrida(
  trozas: readonly TrozaConGuiaFechada[],
  /** `id` null = la corrida todavía no existe (se valida antes de abrirla, para no quemar un N° de línea). */
  corrida: { id: string | null; lineNo: number | null; fecha: Date | string | null | undefined },
): void {
  const fuera = trozasQueEntraronDespues(
    trozas.map((t) => ({
      id: t.id,
      codigo: (t.codigoPlanta ?? "").trim() || (t.codificacion ?? "").trim() || null,
      gtf: t.entry.gtfNumber,
      fechaRecepcionTroza: t.fechaRecepcion,
      fechaRecepcionGuia: t.entry.fechaRecepcion,
      fechaAsientoGuia: t.entry.entryDate,
    })),
    corrida.fecha,
  );
  if (fuera.length === 0) return;
  throw new CtpInvariantError(mensajeEntroDespues(fuera, corrida), "T3_ASERRADA_ANTES_DE_LLEGAR", {
    corridaId: corrida.id,
    lineNo: corrida.lineNo,
    fechaCorrida: diaDelLibro(corrida.fecha),
    trozas: fuera,
  });
}

/**
 * ¿La fila tiene trozas de OTRA especie que su guía sí tiene como fila propia?
 * (ADR-435). Devuelve esas especies y la de la fila, o `null`.
 *
 * Sólo se pregunta cuando I2 ya va a rechazar: es el caso de Blas (27-09) en el
 * que el mensaje decía «la guía no cuadra consigo misma» y la guía cuadraba —
 * las trozas de Cachimbo de 0000009 colgaban de la fila de Yacuchapana. El
 * criterio es el de «Acomodar trozas» (`filaDeEspecie`), para que el mensaje
 * no mande a acomodar algo que el acomodo no movería.
 */
async function especiesEnOtraFila(
  tx: Prisma.TransactionClient,
  tenantId: string,
  woodEntryId: string,
): Promise<{ fila: string; especies: string[] } | null> {
  const fila = await tx.woodEntry.findFirst({
    where: { id: woodEntryId, tenantId },
    select: { gtfNumber: true, gtfSeries: true, speciesCommonName: true },
  });
  if (!fila) return null;
  const clave = claveDeLaGuia(fila.gtfSeries, fila.gtfNumber);
  const hermanas = (
    await tx.woodEntry.findMany({
      where: { tenantId, deletedAt: null, gtfNumber: fila.gtfNumber, status: { notIn: ["anulado", "rechazado"] } },
      select: { id: true, gtfSeries: true, gtfNumber: true, speciesCommonName: true, speciesScientificName: true },
    })
  )
    .filter((h) => claveDeLaGuia(h.gtfSeries, h.gtfNumber) === clave)
    .map((h) => ({ id: h.id, especie: h.speciesCommonName, cientifico: h.speciesScientificName }));
  if (hermanas.length < 2) return null;
  const trozas = await tx.woodEntryTroza.findMany({
    where: { tenantId, woodEntryId },
    select: { especieComun: true, especieCientifica: true },
  });
  const especies = new Set<string>();
  for (const t of trozas) {
    const d = filaDeEspecie(t, hermanas);
    if (d.fila && d.fila.id !== woodEntryId) especies.add((t.especieComun ?? "").trim() || d.fila.especie || "otra especie");
  }
  return especies.size > 0 ? { fila: fila.speciesCommonName, especies: [...especies].sort((a, b) => a.localeCompare(b, "es")) } : null;
}

export class ForestCtpConsumoDB {
  /**
   * Reemplaza el set de consumos de una línea, validando I1 + I2 + tenant
   * dentro de UNA transacción.
   *
   * LOCKEA LOS INGRESOS, NO SÓLO LA LÍNEA. El recurso en disputa es el ingreso:
   * dos líneas DISTINTAS consumiendo la misma guía lockean líneas distintas, no
   * se bloquean entre sí, y bajo READ COMMITTED ambas leen el mismo "disponible"
   * antes de que la otra commitee ⇒ las dos pasan I2 y se consume el doble.
   *
   * No es teórico: reproducido 2026-07-15 con dos `setConsumos` en paralelo
   * sobre un ingreso de 10 m³ → 20 m³ consumidos, I2 burlada. El test de
   * concurrencia que lo detecta vive en `__tests__/forestal-ctp-consumo.test.ts`.
   *
   * Los ingresos se lockean ORDENADOS POR id: dos transacciones que consumen el
   * mismo par de guías las toman en el mismo orden ⇒ sin deadlock.
   */
  static async setConsumos(
    tenantId: string,
    ctpEntryId: string,
    consumos: ConsumoInput[],
    createdBy: string,
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!ctpEntryId) throw new Error("ctpEntryId is required");
    if (!createdBy?.trim()) throw new Error("createdBy is required");

    /* Los cierres se leen ANTES de abrir la transacción: son un KV que se lee
       con el cliente global, y adentro pedirían una SEGUNDA conexión mientras
       la tx retiene la suya (con el pool chico, varias a la vez pueden quedarse
       esperándose entre sí). Es la misma lectura que antes, un instante antes. */
    const cierres = await ForestCtpCierreDB.list(tenantId);
    const escritos = await prisma.$transaction(
      (tx) => ForestCtpConsumoDB.setConsumosEnTx(tx, tenantId, ctpEntryId, consumos, createdBy, { cierres }),
      CTP_TX_OPTS,
    );
    await ForestCtpConsumoDB.despuesDeConsumos(tenantId, ctpEntryId, escritos, createdBy);
    return escritos.consumos;
  }

  /**
   * El núcleo de `setConsumos` DENTRO de una transacción ajena (ADR-441).
   *
   * Existe para que un escritor que hace MÁS que atribuir m³ —vincular una
   * corrida con sus trozas: volumen, consumos por guía y piezas— lo haga en UNA
   * sola transacción. Antes, `sumarACorrida` escribía el volumen, llamaba a
   * `setConsumos` (otra tx) y marcaba las piezas (una tercera): si la tercera
   * fallaba quedaban m³ atribuidos sin piezas, y dos vinculaciones de la misma
   * troza no se veían entre sí.
   *
   * Las reglas son LAS MISMAS, en el mismo orden (I1, I2, cierre, congelado,
   * lock de la línea y de los ingresos `ORDER BY id`): esto es un corte, no una
   * segunda versión. Lo que NO hace es auditar ni invalidar la caché: eso va
   * DESPUÉS del commit (`despuesDeConsumos`) — un renglón escrito antes de un
   * rollback narraría una atribución que nunca existió.
   *
   * `cierres` los lee el llamador ANTES de abrir la transacción
   * (`ForestCtpCierreDB.list`): leerlos acá adentro usaba el cliente global y
   * pedía otra conexión del pool con la de la tx tomada.
   */
  static async setConsumosEnTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    ctpEntryId: string,
    consumos: ConsumoInput[],
    createdBy: string,
    { cierres }: { cierres: CtpCierrePeriodo[] },
  ): Promise<ConsumosEscritos> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!ctpEntryId) throw new Error("ctpEntryId is required");
    if (!createdBy?.trim()) throw new Error("createdBy is required");

    // Un mismo ingreso 2 veces en el payload = el UNIQUE lo rechazaría con un
    // error críptico de Postgres; mejor decirlo claro (y sumar es del caller).
    const ids = consumos.map((c) => c.woodEntryId);
    if (new Set(ids).size !== ids.length) {
      throw new CtpInvariantError(
        "Un mismo ingreso aparece dos veces: suma los m³ en una sola línea.",
        "I1_SOBRE_ATRIBUCION",
      );
    }
    for (const c of consumos) {
      if (Number(c.volumeM3) <= 0) {
        throw new CtpInvariantError("Un consumo debe ser mayor a 0 m³.", "I1_SOBRE_ATRIBUCION", {
          woodEntryId: c.woodEntryId,
        });
      }
    }

    // Cierre de período (ADR-139): la atribución de una corrida de un mes cerrado
    // es inmutable (además del guard de costo congelado de más abajo).
    const entryCons = await tx.forestCtpEntry.findFirst({
      where: { id: ctpEntryId, tenantId },
      select: { entryDate: true },
    });
    const cerradoCons = entryCons ? closedPeriodOf(cierres, entryCons.entryDate) : null;
    if (cerradoCons) {
      throw new CtpInvariantError(
        `El período ${cerradoCons.label} está cerrado: no se puede cambiar la materia prima de una corrida de un mes cerrado.`,
        "PERIODO_CERRADO",
        { periodKey: cerradoCons.periodKey },
      );
    }

    // 1. Lock de la línea. Placeholders $1/$2 — nunca interpolación (regla 11).
    const locked = await tx.$queryRaw<{ id: string; volumeInputM3: Prisma.Decimal | null }[]>`
      SELECT "id", "volumeInputM3" FROM "ForestCtpEntry"
      WHERE "id" = ${ctpEntryId} AND "tenantId" = ${tenantId} AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    if (locked.length === 0) throw new Error("Línea CTP no encontrada");

    // 2. Congelado ⇒ inmutable (el costo del período ya se reportó).
    const yaCongelado = await tx.forestCtpConsumo.count({
      where: { ctpEntryId, tenantId, congeladoAt: { not: null } },
    });
    if (yaCongelado > 0) {
      throw new CtpInvariantError(
        "Esta línea ya tiene el costo congelado: no se puede cambiar su atribución.",
        "CONGELADO",
      );
    }

    // 3. Lock de los INGRESOS — el recurso realmente disputado (ver cabecera).
    //    Ordenado por id para que dos transacciones concurrentes tomen las
    //    mismas guías en el mismo orden y no se deadlockeen entre sí.
    //    A partir de acá, cualquier otra tx que quiera estos ingresos espera,
    //    así que el cálculo de disponible de abajo ya no puede quedar viejo.
    //    (ids vacío = borrar toda la atribución: no hay nada que lockear, y
    //    `IN ()` sería SQL inválido.)
    if (ids.length > 0) {
      await tx.$queryRaw`
        SELECT "id" FROM "WoodEntry"
        WHERE "id" IN (${Prisma.join(ids)}) AND "tenantId" = ${tenantId} AND "deletedAt" IS NULL
        ORDER BY "id"
        FOR UPDATE
      `;
    }

    // 4. Los ingresos citados deben ser de ESTE tenant y estar vivos.
    //    El FK de Postgres no lo garantiza (D3) — probado en el ensayo.
    const ingresos = await tx.woodEntry.findMany({
      where: { id: { in: ids }, tenantId, deletedAt: null },
      select: { id: true, volumeM3: true, gtfNumber: true },
    });
    if (ingresos.length !== ids.length) {
      const vistos = new Set(ingresos.map((i) => i.id));
      throw new CtpInvariantError(
        "Algún ingreso citado no existe, fue borrado, o pertenece a otra tienda.",
        "TENANT_MISMATCH",
        { faltantes: ids.filter((id) => !vistos.has(id)) },
      );
    }

    // 5. I1 — Σ atribuido ≤ declarado en el acta.
    const declarado = locked[0].volumeInputM3 ? Number(locked[0].volumeInputM3) : null;
    const totalAtribuido = consumos.reduce((a, c) => a + Number(c.volumeM3), 0);
    if (declarado != null && r4(totalAtribuido) > r4(declarado)) {
      throw new CtpInvariantError(
        `Estás atribuyendo ${r4(totalAtribuido)} m³ pero la línea declara ${r4(declarado)} m³ consumidos.`,
        "I1_SOBRE_ATRIBUCION",
        { atribuido: r4(totalAtribuido), declarado: r4(declarado) },
      );
    }

    // 6. I2 — ningún ingreso consumido por encima de su volumen, contando lo
    //    que YA consumen OTRAS líneas (excluyendo esta, que se reemplaza).
    const otros = await tx.forestCtpConsumo.groupBy({
      by: ["woodEntryId"],
      where: {
        tenantId,
        woodEntryId: { in: ids },
        ctpEntryId: { not: ctpEntryId },
        ...CONSUMO_VIGENTE, // una línea anulada no sigue reservando materia prima
      },
      _sum: { volumeM3: true },
    });
    const yaConsumido = new Map(otros.map((o) => [o.woodEntryId, Number(o._sum.volumeM3 ?? 0)]));

    for (const c of consumos) {
      const ingreso = ingresos.find((i) => i.id === c.woodEntryId)!;
      const disponible = Number(ingreso.volumeM3) - (yaConsumido.get(c.woodEntryId) ?? 0);
      if (r4(Number(c.volumeM3)) > r4(disponible)) {
        /**
         * DOS causas distintas, dos mensajes distintos (ADR-359).
         *
         * I2 se aplica **por guía**, no sobre el total del lote: un lote de
         * 12.928 m³ puede rendir 7.105 sin problema y aun así una de sus guías
         * estar mal declarada. El mensaje viejo —«sólo tiene 4.161 sin
         * consumir; estás pidiendo 8.247»— mandaba a buscar un cupo que no
         * existe, cuando lo que pasa es que el documento se contradice.
         *
         * Si NADA de esa guía se consumió todavía y aun así se pasa, no falta
         * cupo: la guía declara menos de lo que miden sus propias piezas.
         */
        const nadaConsumido = (yaConsumido.get(c.woodEntryId) ?? 0) === 0;
        /* Una TERCERA causa (27-09), antes que las otras dos: las trozas
           cuelgan de la fila de otra especie de su guía (ADR-435). La guía
           está bien; decirle «no cuadra» mandaba a cambiar cifras oficiales. */
        const otraFila = await especiesEnOtraFila(tx, tenantId, c.woodEntryId);
        throw new CtpInvariantError(
          otraFila
            ? `${fraseTrozasEnOtraFila(ingreso.gtfNumber, otraFila.especies, otraFila.fila)} ` +
                `Hazlo en Ingresos › Opciones › Acomodar trozas.`
            : nadaConsumido
              ? `La guía ${ingreso.gtfNumber} no cuadra consigo misma: declara ${r4(Number(ingreso.volumeM3))} m³ ` +
                  `y las piezas que llevas suman ${r4(Number(c.volumeM3))} m³. ` +
                  `El lote no es el problema, es esa guía: cuádrala en Ingresos.`
              : `La guía ${ingreso.gtfNumber} no alcanza: quedan ${r4(disponible)} m³ ` +
                  `de ${r4(Number(ingreso.volumeM3))} y pides ${r4(Number(c.volumeM3))} m³.`,
          "I2_SOBRE_CONSUMO",
          {
            gtfNumber: ingreso.gtfNumber,
            disponible: r4(disponible),
            pedido: r4(Number(c.volumeM3)),
            volumenIngreso: r4(Number(ingreso.volumeM3)),
            causa: otraFila ? "otra_fila" : nadaConsumido ? "descuadre" : "sin_cupo",
          },
        );
      }
    }

    // 7. Estado ANTERIOR — para que la auditoría diga de qué a qué cambió la
    //    atribución. "Cambió el origen" no le sirve a nadie en una
    //    fiscalización; "de 001-0000120: 8.45 a 001-0000131: 8.45" sí.
    const antes = await tx.forestCtpConsumo.findMany({
      where: { ctpEntryId, tenantId },
      include: { woodEntry: { select: { gtfNumber: true } } },
    });

    // 8. Reemplazo atómico. Sin soft-delete: el consumo es detalle editable,
    //    no acta — el acta (volumeInputM3/gtfIngreso) no se toca nunca.
    await tx.forestCtpConsumo.deleteMany({ where: { ctpEntryId, tenantId } });
    if (consumos.length > 0) {
      await tx.forestCtpConsumo.createMany({
        data: consumos.map((c) => ({
          tenantId,
          ctpEntryId,
          woodEntryId: c.woodEntryId,
          volumeM3: new Prisma.Decimal(c.volumeM3),
          createdBy,
        })),
      });
    }

    /**
     * La corrida que NUNCA declaró su materia prima la completa acá.
     *
     * Hay líneas viejas —importadas o cargadas antes de que el lote existiera—
     * con `volumeInputM3` en null: declararon producto y no de qué madera
     * salió. Su rendimiento queda en blanco y ningún despacho que las cite se
     * puede certificar. Decir de qué guías salió es decir cuánto entró: es el
     * MISMO número por construcción, no una estimación.
     *
     * Sólo cuando está vacío. Un acta que ya declaró su volumen no se toca por
     * este camino —eso lo prohíbe ADR-364— y bajar el consumo de una corrida
     * declarada le cambiaría el rendimiento a espaldas del operador.
     */
    if (declarado == null && totalAtribuido > 0) {
      /**
       * Y el rendimiento sale solo, con la misma fórmula del resto del libro.
       *
       * Sin esto la corrida quedaba con entrada y salida y la columna «Rend.»
       * en blanco: los dos números estaban ahí y nadie los dividía. El
       * rendimiento es DERIVADO, no un dato aparte — si se puede calcular, se
       * calcula.
       */
      const linea = await tx.forestCtpEntry.findUnique({
        where: { id: ctpEntryId },
        select: { section: true, quantity: true, unit: true },
      });
      const salida = linea?.quantity == null ? 0 : Number(linea.quantity);
      const rendimiento =
        linea?.section === "produccion" && linea.unit === "m3" && salida > 0
          ? Math.round((salida / r4(totalAtribuido)) * 10000) / 100
          : undefined;
      await tx.forestCtpEntry.update({
        where: { id: ctpEntryId },
        data: {
          volumeInputM3: new Prisma.Decimal(r4(totalAtribuido)),
          ...(rendimiento != null ? { rendimientoPct: new Prisma.Decimal(rendimiento) } : {}),
        },
      });
    }

    const result = await tx.forestCtpConsumo.findMany({
      where: { ctpEntryId, tenantId },
      include: { woodEntry: { select: { gtfNumber: true, speciesCommonName: true } } },
    });

    const fmt = (rows: { volumeM3: Prisma.Decimal; woodEntry: { gtfNumber: string } }[]) =>
      rows.length === 0
        ? "(sin atribución)"
        : rows.map((r) => `${r.woodEntry.gtfNumber}: ${m3(Number(r.volumeM3))}`).join(", ");
    const auditoria =
      `Origen de la materia prima: ${fmt(antes)} → ${fmt(result)}` +
      /* Que el acta pasó de no tener volumen a tenerlo es un cambio del
         libro, no un detalle del formulario: se narra. */
      (declarado == null && totalAtribuido > 0
        ? ` · la corrida no declaraba materia prima y quedó en ${m3(r4(totalAtribuido))}`
        : "");
    return { consumos: result, auditoria };
  }

  /**
   * Lo que va DESPUÉS del commit de `setConsumosEnTx`: la caché y el renglón
   * del libro. El renglón se ESPERA (`auditCtpEsperando`): en Vercel lo que
   * sigue corriendo después de responder puede no terminar, y de dónde salió
   * la materia prima de una corrida es lo primero que pregunta SERFOR. Nunca
   * tira: auditar no deshace un consumo ya escrito.
   */
  static async despuesDeConsumos(
    tenantId: string,
    ctpEntryId: string,
    escritos: ConsumosEscritos,
    user: string,
  ): Promise<void> {
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch {
      /* cache best-effort */
    }
    await auditCtpEsperando({
      tenantId,
      action: "ctp_consumos_set",
      entity: "ForestCtpEntry",
      entityId: ctpEntryId,
      detail: escritos.auditoria,
      user,
    });
  }

  /** Consumos de una línea, con la guía y especie de cada ingreso. */
  static async listByEntry(tenantId: string, ctpEntryId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.forestCtpConsumo.findMany({
      where: { tenantId, ctpEntryId },
      orderBy: { createdAt: "asc" },
      include: {
        woodEntry: {
          select: {
            id: true,
            gtfNumber: true,
            speciesCommonName: true,
            volumeM3: true,
            costoTotal: true,
            moneda: true,
            entryDate: true,
            /* ADR-437 §1: la de servicio no tiene factura que esperar. */
            maderaDeTercero: true,
          },
        },
      },
    });
  }

  /**
   * Costo de una línea de producción (ADR-134 D6).
   *
   * costoUnitario_i = COALESCE(snap_i, wood.costoTotal / wood.volumeM3)
   * costoMateriaPrima = Σ (costoUnitario_i × consumo.volumeM3)
   *
   * Devuelve `null` (con `motivo`) si falta alguna factura o si se mezclan
   * monedas: no se suman peras con manzanas, y un 0 fingiría margen 100%.
   */
  static async costoDeLinea(tenantId: string, ctpEntryId: string): Promise<CostoDeLinea> {
    if (!tenantId) throw new Error("tenantId is required");

    const [linea, consumos] = await Promise.all([
      prisma.forestCtpEntry.findFirst({
        where: { id: ctpEntryId, tenantId, deletedAt: null },
        select: {
          volumeInputM3: true,
          quantity: true,
          unit: true,
          costoProceso: true,
          moneda: true,
        },
      }),
      ForestCtpConsumoDB.listByEntry(tenantId, ctpEntryId),
    ]);
    if (!linea) throw new Error("Línea CTP no encontrada");

    const atribuidoM3 = r4(consumos.reduce((a, c) => a + Number(c.volumeM3), 0));
    const declarado = linea.volumeInputM3 ? Number(linea.volumeInputM3) : 0;
    const sinAtribuirM3 = r4(Math.max(0, declarado - atribuidoM3));
    const congelado = consumos.some((c) => c.congeladoAt != null);
    const costoProceso = linea.costoProceso != null ? Number(linea.costoProceso) : null;

    const base = {
      costoProceso,
      congelado,
      atribuidoM3,
      sinAtribuirM3,
      moneda: linea.moneda ?? "PEN",
    };

    if (consumos.length === 0) {
      return {
        ...base,
        costoMateriaPrima: null,
        costoTotal: null,
        costoUnitario: null,
        motivo: "sin_consumos",
      };
    }

    /* Madera de servicio (ADR-437 §1): no es nuestra, no lleva costo. No es
       «falta factura» (esa espera un papel que nunca va a llegar). Sólo se
       declara «de servicio» si TODA la madera consumida lo es: si hay madera
       propia, sus facturas se revisan primero — antes la marca de servicio
       ganaba y una factura propia faltante no aparecía (revisión 26-09). */
    const esServicio = (c: (typeof consumos)[number]) => c.costoUnitarioSnap == null && c.woodEntry.maderaDeTercero;
    const propios = consumos.filter((c) => !esServicio(c));
    if (propios.length === 0) {
      return {
        ...base,
        costoMateriaPrima: null,
        costoTotal: null,
        costoUnitario: null,
        motivo: "madera_de_servicio",
      };
    }

    // Monedas: las del ingreso mandan; mezclarlas invalida la suma. La de
    // servicio no tiene precio de compra: su moneda no entra a la pregunta.
    const monedas = new Set(propios.map((c) => c.woodEntry.moneda ?? "PEN"));
    if (monedas.size > 1) {
      return {
        ...base,
        costoMateriaPrima: null,
        costoTotal: null,
        costoUnitario: null,
        motivo: "monedas_mezcladas",
      };
    }

    let costoMateriaPrima = 0;
    /* Todas las que faltan, no la primera: el aviso dice CUÁLES (ADR-485). */
    const sinCosto = new Set<string>();
    for (const c of propios) {
      // Congelado gana: es el costo con el que se reportó el período.
      const unitario =
        c.costoUnitarioSnap != null
          ? Number(c.costoUnitarioSnap)
          : c.woodEntry.costoTotal != null && Number(c.woodEntry.volumeM3) > 0
            ? Number(c.woodEntry.costoTotal) / Number(c.woodEntry.volumeM3)
            : null;
      if (unitario == null) sinCosto.add(c.woodEntry.gtfNumber);
      else costoMateriaPrima += unitario * Number(c.volumeM3);
    }
    // Sin factura ⇒ no se sabe. NULL honesto, no 0 (D6).
    if (sinCosto.size > 0) {
      return {
        ...base,
        costoMateriaPrima: null,
        costoTotal: null,
        costoUnitario: null,
        motivo: "falta_factura",
        guiasSinCosto: [...sinCosto].sort(),
      };
    }

    /* Propia completa + algo de servicio: no hay faltante, pero tampoco un
       costo por unidad — el producto no se separa por dueño, y promediar sólo
       lo comprado sobre todo lo producido lo diluiría. `null` honesto, con su
       motivo: el despacho que salga de acá queda «mixto» (incompleto). */
    if (propios.length < consumos.length) {
      return {
        ...base,
        costoMateriaPrima: null,
        costoTotal: null,
        costoUnitario: null,
        motivo: "mixto_servicio",
      };
    }

    const costoTotal = r2(costoMateriaPrima + (costoProceso ?? 0));
    const producido = linea.quantity != null ? Number(linea.quantity) : 0;

    return {
      ...base,
      moneda: [...monedas][0],
      costoMateriaPrima: r2(costoMateriaPrima),
      costoTotal,
      costoUnitario: producido > 0 ? r2(costoTotal / producido) : null,
      motivo: producido > 0 ? "ok" : "sin_produccion",
    };
  }

  /**
   * Cierre de período: congela el costo unitario de cada consumo (D6/D8).
   * Rechaza si algún costo es desconocido — no se congela lo que no se sabe.
   *
   * `user` es obligatorio: congelar es irreversible (deja la línea inmutable) y
   * un evento irreversible sin autor no es auditable.
   */
  static async congelarCosto(tenantId: string, ctpEntryId: string, user: string) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!user?.trim()) throw new Error("user is required");

    return prisma.$transaction(async (tx) => {
      const consumos = await tx.forestCtpConsumo.findMany({
        where: { tenantId, ctpEntryId },
        include: { woodEntry: { select: { costoTotal: true, volumeM3: true, gtfNumber: true, maderaDeTercero: true } } },
      });
      if (consumos.length === 0) throw new Error("La línea no tiene consumos que congelar");

      /* La madera de servicio (ADR-437 §1) no tiene factura que faltar: no
         frena el cierre. Tampoco se congela: no hay costo que fijar, y el CHECK
         `ForestCtpConsumo_congelado_coherente` exige snap y fecha juntos (un
         snap 0 fingiría madera gratis). Su atribución la protege el mes
         cerrado, igual que a cualquier escritura del libro. */
      const sinFactura = consumos.filter(
        (c) => c.costoUnitarioSnap == null && !c.woodEntry.maderaDeTercero && c.woodEntry.costoTotal == null,
      );
      if (sinFactura.length > 0) {
        throw new CtpInvariantError(
          `No se puede congelar: falta la factura de ${sinFactura.map((c) => c.woodEntry.gtfNumber).join(", ")}.`,
          "CONGELADO",
          { sinFactura: sinFactura.map((c) => c.woodEntry.gtfNumber) },
        );
      }

      const now = new Date();
      const congelados: string[] = [];
      const deServicio: string[] = [];
      for (const c of consumos) {
        if (c.costoUnitarioSnap != null) continue; // ya congelado: no se repisa
        if (c.woodEntry.maderaDeTercero) {
          deServicio.push(c.woodEntry.gtfNumber);
          continue;
        }
        const unitario = r2(Number(c.woodEntry.costoTotal) / Number(c.woodEntry.volumeM3));
        await tx.forestCtpConsumo.update({
          where: { id: c.id },
          data: { costoUnitarioSnap: new Prisma.Decimal(unitario), congeladoAt: now },
        });
        congelados.push(`${c.woodEntry.gtfNumber} @ S/${unitario}/m³`);
      }

      // Irreversible: a partir de acá la línea no se puede reatribuir.
      auditCtp({
        tenantId,
        action: "ctp_costo_congelar",
        entity: "ForestCtpEntry",
        entityId: ctpEntryId,
        detail:
          (congelados.length
            ? `Costo congelado al cierre — ${congelados.join(", ")}. La línea queda inmutable.`
            : deServicio.length
              ? "Sin costo que congelar"
              : "Congelado sin cambios: todos los consumos ya estaban congelados.") +
          (deServicio.length
            ? ` · Madera de servicio sin costo (no se congela): ${[...new Set(deServicio)].join(", ")}.`
            : ""),
        user,
      });

      try {
        invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
      } catch {
        /* cache best-effort */
      }
      return tx.forestCtpConsumo.findMany({ where: { tenantId, ctpEntryId } });
    }, CTP_TX_OPTS);
  }
}
