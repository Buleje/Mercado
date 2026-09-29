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
import { ForestCtpFichaDB } from "./forest-ctp-ficha.db";
import { colaDeGtf, mismoNumeroGtf } from "@/lib/forestal/gtf-talonario";
import { ESTADOS_SIN_INGRESO, GtfNumeroDB, type IngresoVivoDeGuia } from "./gtf-numero.db";
import { leerGtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { vencimientoDeGuia } from "@/lib/forestal/fecha-de-llegada";
import {
  destinoDeGuiaTh,
  especiesDeItems,
  identidadDeGuiaTh,
  ingresosDesdeGuiaTh,
  mismaGuiaTh,
  guiaThDeNumero,
  leerItemsGuiaTh,
  type BajaEnCtp,
  type VinculoLibroTh,
} from "@/lib/forestal/guia-th-al-ctp";
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

/**
 * Ingresos vivos del libro que cuentan como «ya entró». Anulado y rechazado no
 * cuentan: es la regla del alta de una guía entera (`ESTADOS_SIN_INGRESO`,
 * 28-09-2026 — antes acá un rechazado dejaba la guía «ingresada» para siempre
 * mientras el alta la dejaba volver a cargar).
 */
const INGRESO_VIVO = { deletedAt: null, status: { notIn: [...ESTADOS_SIN_INGRESO] } };

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
    /* La GTF se compara tramo a tramo (`019-001-…` ≡ `19-001-…`): el alta
       desde SERFOR escribe el N° como lo publica SERFOR y la guía guardada
       como lo imprimió el talonario. */
    const porGtf = gtf ? await GuiasGuardadasDB.porNumeroGtf(tenantId, gtf) : null;
    if (porGtf) return porGtf;
    if (!reg) return null;
    return prisma.forestGuiaGuardada.findFirst({ where: { tenantId, deletedAt: null, numeroRegistro: reg } });
  }

  /* ── Escrituras ───────────────────────────────────────────────────────── */

  static async crear(
    tenantId: string,
    d: DatosNuevos,
    user: string,
    /** De dónde viene, para el rastro (p.ej. «viene de tu Libro TH»). */
    origen?: string,
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
        detail: `Guardó la guía ${gtf}${f.numeroRegistro ? ` (registro ${f.numeroRegistro})` : ""} antes del ingreso${f.serforGtf ? ", con la ficha de SERFOR" : ""}${origen ? ` · ${origen}` : ""}`,
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
    if (gtf !== antes.gtfNumber && !mismoNumeroGtf(gtf, antes.gtfNumber)) {
      /* La guía que emitió tu Libro TH con este N° es la llave de «Recibir»:
         otro N° la dejaría sin sus trozas. Si el N° está mal, se anula allá. */
      const [vinculo] = (await GuiasGuardadasDB.vinculosLibroTh(tenantId, [antes])).values();
      if (vinculo) {
        return {
          ok: false,
          status: 409,
          error: "viene_del_libro_th",
          message: `Esta guía viene de tu Libro TH (GTF ${vinculo.gtfNumber}): su N° no se cambia desde acá. Si está mal, anúlala en el Libro TH y emite la correcta.`,
        };
      }
    }
    if (cambiaLlave) {
      /* Con el ingreso ya en el libro, cambiar la GTF le quitaría sus papeles. */
      if ((await GuiasGuardadasDB.ingresosVivos(tenantId, antes)) > 0) {
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

  /* ── La guía que viene del Libro TH (28-09-2026) ──────────────────────── */

  /**
   * Por cada guía guardada, la guía de trozas que emitió el Libro TH de ESTE
   * negocio con el mismo N° (tramo a tramo). Dos consultas: los números de
   * todas las guías del TH (livianas) y el detalle sólo de las que calzan.
   */
  static async vinculosLibroTh(
    tenantId: string,
    filas: Pick<Fila, "id" | "gtfNumber" | "permisoCodigo" | "titularNombre">[],
  ): Promise<Map<string, VinculoLibroTh>> {
    if (!tenantId) throw new Error("tenantId is required");
    const out = new Map<string, VinculoLibroTh>();
    if (filas.length === 0) return out;
    const numeros = await prisma.forestGtf.findMany({
      where: { tenantId, deletedAt: null, tipo: "trozas" },
      select: { id: true, gtfNumber: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 2000,
    });
    if (numeros.length === 0) return out;
    const elegida = new Map<string, string>();
    for (const f of filas) {
      const g = guiaThDeNumero(f.gtfNumber, numeros);
      if (g) elegida.set(f.id, g.id);
    }
    if (elegida.size === 0) return out;
    const [detalles, ficha] = await Promise.all([
      prisma.forestGtf.findMany({
        where: { tenantId, id: { in: [...new Set(elegida.values())] } },
        select: {
          id: true, gtfNumber: true, status: true, items: true, gtfDatos: true,
          volumenTotalM3: true, piezasTotal: true, destino: true,
          titularName: true, tituloHabilitante: true,
        },
      }),
      ForestCtpFichaDB.get(tenantId),
    ]);
    const porId = new Map(detalles.map((d) => [d.id, d]));
    const guardadas = new Map(filas.map((f) => [f.id, f]));
    for (const [guardadaId, gtfId] of elegida) {
      const g = porId.get(gtfId);
      const guardada = guardadas.get(guardadaId);
      if (!g || !guardada) continue;
      const items = leerItemsGuiaTh(g.items);
      const datos = leerGtfDatos(g.gtfDatos);
      const destino = destinoDeGuiaTh(datos, ficha.ruc);
      const anulada = g.status !== "emitida";
      /* Sólo se recibe si la lista de trozas alcanza para registrarla: la
         lista es una FOTO de lo que viajó, completar el Trozado después no la
         cambia. Y si la guardada dice otro permiso, no es la misma guía. */
      const reparto = ingresosDesdeGuiaTh(items, {
        volumenDeclaradoM3: g.volumenTotalM3 != null ? Number(g.volumenTotalM3) : null,
      });
      const misma = mismaGuiaTh(guardada, identidadDeGuiaTh(g, datos));
      out.set(guardadaId, {
        gtfId: g.id,
        gtfNumber: g.gtfNumber,
        estado: g.status,
        trozas: items.length || g.piezasTotal || 0,
        volumenM3: g.volumenTotalM3 != null ? Number(g.volumenTotalM3) : null,
        especies: especiesDeItems(items),
        destinatario: datos.destinatario.nombre.trim() || g.destino?.trim() || null,
        vencimiento: vencimientoDeGuia([{ gtfDatos: g.gtfDatos }]).vencimiento,
        destinoPropio: destino.propio,
        recibible: !anulada && destino.propio && reparto.ok && misma.ok,
        motivo: anulada
          ? "La guía está anulada en tu Libro TH."
          : !destino.propio
            ? destino.mensaje
            : !misma.ok
              ? misma.motivo
              : !reparto.ok
                ? reparto.motivo
                : null,
      });
    }
    return out;
  }

  /**
   * La guardada viva que corresponde a este N° de guía, comparado tramo a
   * tramo (`019-0000001` ≡ `19-0000001`). El despacho del TH la busca así para
   * no guardar dos veces la misma guía escrita distinto.
   */
  static async porNumeroGtf(tenantId: string, gtfNumber: string): Promise<Fila | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const cola = colaDeGtf(gtfNumber);
    if (!cola) return null;
    /* Candidatas por el último tramo sin ceros (`…-0000123` termina en «123»),
       SIN `take` (una cola corta trae muchas y cortarlas podía dejar afuera la
       buena) y sólo id + N°; la comparación de verdad, tramo a tramo, en
       memoria; la fila entera, sólo de la que calza. */
    const candidatas = await prisma.forestGuiaGuardada.findMany({
      where: { tenantId, deletedAt: null, gtfNumber: { endsWith: cola, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
      select: { id: true, gtfNumber: true },
    });
    const buena = candidatas.find((f) => mismoNumeroGtf(f.gtfNumber, gtfNumber));
    return buena ? prisma.forestGuiaGuardada.findFirst({ where: { id: buena.id, tenantId } }) : null;
  }

  /**
   * Los ingresos vivos del libro de esta guía: por su N° (tramo a tramo, bajo
   * la regla de `GtfNumeroDB`) o por su N° de registro. La misma regla que la
   * lista (`ingresoEsDeGuia`).
   */
  static async ingresosVivosDe(
    tenantId: string,
    f: { gtfNumber: string; numeroRegistro: string | null },
  ): Promise<IngresoVivoDeGuia[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const porNumero = await GtfNumeroDB.ingresosVivos(prisma, tenantId, f.gtfNumber);
    if (!f.numeroRegistro) return porNumero;
    const porRegistro = await prisma.woodEntry.findMany({
      where: { tenantId, ...INGRESO_VIVO, serforNumeroRegistro: f.numeroRegistro },
      select: {
        id: true, libroNro: true, gtfNumber: true, serforNumeroRegistro: true, speciesCommonName: true,
        originCode: true, providerName: true,
      },
    });
    const ids = new Set(porNumero.map((e) => e.id));
    return [...porNumero, ...porRegistro.filter((e) => !ids.has(e.id))];
  }

  /** ¿Cuántos ingresos vivos del libro tiene esta guía guardada? */
  static async ingresosVivos(tenantId: string, f: Pick<Fila, "gtfNumber" | "numeroRegistro">): Promise<number> {
    return (await GuiasGuardadasDB.ingresosVivosDe(tenantId, f)).length;
  }

  /**
   * Se anuló la guía en el Libro TH: la guardada del CTP con ese N° se da de
   * baja (la guía ya no vale). Si su madera ya entró al libro, NO se toca: el
   * ingreso sigue y se avisa, porque anularlo es una decisión del CTP.
   */
  static async bajaPorGuiaTh(
    tenantId: string,
    th: { gtfNumber: string; permiso: string | null; titular: string | null },
    motivo: string,
    user: string,
  ): Promise<BajaEnCtp> {
    if (!tenantId) throw new Error("tenantId is required");
    const guia = await GuiasGuardadasDB.porNumeroGtf(tenantId, th.gtfNumber);
    if (!guia) return { estado: "sin_guardada", mensaje: "" };
    /* Sólo el N° no alcanza: si la guardada dice otro permiso (u otro titular
       sin permiso), es otra guía con el mismo número y no se toca. */
    if (!mismaGuiaTh(guia, th).ok) return { estado: "sin_guardada", mensaje: "" };
    const ingresos = await GuiasGuardadasDB.ingresosVivos(tenantId, guia);
    if (ingresos > 0) {
      return {
        estado: "ya_recibida",
        ingresos,
        mensaje: `Esta guía ya se recibió en tu Libro CTP (${ingresos === 1 ? "1 ingreso" : `${ingresos} ingresos`}): ahí sigue. Si la madera no llegó, anula el ingreso en Ingresos.`,
      };
    }
    const r = await prisma.forestGuiaGuardada.updateMany({
      where: { id: guia.id, tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (r.count === 0) return { estado: "sin_guardada", mensaje: "" };
    auditCtp({
      tenantId,
      action: "ctp_guia_guardada_eliminar",
      entity: "ForestGuiaGuardada",
      entityId: guia.id,
      detail: `Se anuló la GTF ${guia.gtfNumber} en el Libro TH (${motivo.trim()}): la guía guardada ya no espera su madera. Sus documentos siguen en el Drive.`,
      user,
    });
    return {
      estado: "anulada",
      mensaje: "También salió de las guías por recibir de tu Libro CTP.",
    };
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
    /* Tramo a tramo: `019-001-…` y `19-001-…` son la misma guía. */
    const cola = colaDeGtf(gtf);
    const candidatas = await prisma.forestGuiaGuardada.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(excepto ? { id: { not: excepto } } : {}),
        OR: [
          ...(cola ? [{ gtfNumber: { endsWith: cola, mode: "insensitive" as const } }] : []),
          ...(reg ? [{ numeroRegistro: reg }] : []),
        ],
      },
      select: { id: true, gtfNumber: true, numeroRegistro: true },
    });
    const otra = candidatas.find((c) => mismoNumeroGtf(c.gtfNumber, gtf) || (reg && c.numeroRegistro === reg));
    if (otra) {
      return {
        ok: false,
        status: 409,
        error: "ya_guardada",
        message: `Esa guía ya está guardada (GTF ${otra.gtfNumber}).`,
        id: otra.id,
      };
    }
    const [ingreso] = await GuiasGuardadasDB.ingresosVivosDe(tenantId, { gtfNumber: gtf, numeroRegistro: reg });
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
    /* Candidatas por el último tramo del N° (sin ceros) y la comparación de
       verdad, tramo a tramo, en `ingresoEsDeGuia`. */
    const colas = [...new Set(gtfs.map(colaDeGtf).filter((c): c is string => Boolean(c)))];
    const [docs, ingresos] = await Promise.all([
      CtpGuiaDocumentosDB.documentosDeGuias(tenantId, gtfs, viewerRole),
      prisma.woodEntry.findMany({
        where: {
          tenantId,
          ...INGRESO_VIVO,
          OR: [
            ...colas.map((c) => ({ gtfNumber: { endsWith: c, mode: "insensitive" as const } })),
            ...(regs.length ? [{ serforNumeroRegistro: { in: regs } }] : []),
          ],
        },
        select: { gtfNumber: true, serforNumeroRegistro: true, createdAt: true },
      }),
    ]);
    const llenos = llenosPorGuia(docs, gtfs);
    const vinculos = await GuiasGuardadasDB.vinculosLibroTh(tenantId, filas);
    return filas.map((f) => {
      const suyos = ingresos.filter((e) => ingresoEsDeGuia(e, f));
      const primero = suyos.reduce<Date | null>(
        (m, e) => (!m || e.createdAt < m ? e.createdAt : m),
        null,
      );
      return GuiasGuardadasDB.aVista(f, {
        llenos: llenos[f.gtfNumber] ?? 0,
        ingreso: primero ? { en: primero.toISOString(), asientos: suyos.length } : null,
        libroTh: vinculos.get(f.id) ?? null,
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
    x: { llenos: number; ingreso: GuiaGuardadaVista["ingreso"]; libroTh: VinculoLibroTh | null },
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
      libroTh: x.libroTh,
      createdBy: f.createdBy,
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.updatedAt.toISOString(),
    };
  }
}
