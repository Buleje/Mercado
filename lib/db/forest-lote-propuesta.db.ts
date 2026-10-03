import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { logger } from "@/lib/logger";
import { esChoqueDeLocks, MENSAJE_CHOQUE_DE_LOCKS } from "@/lib/forestal/ctp-api-errors";
import {
  claveDePropuesta,
  proponerLotes,
  type EstadoParaLote,
  type LoteCreadoDesdePropuesta,
  type PedidoDeLote,
  type PropuestaQueNoSeCreo,
  type PropuestasDelPatio,
  type ResultadoCrearLotes,
  type TrozaQueNoEntro,
} from "@/lib/forestal/propuesta-de-lotes";
import {
  lotesPorBloque,
  type LoteDelBloque,
  type PedidoPorBloque,
  type ResultadoLotesPorBloque,
  type TrozaDelBloque,
} from "@/lib/forestal/lotes-por-bloque";
import { auditCtp, m3 as m3Audit } from "@/lib/forestal/ctp-audit";
import { CtpInvariantError } from "./forest-ctp-consumo.db";
import { ForestLoteAserrioDB, motivoNoElegible } from "./forest-lote-aserrio.db";
import { WoodEntriesDB } from "./wood-entries.db";

/**
 * «Lotes que puedes armar» (Brandon, 2026-09-27): lee el patio, propone un
 * lote por especie + permiso y lo crea con un clic.
 *
 * ## No abre otra vía de escritura
 *
 * Crear es EXACTAMENTE lo que hace «Armar lote» + «guardar en lote» en
 * Consumos, del lado del servidor: `ForestLoteAserrioDB.create` (correlativo
 * `LA-AAAA-NNN`, contrato del permiso, auditoría, caché) y después
 * `ForestLoteAserrioDB.agregarTrozas` (lock `FOR UPDATE ORDER BY id`, L-A1,
 * ADR-393, LM4, `motivoNoElegible` pieza por pieza). Lo que se agregue mañana a
 * esas dos puertas vale acá sin tocar este archivo.
 *
 * ## El navegador no decide qué troza entra
 *
 * El POST vuelve a leer el patio y a armar la propuesta con la regla del
 * servidor. Los ids que manda la pantalla sólo ACOTAN («lo que vi»): una troza
 * que ya no está libre o es de otro negocio no entra, se devuelve con su motivo.
 *
 * ## Si no entra ninguna pieza, el lote no queda
 *
 * `create` y `agregarTrozas` son dos transacciones (así nació el alta en
 * Consumos, y no se tocan acá). Si entre la lectura y el lock otra persona se
 * llevó todas las piezas, el lote recién abierto se deshace por la puerta de
 * siempre (`softDelete`, que audita «Deshizo el lote»): un lote vacío que
 * nadie pidió es el que después nadie se anima a borrar.
 */

/** Lo que se lee de cada troza: lo que mira `motivoNoElegible` + lo que se muestra. */
const SELECT_TROZA = {
  id: true,
  especieComun: true,
  especieCientifica: true,
  volumenM3: true,
  consumidaEnId: true,
  noRecepcionada: true,
  descarte: true,
  fechaRecepcion: true,
  _count: { select: { retrozos: true } },
  despachadaEn: { select: { status: true, deletedAt: true } },
  loteMixto: { select: { code: true, status: true, deletedAt: true } },
  entry: {
    select: {
      status: true,
      deletedAt: true,
      fechaRecepcion: true,
      gtfNumber: true,
      /* El permiso vive en el INGRESO: la misma fuente que `agregarTrozas`. */
      originCode: true,
      providerName: true,
      contrato: { select: { titularNombre: true, deletedAt: true } },
    },
  },
} satisfies Prisma.WoodEntryTrozaSelect;

type FilaTroza = Prisma.WoodEntryTrozaGetPayload<{ select: typeof SELECT_TROZA }>;

