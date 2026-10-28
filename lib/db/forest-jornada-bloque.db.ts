/**
 * La JORNADA del bloque en un solo acto (ADR-519, fase 2 «Jornadas seguras»).
 *
 * Registrar un día eran dos pedidos: consumir (abre la corrida con su materia
 * prima) y declarar la producción. Si el segundo fallaba —el tope del 56 %, un
 * paquete repetido, un mes que se cerró en el medio, la red— la corrida quedaba
 * ABIERTA con la madera consumida y sin producción, y había que ir a buscarla
 * al Libro por su N°.
 *
 * Acá los tres hechos van en UNA transacción: el alta de la corrida, el
 * consumo (piezas + m³ por guía) y la declaración. O queda la corrida
 * declarada o no queda nada: sin compensación ni línea fantasma. Las reglas
 * son las de siempre y viven donde siempre —`prepararConsumo` (T1),
 * `exigirIngresoAntesDeLaCorrida` (T3), `prepararCreate` + `validarDeclaracion`
 * (mes cerrado, tope, paquetes), `consumirEnTx` (locks `ORDER BY id`, I1/I2,
 * cierre y congelado)—: esto sólo las encadena.
 *
 * Revisión de ADR-519:
 * - SIEMPRE todas las piezas (B3): si una no entra, el día no se registra. La
 *   producción del día se cubicó sobre ESAS trozas; declararla sobre menos
 *   madera es atribuir de más (I1).
 * - Lo que se puede rechazar sin escribir se rechaza antes de apartar las
 *   piezas al lote (B1): un día que el tope del 56 % va a rechazar no mueve
 *   nada de fila.
 * - Con `anotarEn` (el Recorrido del permiso), la corrida y la anotación del
 *   bloque van en la MISMA transacción (A1, `ForestDistribucionesDB.escribirEnBloque`).
 *
 * ADR-521: un lote YA consumido (el del Excel del SNIFFS, ADR-520) llega a la
 * Distribución con su corrida abierta adoptada; `declararJornadaAbierta` le
 * declara la producción a ESA corrida (no abre otra) y anota el día en la
 * misma transacción.
 */
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { ForestCtpDB, type CamposDeclaracion, type CtpEntryInput } from "./forest-ctp.db";
import { ForestLoteAserrioDB } from "./forest-lote-aserrio.db";
import { CTP_TX_OPTS, CtpInvariantError, exigirIngresoAntesDeLaCorrida } from "./forest-ctp-consumo.db";
import { ForestCtpCierreDB } from "./forest-ctp-cierre.db";
import { ForestAserrioDB } from "./forest-aserrio.db";
import { ForestDistribucionesDB } from "./forest-distribuciones.db";
import type { BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import type { Prisma } from "@/lib/generated/prisma/client";

export interface JornadaParaRegistrar {
  loteId: string;
  /** Las piezas del día. Las que todavía no están en el lote se apartan primero, como en «Consumir». */
  trozaIds: string[];
  /** Día de la corrida, a mediodía UTC. Sin fecha, hoy (lo mismo que `ForestCtpDB.create`). */
  fecha?: Date;
  /** Casillero (11) del consumo. La declaración lo reemplaza con `produccion.observations`, como hoy. */
  observaciones?: string | null;
  produccion: CamposDeclaracion;
  user: string;
}

/**
 * Dónde anotar la jornada, en la misma transacción que la escribe (A1).
 * `parche` recibe el bloque leído BAJO el candado y la corrida que quedó.
 */
export interface AnotarJornadaEn {
  distribucionId: string;
  bloqueId: string;
  parche: (b: BloqueRolliza, corrida: { id: string; lineNo: number }) => Partial<BloqueRolliza>;
}

export interface JornadaRegistrada {
  corrida: { id: string; lineNo: number };
  piezas: number;
  volumenM3: number;
  /** `true` = esas piezas ya estaban en UNA corrida declarada (un reintento): no se abrió otra. */
  yaEstaba: boolean;
  /** Siempre vacía desde la revisión B3 (si una no entra, no se registra nada); queda por contrato. */
  rechazadas: { id: string; codigo: string | null; motivo: string }[];
  /** El bloque ya anotado, cuando se pidió `anotarEn`. */
  bloque?: BloqueRolliza | null;
}

/** Declarar la corrida abierta que el bloque adoptó (ADR-521): ya consumió sus piezas. */
export interface JornadaAbiertaParaDeclarar {
  corridaId: string;
  /** Las piezas del bloque: la corrida tiene que haber consumido EXACTAMENTE éstas. */
  trozaIds: string[];
  produccion: CamposDeclaracion;
  user: string;
}

/** Una corrida con TODAS las piezas que consumió, de cualquier lote. */
export interface CorridaConSusPiezas {
  id: string;
  lineNo: number;
  section: string;
  status: string;
  deletedAt: Date | null;
  entryDate: Date;
  quantity: number | null;
  volumeInputM3: number | null;
  trozaIds: string[];
}

const redondear4 = (n: number) => Math.round(n * 10000) / 10000;
/** Más piezas que esto no entran en un bloque (`MAX_TROZAS_POR_BLOQUE`): leer de más sólo confirma que no entra. */
const TOPE_PIEZAS_LEIDAS = 2000;

export class ForestJornadaBloqueDB {
  /**
   * Crea la corrida, le consume sus piezas y m³ por guía y le declara la
   * producción, todo en una transacción. Ver el encabezado del archivo.
   */
  static async registrarJornada(
    tenantId: string,
    input: JornadaParaRegistrar,
    anotarEn?: AnotarJornadaEn,
  ): Promise<JornadaRegistrada> {
    if (!tenantId) throw new Error("tenantId is required");
    const { loteId, fecha, user, produccion } = input;
    const trozaIds = [...new Set(input.trozaIds.map((t) => t.trim()).filter(Boolean))];
    if (trozaIds.length === 0) {
      throw new CtpInvariantError("La jornada no trae trozas que aserrar.", "VALIDACION");
    }

    /* Idempotencia (la segunda llave de ADR-464): si la red se cortó DESPUÉS
       del commit, el reintento encuentra las mismas piezas en una corrida
       viva y declarada, y la devuelve en vez de fallar o de abrir otra. */
    const previa = await ForestJornadaBloqueDB.corridaQueYaLasConsumio(tenantId, trozaIds);
    if (previa) {
      const corrida = { id: previa.id, lineNo: previa.lineNo };
      /* Sin Libro que escribir: sólo falta que el bloque lo sepa (idempotente). */
      const bloque = anotarEn
        ? await ForestDistribucionesDB.anotarBloque(
            tenantId,
            anotarEn.distribucionId,
            anotarEn.bloqueId,
            (b) => anotarEn.parche(b, corrida),
            user,
          )
        : undefined;
      return {
        corrida,
        piezas: trozaIds.length,
        volumenM3: redondear4(Number(previa.volumeInputM3 ?? 0)),
        yaEstaba: true,
        rechazadas: [],
        ...(anotarEn ? { bloque } : {}),
      };
    }

    /* Todo lo que puede rechazar, ANTES de abrir la transacción: dentro sólo
       quedan los locks y las escrituras, y el tope de 20 s no se gasta en
       lecturas. Lo de abajo vuelve a mirar bajo lock lo que se disputa.
       B1: las reglas de Declarar (mes cerrado, tope del 56 %, paquetes) con el
       m³ de las piezas PEDIDAS, antes de apartarlas al lote: lo que se va a
       rechazar no mueve ninguna pieza de fila. */
    const fechaCorrida = fecha ?? new Date();
    const volumenPedido = await ForestJornadaBloqueDB.volumenDe(tenantId, trozaIds);
    await ForestJornadaBloqueDB.validarSobre(tenantId, fechaCorrida, volumenPedido, produccion);

    await ForestLoteAserrioDB.apartarParaConsumir(tenantId, loteId, trozaIds, fecha, user, { exigirTodas: true });
    const prep = await ForestLoteAserrioDB.prepararConsumo(tenantId, loteId, trozaIds);
    const { lote, libres } = prep;
    if (libres.length < trozaIds.length) {
      const entran = new Set(libres.map((t) => t.id));
      throw new CtpInvariantError(
        `Entran ${libres.length} de ${trozaIds.length} trozas: la producción del día no se declara sobre menos madera. No se registró nada.`,
        "LOTE_NO_EDITABLE",
        { faltan: trozaIds.filter((id) => !entran.has(id)) },
      );
    }
    const volumenM3 = redondear4(libres.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0));
    /* T3 (ADR-433) con la fecha de la corrida que todavía no existe. */
    exigirIngresoAntesDeLaCorrida(libres, { id: null, lineNo: null, fecha: fechaCorrida });

    /* La misma corrida que abre `consumirEnPatio`. */
    const corridaInput: CtpEntryInput = {
      section: "produccion",
      entryDate: fecha,
      speciesCommon: lote.speciesCommon,
      speciesScientific: lote.speciesScientific ?? libres[0]?.especieCientifica ?? null,
      volumeInputM3: volumenM3,
      materiaPrimaRef: lote.code,
      observations: (input.observaciones ?? "").trim() || `Consumo del lote ${lote.code} · producción por declarar`,
      createdBy: user,
    };
    const pre = await ForestCtpDB.prepararCreate(tenantId, corridaInput);
    /* Lo apartado pesa distinto de lo pedido (una pieza recubicada en el
       medio): el tope se mide otra vez contra la madera que de verdad entra. */
    if (volumenM3 !== volumenPedido) await ForestJornadaBloqueDB.validarSobre(tenantId, fechaCorrida, volumenM3, produccion);
    /* Los cierres, con el cliente global: adentro de la tx pedirían otra conexión. */
    const cierres = await ForestCtpCierreDB.list(tenantId);

    /* UNA transacción, en el orden del libro: la corrida, lo que consumió
       (corrida → lote → piezas → ingresos) y lo que salió. Si cualquiera tira,
       no queda ni la corrida ni el consumo — ni se quema el N° de línea. */
    const escribir = async (tx: Prisma.TransactionClient) => {
      const creado = await ForestCtpDB.crearEnTx(tx, tenantId, corridaInput, pre);
      const escritos = await ForestLoteAserrioDB.consumirEnTx(tx, tenantId, prep, creado.entry.id, fecha, user, {
        yaAtribuida: 0,
        cierres,
      });
      const { rendimiento } = await ForestCtpDB.declararProduccionEnTx(
        tx,
        tenantId,
        { id: creado.entry.id, volumeInputM3: volumenM3 },
        produccion,
        user,
      );
      return { creado, escritos, rendimiento };
    };
    /* Con `anotarEn`, la misma transacción toma primero la clave KV de las
       distribuciones (orden de candados en `escribirEnBloque`). */
    let bloque: BloqueRolliza | undefined;
    let hecho: Awaited<ReturnType<typeof escribir>>;
    if (anotarEn) {
      const r = await ForestDistribucionesDB.escribirEnBloque(
        tenantId,
        anotarEn.distribucionId,
        anotarEn.bloqueId,
        async (tx, b) => {
          const h = await escribir(tx);
          return { parche: anotarEn.parche(b, { id: h.creado.entry.id, lineNo: h.creado.entry.lineNo }), resultado: h };
        },
        user,
        CTP_TX_OPTS,
      );
      hecho = r.resultado;
      bloque = r.bloque;
    } else {
      hecho = await prisma.$transaction(escribir, CTP_TX_OPTS);
    }

    /* Tras el commit, los tres renglones de siempre (alta, consumo, declarada) y la caché. */
    const corridaId = hecho.creado.entry.id;
    await ForestCtpDB.despuesDeCrear(tenantId, corridaInput, hecho.creado);
    const consumo = await ForestLoteAserrioDB.despuesDeConsumir(tenantId, prep, corridaId, hecho.escritos, user);
    ForestCtpDB.despuesDeDeclarar(tenantId, hecho.creado.entry, produccion, hecho.rendimiento, user);
    /* El cobro del aserrío, igual que Declarar sin pedido (ADR-412 §4): después
       del asiento y sin poder tumbarlo. Una corrida recién nacida no se le cobra
       a nadie todavía, así que hoy no hace nada; queda por si eso cambia. */
    await ForestAserrioDB.recotizarSiCobrada(tenantId, corridaId, user).catch((err) =>
      logger.error("[forestal.registrarJornada] la jornada se guardó pero el aserrío no se recotizó", {
        tenantId,
        corridaId,
        error: String(err),
      }),
    );

    return {
      corrida: { id: corridaId, lineNo: hecho.creado.entry.lineNo },
      piezas: consumo.piezas,
      volumenM3: consumo.volumenM3,
      yaEstaba: false,
      rechazadas: [],
      ...(anotarEn ? { bloque } : {}),
    };
  }

  /**
   * La corrida y todas sus piezas (ADR-521). La usan la lectura que arma el
   * bloque de un lote consumido —para no adoptar una corrida que también
   * comió piezas de otro lote— y `declararJornadaAbierta`.
   */
  static async corridaConSusPiezas(tenantId: string, corridaId: string): Promise<CorridaConSusPiezas | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const [c, piezas] = await Promise.all([
      prisma.forestCtpEntry.findFirst({
        where: { id: corridaId, tenantId },
        select: {
          id: true,
          lineNo: true,
          section: true,
          status: true,
          deletedAt: true,
          entryDate: true,
          quantity: true,
          volumeInputM3: true,
        },
      }),
      prisma.woodEntryTroza.findMany({
        where: { tenantId, consumidaEnId: corridaId },
        select: { id: true },
        orderBy: { id: "asc" },
        take: TOPE_PIEZAS_LEIDAS,
      }),
    ]);
    if (!c) return null;
    return {
      ...c,
      quantity: c.quantity == null ? null : Number(c.quantity),
      volumeInputM3: c.volumeInputM3 == null ? null : Number(c.volumeInputM3),
      trozaIds: piezas.map((p) => p.id),
    };
  }

  /**
   * Le declara la producción a la corrida ABIERTA que el bloque adoptó
   * (ADR-521) y anota el día como declarado, en UNA transacción. No abre
   * corrida ni consume: las piezas ya entraron a la sierra.
   *
   * Sólo si la corrida es del bloque entero: de producción, registrada, viva y
   * con EXACTAMENTE las piezas del bloque. Una con piezas de más (otro lote) o
   * de menos declararía producción sobre madera que no es la del bloque (I1).
   * Ya declarada con esas mismas piezas = un reintento: sólo se anota.
   */
  static async declararJornadaAbierta(
    tenantId: string,
    input: JornadaAbiertaParaDeclarar,
    anotarEn: AnotarJornadaEn,
  ): Promise<JornadaRegistrada> {
    if (!tenantId) throw new Error("tenantId is required");
    const { corridaId, produccion, user } = input;
    const trozaIds = [...new Set(input.trozaIds.map((t) => t.trim()).filter(Boolean))];
    if (!corridaId || trozaIds.length === 0) {
      throw new CtpInvariantError("La jornada no trae la corrida ni sus trozas.", "VALIDACION");
    }
    const c = await ForestJornadaBloqueDB.corridaConSusPiezas(tenantId, corridaId);
    const pedidas = new Set(trozaIds);
    const mismas = Boolean(c) && c!.trozaIds.length === pedidas.size && c!.trozaIds.every((id) => pedidas.has(id));
    const noEsDelBloque = (lineNo: number | null) =>
      new CtpInvariantError(
        lineNo == null
          ? "La corrida del bloque ya no está en el Libro: vuelve a llevar el lote a la Distribución."
          : `La corrida N° ${lineNo} ya no tiene justo las trozas del bloque (se anuló o cambió su consumo): vuelve a llevar el lote a la Distribución o declárala desde el Libro.`,
        "LINEA_NO_EDITABLE",
        { motivo: "CORRIDA_NO_ES_DEL_BLOQUE", corridaId, lineNo },
      );
    if (!c || c.deletedAt || c.section !== "produccion" || c.status !== "registrado" || !mismas) {
      throw noEsDelBloque(c?.lineNo ?? null);
    }
    const corrida = { id: c.id, lineNo: c.lineNo };
    const volumenM3 = redondear4(Number(c.volumeInputM3 ?? 0));

    /* Idempotencia: el pedido se cortó DESPUÉS del commit. Sin Libro que
       escribir: sólo falta que el bloque lo sepa. */
    if (c.quantity != null) {
      const bloque = await ForestDistribucionesDB.anotarBloque(
        tenantId,
        anotarEn.distribucionId,
        anotarEn.bloqueId,
        (b) => anotarEn.parche(b, corrida),
        user,
      );
      return { corrida, piezas: trozaIds.length, volumenM3, yaEstaba: true, rechazadas: [], bloque };
    }

    /* Las reglas de Declarar (mes cerrado, tope del 56 % sobre SU materia
       prima, paquetes), antes de abrir la transacción. */
    await ForestCtpDB.validarDeclaracion(tenantId, c, produccion);

    const r = await ForestDistribucionesDB.escribirEnBloque(
      tenantId,
      anotarEn.distribucionId,
      anotarEn.bloqueId,
      async (tx, b) => {
        /* Bajo el candado de la clave: que nadie le haya sumado o quitado
           piezas desde que se leyó. `declararProduccionEnTx` toma la corrida
           con `quantity` null en el WHERE: dos declaraciones a la vez, una sola. */
        const n = await tx.woodEntryTroza.count({ where: { tenantId, consumidaEnId: c.id } });
        if (n !== trozaIds.length) throw noEsDelBloque(c.lineNo);
        const h = await ForestCtpDB.declararProduccionEnTx(
          tx,
          tenantId,
          { id: c.id, volumeInputM3: c.volumeInputM3 },
          produccion,
          user,
        );
        return { parche: anotarEn.parche(b, corrida), resultado: h };
      },
      user,
      CTP_TX_OPTS,
    );

    ForestCtpDB.despuesDeDeclarar(tenantId, r.resultado.entry, produccion, r.resultado.rendimiento, user);
    /* El cobro del aserrío, igual que Declarar (ADR-412 §4): después del
       asiento y sin poder tumbarlo. */
    await ForestAserrioDB.recotizarSiCobrada(tenantId, c.id, user).catch((err) =>
      logger.error("[forestal.declararJornadaAbierta] la producción se declaró pero el aserrío no se recotizó", {
        tenantId,
        corridaId: c.id,
        error: String(err),
      }),
    );
    return { corrida, piezas: trozaIds.length, volumenM3, yaEstaba: false, rechazadas: [], bloque: r.bloque };
  }

  /** m³ de las piezas pedidas, como los suma el consumo (las sin volumen no pesan). */
  private static async volumenDe(tenantId: string, trozaIds: readonly string[]): Promise<number> {
    const filas = await prisma.woodEntryTroza.findMany({
      where: { tenantId, id: { in: [...trozaIds] } },
      select: { volumenM3: true },
    });
    return redondear4(filas.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0));
  }

  /** Las reglas de Declarar sobre la corrida que va a nacer: registrada, sin producción, con este m³. */
  private static async validarSobre(
    tenantId: string,
    entryDate: Date,
    volumeInputM3: number,
    produccion: CamposDeclaracion,
  ): Promise<void> {
    await ForestCtpDB.validarDeclaracion(
      tenantId,
      { id: "", section: "produccion", status: "registrado", lineNo: 0, entryDate, quantity: null, volumeInputM3 },
      produccion,
    );
  }

  /**
   * La corrida viva y DECLARADA que consumió exactamente estas piezas, o `null`.
   * Mira el estado de la corrida, nunca el id pelado: una anulada no cuenta.
   * Si la que las tiene está abierta (sin producción), lo dice con su N°: el
   * día ya entró a la sierra y lo que falta es declararlo, no repetirlo.
   */
  private static async corridaQueYaLasConsumio(tenantId: string, trozaIds: readonly string[]) {
    const filas = await prisma.woodEntryTroza.findMany({
      where: { tenantId, id: { in: [...trozaIds] } },
      select: {
        consumidaEn: {
          select: { id: true, lineNo: true, status: true, deletedAt: true, quantity: true, volumeInputM3: true },
        },
      },
    });
    const c = filas[0]?.consumidaEn;
    if (filas.length !== trozaIds.length || !c || c.deletedAt || c.status !== "registrado") return null;
    if (filas.some((f) => f.consumidaEn?.id !== c.id)) return null;
    /* Exactamente esas: una corrida con más piezas es otra jornada. */
    const total = await prisma.woodEntryTroza.count({ where: { tenantId, consumidaEnId: c.id } });
    if (total !== trozaIds.length) return null;
    if (c.quantity == null) {
      throw new CtpInvariantError(
        `Estas trozas ya entraron a la sierra en la corrida #${c.lineNo}, que falta declarar: declárale la producción desde el Libro.`,
        "LINEA_NO_EDITABLE",
        { motivo: "CORRIDA_ABIERTA", corridaId: c.id, lineNo: c.lineNo },
      );
    }
    return c;
  }
}
