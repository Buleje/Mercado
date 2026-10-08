import "server-only";
import { prisma } from "@/lib/prisma";
import { colaDeGtf, mismoNumeroGtf } from "@/lib/forestal/gtf-talonario";
import { mensajeDelPase } from "@/lib/forestal/guia-th-al-ctp";
import {
  cruzarGuiasTh,
  guiaPorNumero,
  type CruceGuiasTh,
  type GuiaThAlistada,
  type GuiaThPorIngresar,
} from "@/lib/forestal/guias-th-por-ingresar";
import { GuiaThAlCtpDB, GuiaThError } from "./guia-th-al-ctp.db";
import { ESTADOS_SIN_INGRESO } from "./gtf-numero.db";

/**
 * GuiaThPorIngresarDB — «Nuevo ingreso › Desde tu Libro TH» (ADR-481).
 *
 *   · `listar`  — las guías del Libro TH (emitidas, de trozas) que todavía no
 *                 tienen ingreso vivo en el CTP, con si se pueden ingresar y
 *                 por qué no. TRES consultas para toda la lista (sin N+1): las
 *                 guías, los ingresos vivos y las guardadas con esas colas.
 *   · `alistar` — la guía elegida queda guardada en el CTP (`pasarAlCtp`, el
 *                 mismo pase de «Despachar con guía», idempotente) y devuelve
 *                 la guardada para abrir «Recibir». Lo que registra el libro
 *                 lo hace `GuiaThAlCtpDB.recibir`: cierre de mes, candado del
 *                 N°, duplicado, trozas repetidas y vencida viven ahí.
 *
 * Todo dentro del tenant de la sesión: la guía, los ingresos y las guardadas
 * son filas de este negocio.
 */

/** Hasta cuántas guías del TH se cruzan (Blas: 3 en total el 08-10). */
const TOPE_GUIAS = 300;