const texto = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t && t !== "—" ? t : null;
};

/**
 * Elegible, esperando su guía o fuera — con la regla del escritor.
 *
 * «Esperando su guía» se decide preguntándole a la MISMA función qué diría si
 * la guía ya estuviera recibida: si con eso la pieza entra, lo único que falta
 * es recibirla. Así no hay que leer el texto del motivo ni repetir el orden de
 * sus chequeos (una pieza que además no llegó, o está en un mixto, sigue fuera).
 */
export function estadoParaLote(t: FilaTroza): EstadoParaLote {
  if (motivoNoElegible(t) === null) return "elegible";
  const e = t.entry;
  if (e.deletedAt || ["anulado", "rechazado"].includes(e.status)) return "fuera";
  const conGuiaRecibida = { ...t, entry: { ...e, fechaRecepcion: e.fechaRecepcion ?? new Date(0) } };
  return motivoNoElegible(conGuiaRecibida) === null ? "espera-guia" : "fuera";
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** El índice único parcial de códigos vivos: otro equipo abrió un lote al mismo tiempo. */
function esChoqueDeCodigo(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const huella = `${e.message} ${JSON.stringify((e as { meta?: unknown }).meta ?? {})}`;
  return huella.includes("ForestLoteAserrio_tenantId_code_vivo_key");
}

/**
 * Lo que se le dice al operador cuando UNO de varios lotes falla. Lo que no es
 * una regla del libro ni un choque de locks se loguea: el motivo genérico no
 * puede ser el único rastro de una falla de verdad.
 */
function motivoDeFalla(e: unknown, tenantId: string): string {
  if (e instanceof CtpInvariantError) return e.message;
  if (esChoqueDeLocks(e)) return MENSAJE_CHOQUE_DE_LOCKS;
  logger.error("[forestal.lote-propuesta] falló un lote de la tanda", { tenantId, error: String(e) });
  return "No se pudo armar este lote. Vuelve a intentar.";
}

export class ForestLotePropuestaDB {
  /** El patio sin lote, clasificado con la regla del servidor. */
  private static async trozasDelPatio(tenantId: string): Promise<FilaTroza[]> {
    return prisma.woodEntryTroza.findMany({
      where: {
        /* El MISMO patio que `/trozas/patio` (guía viva, ni anulada ni rechazada). */
        ...WoodEntriesDB.wherePatio(tenantId),
        loteAserrioId: null,
        consumidaEnId: null,
      },
      select: SELECT_TROZA,
      orderBy: [{ createdAt: "asc" }, { orden: "asc" }],
      take: 5000,
    });
  }

  private static aTroza(t: FilaTroza) {
    return {
      id: t.id,
      especieComun: t.especieComun,
      especieCientifica: t.especieCientifica,
      permiso: texto(t.entry.originCode),
      /* El titular del contrato si el ingreso está atado a uno; si no, el de la guía. */
      titular:
        (t.entry.contrato && !t.entry.contrato.deletedAt ? texto(t.entry.contrato.titularNombre) : null) ??
        texto(t.entry.providerName),
      volumenM3: t.volumenM3 == null ? null : Number(t.volumenM3),
      gtfNumber: t.entry.gtfNumber,
      estado: estadoParaLote(t),
    };
  }

  /**
   * Las trozas de los bloques, estén donde estén (ADR-464). No es el patio:
   * para decir POR QUÉ un bloque no arma su lote hay que ver también la pieza
   * que ya está en un lote, la consumida y la de una guía anulada. El
   * `tenantId` va en el WHERE: un id de otro negocio no vuelve y el bloque se
   * apaga con «ya no existen en este negocio».
   */
  private static async trozasDeBloques(tenantId: string, ids: readonly string[]): Promise<TrozaDelBloque[]> {
    if (ids.length === 0) return [];
    const filas = await prisma.woodEntryTroza.findMany({
      where: { tenantId, id: { in: [...new Set(ids)] } },
      select: { ...SELECT_TROZA, loteAserrioId: true, loteAserrio: { select: { code: true } } },
    });
    return filas.map((t) => ({
      ...ForestLotePropuestaDB.aTroza(t),
      enLote: t.loteAserrioId ? (t.loteAserrio?.code ?? "otro lote") : null,
      motivo: motivoNoElegible(t),
    }));
  }

  /** Qué lote armaría cada bloque, o por qué no. Sólo lee. */
  static async previsualizarPorBloques(
    tenantId: string,
    pedidos: readonly PedidoPorBloque[],
  ): Promise<LoteDelBloque[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const trozas = await ForestLotePropuestaDB.trozasDeBloques(tenantId, pedidos.flatMap((p) => p.trozaIds));
    return lotesPorBloque(pedidos, trozas);
  }

  /**
   * Arma UN lote por bloque con EXACTAMENTE sus trozas (ADR-464).
   *
   * Vuelve a leer y a decidir con la regla del servidor: lo que la pantalla
   * previsualizó puede tener minutos. Después, las dos puertas de siempre
   * (`create` + `agregarTrozas`, con su lock `FOR UPDATE ORDER BY id`).
   *
   * **Todo o nada por bloque.** Si en el instante entre leer y lockear otra
   * persona se llevó UNA pieza, el lote se deshace (`softDelete` devuelve las
   * que entraron al patio) y el bloque se dice con su motivo: un lote con menos
   * piezas que el bloque declararía en la Distribución madera que no tiene.
   * Cada bloque es independiente: el que falla no frena a los demás.
   */
  static async crearPorBloques(
    tenantId: string,
    pedidos: readonly PedidoPorBloque[],
    user: string,
  ): Promise<ResultadoLotesPorBloque> {
    if (!tenantId) throw new Error("tenantId is required");
    const decisiones = await ForestLotePropuestaDB.previsualizarPorBloques(tenantId, pedidos);
    const etiquetaDe = new Map(pedidos.map((p) => [p.bloqueId, (p.etiqueta ?? "").trim() || "sin nombre"]));
    const resultado: ResultadoLotesPorBloque = { creados: [], noCreados: [] };

    for (const d of decisiones) {
      if (!d.listo) {
        resultado.noCreados.push({ bloqueId: d.bloqueId, motivo: d.motivo });
        continue;
      }
      const etiqueta = etiquetaDe.get(d.bloqueId) ?? "sin nombre";

      let lote: Awaited<ReturnType<typeof ForestLoteAserrioDB.create>>;
      try {
        lote = await ForestLotePropuestaDB.abrirLote(tenantId, {
          speciesCommon: d.especie,
          speciesScientific: d.especieCientifica,
          permiso: d.permiso,
          notes: `Armado desde la Distribución de rolliza · bloque «${etiqueta}»`.slice(0, 300),
          createdBy: user,
        });
      } catch (e) {
        resultado.noCreados.push({ bloqueId: d.bloqueId, motivo: motivoDeFalla(e, tenantId) });
        continue;
      }

      /* Todo o nada DENTRO de la transacción (`exigirTodas`): si una troza no
         entra, no queda ninguna en el lote; lo único que puede sobrar es el lote
         VACÍO, que se deshace acá (y si eso falla, queda vacío, nunca a medias). */
      let r: Awaited<ReturnType<typeof ForestLoteAserrioDB.agregarTrozas>>;
      try {
        r = await ForestLoteAserrioDB.agregarTrozas(tenantId, lote.id, d.trozaIds, user, { exigirTodas: true });
      } catch (e) {
        await ForestLotePropuestaDB.deshacerVacio(tenantId, lote.id, user);
        resultado.noCreados.push({ bloqueId: d.bloqueId, motivo: motivoDeFalla(e, tenantId) });
        continue;
      }

      if (r.agregadas < d.trozaIds.length) {
        /* Ids repetidos o ya en este lote: no debería pasar (el lote nace vacío). */
        await ForestLotePropuestaDB.deshacerVacio(tenantId, lote.id, user);
        resultado.noCreados.push({ bloqueId: d.bloqueId, motivo: "No se armó: sus trozas cambiaron mientras tanto. Vuelve a intentar." });
        continue;
      }

      auditCtp({
        tenantId,
        action: "ctp_lote_aserrio_desde_distribucion",
        entity: "ForestLoteAserrio",
        entityId: lote.id,
        detail: `Armó el lote ${lote.code} desde el bloque «${etiqueta}» de la Distribución de rolliza: ${d.trozas} trozas · ${m3Audit(d.m3)} de ${d.especie}${d.permiso ? ` · permiso ${d.permiso}` : ""}`,
        user,
      });
      resultado.creados.push({
        bloqueId: d.bloqueId,
        loteId: lote.id,
        code: lote.code,
        especie: d.especie,
        permiso: d.permiso,
        trozas: d.trozas,
        m3: d.m3,
      });
    }
    return resultado;
  }

  /** Las propuestas del patio de hoy. Sin caché: recibir una guía las cambia al toque. */
  static async leer(tenantId: string): Promise<PropuestasDelPatio> {
    if (!tenantId) throw new Error("tenantId is required");
    const filas = await ForestLotePropuestaDB.trozasDelPatio(tenantId);
    return proponerLotes(filas.map((t) => ForestLotePropuestaDB.aTroza(t)));
  }

  /** `create` con UN reintento si otro equipo tomó el mismo correlativo en el mismo instante. */
  private static async abrirLote(
    tenantId: string,
    input: Parameters<typeof ForestLoteAserrioDB.create>[1],
  ) {
    try {
      return await ForestLoteAserrioDB.create(tenantId, input);
    } catch (e) {
      if (!esChoqueDeCodigo(e)) throw e;
    }
    try {
      return await ForestLoteAserrioDB.create(tenantId, input);
    } catch (e) {
      if (!esChoqueDeCodigo(e)) throw e;
      throw new CtpInvariantError(
        "Otro equipo está abriendo lotes al mismo tiempo. Este lote no se armó: vuelve a intentar.",
        "LOTE_CODIGO_DUPLICADO",
      );
    }
  }

  /** Deshace un lote que quedó vacío. Nunca tira: el pedido ya tiene su respuesta. */
  private static async deshacerVacio(tenantId: string, loteId: string, user: string): Promise<void> {
    await ForestLoteAserrioDB.softDelete(tenantId, loteId, user).catch((err: unknown) =>
      logger.error("[forestal.lote-propuesta] no se pudo deshacer el lote vacío", {
        tenantId,
        loteId,
        error: String(err),
      }),
    );
  }

  /**
   * Crea uno o varios lotes de la propuesta. Cada lote es independiente: si uno
   * no se puede (se llevaron sus trozas), los demás se crean igual y el que no,
   * se dice con su motivo. Si no se crea ninguno, tira el primer motivo.
   */
  static async crear(tenantId: string, pedidos: readonly PedidoDeLote[], user: string): Promise<ResultadoCrearLotes> {
    if (!tenantId) throw new Error("tenantId is required");
    /* El patio de AHORA, con la regla del servidor: lo que la pantalla vio puede
       tener minutos. Una sola lectura sirve para la propuesta y para el volumen. */
    const filas = await ForestLotePropuestaDB.trozasDelPatio(tenantId);
    const { propuestas } = proponerLotes(filas.map((t) => ForestLotePropuestaDB.aTroza(t)));
    const porClave = new Map(propuestas.map((p) => [p.clave, p]));
    const m3De = new Map(filas.map((t) => [t.id, Number(t.volumenM3 ?? 0)]));

    const creados: LoteCreadoDesdePropuesta[] = [];
    const noCreados: PropuestaQueNoSeCreo[] = [];
    const vistas = new Set<string>();
    const unSoloPedido = pedidos.length === 1;

    for (const pedido of pedidos) {
      const clave = claveDePropuesta(pedido.especie, pedido.permiso);
      if (vistas.has(clave)) continue;
      vistas.add(clave);

      const propuesta = porClave.get(clave);
      if (!propuesta) {
        noCreados.push({
          especie: pedido.especie,
          permiso: pedido.permiso,
          motivo: `Ya no hay trozas libres de ${pedido.especie}${pedido.permiso ? ` del permiso ${pedido.permiso}` : ""}.`,
        });
        continue;
      }

      const ofrecidas = new Set(propuesta.trozaIds);
      const vistasEnPantalla = pedido.trozaIds ? new Set(pedido.trozaIds) : null;
      const ids = vistasEnPantalla ? propuesta.trozaIds.filter((id) => vistasEnPantalla.has(id)) : propuesta.trozaIds;
      const yaNoLibres: TrozaQueNoEntro[] = (pedido.trozaIds ?? [])
        .filter((id, i, arr) => !ofrecidas.has(id) && arr.indexOf(id) === i)
        .map((id) => ({ id, codigo: null, motivo: "ya no está libre para un lote" }));

      if (ids.length === 0) {
        noCreados.push({
          especie: propuesta.especie,
          permiso: propuesta.permiso,
          motivo: `Las trozas de ${propuesta.especie} que viste ya no están libres. Recarga la lista.`,
        });
        continue;
      }

      let lote: Awaited<ReturnType<typeof ForestLoteAserrioDB.create>>;
      try {
        lote = await ForestLotePropuestaDB.abrirLote(tenantId, {
          speciesCommon: propuesta.especie,
          speciesScientific: propuesta.especieCientifica,
          permiso: propuesta.permiso,
          notes: "Armado con un clic desde «Lotes que puedes armar»",
          createdBy: user,
        });
      } catch (e) {
        if (unSoloPedido) throw e;
        noCreados.push({ especie: propuesta.especie, permiso: propuesta.permiso, motivo: motivoDeFalla(e, tenantId) });
        continue;
      }

      let r: Awaited<ReturnType<typeof ForestLoteAserrioDB.agregarTrozas>>;
      try {
        r = await ForestLoteAserrioDB.agregarTrozas(tenantId, lote.id, ids, user);
      } catch (e) {
        await ForestLotePropuestaDB.deshacerVacio(tenantId, lote.id, user);
        if (unSoloPedido) throw e;
        noCreados.push({ especie: propuesta.especie, permiso: propuesta.permiso, motivo: motivoDeFalla(e, tenantId) });
        continue;
      }

      if (r.agregadas === 0) {
        await ForestLotePropuestaDB.deshacerVacio(tenantId, lote.id, user);
        noCreados.push({
          especie: propuesta.especie,
          permiso: propuesta.permiso,
          motivo: r.rechazadas[0]
            ? `Ninguna troza de ${propuesta.especie} pudo entrar: ${r.rechazadas[0].motivo}.`
            : `Ninguna troza de ${propuesta.especie} pudo entrar.`,
        });
        continue;
      }

      const rechazadas = new Set(r.rechazadas.map((x) => x.id));
      const entraron = ids.filter((id) => !rechazadas.has(id));
      creados.push({
        loteId: lote.id,
        code: lote.code,
        especie: propuesta.especie,
        permiso: propuesta.permiso,
        trozas: r.agregadas,
        m3: r4(entraron.reduce((a, id) => a + (m3De.get(id) ?? 0), 0)),
        noEntraron: [...r.rechazadas, ...yaNoLibres],
      });
    }

    if (creados.length === 0 && noCreados.length > 0) {
      throw new CtpInvariantError(noCreados[0].motivo, "T1_TROZA_NO_CONSUMIBLE", { noCreados });
    }
    return { creados, noCreados };
  }
}
