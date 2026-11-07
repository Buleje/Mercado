/**
 * ForestRecepcionDB — la fecha real de llegada de una guía (ADR-434).
 *
 * Dos cosas, las dos por GUÍA (una GTF con tres especies son tres asientos que
 * bajaron del mismo camión):
 *
 * - `contexto`: lo que hace falta para proponer y revisar la llegada —fechas de
 *   la guía, corridas del permiso, trozas ya aserradas, meses cerrados, costo
 *   congelado—. Lo lee la pantalla ANTES de guardar.
 * - `corregir`: cambia la recepción de una guía ya recibida, con motivo, dentro
 *   de una transacción que vuelve a leer ese mismo contexto bajo lock y lo
 *   revisa con la MISMA función pura que la pantalla (`revisarLlegada`).
 *
 * Y un guard para `WoodEntriesDB.recepcionar`: `exigirLlegadaCompatible`, T3
 * al revés al recibir (una troza sin fecha que ya se aserró no puede quedar
 * fechada después de su corrida).
 *
 * `tenantId` va en la raíz de cada `where`. No importa `wood-entries.db` (él
 * importa a éste).
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";
import { auditCtpEsperando } from "@/lib/forestal/ctp-audit";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import {
  bloqueoDeVencida,
  choquesConLaSierra,
  ddmm,
  diaDelLibro,
  mensajeDeChoque,
  revisarLlegada,
  sigueALaGuia,
  vencidaAlLlegar,
  vencimientoDeGuia,
  type ConfirmacionDeVencida,
  type ContextoDeLlegada,
  type CorridaDelPermiso,
  type PiezaAserrada,
  type VencidaAlLlegar,
  type VigenciaDeGuia,
} from "@/lib/forestal/fecha-de-llegada";
import { ForestCtpCierreDB } from "./forest-ctp-cierre.db";
import { CTP_TX_OPTS, CtpInvariantError } from "./forest-ctp-consumo.db";

type Db = Prisma.TransactionClient;

/** Estados de un asiento que ya no se reciben ni se corrigen. */
const MUERTOS = ["anulado", "rechazado"] as const;

/** Tope de guías por pedido de contexto: una página de Ingresos son 25. */
export const MAX_GUIAS_CONTEXTO = 60;

const txt = (v: string | null | undefined) => (v ?? "").trim();

/** Una fecha date-only `AAAA-MM-DD` como la guarda el libro: medianoche UTC. */
const aFechaDelLibro = (dia: string) => new Date(`${dia}T00:00:00.000Z`);

/** `AAAA-MM-DD` → «dd/mm/aaaa», para el rastro. */
const dma = (dia: string) => `${ddmm(dia)}/${dia.slice(0, 4)}`;

/**
 * Expedición y vencimiento de cada guía (ADR-434 §Vencimiento), leídos de la
 * ficha de SERFOR y del cuerpo transcrito. Sólo los CUATRO textos, por SQL:
 * la ficha entera es un JSON grande (la lista de trozas va adentro) y para
 * dos fechas no se trae. La interpretación es la misma función pura que usa
 * la pantalla (`vencimientoDeGuia`).
 */
async function vigenciasDe(
  db: Db,
  tenantId: string,
  gtfNumbers: readonly string[],
): Promise<Map<string, VigenciaDeGuia>> {
  const salida = new Map<string, VigenciaDeGuia>();
  if (gtfNumbers.length === 0) return salida;
  const filas = await db.$queryRaw<
    { gtfNumber: string | null; exp: string | null; ven: string | null; ini: string | null; fin: string | null }[]
  >`
    SELECT "gtfNumber",
      "serforGtf"->>'fechaExpedicion' AS exp,
      "serforGtf"->>'fechaVencimiento' AS ven,
      "gtfDatos"->'traslado'->>'fechaInicio' AS ini,
      "gtfDatos"->'traslado'->>'fechaFin' AS fin
    FROM "WoodEntry"
    WHERE "tenantId" = ${tenantId} AND "gtfNumber" = ANY(${[...gtfNumbers]}::text[])
      AND "deletedAt" IS NULL AND "status" NOT IN ('anulado', 'rechazado')
    ORDER BY "gtfNumber", "id"
  `;
  const porGuia = new Map<string, { serforGtf: unknown; gtfDatos: unknown }[]>();
  for (const f of Array.isArray(filas) ? filas : []) {
    const gtf = txt(f?.gtfNumber);
    if (!gtf) continue;
    const lista = porGuia.get(gtf) ?? [];
    lista.push({
      serforGtf: { fechaExpedicion: f.exp, fechaVencimiento: f.ven },
      gtfDatos: { traslado: { fechaInicio: f.ini, fechaFin: f.fin } },
    });
    porGuia.set(gtf, lista);
  }
  for (const [gtf, lineas] of porGuia) salida.set(gtf, vencimientoDeGuia(lineas));
  return salida;
}