export class GuiaThPorIngresarDB {
  static async listar(tenantId: string, opts: { numero?: string | null } = {}): Promise<CruceGuiasTh> {
    if (!tenantId) throw new Error("tenantId is required");
    const colaBuscada = opts.numero ? colaDeGtf(opts.numero) : null;
    if (opts.numero && !colaBuscada) return { porIngresar: [], ingresadas: [] };

    const guias = await prisma.forestGtf.findMany({
      where: {
        tenantId,
        deletedAt: null,
        tipo: "trozas",
        status: "emitida",
        ...(colaBuscada ? { gtfNumber: { endsWith: colaBuscada, mode: "insensitive" as const } } : {}),
      },
      select: {
        id: true, gtfNumber: true, gtfDate: true, titularName: true, tituloHabilitante: true, origen: true,
        items: true, volumenTotalM3: true, piezasTotal: true, gtfDatos: true, createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: TOPE_GUIAS,
    });
    if (guias.length === 0) return { porIngresar: [], ingresadas: [] };

    /* Candidatas por el último tramo sin ceros (filtro AMPLIO: nunca deja
       afuera la misma guía); la comparación de verdad, en `cruzarGuiasTh`. */
    const colas = [...new Set(guias.map((g) => colaDeGtf(g.gtfNumber)).filter((c): c is string => !!c))];
    const porCola = colas.map((c) => ({ gtfNumber: { endsWith: c, mode: "insensitive" as const } }));
    const [ingresos, guardadas, planta] = await Promise.all([
      porCola.length
        ? prisma.woodEntry.findMany({
            where: { tenantId, deletedAt: null, status: { notIn: [...ESTADOS_SIN_INGRESO] }, OR: porCola },
            select: { gtfNumber: true, providerName: true, originCode: true },
          })
        : Promise.resolve([]),
      porCola.length
        ? prisma.forestGuiaGuardada.findMany({
            where: { tenantId, deletedAt: null, OR: porCola },
            orderBy: { createdAt: "desc" },
            select: { id: true, gtfNumber: true, titularNombre: true, permisoCodigo: true },
          })
        : Promise.resolve([]),
      GuiaThAlCtpDB.rucPropio(tenantId),
    ]);

    return cruzarGuiasTh({
      guias: guias.map((g) => ({
        ...g,
        volumenTotalM3: g.volumenTotalM3 != null ? Number(g.volumenTotalM3) : null,
      })),
      ingresos: ingresos.filter((e): e is typeof e & { gtfNumber: string } => !!e.gtfNumber),
      guardadas,
      rucPropio: planta.ruc,
    });
  }

  /**
   * Deja la guía del TH guardada en el CTP para recibirla con todo relleno.
   * Por id (la lista) o por N° (el puente «Ingresar al CTP» del Libro TH).
   */
  static async alistar(
    tenantId: string,
    ref: { gtfId?: string | null; gtfNumber?: string | null },
    user: string,
  ): Promise<GuiaThAlistada> {
    if (!tenantId) throw new Error("tenantId is required");
    const numero = ref.gtfNumber?.trim() || null;
    /* Por id también se filtra por SU N°: sin filtro, la lista corta en las
       TOPE_GUIAS más nuevas y una guía vigente más vieja daba «se anuló». */
    const delId = ref.gtfId
      ? await prisma.forestGtf.findFirst({
          where: { id: ref.gtfId, tenantId, deletedAt: null, tipo: "trozas", status: "emitida" },
          select: { gtfNumber: true },
        })
      : null;
    if (ref.gtfId && !delId) {
      throw new GuiaThError("Esa guía ya no está vigente en tu Libro TH (se anuló o se quitó).", "YA_NO_ESTA", 409);
    }
    const cruce = await GuiaThPorIngresarDB.listar(tenantId, { numero: delId?.gtfNumber ?? numero });

    let guia: GuiaThPorIngresar | undefined;
    if (ref.gtfId) {
      guia = cruce.porIngresar.find((g) => g.gtfId === ref.gtfId);
      if (!guia) {
        const ya = cruce.ingresadas.find((g) => g.gtfId === ref.gtfId);
        if (ya) throw new GuiaThError(`La guía ${ya.gtfNumber} ya entró a tu Libro CTP: la ves en Ingresos.`, "YA_INGRESADA", 409);
        throw new GuiaThError("Esa guía ya no está vigente en tu Libro TH (se anuló o se quitó).", "YA_NO_ESTA", 409);
      }
    } else if (numero) {
      const e = guiaPorNumero(cruce.porIngresar, numero);
      if (e.estado === "ambigua") {
        throw new GuiaThError(
          `En tu Libro TH hay ${e.candidatas.length} guías con el N° ${numero} de titulares distintos (${e.candidatas
            .map((g) => g.titular ?? "sin titular")
            .join(" · ")}): elige cuál en «Nuevo ingreso › Desde tu Libro TH».`,
          "OTRA_GUIA",
          409,
        );
      }
      if (e.estado === "ninguna") {
        /* El filtro de la base es amplio (…0481 trae también …1481): el «ya
           entró» se mira sólo con el N° exacto. */
        if (cruce.ingresadas.some((g) => mismoNumeroGtf(g.gtfNumber, numero))) {
          throw new GuiaThError(`La guía ${numero} ya entró a tu Libro CTP: la ves en Ingresos.`, "YA_INGRESADA", 409);
        }
        throw new GuiaThError(`No hay una guía vigente con el N° ${numero} en tu Libro TH.`, "SIN_GUIA_TH", 409);
      }
      guia = e.guia;
    } else {
      throw new GuiaThError("Elige la guía de tu Libro TH.", "SIN_GUIA_TH", 409);
    }

    if (!guia.lista) throw new GuiaThError(guia.motivo ?? "Esta guía no se puede ingresar desde acá.", "OTRO_DESTINATARIO", 422);
    if (guia.guardadaId) return { guardadaId: guia.guardadaId, gtfNumber: guia.gtfNumber, creada: false };

    const pase = await GuiaThAlCtpDB.pasarAlCtp(tenantId, guia.gtfId, user);
    if (pase.guardadaId) return { guardadaId: pase.guardadaId, gtfNumber: guia.gtfNumber, creada: pase.estado === "creada" };
    if (pase.estado === "ya_ingresada") {
      throw new GuiaThError(`La guía ${guia.gtfNumber} ya entró a tu Libro CTP: la ves en Ingresos.`, "YA_INGRESADA", 409);
    }
    /* El mensaje genérico del pase habla desde el TH («quedó emitida…»): acá se dice desde Ingresos. */
    const generico = !pase.mensaje || pase.mensaje === mensajeDelPase("error");
    throw new GuiaThError(
      generico ? "No se pudo pasar la guía a tu Libro CTP. Prueba de nuevo en un momento." : pase.mensaje,
      "SIN_GUIA_TH",
      409,
    );
  }
}
