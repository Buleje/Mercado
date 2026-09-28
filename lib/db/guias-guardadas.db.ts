import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { logger } from "@/lib/logger";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import type { DbDocument } from "@/lib/types/documents";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import { DocumentsDB } from "./documents.db";
import { ForestContratoDB } from "./forest-contrato.db";
import { CtpGuiaDocumentosDB } from "./ctp-guia-documentos.db";
import {
  carpetaGuiaPorTitular,
  llenosPorGuia,
  tagGtf,
} from "@/lib/forestal/documentos-guia";
import {
  claveGtf,
  claveRegistro,
  esGtfValida,
  fechaDeSerfor,
  ingresoEsDeGuia,
  ordenarGuias,
  resumenDeFicha,
  type CamposDeGuia,
  type EstadoLista,
  type GuiaGuardadaDetalle,
  type GuiaGuardadaVista,
  type ListaGuiasGuardadas,
} from "@/lib/forestal/guias-guardadas";

/**
 * Guías guardadas antes del ingreso (ADR-442).
 *
 * La fila guarda los datos del papel; los papeles son documentos del Drive
 * (ADR-438) y se leen por su etiqueta `gtf:`. «¿Ya entró al libro?» se deduce
 * de los ingresos vivos cada vez que se lista: nada que sincronizar al borrar
 * un ingreso.
 *
 * Sin caché a propósito (igual que `CtpGuiaDocumentosDB`): la escriben este
 * apartado, el alta de ingresos y el Drive; un caché mostraría una guía «por
 * ingresar» que ya entró en la otra pestaña.
 */

type Fila = Prisma.ForestGuiaGuardadaGetPayload<object>;

export interface DatosNuevos extends CamposDeGuia {
  contratoId: string | null;
  notas: string | null;
  serforGtf: GtfSerfor | null;
  serforConsultadaEn: Date | null;
}

export type ResultadoEscritura =
  | { ok: true; id: string }
  | { ok: false; status: number; error: string; message: string; id?: string };

