import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { DocumentsDB } from "./documents.db";
import { canRoleSeeEnCadena, rolesDeLaCadena } from "@/lib/documents/doc-access";
import { CtpGuiaDocumentosDB } from "./ctp-guia-documentos.db";
import {
  CARPETA_GUIAS,
  carpetaGuiaPorTitular,
  casilleroDeDocumento,
  tagCasillero,
  tagGtf,
  type CasilleroGuia,
} from "@/lib/forestal/documentos-guia";

/**
 * Papeles de guías que quedaron en la carpeta por AÑO/MES (antes de ADR-442) y
 * su mudanza a la carpeta del titular › permiso › GTF.
 *
 * Qué cuenta como «papel viejo de una guía»: un documento vivo en
 * `Guías forestales (GTF)` (su raíz, un año `AAAA` o un mes `MM` adentro) que
 * es de una guía que el libro conoce — por la etiqueta de máquina `gtf:` o por
 * el legado de ADR-438 (`forestal` + `GTF`/`lista de trozas` + el N°). El
 * legajo del mes y la GTF de SALIDA también viven ahí y NO son papeles de un
 * ingreso: `casilleroDeDocumento` ya los deja afuera.
 *
 * La mudanza además les pone las etiquetas de máquina que les faltan: el papel
 * queda en su casillero aunque alguien edite las humanas.
 */

export interface PapelViejo {
  id: string;
  name: string;
  gtf: string;
  casillero: CasilleroGuia;
  destino: string[];
}

const ES_ANIO = /^\d{4}$/;
const ES_MES = /^\d{2}$/;

export class CtpGuiaPapelesViejosDB {
  /** Qué se mudaría y adónde (no escribe nada). */
  /**
   * `viewerRole`: la lista muestra NOMBRES de documentos; un rol que no ve la
   * carpeta (o el papel) no los recibe (security 04-10). Sin rol = todo, como
   * antes (lo usa `ordenar`, que ya exige admin o dueño).
   */
  static async pendientes(tenantId: string, viewerRole?: string): Promise<PapelViejo[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const carpetas = await prisma.documentFolder.findMany({
      where: { tenantId },
      select: { id: true, name: true, parentId: true, allowedRoles: true },
    });
    const raiz = carpetas.find(
      (c) => c.parentId === null && c.name.trim().toLowerCase() === CARPETA_GUIAS.toLowerCase(),
    );
    if (!raiz) return [];
    const anios = carpetas.filter((c) => c.parentId === raiz.id && ES_ANIO.test(c.name.trim()));
    const meses = carpetas.filter(
      (c) => anios.some((a) => a.id === c.parentId) && ES_MES.test(c.name.trim()),
    );
    const viejas = [raiz.id, ...anios.map((a) => a.id), ...meses.map((m) => m.id)];

    const todos = await prisma.document.findMany({
      where: { tenantId, deletedAt: null, folderId: { in: viejas } },
      select: { id: true, name: true, tags: true, folderId: true, allowedRoles: true },
      take: 1000,
    });
    const mapa = new Map(carpetas.map((c) => [c.id, { parentId: c.parentId ?? null, allowedRoles: c.allowedRoles ?? [] }]));
    const docs = viewerRole
      ? todos.filter((d) => canRoleSeeEnCadena(viewerRole, d.allowedRoles ?? [], rolesDeLaCadena(d.folderId, mapa)))
      : todos;
    if (docs.length === 0) return [];

    /* ¿De qué guía es? Candidatos: la etiqueta de máquina, o cualquier
       etiqueta que coincida con una GTF viva del libro (el legado guarda el N°
       suelto). */
    const candidatas = new Set<string>();
    for (const d of docs) {
      for (const t of d.tags) {
        const s = t.trim();
        candidatas.add(s.toLowerCase().startsWith("gtf:") ? s.slice(4).trim() : s);
      }
    }
    const [ingresos, guardadas] = await Promise.all([
      prisma.woodEntry.findMany({
        where: { tenantId, deletedAt: null, gtfNumber: { in: [...candidatas] } },
        select: { gtfNumber: true },
        distinct: ["gtfNumber"],
      }),
      prisma.forestGuiaGuardada.findMany({
        where: { tenantId, deletedAt: null, gtfNumber: { in: [...candidatas] } },
        select: { gtfNumber: true },
      }),
    ]);
    const conocidas = [...new Set([...ingresos, ...guardadas].map((x) => x.gtfNumber))];

    const out: PapelViejo[] = [];
    const destinoPorGtf = new Map<string, string[]>();
    for (const d of docs) {
      for (const gtf of conocidas) {
        const casillero = casilleroDeDocumento(d.tags, gtf);
        if (!casillero) continue;
        let destino = destinoPorGtf.get(gtf);
        if (!destino) {
          const g = await CtpGuiaDocumentosDB.datosDeGuia(tenantId, gtf);
          destino = carpetaGuiaPorTitular({
            titular: g?.titular ?? null,
            permiso: g?.permiso ?? null,
            gtfNumber: gtf,
          });
          destinoPorGtf.set(gtf, destino);
        }
        out.push({ id: d.id, name: d.name, gtf, casillero, destino });
        break;
      }
    }
    return out;
  }

