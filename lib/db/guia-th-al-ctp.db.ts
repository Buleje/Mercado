import "server-only";
import { prisma } from "@/lib/prisma";
import { invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";
import { isSpecializationEnabled } from "@/lib/specializations";
import { auditLoth } from "@/lib/forestal/loth-audit";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { leerGtfDatos, type GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { ORIGEN_SERFOR, regionDeSerfor, sinTildesUp } from "@/lib/forestal/serfor-origen";
import {
  bloqueoDeVencida,
  problemaDeLlegada,
  vencidaAlLlegar,
  vencimientoDeGuia,
} from "@/lib/forestal/fecha-de-llegada";
import {
  destinoDeGuiaTh,
  foliosEnTexto,
  identidadDeGuiaTh,
  ingresosDesdeGuiaTh,
  mismaGuiaTh,
  leerItemsGuiaTh,
  mensajeDelPase,
  soloDigitos,
  atarTrozadosDeGuia,
  type CodigoGuiaTh,
  type LineaDeIngresoTh,
  type PaseAlCtp,
  type PlantaPropia,
  type PreparadoRecibirTh,
  type RecibidaTh,
  type RecibirGuiaThInput,
} from "@/lib/forestal/guia-th-al-ctp";
import { huellaDeReparto, planearConteo, type PiezaContada } from "@/lib/forestal/conteo-guia-th";
import { findSpeciesByCommonName } from "@/data/forestry-species";
import type { Prisma, WoodOriginType } from "@/lib/generated/prisma/client";
import { GuiasGuardadasDB } from "./guias-guardadas.db";
import { WoodEntriesDB, type WoodEntryDesdeGtfInput } from "./wood-entries.db";
import { GtfNumeroDB } from "./gtf-numero.db";
import { ForestCtpFichaDB } from "./forest-ctp-ficha.db";
import { ForestContratoDB } from "./forest-contrato.db";
import { CtpInvariantError } from "./forest-ctp-consumo.db";

/**
 * GuiaThAlCtpDB — el puente entre los dos libros del mismo negocio
 * (28-09-2026): la guía que emite el Libro TH queda GUARDADA en el Libro CTP
 * (ADR-442) para recibirla, y «Recibir» la registra con sus trozas sin tipear.
 *
 *   · `pasarAlCtp`  — después de «Despachar con guía» en el TH. Idempotente por
 *                     N° de guía (tramo a tramo): si ya está guardada o ya
 *                     entró al libro, no crea nada.
 *   · `alAnular`    — la guía se anuló en el TH: la guardada se da de baja.
 *                     (Anular una guía cuya madera ya entró al CTP lo frena
 *                     antes `GtfNumeroDB.exigirSinIngresosEnElCtp`, con 409.)
 *   · `preparar`    — lo que la pantalla muestra antes de recibir: los MISMOS
 *                     renglones que va a registrar `recibir`.
 *   · `recibir`     — en UNA transacción, bajo el candado del N° de la guía
 *                     (`GtfNumeroDB.bloquear`, el mismo de «Anular en el TH»
 *                     y del alta desde SERFOR): relee la guardada, la guía
 *                     del TH y los ingresos vivos del N°, frena las trozas que
 *                     ya estén en el libro y registra un ingreso por especie
 *                     con sus trozas (`crearDesdeGtfEnTx`). Después, la
 *                     recepción con la fecha que pone quien recibe
 *                     (`recepcionarGuia`, ADR-434).
 *
 * Todo dentro del MISMO tenant: la guía del TH, la guardada y el ingreso son
 * filas de este negocio. La regla de «a quién va» (RUC del destinatario = RUC
 * de la Ficha del CTP) decide si una guía propia entra al libro de la planta
 * propia; una guía a otra empresa nunca cruza a ningún lado.
 */

type Guia = NonNullable<Awaited<ReturnType<typeof leerGuiaTh>>>;

/**
 * Lo que impide recibir desde acá, con su status HTTP: 409 choca con algo que
 * ya existe o cambió (ya entró, se quitó, anulada, otra guía, troza repetida);
 * 422 es un dato de la guía que no alcanza para registrarla.
 */
export class GuiaThError extends Error {
  constructor(
    message: string,
    /** La lista vive en `CodigoGuiaTh` (puro): la pantalla la lee sin importar la DB class. */
    readonly code: CodigoGuiaTh,
    readonly status: 409 | 422,
  ) {
    super(message);
    this.name = "GuiaThError";
  }
}

/** La guía del TH por su id, dentro del negocio. */
async function leerGuiaTh(tenantId: string, gtfId: string) {
  return prisma.forestGtf.findFirst({
    where: { tenantId, id: gtfId, deletedAt: null },
    select: {
      id: true, planId: true, gtfNumber: true, gtfDate: true, tipo: true, status: true,
      titularName: true, tituloHabilitante: true, parcelaCorta: true,
      items: true, volumenTotalM3: true, gtfDatos: true,
    },
  });
}

type Db = Prisma.TransactionClient | typeof prisma;

/** El 409 de una guía que ya no es la que se contó (ADR-450). */
const guiaCambio = (gtfNumber: string) =>
  new GuiaThError(
    `La lista de la GTF ${gtfNumber} cambió en tu Libro TH desde que la abriste: vuelve a abrirla y cuenta otra vez.`,
    "GUIA_CAMBIO",
    409,
  );

const codigoDe = (t: { codificacion: string | null; orden: number }) => t.codificacion?.trim() || `N° ${t.orden}`;

/**
 * Cada troza de la guía con su línea de Trozado del Libro TH (ADR-450 L4). La
 * base trae SÓLO candidatas de este negocio (`tenantId` en el WHERE): las que
 * nombra la guía por id y las vigentes con esos códigos. Qué se ata lo decide
 * `atarTrozadosDeGuia` (puro, probado sin base).
 */
async function atarTrozados(
  db: Db,
  tenantId: string,
  planId: string | null,
  lineas: readonly LineaDeIngresoTh[],
): Promise<{ lineas: LineaDeIngresoTh[]; avisos: string[] }> {
  const trozas = lineas.flatMap((l) => l.trozas);
  const ids = [...new Set(trozas.map((t) => t.trozadoId).filter((x): x is string => !!x))];
  const codigos = [...new Set(trozas.map((t) => t.codificacion?.trim()).filter((x): x is string => !!x))];
  if (ids.length === 0 && codigos.length === 0) return { lineas: [...lineas], avisos: [] };
  const filas = await db.forestLothEntry.findMany({
    where: {
      tenantId,
      section: "trozado",
      OR: [
        { id: { in: ids } },
        { trozaCode: { in: codigos, mode: "insensitive" }, status: "registrado", deletedAt: null },
      ],
    },
    select: { id: true, trozaCode: true, treeCode: true, planId: true, status: true, deletedAt: true },
  });
  return atarTrozadosDeGuia(lineas, filas, planId);
}

/** Un día `AAAA-MM-DD` como se escribe en el libro: mediodía UTC (cae en el mismo mes de Lima). */
const aMediodia = (dia: string) => new Date(`${dia}T12:00:00.000Z`);
const diaDe = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const ddmm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

/**
 * El documento del proveedor del ingreso: el del TITULAR. En la guía del TH el
 * propietario del producto es el titular salvo que se haya dicho otro; si es
 * otro, su documento no es el del titular y el ingreso lo deja vacío (la misma
 * regla que `documentoDelTitular` del alta desde SERFOR).
 */
function docDelTitular(datos: GtfDatos, titular: string): {
  providerDocument: string | null;
  providerDocumentType: "RUC" | "DNI" | null;
} {
  const p = datos.propietario;
  const esElTitular = p.esElCtp || sinTildesUp(p.nombre) === sinTildesUp(titular);
  const n = soloDigitos(p.docNumero);
  if (!esElTitular || !n) return { providerDocument: null, providerDocumentType: null };
  const tipo = n.length === 11 ? "RUC" : n.length === 8 ? "DNI" : null;
  return { providerDocument: n, providerDocumentType: tipo };
}

export class GuiaThAlCtpDB {
  /**
   * La planta propia según la Ficha del CTP, leída de la base (sin el caché
   * por instancia): su RUC decide si una guía del TH pasa al Libro CTP, y el
   * resto sirve para poner «es mi planta» como destinatario sin tipear.
   */
  static async rucPropio(tenantId: string): Promise<PlantaPropia> {
    if (!tenantId) throw new Error("tenantId is required");
    const f = await ForestCtpFichaDB.getFresco(tenantId);
    const t = (v: string | null | undefined) => v?.trim() || "";
    return {
      ruc: soloDigitos(f.ruc) || null,
      nombre: t(f.razonSocial) || t(f.nombreCtp) || null,
      direccion: t(f.direccion),
      departamento: t(f.region),
      provincia: t(f.provincia),
      distrito: t(f.distrito),
    };
  }

  /**
   * Después de emitir la guía en el Libro TH: la deja guardada en el Libro CTP
   * para recibirla. No tira: la guía del TH ya quedó, y lo que pase acá se
   * devuelve para decírselo a la persona.
   */
  static async pasarAlCtp(tenantId: string, gtfId: string, user: string): Promise<PaseAlCtp> {
    if (!tenantId) throw new Error("tenantId is required");
    try {
      const gtf = await leerGuiaTh(tenantId, gtfId);
      if (!gtf || gtf.status !== "emitida") return { estado: "error", mensaje: mensajeDelPase("error") };
      if (gtf.tipo !== "trozas") return { estado: "no_es_de_trozas", mensaje: "" };
      if (!(await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro"))) {
        return { estado: "sin_libro_ctp", mensaje: "" };
      }
      const datos = leerGtfDatos(gtf.gtfDatos);
      const { ruc } = await GuiaThAlCtpDB.rucPropio(tenantId);
      const destino = destinoDeGuiaTh(datos, ruc);
      if (!destino.propio) return { estado: destino.motivo, mensaje: destino.mensaje };

      const ya = await GuiasGuardadasDB.porNumeroGtf(tenantId, gtf.gtfNumber);
      if (ya) return { estado: "ya_estaba", mensaje: mensajeDelPase("ya_estaba"), guardadaId: ya.id };
      if ((await GtfNumeroDB.ingresosVivos(prisma, tenantId, gtf.gtfNumber)).length > 0) {
        return { estado: "ya_ingresada", mensaje: mensajeDelPase("ya_ingresada") };
      }

      const titular = gtf.titularName?.trim() || datos.propietario.nombre.trim() || null;
      const contratoId = await GuiaThAlCtpDB.contratoDeLaGuia(tenantId, gtf, null);
      const r = await GuiasGuardadasDB.crear(
        tenantId,
        {
          numeroRegistro: null,
          gtfNumber: gtf.gtfNumber,
          gtfDate: diaDe(gtf.gtfDate),
          titularNombre: titular,
          titularDoc: titular ? docDelTitular(datos, titular).providerDocument : null,
          permisoCodigo: gtf.tituloHabilitante?.trim() || datos.titulos[0]?.trim() || null,
          contratoId,
          notas: null,
          serforGtf: null,
          serforConsultadaEn: null,
        },
        user,
        "viene de tu Libro TH",
      );
      if (!r.ok) {
        if (r.error === "ya_guardada") return { estado: "ya_estaba", mensaje: mensajeDelPase("ya_estaba"), guardadaId: r.id };
        if (r.error === "ya_ingresada") return { estado: "ya_ingresada", mensaje: mensajeDelPase("ya_ingresada") };
        logger.warn("[guia-th-al-ctp] no se pudo guardar la guía", { tenantId, error: r.error });
        return { estado: "error", mensaje: mensajeDelPase("error") };
      }
      const items = leerItemsGuiaTh(gtf.items);
      auditLoth({
        tenantId,
        action: "loth_gtf_al_ctp",
        entity: "ForestGtf",
        entityId: gtf.id,
        detail: `La GTF ${gtf.gtfNumber} pasó a tu Libro CTP para recibirla: ${items.length} troza(s)${gtf.volumenTotalM3 != null ? `, ${fmtM3(Number(gtf.volumenTotalM3))} m³` : ""}`,
        user,
      });
      return { estado: "creada", mensaje: mensajeDelPase("creada"), guardadaId: r.id };
    } catch (err) {
      logger.error("[guia-th-al-ctp] pasarAlCtp failed", { tenantId, error: String(err) });
      return { estado: "error", mensaje: mensajeDelPase("error") };
    }
  }

  /**
   * Se anuló la guía en el Libro TH. No tira: la anulación ya quedó; lo que
   * pase en el CTP se devuelve para avisarlo.
   */
  static async alAnular(
    tenantId: string,
    gtf: { gtfNumber: string; tituloHabilitante: string | null; titularName: string | null; gtfDatos: unknown },
    motivo: string,
    user: string,
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    try {
      if (!(await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro"))) {
        return { estado: "sin_guardada" as const, mensaje: "" };
      }
      const id = identidadDeGuiaTh(gtf, leerGtfDatos(gtf.gtfDatos));
      return await GuiasGuardadasDB.bajaPorGuiaTh(tenantId, { gtfNumber: gtf.gtfNumber, ...id }, motivo, user);
    } catch (err) {
      logger.error("[guia-th-al-ctp] alAnular failed", { tenantId, error: String(err) });
      return {
        estado: "error" as const,
        mensaje: "La guía quedó anulada acá, pero no se pudo revisar tu Libro CTP: fíjate en sus guías por recibir.",
      };
    }
  }

  /**
   * Lo que se va a registrar al recibir. `null` = la guardada no existe.
   * Tira `GuiaThError` cuando no se puede recibir desde acá (con el motivo en
   * palabras de la persona y su status HTTP).
   */
  static async preparar(tenantId: string, guardadaId: string): Promise<PreparadoRecibirTh | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const x = await GuiaThAlCtpDB.contexto(tenantId, guardadaId);
    if (!x) return null;
    const { guardada, gtf, datos, reparto } = x;
    /* ADR-450: el árbol de cada troza y la huella de la lista que se va a contar. */
    const atadas = await atarTrozados(prisma, tenantId, gtf.planId, reparto.lineas);
    return {
      guardadaId: guardada.id,
      gtfNumber: guardada.gtfNumber,
      gtfDate: diaDe(gtf.gtfDate),
      titular: guardada.titularNombre,
      permiso: guardada.permisoCodigo,
      destinatario: datos.destinatario.nombre.trim() || null,
      vencimiento: vencimientoDeGuia([{ gtfDatos: gtf.gtfDatos }]).vencimiento,
      lineas: atadas.lineas,
      totalM3: reparto.totalM3,
      trozas: reparto.trozas,
      avisos: [...reparto.avisos, ...atadas.avisos],
      huella: huellaDeReparto(reparto.lineas),
    };
  }

  /**
   * Recibe la guía CONTANDO sus trozas (ADR-450 L1): registra un ingreso por
   * especie con TODAS las trozas de la guía —la que no llegó entra marcada
   * «no llegó», la que llegó distinta guarda lo medido en planta sin tocar la
   * guía— y la recepciona con la fecha de llegada. El m³ de cada ingreso es
   * el de la guía (I2); la faltante se informa.
   *
   * Si el ingreso entra pero la recepción falla (p.ej. una troza ya aserrada),
   * el ingreso queda y se dice por qué: es el mismo estado que «por recibir»
   * de Ingresos, no media guía perdida.
   */
  static async recibir(
    tenantId: string,
    guardadaId: string,
    input: RecibirGuiaThInput,
    user: string,
  ): Promise<RecibidaTh | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const x = await GuiaThAlCtpDB.contexto(tenantId, guardadaId);
    if (!x) return null;
    const { guardada, gtf, datos, reparto } = x;
    const dia = input.fechaLlegada;

    /* La fecha y el vencimiento se revisan ANTES de registrar: si frenaran en
       la recepción, el ingreso ya estaría hecho y la guía quedaría a medias. */
    const imposible = problemaDeLlegada(dia, gtf.gtfDate, limaDateKey());
    if (imposible) {
      throw new CtpInvariantError(`Guía ${guardada.gtfNumber}: ${imposible}`, "VALIDACION", { fecha: dia });
    }
    const confirmacion = { aceptaVencida: input.aceptaVencida, motivoVencida: input.motivoVencida };
    const vencida = vencidaAlLlegar(dia, vencimientoDeGuia([{ gtfDatos: gtf.gtfDatos }]));
    const bloqueo = bloqueoDeVencida(vencida, confirmacion);
    if (bloqueo) {
      throw new CtpInvariantError(`Guía ${guardada.gtfNumber} — ${bloqueo.mensaje}`, bloqueo.codigo, {
        gtfNumber: guardada.gtfNumber,
        fecha: dia,
        vencimiento: vencida?.vencimiento,
      });
    }
    /* ADR-450: la lista que se contó es ésta y el conteo cierra. Se revisa acá
       para fallar rápido y OTRA VEZ bajo el candado, sobre la lista releída. */
    if (input.huella !== huellaDeReparto(reparto.lineas)) throw guiaCambio(guardada.gtfNumber);
    const previo = planearConteo(reparto.lineas, input.conteo, input.confirmaFaltantes);
    if (!previo.ok) throw new GuiaThError(previo.motivo, previo.code, 422);

    const titular = guardada.titularNombre?.trim() || gtf.titularName?.trim() || datos.propietario.nombre.trim() || "Sin titular declarado";
    const origenRecurso = sinTildesUp(datos.guia.origenRecurso);
    const region = regionDeSerfor(datos.guia.departamento);
    const base: Omit<WoodEntryDesdeGtfInput, "lineas"> = {
      entryDate: aMediodia(dia),
      docType: "GTF",
      serforNumeroRegistro: guardada.numeroRegistro ?? null,
      serforGtf: null,
      gtfDatos: datos as unknown as Record<string, unknown>,
      // El N° como lo tiene la guardada: es la llave de sus papeles (ADR-438).
      gtfNumber: guardada.gtfNumber,
      gtfDate: gtf.gtfDate,
      providerName: titular,
      ...docDelTitular(datos, titular),
      originType: (ORIGEN_SERFOR[origenRecurso] ?? "otro") as WoodOriginType,
      originCode: guardada.permisoCodigo ?? gtf.tituloHabilitante ?? datos.titulos[0] ?? null,
      contratoId: (await GuiaThAlCtpDB.contratoDeLaGuia(tenantId, gtf, guardada.contratoId)) ?? undefined,
      originSourceNumber: datos.guia.resolucion.trim() || null,
      originRegion: region && region !== "Otra" ? region : null,
      originDistrict: datos.guia.distrito.trim() || null,
      origenAlta: "libro_th",
      createdBy: user,
    };
    /** Las líneas del alta: la guía, con lo que dijo el conteo pieza por pieza. */
    const lineasDelAlta = (lineas: readonly LineaDeIngresoTh[], piezas: readonly PiezaContada[]): WoodEntryDesdeGtfInput["lineas"] => {
      const porOrden = new Map(piezas.map((p) => [p.orden, p]));
      return lineas.map((l) => {
        const cat = findSpeciesByCommonName(l.especieComun);
        return {
          especieComun: l.especieComun,
          especieCientifica: l.especieCientifica ?? cat?.scientificName ?? null,
          cites: l.cites || (cat?.cites ?? false),
          unit: "m3",
          presentacion: l.presentacion,
          // El m³ de la GUÍA (I2 con ≤): lo que no llegó se informa, no se descuenta.
          volumenM3: l.volumenM3,
          piezas: l.piezas,
          trozas: l.trozas.map((t) => {
            const p = porOrden.get(t.orden);
            return {
              orden: t.orden,
              codificacion: t.codificacion,
              especieComun: t.especieComun,
              especieCientifica: t.especieCientifica,
              dimensiones: t.dimensiones,
              largoM: t.largoM,
              diametroCm: t.diametroCm,
              d1Cm: t.d1Cm,
              d2Cm: t.d2Cm,
              cantidad: t.cantidad,
              volumenM3: t.volumenM3,
              parcela: t.parcela,
              lothTrozadoId: t.trozadoId,
              arbolCodigo: t.arbolCodigo,
              noRecepcionada: p ? !p.llego : false,
              recepcionObs: p?.recepcionObs ?? null,
              recibida: p?.recibida ?? null,
            };
          }),
        };
      });
    };
    /* Mes cerrado y permiso del negocio: antes de abrir la transacción. */
    const contratoId = await WoodEntriesDB.prepararAltaDesdeGtf(tenantId, {
      ...base,
      lineas: lineasDelAlta(reparto.lineas, previo.piezas),
    });

    /* TODO en una transacción, bajo el candado del N°: dos «Recibir» a la vez,
       un alta desde SERFOR de la misma guía o un «Anular» en el TH esperan
       su turno y, al entrar, releen lo que el otro dejó. */
    const hecho = await prisma.$transaction(
      async (tx) => {
        await GtfNumeroDB.bloquear(tx, tenantId, guardada.gtfNumber);
        const viva = await tx.forestGuiaGuardada.findFirst({
          where: { id: guardada.id, tenantId, deletedAt: null },
          select: { id: true },
        });
        if (!viva) {
          throw new GuiaThError(
            "Esta guía ya no está entre tus guías por recibir: se quitó o se anuló en tu Libro TH. Actualiza la lista.",
            "YA_NO_ESTA",
            409,
          );
        }
        const th = await tx.forestGtf.findFirst({
          where: { id: gtf.id, tenantId, deletedAt: null },
          select: { status: true, items: true, planId: true, parcelaCorta: true, volumenTotalM3: true },
        });
        if (th?.status !== "emitida") {
          throw new GuiaThError(
            `La GTF ${gtf.gtfNumber} se anuló en tu Libro TH: no se recibe.`,
            "GUIA_ANULADA",
            409,
          );
        }
        const yaEsta = await GtfNumeroDB.ingresosVivos(tx, tenantId, guardada.gtfNumber);
        if (yaEsta.length > 0) {
          throw new GuiaThError(
            `La guía ${guardada.gtfNumber} ya entró al libro como ${yaEsta.length === 1 ? "ingreso" : "ingresos"} ${foliosEnTexto(yaEsta.map((e) => e.libroNro))}: la ves en Ingresos.`,
            "YA_INGRESADA",
            409,
          );
        }
        /* ADR-450: la lista RELEÍDA bajo el candado, no la de antes. */
        const fresco = ingresosDesdeGuiaTh(leerItemsGuiaTh(th.items), {
          parcela: th.parcelaCorta,
          volumenDeclaradoM3: th.volumenTotalM3 != null ? Number(th.volumenTotalM3) : null,
          gtfNumber: gtf.gtfNumber,
        });
        if (!fresco.ok || huellaDeReparto(fresco.lineas) !== input.huella) throw guiaCambio(guardada.gtfNumber);
        const plan = planearConteo(fresco.lineas, input.conteo, input.confirmaFaltantes);
        if (!plan.ok) throw new GuiaThError(plan.motivo, plan.code, 422);
        const atadas = await atarTrozados(tx, tenantId, th.planId, fresco.lineas);
        const alta: WoodEntryDesdeGtfInput = { ...base, lineas: lineasDelAlta(atadas.lineas, plan.piezas) };

        const piezas = atadas.lineas.flatMap((l) =>
          l.trozas.map((t) => ({ codificacion: t.codificacion, especie: t.especieComun ?? l.especieComun, lothTrozadoId: t.trozadoId })),
        );
        const repetidas = await GtfNumeroDB.trozasYaEnElLibro(tx, tenantId, piezas, alta.originCode ?? null);
        if (repetidas.length > 0) {
          const r = repetidas[0];
          const mas = repetidas.length > 1 ? ` (y ${repetidas.length - 1} más)` : "";
          throw new GuiaThError(
            `La troza ${r.codificacion}${mas} ya está en tu libro, en la guía ${r.gtfNumber} (${foliosEnTexto([r.libroNro])}): una pieza no entra dos veces. Revisa esa guía antes de recibir esta.`,
            "TROZA_YA_EN_EL_LIBRO",
            409,
          );
        }
        const creados = await WoodEntriesDB.crearDesdeGtfEnTx(tx, tenantId, alta, contratoId);
        return { creados, alta, plan, fresco, avisos: [...fresco.avisos, ...atadas.avisos, ...plan.avisos] };
      },
      { timeout: 60_000, maxWait: 15_000 },
    );
    WoodEntriesDB.despuesDeAltaDesdeGtf(tenantId, hecho.alta, hecho.creados);
    const creados = hecho.creados.map((c) => c.entry);
    const { resumen, piezas } = hecho.plan;

    const recepcion = await WoodEntriesDB.recepcionarGuia(
      tenantId,
      creados.map((e) => e.id),
      dia,
      user,
      input.observacion,
      confirmacion,
    );

    const noLlegaron = piezas.filter((p) => !p.llego).map((p) => codigoDe(p));
    const escaneadas = piezas.filter((p) => p.llego && p.como === "escaneada").length;
    const aMano = piezas.filter((p) => p.llego && p.como === "a_mano").length;
    const sobrantes = [...new Set((input.sobrantes ?? []).map((c) => c.trim()).filter(Boolean))];
    auditCtp({
      tenantId,
      action: "ctp_guia_th_recibir",
      entity: "ForestGuiaGuardada",
      entityId: guardada.id,
      detail:
        `La guía ${guardada.gtfNumber} de tu Libro TH entró al libro con sus ${hecho.fresco.trozas} troza(s) (${fmtM3(hecho.fresco.totalM3)} m³ de la guía)` +
        ` · contadas: ${resumen.llegaron} llegaron (${escaneadas} escaneada(s), ${aMano} a mano)` +
        (noLlegaron.length ? `, ${noLlegaron.length} no llegaron (${noLlegaron.join(", ")}) — faltan ${fmtM3(resumen.m3NoLlego)} m³` : "") +
        (resumen.distintas ? ` · ${resumen.distintas} con otra medida (${fmtM3(resumen.m3Recibido)} m³ recibidos)` : "") +
        (sobrantes.length ? ` · escaneadas y no están en la guía: ${sobrantes.join(", ")}` : "") +
        (recepcion.fallo ? ` · la recepción del ${ddmm(dia)} quedó pendiente: ${recepcion.fallo.motivo}` : ` · recibida el ${ddmm(dia)}`),
      user,
    });
    auditLoth({
      tenantId,
      action: "loth_gtf_al_ctp",
      entity: "ForestGtf",
      entityId: gtf.id,
      detail: `La GTF ${gtf.gtfNumber} se ${recepcion.fallo ? "registró" : "recibió"} en tu Libro CTP el ${ddmm(dia)}: ${creados.length} ingreso(s), ${resumen.llegaron} de ${resumen.total} troza(s) llegaron`,
      user,
    });
    try {
      invalidateByPrefix(`forest-gtf:${tenantId}`);
      invalidateByPrefix(`forest-loth:${tenantId}`);
    } catch {
      /* cache best-effort */
    }

    const avisos = [...hecho.avisos];
    if (sobrantes.length > 0) {
      avisos.push(
        `${sobrantes.length === 1 ? "Escaneaste un código que no viene" : `Escaneaste ${sobrantes.length} códigos que no vienen`} en esta guía (${sobrantes.slice(0, 5).join(", ")}${sobrantes.length > 5 ? "…" : ""}): quedó anotado en la auditoría.`,
      );
    }
    return {
      ingresos: creados.map((e) => ({
        id: e.id,
        libroNro: e.libroNro,
        especie: e.speciesCommonName,
        volumeM3: Number(e.volumeM3),
        pieces: e.pieces,
      })),
      trozas: hecho.fresco.trozas,
      totalM3: hecho.fresco.totalM3,
      fecha: dia,
      recibida: !recepcion.fallo,
      motivoSinRecibir: recepcion.fallo?.motivo ?? null,
      avisos,
      llegaron: resumen.llegaron,
      noLlegaron,
      distintas: resumen.distintas,
      m3Recibido: resumen.m3Recibido,
      brechaM3: resumen.brechaM3,
      resumen,
    };
  }

  /* ── Internos ─────────────────────────────────────────────────────────── */

  /**
   * La guardada, su guía del TH y los renglones que salen de ella. Frena con
   * `GuiaThError` todo lo que impide recibir desde acá.
   */
  private static async contexto(tenantId: string, guardadaId: string) {
    const vista = await GuiasGuardadasDB.obtener(tenantId, guardadaId);
    if (!vista) return null;
    if (vista.ingreso) {
      throw new GuiaThError(`La guía ${vista.gtfNumber} ya entró al libro: la ves en Ingresos.`, "YA_INGRESADA", 409);
    }
    const vinculo = vista.libroTh;
    if (!vinculo) {
      throw new GuiaThError("Esta guía no viene de tu Libro TH: regístrala con «Ingresar».", "SIN_GUIA_TH", 409);
    }
    const gtf = await leerGuiaTh(tenantId, vinculo.gtfId);
    if (!gtf || gtf.status !== "emitida") {
      throw new GuiaThError(`La GTF ${vinculo.gtfNumber} está anulada en tu Libro TH: no se recibe.`, "GUIA_ANULADA", 409);
    }
    const datos = leerGtfDatos(gtf.gtfDatos);
    const { ruc } = await GuiaThAlCtpDB.rucPropio(tenantId);
    const destino = destinoDeGuiaTh(datos, ruc);
    if (!destino.propio) throw new GuiaThError(destino.mensaje, "OTRO_DESTINATARIO", 409);
    /* El N° solo no alcanza: si la guardada dice otro permiso, es otra guía. */
    const misma = mismaGuiaTh(vista, identidadDeGuiaTh(gtf, datos));
    if (!misma.ok) throw new GuiaThError(misma.motivo, "OTRA_GUIA", 409);
    const reparto = ingresosDesdeGuiaTh(leerItemsGuiaTh(gtf.items), {
      parcela: gtf.parcelaCorta,
      volumenDeclaradoM3: gtf.volumenTotalM3 != null ? Number(gtf.volumenTotalM3) : null,
      gtfNumber: gtf.gtfNumber,
    });
    if (!reparto.ok) throw new GuiaThError(reparto.motivo, "GUIA_INCOMPLETA", 422);
    return {
      guardada: {
        id: vista.id,
        gtfNumber: vista.gtfNumber,
        numeroRegistro: vista.numeroRegistro,
        titularNombre: vista.titularNombre,
        permisoCodigo: vista.permisoCodigo,
        contratoId: vista.contratoId,
      },
      gtf,
      datos,
      reparto,
    };
  }

  /**
   * El permiso de la guía, de ESTE negocio: el que eligió la guardada, si no
   * el del plan de manejo de la guía. `null` = que el alta lo deduzca del
   * código del título (como siempre).
   */
  private static async contratoDeLaGuia(
    tenantId: string,
    gtf: Pick<Guia, "planId">,
    elegido: string | null,
  ): Promise<string | null> {
    if (elegido && (await ForestContratoDB.get(tenantId, elegido))) return elegido;
    if (!gtf.planId) return null;
    const plan = await prisma.forestPlan.findFirst({
      where: { tenantId, id: gtf.planId },
      select: { contratoId: true },
    });
    if (plan?.contratoId && (await ForestContratoDB.get(tenantId, plan.contratoId))) return plan.contratoId;
    return null;
  }
}