/**
 * El rastro de una llegada confirmada después del vencimiento: un renglón por
 * asiento, esperado (queda escrito ANTES de responder).
 */
async function auditarVencida(
  tenantId: string,
  ids: readonly string[],
  gtf: string,
  dia: string,
  vencida: VencidaAlLlegar,
  motivo: string,
  user: string,
  como: "recibió" | "corrigió la recepción de",
): Promise<void> {
  const detalle =
    `${como === "recibió" ? "Recibió" : "Corrigió la recepción de"} la guía ${gtf} con llegada el ${dma(dia)}, ` +
    `después de su vencimiento (${dma(vencida.vencimiento)}): confirmó que la madera viajó con la guía vencida · motivo: ${motivo.trim()}`;
  await Promise.all(
    ids.map((id) =>
      auditCtpEsperando({
        tenantId,
        action: "ctp_ingreso_recepcion_vencida",
        entity: "WoodEntry",
        entityId: id,
        detail: detalle,
        user,
      }),
    ),
  );
}

/**
 * Arma el contexto de varias guías con UNA tanda de consultas (no una por
 * guía). Recibe el cliente para poder correr dentro de la transacción.
 */
async function armarContextos(
  db: Db,
  tenantId: string,
  gtfNumbers: readonly string[],
  cierres: readonly { periodKey: string; label: string }[],
): Promise<{ contextos: ContextoDeLlegada[]; idsPorGuia: Map<string, string[]> }> {
  const pedidas = [...new Set(gtfNumbers.map(txt).filter(Boolean))];
  if (pedidas.length === 0) return { contextos: [], idsPorGuia: new Map() };

  const asientos = await db.woodEntry.findMany({
    where: { tenantId, gtfNumber: { in: pedidas }, deletedAt: null, status: { notIn: [...MUERTOS] } },
    select: {
      id: true,
      gtfNumber: true,
      gtfDate: true,
      entryDate: true,
      createdAt: true,
      fechaRecepcion: true,
      speciesCommonName: true,
      contratoId: true,
      originCode: true,
      contrato: { select: { codigo: true } },
    },
    orderBy: [{ entryDate: "asc" }, { id: "asc" }],
  });
  const ids = asientos.map((a) => a.id);
  const contratoIds = [...new Set(asientos.map((a) => a.contratoId).filter((v): v is string => Boolean(v)))];
  const codigosSinContrato = [
    ...new Set(asientos.filter((a) => !a.contratoId).map((a) => txt(a.originCode)).filter(Boolean)),
  ];

  const [especiesTrozas, aserradas, congelados, corridas, vigencias] = await Promise.all([
    ids.length
      ? db.woodEntryTroza.findMany({
          where: { tenantId, woodEntryId: { in: ids } },
          distinct: ["woodEntryId", "especieComun"],
          select: { woodEntryId: true, especieComun: true },
        })
      : Promise.resolve([]),
    ids.length
      ? db.woodEntryTroza.findMany({
          where: {
            tenantId,
            woodEntryId: { in: ids },
            noRecepcionada: false,
            consumidaEnId: { not: null },
            consumidaEn: { is: { tenantId, status: "registrado", deletedAt: null } },
          },
          select: {
            id: true,
            codigoPlanta: true,
            codificacion: true,
            fechaRecepcion: true,
            woodEntryId: true,
            consumidaEn: { select: { id: true, lineNo: true, entryDate: true } },
          },
          orderBy: { id: "asc" },
        })
      : Promise.resolve([]),
    ids.length
      ? db.forestCtpConsumo.findMany({
          where: { tenantId, woodEntryId: { in: ids }, congeladoAt: { not: null } },
          select: { woodEntryId: true },
        })
      : Promise.resolve([]),
    contratoIds.length || codigosSinContrato.length
      ? db.forestCtpEntry.findMany({
          where: {
            tenantId,
            section: "produccion",
            status: "registrado",
            deletedAt: null,
            OR: [
              ...(contratoIds.length ? [{ contratoId: { in: contratoIds } }] : []),
              ...(codigosSinContrato.length ? [{ originCode: { in: codigosSinContrato } }] : []),
            ],
          },
          select: { contratoId: true, originCode: true, speciesCommon: true, entryDate: true },
        })
      : Promise.resolve([]),
    vigenciasDe(db, tenantId, pedidas),
  ]);

  const recepcionDeAsiento = new Map(asientos.map((a) => [a.id, a.fechaRecepcion]));
  const congeladoPorAsiento = new Set(congelados.map((c) => c.woodEntryId));

  const porGuia = new Map<string, typeof asientos>();
  for (const a of asientos) {
    const lista = porGuia.get(a.gtfNumber) ?? [];
    lista.push(a);
    porGuia.set(a.gtfNumber, lista);
  }

  const idsPorGuia = new Map<string, string[]>();
  const contextos: ContextoDeLlegada[] = [];
  for (const gtf of pedidas) {
    const suyos = porGuia.get(gtf);
    if (!suyos || suyos.length === 0) continue;
    const propios = new Set(suyos.map((a) => a.id));
    idsPorGuia.set(gtf, [...propios]);

    const dias = (vs: (Date | null)[]) =>
      vs.map((v) => diaDelLibro(v)).filter((d): d is string => Boolean(d)).sort();
    const guias = dias(suyos.map((a) => a.gtfDate));
    const recepciones = dias(suyos.map((a) => a.fechaRecepcion));
    const registros = suyos.map((a) => a.createdAt.getTime()).sort((x, y) => x - y);

    /* Una especie, una vez: la troza escribe «TORNILLO» y el asiento «Tornillo». */
    const especies = new Map<string, string>();
    const sumar = (nombre: string | null | undefined) => {
      const k = claveEspecie(nombre);
      if (k && !especies.has(k)) especies.set(k, txt(nombre));
    };
    for (const a of suyos) sumar(a.speciesCommonName);
    for (const t of especiesTrozas) if (propios.has(t.woodEntryId)) sumar(t.especieComun);

    /* El permiso de la guía: su vínculo interno si lo tiene; si no, el código
       declarado. Las corridas se buscan por lo mismo. */
    const contratoId = suyos.find((a) => a.contratoId)?.contratoId ?? null;
    const codigo = txt(suyos.find((a) => txt(a.originCode))?.originCode);
    const delPermiso: CorridaDelPermiso[] = corridas
      .filter((c) =>
        contratoId ? c.contratoId === contratoId : Boolean(codigo) && txt(c.originCode) === codigo,
      )
      .map((c) => ({ especie: c.speciesCommon, dia: diaDelLibro(c.entryDate) ?? "" }))
      .filter((c) => c.dia !== "");

    const piezasAserradas: PiezaAserrada[] = aserradas.flatMap((t) =>
      propios.has(t.woodEntryId) && t.consumidaEn
        ? [
            {
              id: t.id,
              codigo: txt(t.codigoPlanta) || txt(t.codificacion) || null,
              fechaPropia: diaDelLibro(t.fechaRecepcion),
              fechaDeSuAsiento: diaDelLibro(recepcionDeAsiento.get(t.woodEntryId)),
              corrida: {
                id: t.consumidaEn.id,
                lineNo: t.consumidaEn.lineNo,
                fecha: diaDelLibro(t.consumidaEn.entryDate),
              },
            },
          ]
        : [],
    );

    contextos.push({
      gtfNumber: gtf,
      asientos: suyos.length,
      guia: guias.at(-1) ?? null,
      asiento: dias(suyos.map((a) => a.entryDate))[0] ?? null,
      recepcion: recepciones[0] ?? null,
      ultimaRecepcion: recepciones.at(-1) ?? null,
      expedicion: vigencias.get(gtf)?.expedicion ?? null,
      vencimiento: vigencias.get(gtf)?.vencimiento ?? null,
      recepcionPareja: recepciones.length === suyos.length && new Set(recepciones).size === 1,
      filasSinRecibir: suyos.filter((a) => !a.fechaRecepcion).map((a) => txt(a.speciesCommonName) || a.id),
      registradoEl: registros.length ? new Date(registros[0]).toISOString() : null,
      especies: [...especies.values()],
      permiso: suyos.find((a) => a.contrato?.codigo)?.contrato?.codigo ?? (codigo || null),
      corridas: delPermiso,
      piezasAserradas,
      mesesDeAsientos: [
        ...new Set(dias(suyos.map((a) => a.entryDate)).map((d) => d.slice(0, 7))),
      ],
      mesesCerrados: [...cierres],
      congelado: suyos.some((a) => congeladoPorAsiento.has(a.id)),
    });
  }
  return { contextos, idsPorGuia };
}