const aFecha = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00.000Z`) : null);
const deFecha = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Ingresos vivos del libro que cuentan como «ya entró». Anulado no cuenta: no pasó. */
const INGRESO_VIVO = { deletedAt: null, status: { not: "anulado" as const } };

export class GuiasGuardadasDB {
  /* ── Lecturas ─────────────────────────────────────────────────────────── */

  static async list(
    tenantId: string,
    estado: EstadoLista,
    viewerRole?: string,
  ): Promise<ListaGuiasGuardadas> {
    if (!tenantId) throw new Error("tenantId is required");
    const filas = await prisma.forestGuiaGuardada.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    const vistas = await GuiasGuardadasDB.vistas(tenantId, filas, viewerRole);
    const porIngresar = vistas.filter((v) => !v.ingreso).length;
    const elegidas =
      estado === "todas"
        ? vistas
        : vistas.filter((v) => (estado === "por_ingresar" ? !v.ingreso : Boolean(v.ingreso)));
    return { guias: ordenarGuias(elegidas), porIngresar, total: vistas.length };
  }

  static async obtener(
    tenantId: string,
    id: string,
    viewerRole?: string,
  ): Promise<GuiaGuardadaDetalle | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const f = await prisma.forestGuiaGuardada.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    return f ? GuiasGuardadasDB.detalle(tenantId, f, viewerRole) : null;
  }

  /** Por N° de registro o por N° de GTF (lo que la persona tenga a mano). */
  static async buscar(
    tenantId: string,
    texto: string,
    viewerRole?: string,
  ): Promise<GuiaGuardadaDetalle | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const f = await GuiasGuardadasDB.filaPor(tenantId, { gtfNumber: texto, numeroRegistro: texto });
    return f ? GuiasGuardadasDB.detalle(tenantId, f, viewerRole) : null;
  }

  /**
   * La guía viva que corresponde a una GTF o a un N° de registro. La GTF
   * primero: es la llave de los casilleros.
   */
  static async filaPor(
    tenantId: string,
    o: { gtfNumber?: string | null; numeroRegistro?: string | null },
  ): Promise<Fila | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const gtf = claveGtf(o.gtfNumber);
    const reg = claveRegistro(o.numeroRegistro);
    if (!gtf && !reg) return null;
    const filas = await prisma.forestGuiaGuardada.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: [
          ...(gtf ? [{ gtfNumber: gtf }] : []),
          ...(reg ? [{ numeroRegistro: reg }] : []),
        ],
      },
      take: 2,
    });
    return filas.find((f) => gtf && f.gtfNumber === gtf) ?? filas[0] ?? null;
  }

  /* ── Escrituras ───────────────────────────────────────────────────────── */

  static async crear(
    tenantId: string,
    d: DatosNuevos,
    user: string,
  ): Promise<ResultadoEscritura> {
    if (!tenantId) throw new Error("tenantId is required");
    const gtf = claveGtf(d.gtfNumber);
    if (!gtf || !esGtfValida(gtf)) {
      return {
        ok: false,
        status: 422,
        error: "falta_gtf",
        message: "Falta el N° de GTF (con sus números): escríbelo o busca la guía en SERFOR con su N° de registro.",
      };
    }
    const choque = await GuiasGuardadasDB.choques(tenantId, gtf, claveRegistro(d.numeroRegistro));
    if (choque) return choque;
    const contrato = await GuiasGuardadasDB.contratoAjeno(tenantId, d.contratoId);
    if (contrato) return contrato;
    try {
      const f = await prisma.forestGuiaGuardada.create({
        data: {
          tenantId,
          ...GuiasGuardadasDB.columnas(d),
          gtfNumber: gtf,
          createdBy: user,
        },
      });
      auditCtp({
        tenantId,
        action: "ctp_guia_guardada_crear",
        entity: "ForestGuiaGuardada",
        entityId: f.id,
        detail: `Guardó la guía ${gtf}${f.numeroRegistro ? ` (registro ${f.numeroRegistro})` : ""} antes del ingreso${f.serforGtf ? ", con la ficha de SERFOR" : ""}`,
        user,
      });
      /* La carpeta existe desde ya: Brandon la ve en Documentos antes de subir
         nada. Con `await`: si la primera subida llegaba mientras se creaba en
         segundo plano, quedaban dos carpetas gemelas (no hay índice único). */
      await GuiasGuardadasDB.carpetaId(tenantId, f).catch((err) =>
        logger.warn("[guias-guardadas] carpeta no disponible", { error: String(err) }),
      );
      return { ok: true, id: f.id };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const otra = await GuiasGuardadasDB.choques(tenantId, gtf, claveRegistro(d.numeroRegistro));
        if (otra) return otra;
      }
      throw e;
    }
  }

  /**
   * Edita. Si cambia la GTF, el titular o el permiso, los papeles van detrás:
   * se re-etiquetan (GTF) y se mudan a la carpeta nueva.
   */
  static async editar(
    tenantId: string,
    id: string,
    d: DatosNuevos,
    user: string,
  ): Promise<ResultadoEscritura> {
    if (!tenantId) throw new Error("tenantId is required");
    const antes = await prisma.forestGuiaGuardada.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!antes) return { ok: false, status: 404, error: "not_found", message: "Esa guía ya no está." };
    const gtf = claveGtf(d.gtfNumber);
    if (!gtf || !esGtfValida(gtf)) {
      return { ok: false, status: 422, error: "falta_gtf", message: "La guía necesita su N° de GTF (con sus números)." };
    }
    const reg = claveRegistro(d.numeroRegistro);
    if (d.contratoId !== antes.contratoId) {
      const contrato = await GuiasGuardadasDB.contratoAjeno(tenantId, d.contratoId);
      if (contrato) return contrato;
    }
    const cambiaLlave = gtf !== antes.gtfNumber || reg !== (antes.numeroRegistro ?? null);
    if (cambiaLlave) {
      /* Con el ingreso ya en el libro, cambiar la GTF le quitaría sus papeles. */
      const ingreso = await prisma.woodEntry.findFirst({
        where: {
          tenantId,
          ...INGRESO_VIVO,
          OR: [
            { gtfNumber: antes.gtfNumber },
            ...(antes.numeroRegistro ? [{ serforNumeroRegistro: antes.numeroRegistro }] : []),
          ],
        },
        select: { id: true },
      });
      if (ingreso) {
        return {
          ok: false,
          status: 409,
          error: "ya_ingresada",
          message: "Esta guía ya entró al libro: su N° de GTF y de registro no se cambian desde acá.",
        };
      }
      const choque = await GuiasGuardadasDB.choques(tenantId, gtf, reg, id);
      if (choque) return choque;
    }
    try {
      const despues = await prisma.forestGuiaGuardada.update({
        where: { id: antes.id },
        data: { ...GuiasGuardadasDB.columnas(d), gtfNumber: gtf },
      });
      auditCtp({
        tenantId,
        action: "ctp_guia_guardada_editar",
        entity: "ForestGuiaGuardada",
        entityId: id,
        detail: `Editó la guía guardada ${antes.gtfNumber}${gtf !== antes.gtfNumber ? ` → ${gtf}` : ""}`,
        user,
      });
      const mueve =
        gtf !== antes.gtfNumber ||
        (despues.titularNombre ?? "") !== (antes.titularNombre ?? "") ||
        (despues.permisoCodigo ?? "") !== (antes.permisoCodigo ?? "");
      if (mueve) await GuiasGuardadasDB.reubicarPapeles(tenantId, antes, despues);
      return { ok: true, id };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const otra = await GuiasGuardadasDB.choques(tenantId, gtf, reg, id);
        if (otra) return otra;
      }
      throw e;
    }
  }

  /** Baja lógica. Los papeles se quedan en el Drive (y en el ingreso, si lo hay). */
  static async eliminar(tenantId: string, id: string, user: string): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    const r = await prisma.forestGuiaGuardada.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (r.count > 0) {
      auditCtp({
        tenantId,
        action: "ctp_guia_guardada_eliminar",
        entity: "ForestGuiaGuardada",
        entityId: id,
        detail: "Quitó una guía guardada (sus documentos siguen en el Drive)",
        user,
      });
    }
    return r.count > 0;
  }

  /**
   * Al registrar un ingreso: si una guía guardada lo reconoce por su N° de
   * registro pero su GTF está escrita distinto que la del ingreso, sus papeles
   * reciben TAMBIÉN la etiqueta de la GTF del ingreso — así los casilleros del
   * ingreso los muestran sin mover nada. Con la misma GTF no hace falta nada.
   *
   * Se llama en segundo plano: el ingreso ya quedó; esto no lo frena.
   */
  static async alRegistrarIngreso(
    tenantId: string,
    ingreso: { gtfNumber: string; serforNumeroRegistro: string | null },
    user: string,
    /** La ficha que el SERVIDOR pidió para registrar el ingreso (desde SERFOR). */
    ficha?: GtfSerfor | null,
  ): Promise<void> {
    if (!tenantId) throw new Error("tenantId is required");
    let guia = await GuiasGuardadasDB.filaPor(tenantId, {
      gtfNumber: ingreso.gtfNumber,
      numeroRegistro: ingreso.serforNumeroRegistro,
    });
    if (!guia) return;
    /* Guardada a mano (titular tipeado) + ingreso verificado en SERFOR: la guía
       toma el titular, el permiso y la fecha oficiales y sus papeles se mudan.
       Si no, sus casilleros quedaban en una carpeta y el «Guardar en el
       expediente» (que usa la ficha) en otra hermana. La GTF NO cambia acá:
       es la llave de los papeles; el enlace de abajo cubre la diferencia. */
    if (ficha && !guia.serforGtf) {
      const antes = guia;
      guia = await prisma.forestGuiaGuardada.update({
        where: { id: guia.id },
        data: {
          serforGtf: ficha as unknown as Prisma.InputJsonValue,
          serforConsultadaEn: new Date(),
          numeroRegistro: antes.numeroRegistro ?? claveRegistro(ficha.numeroRegistro),
          titularNombre: ficha.titular?.trim() || antes.titularNombre,
          permisoCodigo: ficha.numeroTitulo?.trim() || antes.permisoCodigo,
          gtfDate: aFecha(fechaDeSerfor(ficha.fechaExpedicion)) ?? antes.gtfDate,
        },
      });
      if (
        (guia.titularNombre ?? "") !== (antes.titularNombre ?? "") ||
        (guia.permisoCodigo ?? "") !== (antes.permisoCodigo ?? "")
      ) {
        await GuiasGuardadasDB.reubicarPapeles(tenantId, antes, guia);
      }
      auditCtp({
        tenantId,
        action: "ctp_guia_guardada_editar",
        entity: "ForestGuiaGuardada",
        entityId: guia.id,
        detail: `La guía guardada ${guia.gtfNumber} tomó la ficha de SERFOR al registrarse el ingreso`,
        user,
      });
    }
    const gtfIngreso = claveGtf(ingreso.gtfNumber);
    if (!gtfIngreso || gtfIngreso === guia.gtfNumber) return;
    const docs = await GuiasGuardadasDB.papeles(tenantId, guia.gtfNumber);
    let n = 0;
    for (const doc of docs) {
      if (doc.tags.some((t) => t.toLowerCase() === tagGtf(gtfIngreso).toLowerCase())) continue;
      await DocumentsDB.update(tenantId, doc.id, { tags: [...doc.tags, tagGtf(gtfIngreso), gtfIngreso] });
      n++;
    }
    if (n > 0) {
      auditCtp({
        tenantId,
        action: "ctp_guia_guardada_editar",
        entity: "ForestGuiaGuardada",
        entityId: guia.id,
        detail: `Enlazó ${n} documento(s) de la guía guardada ${guia.gtfNumber} al ingreso con GTF ${gtfIngreso}`,
        user,
      });
    }
  }

  /* ── Internos ─────────────────────────────────────────────────────────── */

  private static columnas(d: DatosNuevos) {
    return {
      numeroRegistro: claveRegistro(d.numeroRegistro),
      gtfDate: aFecha(d.gtfDate),
      titularNombre: d.titularNombre,
      titularDoc: d.titularDoc,
      permisoCodigo: d.permisoCodigo,
      contratoId: d.contratoId,
      notas: d.notas,
      serforGtf: d.serforGtf ? (d.serforGtf as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      serforConsultadaEn: d.serforConsultadaEn,
    };
  }

  /**
   * El permiso tiene que ser de ESTE negocio: el alta desde SERFOR lo pasa tal
   * cual a `WoodEntry.contratoId` (FK), y un id ajeno imputaría la madera a un
   * contrato de otro tenant.
   */
  private static async contratoAjeno(
    tenantId: string,
    contratoId: string | null,
  ): Promise<Extract<ResultadoEscritura, { ok: false }> | null> {
    if (!contratoId) return null;
    if (await ForestContratoDB.get(tenantId, contratoId)) return null;
    return {
      ok: false,
      status: 400,
      error: "contrato_invalido",
      message: "Ese permiso no está en tu lista de permisos. Elígelo de nuevo.",
    };
  }

  /** ¿Ya hay otra guía guardada o un ingreso con esa GTF / ese registro? */
  private static async choques(
    tenantId: string,
    gtf: string,
    reg: string | null,
    excepto?: string,
  ): Promise<Extract<ResultadoEscritura, { ok: false }> | null> {
    const otra = await prisma.forestGuiaGuardada.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        ...(excepto ? { id: { not: excepto } } : {}),
        OR: [{ gtfNumber: gtf }, ...(reg ? [{ numeroRegistro: reg }] : [])],
      },
      select: { id: true, gtfNumber: true },
    });
    if (otra) {
      return {
        ok: false,
        status: 409,
        error: "ya_guardada",
        message: `Esa guía ya está guardada (GTF ${otra.gtfNumber}).`,
        id: otra.id,
      };
    }
    const ingreso = await prisma.woodEntry.findFirst({
      where: {
        tenantId,
        ...INGRESO_VIVO,
        OR: [{ gtfNumber: gtf }, ...(reg ? [{ serforNumeroRegistro: reg }] : [])],
      },
      select: { gtfNumber: true },
    });
    if (ingreso) {
      return {
        ok: false,
        status: 409,
        error: "ya_ingresada",
        message: `La GTF ${ingreso.gtfNumber} ya está en el libro: sus documentos se suben desde la guía, en Ingresos.`,
      };
    }
    return null;
  }

  /**
   * Los papeles vivos de la guía que se pueden MUDAR o ENLAZAR: sólo los que
   * llevan la etiqueta de máquina `gtf:<N°>`. El legado de ADR-438 se reconoce
   * por etiquetas humanas (el N° suelto) y mudarlo tocaría documentos que la
   * guía no subió.
   */
  private static async papeles(tenantId: string, gtf: string): Promise<DbDocument[]> {
    const maquina = tagGtf(gtf).toLowerCase();
    const docs = await CtpGuiaDocumentosDB.documentosDeGuias(tenantId, [gtf]);
    return docs.filter((d) => d.tags.some((t) => t.toLowerCase() === maquina));
  }

  /** La carpeta de la guía en el Drive (la crea si falta). */
  private static async carpetaId(tenantId: string, f: Fila): Promise<string | null> {
    const ruta = carpetaGuiaPorTitular({
      titular: f.titularNombre,
      permiso: f.permisoCodigo,
      gtfNumber: f.gtfNumber,
    }).join("/");
    return (await DocumentsDB.createFolderTree(tenantId, { rutas: [ruta] })).idPorRuta[ruta] ?? null;
  }

  /**
   * Cambió la GTF, el titular o el permiso: los papeles van a la carpeta nueva
   * y, si cambió la GTF, cambian de etiqueta y de nombre. Sólo se mudan los que
   * seguían en la carpeta vieja de la guía: uno que la persona movió a mano en
   * el Drive se queda donde lo puso.
   */
  private static async reubicarPapeles(tenantId: string, antes: Fila, despues: Fila): Promise<void> {
    try {
      const docs = await GuiasGuardadasDB.papeles(tenantId, antes.gtfNumber);
      const carpetaVieja = await GuiasGuardadasDB.carpetaExistente(tenantId, antes);
      const carpetaNueva = await GuiasGuardadasDB.carpetaId(tenantId, despues);
      const cambiaGtf = antes.gtfNumber !== despues.gtfNumber;
      const viejaTag = tagGtf(antes.gtfNumber).toLowerCase();
      for (const doc of docs) {
        const patch: { tags?: string[]; name?: string; folderId?: string | null } = {};
        if (cambiaGtf) {
          patch.tags = [
            ...new Set(
              doc.tags.map((t) =>
                t.toLowerCase() === viejaTag
                  ? tagGtf(despues.gtfNumber)
                  : t === antes.gtfNumber
                    ? despues.gtfNumber
                    : t,
              ),
            ),
          ];
          patch.name = doc.name.replace(`GTF ${antes.gtfNumber}`, `GTF ${despues.gtfNumber}`);
        }
        if (carpetaNueva && carpetaVieja && doc.folderId === carpetaVieja && carpetaNueva !== carpetaVieja)
          patch.folderId = carpetaNueva;
        if (Object.keys(patch).length > 0) await DocumentsDB.update(tenantId, doc.id, patch);
      }
    } catch (e) {
      /* La edición de la guía ya quedó; los papeles siguen en el Drive aunque
         no se hayan mudado. */
      logger.warn("[guias-guardadas] no se pudieron reubicar los papeles", { error: String(e) });
    }
  }

  /** La carpeta de la guía SI existe (no la crea). */
  private static async carpetaExistente(tenantId: string, f: Fila): Promise<string | null> {
    const partes = carpetaGuiaPorTitular({
      titular: f.titularNombre,
      permiso: f.permisoCodigo,
      gtfNumber: f.gtfNumber,
    });
    /* Igual que `createFolderTree`: el índice por (padre, nombre en minúscula). */
    const carpetas = await prisma.documentFolder.findMany({
      where: { tenantId },
      select: { id: true, name: true, parentId: true },
    });
    let padre: string | null = null;
    for (const nombre of partes) {
      const c = carpetas.find(
        (x) => x.parentId === padre && x.name.trim().toLowerCase() === nombre.toLowerCase(),
      );
      if (!c) return null;
      padre = c.id;
    }
    return padre;
  }

  private static async vistas(
    tenantId: string,
    filas: Fila[],
    viewerRole?: string,
  ): Promise<GuiaGuardadaVista[]> {
    if (filas.length === 0) return [];
    const gtfs = filas.map((f) => f.gtfNumber);
    const regs = filas.map((f) => f.numeroRegistro).filter((r): r is string => Boolean(r));
    const [docs, ingresos] = await Promise.all([
      CtpGuiaDocumentosDB.documentosDeGuias(tenantId, gtfs, viewerRole),
      prisma.woodEntry.findMany({
        where: {
          tenantId,
          ...INGRESO_VIVO,
          OR: [{ gtfNumber: { in: gtfs } }, ...(regs.length ? [{ serforNumeroRegistro: { in: regs } }] : [])],
        },
        select: { gtfNumber: true, serforNumeroRegistro: true, createdAt: true },
      }),
    ]);
    const llenos = llenosPorGuia(docs, gtfs);
    return filas.map((f) => {
      const suyos = ingresos.filter((e) => ingresoEsDeGuia(e, f));
      const primero = suyos.reduce<Date | null>(
        (m, e) => (!m || e.createdAt < m ? e.createdAt : m),
        null,
      );
      return GuiasGuardadasDB.aVista(f, {
        llenos: llenos[f.gtfNumber] ?? 0,
        ingreso: primero ? { en: primero.toISOString(), asientos: suyos.length } : null,
      });
    });
  }

  private static async detalle(
    tenantId: string,
    f: Fila,
    viewerRole?: string,
  ): Promise<GuiaGuardadaDetalle> {
    const [v] = await GuiasGuardadasDB.vistas(tenantId, [f], viewerRole);
    return { ...v, serforGtf: (f.serforGtf ?? null) as unknown as GtfSerfor | null };
  }

  private static aVista(
    f: Fila,
    x: { llenos: number; ingreso: GuiaGuardadaVista["ingreso"] },
  ): GuiaGuardadaVista {
    const ficha = (f.serforGtf ?? null) as unknown as GtfSerfor | null;
    return {
      id: f.id,
      numeroRegistro: f.numeroRegistro,
      gtfNumber: f.gtfNumber,
      gtfDate: deFecha(f.gtfDate),
      titularNombre: f.titularNombre,
      titularDoc: f.titularDoc,
      permisoCodigo: f.permisoCodigo,
      contratoId: f.contratoId,
      notas: f.notas,
      verificadaEnSerfor: Boolean(ficha),
      serforConsultadaEn: f.serforConsultadaEn?.toISOString() ?? null,
      resumen: resumenDeFicha(ficha),
      carpeta: carpetaGuiaPorTitular({
        titular: f.titularNombre,
        permiso: f.permisoCodigo,
        gtfNumber: f.gtfNumber,
      }),
      ingreso: x.ingreso,
      docsLlenos: x.llenos,
      createdBy: f.createdBy,
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.updatedAt.toISOString(),
    };
  }
}