  /**
   * Muda los papeles viejos y borra las carpetas de año/mes que quedaron
   * VACÍAS de verdad (sin subcarpetas ni documentos, tampoco en la papelera:
   * uno en la papelera volvería a la raíz del Drive al restaurarlo).
   */
  static async ordenar(
    tenantId: string,
    user: string,
  ): Promise<{ movidos: number; carpetasQuitadas: number }> {
    if (!tenantId) throw new Error("tenantId is required");
    const papeles = await CtpGuiaPapelesViejosDB.pendientes(tenantId);
    if (papeles.length === 0) return { movidos: 0, carpetasQuitadas: 0 };

    const rutas = [...new Set(papeles.map((p) => p.destino.join("/")))];
    const { idPorRuta } = await DocumentsDB.createFolderTree(tenantId, { rutas });
    let movidos = 0;
    const origenes = new Set<string>();
    for (const p of papeles) {
      const folderId = idPorRuta[p.destino.join("/")];
      if (!folderId) continue;
      const doc = await DocumentsDB.getById(tenantId, p.id);
      if (!doc) continue;
      if (doc.folderId) origenes.add(doc.folderId);
      const faltan = [tagGtf(p.gtf), tagCasillero(p.casillero)].filter(
        (t) => !doc.tags.some((x) => x.toLowerCase() === t.toLowerCase()),
      );
      const r = await DocumentsDB.update(tenantId, p.id, {
        folderId,
        ...(faltan.length ? { tags: [...doc.tags, ...faltan] } : {}),
      });
      if (!r) continue;
      movidos++;
      DocumentsDB.log(tenantId, {
        documentId: p.id,
        actorId: user,
        action: "move",
        metadata: { origen: "guia", motivo: "ordenar_papeles_viejos", gtfNumber: p.gtf, destino: p.destino.join(" › ") },
      }).catch((err) => logger.warn("[papeles-viejos] auditoría falló", { error: String(err) }));
    }

    const carpetasQuitadas = await CtpGuiaPapelesViejosDB.quitarVacias(tenantId, [...origenes]);
    auditCtp({
      tenantId,
      action: "ctp_guia_guardada_editar",
      entity: "ForestGuiaGuardada",
      entityId: "papeles-viejos",
      detail: `Ordenó ${movidos} papel(es) de guías de las carpetas por mes a la carpeta de su titular y permiso`,
      user,
    });
    return { movidos, carpetasQuitadas };
  }

  /** Borra, de abajo hacia arriba, las carpetas de mes/año que quedaron vacías. */
  private static async quitarVacias(tenantId: string, ids: string[]): Promise<number> {
    let quitadas = 0;
    /* Sin «ya visto»: un año que tenía un mes adentro se vuelve a mirar cuando
       ese mes se borra. Termina solo: el padre sólo se encola tras un borrado. */
    const porRevisar = [...new Set(ids)];
    while (porRevisar.length > 0) {
      const id = porRevisar.shift();
      if (!id) continue;
      const carpeta = await prisma.documentFolder.findFirst({
        where: { id, tenantId },
        select: { id: true, name: true, parentId: true },
      });
      /* Sólo carpetas de año o mes: nunca la raíz de las guías ni otra. */
      if (!carpeta || !(ES_ANIO.test(carpeta.name.trim()) || ES_MES.test(carpeta.name.trim()))) continue;
      const [docs, hijas] = await Promise.all([
        prisma.document.count({ where: { tenantId, folderId: id } }),
        prisma.documentFolder.count({ where: { tenantId, parentId: id } }),
      ]);
      if (docs > 0 || hijas > 0) continue;
      if (await DocumentsDB.deleteFolder(tenantId, id)) {
        quitadas++;
        if (carpeta.parentId) porRevisar.push(carpeta.parentId);
      }
    }
    return quitadas;
  }
}