/** Los meses cerrados y no reabiertos, como los lee la regla pura. */
async function mesesCerradosDe(tenantId: string): Promise<{ periodKey: string; label: string }[]> {
  const cierres = await ForestCtpCierreDB.list(tenantId);
  return cierres.filter((c) => !c.reabierto).map((c) => ({ periodKey: c.periodKey, label: c.label }));
}

export interface CorreccionDeRecepcion {
  gtfNumber: string;
  /** `AAAA-MM-DD` antes y después. */
  antes: string | null;
  despues: string;
  asientos: number;
  trozas: number;
  /** Lo que la pantalla mostró como aviso: el servidor lo devuelve para el rastro. */
  avisos: string[];
  /** La nueva llegada cae después del vencimiento y se confirmó: `AAAA-MM-DD` del vencimiento. */
  vencida?: string;
}

export const ForestRecepcionDB = {
  /** El contexto de llegada de esas guías, en el orden pedido. Las que no existen no vuelven. */
  async contexto(tenantId: string, gtfNumbers: readonly string[]): Promise<ContextoDeLlegada[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const cierres = await mesesCerradosDe(tenantId);
    const { contextos } = await armarContextos(prisma, tenantId, gtfNumbers.slice(0, MAX_GUIAS_CONTEXTO), cierres);
    return contextos;
  },

  /**
   * Corrige la fecha de recepción de una guía YA recibida (ADR-434 §2).
   *
   * Cambia `fechaRecepcion` de TODOS los asientos vivos de la GTF, y la de sus
   * trozas que seguían a la guía (sin fecha propia o con la misma); una troza
   * que bajó en otro viaje conserva la suya. Una no recibida no se toca.
   *
   * Dentro de la transacción, primero las TROZAS y después los asientos, los
   * dos `ORDER BY id`: es el orden de los escritores de consumo por pieza, así
   * que una vinculación concurrente espera en vez de abrazarse en un deadlock,
   * y la revisión de abajo ya ve lo que esa vinculación haya escrito.
   *
   * `null` = la guía no existe en este tenant (el endpoint responde 404).
   */
  async corregir(
    tenantId: string,
    /**
     * `aceptaVencida` + `motivoVencida`: la nueva llegada cae después del
     * vencimiento de la guía y quien corrige confirma que fue así (ADR-434
     * §Vencimiento). Sin eso, esa fecha se rechaza con `GUIA_VENCIDA`.
     */
    input: { gtfNumber: string; fecha: string; motivo: string } & ConfirmacionDeVencida,
    user: string,
  ): Promise<CorreccionDeRecepcion | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const gtf = txt(input.gtfNumber);
    const motivo = txt(input.motivo);
    if (motivo.length < 3) {
      throw new CtpInvariantError(
        "Falta el motivo: corregir una fecha del libro deja rastro de por qué.",
        "MOTIVO_REQUERIDO",
      );
    }
    const hoy = limaDateKey();
    const cierres = await mesesCerradosDe(tenantId);

    const resultado = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT t."id" FROM "WoodEntryTroza" t
        JOIN "WoodEntry" e ON e."id" = t."woodEntryId"
        WHERE e."tenantId" = ${tenantId} AND e."gtfNumber" = ${gtf} AND e."deletedAt" IS NULL
          AND t."tenantId" = ${tenantId}
        ORDER BY t."id"
        FOR UPDATE OF t
      `;
      await tx.$queryRaw`
        SELECT "id" FROM "WoodEntry"
        WHERE "tenantId" = ${tenantId} AND "gtfNumber" = ${gtf} AND "deletedAt" IS NULL
        ORDER BY "id"
        FOR UPDATE
      `;

      const { contextos, idsPorGuia } = await armarContextos(tx, tenantId, [gtf], cierres);
      const ctx = contextos[0];
      if (!ctx) return null;

      const revision = revisarLlegada(input.fecha, ctx, hoy, "corregir", input);
      if (revision.bloqueo) {
        throw new CtpInvariantError(revision.bloqueo.mensaje, revision.bloqueo.codigo, {
          gtfNumber: gtf,
          fecha: input.fecha,
          ...(revision.bloqueo.codigo === "T3_ASERRADA_ANTES_DE_LLEGAR"
            ? { corridas: choquesConLaSierra(input.fecha, ctx.piezasAserradas) }
            : {}),
          ...(revision.vencida ? { vencimiento: revision.vencida.vencimiento } : {}),
        });
      }

      /* Sólo las filas YA recibidas, aunque la revisión de arriba ya frenó una
         guía a medio recibir: una fila sin fecha nunca sale de «por recibir»
         por esta puerta (es `recepcionar`, que además la valida). */
      const asientos = await tx.woodEntry.findMany({
        where: { tenantId, id: { in: idsPorGuia.get(gtf) ?? [] }, fechaRecepcion: { not: null } },
        select: { id: true, fechaRecepcion: true },
      });
      const ids = asientos.map((a) => a.id);
      const viejaDe = new Map(asientos.map((a) => [a.id, a.fechaRecepcion]));
      const trozas = await tx.woodEntryTroza.findMany({
        where: { tenantId, woodEntryId: { in: ids }, noRecepcionada: false },
        select: { id: true, woodEntryId: true, fechaRecepcion: true },
      });
      const siguen = trozas
        .filter((t) => sigueALaGuia({ fechaPropia: t.fechaRecepcion, fechaDeSuAsiento: viejaDe.get(t.woodEntryId) }))
        .map((t) => t.id);

      const nueva = aFechaDelLibro(input.fecha);
      await tx.woodEntry.updateMany({ where: { tenantId, id: { in: ids } }, data: { fechaRecepcion: nueva } });
      if (siguen.length > 0) {
        await tx.woodEntryTroza.updateMany({
          where: { tenantId, id: { in: siguen } },
          data: { fechaRecepcion: nueva },
        });
      }
      return {
        gtfNumber: gtf,
        antes: ctx.recepcion,
        despues: input.fecha,
        asientos: ids.length,
        trozas: siguen.length,
        avisos: revision.avisos,
        ...(revision.vencida ? { vencida: revision.vencida.vencimiento } : {}),
        ids,
        vencidaConfirmada: revision.vencida ?? null,
      };
    }, CTP_TX_OPTS);

    if (!resultado) return null;
    const { ids, vencidaConfirmada, ...salida } = resultado;

    /* El rastro va ANTES de responder: «queda auditada» es parte del pedido, y
       en Vercel lo que corre después de la respuesta puede no terminar. Un
       renglón por asiento: la historia de cada fila del libro lo muestra. */
    const detalle =
      `Corrigió la recepción de la guía ${salida.gtfNumber}: ` +
      `${salida.antes ? ddmm(salida.antes) + "/" + salida.antes.slice(0, 4) : "sin fecha"} → ` +
      `${ddmm(salida.despues)}/${salida.despues.slice(0, 4)}` +
      ` · ${salida.trozas} troza${salida.trozas === 1 ? "" : "s"} con la fecha nueva` +
      ` · motivo: ${motivo}` +
      (vencidaConfirmada ? ` · después del vencimiento (${dma(vencidaConfirmada.vencimiento)}), confirmado` : "") +
      (salida.avisos.length > 0 ? ` · avisos al guardar: ${salida.avisos.join(" ")}` : "");
    await Promise.all([
      ...ids.map((id) =>
        auditCtpEsperando({
          tenantId,
          action: "ctp_ingreso_recepcion_corregida",
          entity: "WoodEntry",
          entityId: id,
          detail: detalle,
          user,
        }),
      ),
      ...(vencidaConfirmada
        ? [
            auditarVencida(
              tenantId,
              ids,
              salida.gtfNumber,
              salida.despues,
              vencidaConfirmada,
              input.motivoVencida ?? "",
              user,
              "corrigió la recepción de",
            ),
          ]
        : []),
    ]);
    invalidar(tenantId);
    return salida;
  },

  /**
   * Revisión de la guía ENTERA antes de recibirla (ADR-434 §1), con la misma
   * regla que la fila del modal. Va antes de tocar el primer asiento: las
   * trozas cuelgan de UNO de ellos (ADR-432), y si ése es el segundo, frenar
   * recién ahí dejaría la guía recibida a medias.
   *
   * No reemplaza el guard con lock de `exigirLlegadaCompatible`: lo adelanta.
   */
  async revisarAntesDeRecibir(
    tenantId: string,
    woodEntryIds: readonly string[],
    dia: string,
    /** Llegada después del vencimiento confirmada con motivo (ADR-434 §Vencimiento). */
    confirmacion: ConfirmacionDeVencida = {},
  ): Promise<void> {
    if (!tenantId) throw new Error("tenantId is required");
    if (woodEntryIds.length === 0) return;
    const guias = await prisma.woodEntry.findMany({
      where: { tenantId, id: { in: [...woodEntryIds] }, deletedAt: null },
      select: { gtfNumber: true },
      distinct: ["gtfNumber"],
    });
    const hoy = limaDateKey();
    const cierres = await mesesCerradosDe(tenantId);
    const { contextos } = await armarContextos(
      prisma,
      tenantId,
      guias.map((g) => g.gtfNumber),
      cierres,
    );
    for (const ctx of contextos) {
      const { bloqueo, vencida } = revisarLlegada(dia, ctx, hoy, "recibir", confirmacion);
      if (bloqueo) {
        /* Con el N° de guía adelante: «Recepcionar seleccionadas» manda varias
           guías en un pedido y el mensaje tiene que decir cuál frenó. */
        throw new CtpInvariantError(
          bloqueo.codigo === "GUIA_VENCIDA" ? `Guía ${ctx.gtfNumber} — ${bloqueo.mensaje}` : bloqueo.mensaje,
          bloqueo.codigo,
          { gtfNumber: ctx.gtfNumber, fecha: dia, ...(vencida ? { vencimiento: vencida.vencimiento } : {}) },
        );
      }
    }
  },

  /**
   * La guía vencida al RECIBIR un asiento (ADR-434 §Vencimiento), para cada
   * puerta que fecha la llegada —la del bloque, la de la ficha y la de un
   * asiento suelto—: si `dia` cae después del vencimiento de la guía y no se
   * confirmó con motivo, frena con `GUIA_VENCIDA`. Confirmado, devuelve la
   * vencida para que quien recibe la audite; sin vencimiento conocido, `null`.
   */
  async exigirGuiaVigente(
    tenantId: string,
    gtfNumber: string,
    dia: string,
    confirmacion: ConfirmacionDeVencida = {},
  ): Promise<VencidaAlLlegar | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const gtf = txt(gtfNumber);
    const vigencia = (await vigenciasDe(prisma, tenantId, [gtf])).get(gtf) ?? null;
    const vencida = vencidaAlLlegar(dia, vigencia);
    const bloqueo = bloqueoDeVencida(vencida, confirmacion);
    if (bloqueo) {
      throw new CtpInvariantError(`Guía ${gtf} — ${bloqueo.mensaje}`, bloqueo.codigo, {
        gtfNumber: gtf,
        fecha: dia,
        vencimiento: vencida?.vencimiento,
      });
    }
    return vencida;
  },

  /** El rastro de una recepción confirmada después del vencimiento (lo llama `recepcionar`). */
  async auditarRecepcionVencida(
    tenantId: string,
    woodEntryId: string,
    gtfNumber: string,
    dia: string,
    vencida: VencidaAlLlegar,
    motivo: string,
    user: string,
  ): Promise<void> {
    await auditarVencida(tenantId, [woodEntryId], gtfNumber, dia, vencida, motivo, user, "recibió");
  },

  /**
   * T3 al RECIBIR (ADR-434): las trozas de estos asientos que quedan fechadas
   * con `dia` —las que no tienen fecha propia— no pueden haber entrado a una
   * corrida viva anterior. Va dentro de la transacción de `recepcionar`, antes
   * del UPDATE, con el mismo lock que los escritores de consumo.
   */
  async exigirLlegadaCompatible(
    tx: Db,
    tenantId: string,
    woodEntryIds: readonly string[],
    dia: string,
    gtf: string,
  ): Promise<void> {
    if (woodEntryIds.length === 0) return;
    await tx.$queryRaw`
      SELECT "id" FROM "WoodEntryTroza"
      WHERE "tenantId" = ${tenantId} AND "woodEntryId" = ANY(${[...woodEntryIds]}::text[])
        AND "fechaRecepcion" IS NULL AND "noRecepcionada" = false
      ORDER BY "id"
      FOR UPDATE
    `;
    const aserradas = await tx.woodEntryTroza.findMany({
      where: {
        tenantId,
        woodEntryId: { in: [...woodEntryIds] },
        fechaRecepcion: null,
        noRecepcionada: false,
        consumidaEnId: { not: null },
        consumidaEn: { is: { tenantId, status: "registrado", deletedAt: null } },
      },
      select: {
        id: true,
        codigoPlanta: true,
        codificacion: true,
        consumidaEn: { select: { id: true, lineNo: true, entryDate: true } },
      },
    });
    const choques = choquesConLaSierra(
      dia,
      aserradas.flatMap((t) =>
        t.consumidaEn
          ? [
              {
                id: t.id,
                codigo: txt(t.codigoPlanta) || txt(t.codificacion) || null,
                fechaPropia: null,
                fechaDeSuAsiento: null,
                corrida: { id: t.consumidaEn.id, lineNo: t.consumidaEn.lineNo, fecha: t.consumidaEn.entryDate },
              },
            ]
          : [],
      ),
    );
    if (choques.length > 0) {
      throw new CtpInvariantError(mensajeDeChoque(gtf, dia, choques), "T3_ASERRADA_ANTES_DE_LLEGAR", {
        gtfNumber: gtf,
        fecha: dia,
        corridas: choques,
      });
    }
  },
};

/** Las lecturas que dependen de la recepción: ingresos, patio y ficha del permiso. */
function invalidar(tenantId: string): void {
  for (const prefijo of ["wood-entries", "forest-ctp", "forest-contrato", "forestal:lote-aserrio"]) {
    try {
      invalidateByPrefix(`${prefijo}:${tenantId}`);
    } catch (err) {
      logger.error("[forest-recepcion] no se pudo invalidar la caché", { prefijo, error: String(err) });
    }
  }
}
