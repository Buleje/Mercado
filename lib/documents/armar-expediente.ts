import "server-only";
import { DocumentsDB } from "@/lib/db/documents.db";
import { MembreteDB } from "@/lib/db/membrete.db";
import { buildStoragePath, downloadFromStorage, uploadToStorage } from "@/lib/documents/storage";
import { canRoleSeeEnCadena, rolesDeLaCadena, rolesDelCombinado, type CarpetaConRoles } from "@/lib/documents/doc-access";
import { armarPdfExpediente } from "@/lib/documents/expediente-pdf";
import {
  carpetasEnOrden,
  MAX_MB_EXPEDIENTE,
  MAX_PAPELES_EXPEDIENTE,
  nombreDelExpediente,
  ordenarPorCarpeta,
  ordenDeSeleccion,
  rutaDeCarpeta,
  tipoDePapel,
  venceEl,
  type FilaDelIndice,
  type PapelDelPlan,
  type PlanExpediente,
} from "@/lib/documents/expediente-indice";
import { logger } from "@/lib/logger";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";

/**
 * Expediente en un clic (22-10): junta los papeles de una carpeta (con o sin
 * subcarpetas), de una selección o de una etiqueta, y los arma en UN PDF con
 * portada e índice (`expediente-pdf.ts`). El plan (qué entra) es lo mismo que
 * el modal muestra antes de armar.
 *
 * Permisos: nada entra si quien arma no lo puede ver. `DocumentsDB` ya filtra
 * por rol, pero no a los privilegiados (manager/encargado) y el candado «solo
 * dueños» de ADR-502 sí los frena: acá se mira de nuevo cada papel con la
 * cadena entera de carpetas (`canRoleSeeEnCadena`), así un papel de `Terceros`
 * no se cuela en el expediente de un encargado.
 */

/** Marca del PDF armado: no entra al expediente siguiente de la misma carpeta. */
export const TAG_EXPEDIENTE = "expediente";

export type FuenteExpediente =
  | { tipo: "carpeta"; folderId: string; incluirSubcarpetas: boolean }
  | { tipo: "ids"; ids: string[] }
  | { tipo: "tag"; tag: string };

type Falla = { ok: false; error: string; mensaje: string; status: number };
const falla = (status: number, error: string, mensaje: string): Falla => ({ ok: false, error, mensaje, status });

interface PlanInterno extends PlanExpediente {
  docs: DbDocument[];
  /** Roles del PDF armado: el que no ve algún papel no ve el expediente (`rolesDelCombinado`). */
  allowedRoles: string[];
}

export async function planearExpediente(
  tenantId: string,
  fuente: FuenteExpediente,
  viewerRole: string,
): Promise<{ ok: true; plan: PlanExpediente } | Falla> {
  const r = await planInterno(tenantId, fuente, viewerRole);
  if (!r.ok) return r;
  const { tituloSugerido, papeles, destinoId, bytesImprimibles } = r.plan;
  return { ok: true, plan: { tituloSugerido, papeles, destinoId, bytesImprimibles } };
}

async function planInterno(
  tenantId: string,
  fuente: FuenteExpediente,
  viewerRole: string,
): Promise<{ ok: true; plan: PlanInterno } | Falla> {
  // Todas las carpetas (sin filtrar): hacen falta sus roles para mirar la cadena entera.
  const carpetas = await DocumentsDB.listFolders(tenantId);
  const porId = new Map<string, DbDocumentFolder>(carpetas.map((c) => [c.id, c]));
  const mapa = new Map<string, CarpetaConRoles>(carpetas.map((c) => [c.id, { parentId: c.parentId, allowedRoles: c.allowedRoles ?? [] }]));
  const ve = (d: { folderId: string | null; allowedRoles?: string[] | null }) =>
    canRoleSeeEnCadena(viewerRole, d.allowedRoles ?? [], rolesDeLaCadena(d.folderId, mapa));
  const carpetaVisible = (id: string) => porId.has(id) && canRoleSeeEnCadena(viewerRole, [], rolesDeLaCadena(id, mapa));

  let docs: DbDocument[];
  let tituloSugerido: string;
  let destinoId: string | null = null;
  let etiquetaCarpeta: (d: DbDocument) => string = (d) => rutaDeCarpeta(d.folderId, porId);

  if (fuente.tipo === "carpeta") {
    const raiz = porId.get(fuente.folderId);
    if (!raiz || !carpetaVisible(raiz.id)) return falla(404, "folder_not_found", "No se encontró la carpeta.");
    const orden = carpetasEnOrden(raiz.id, carpetas, fuente.incluirSubcarpetas).filter(carpetaVisible);
    const porCarpeta = await Promise.all(
      orden.map((folderId) => DocumentsDB.list(tenantId, { folderId, sinTags: [TAG_EXPEDIENTE] }, viewerRole)),
    );
    docs = ordenarPorCarpeta(porCarpeta.flat().filter(ve), orden);
    tituloSugerido = raiz.name;
    destinoId = raiz.id;
    etiquetaCarpeta = (d) => rutaDeCarpeta(d.folderId, porId, raiz.id);
  } else if (fuente.tipo === "ids") {
    const unicos = [...new Set(fuente.ids)];
    if (unicos.length > MAX_PAPELES_EXPEDIENTE) {
      return falla(422, "demasiados_papeles", `Elegiste ${unicos.length} papeles y el expediente arma hasta ${MAX_PAPELES_EXPEDIENTE}. Elige menos.`);
    }
    const encontrados = await Promise.all(unicos.map((id) => DocumentsDB.getById(tenantId, id, viewerRole)));
    docs = ordenDeSeleccion(encontrados.filter((d): d is DbDocument => !!d && ve(d)), fuente.ids);
    tituloSugerido = "Papeles elegidos";
    // Todos de la misma carpeta → el expediente queda con ellos; si vienen de varias, en la raíz.
    const carpetasDe = new Set(docs.map((d) => d.folderId));
    destinoId = carpetasDe.size === 1 ? [...carpetasDe][0] : null;
  } else {
    const conTag = await DocumentsDB.list(tenantId, { tags: [fuente.tag], sinTags: [TAG_EXPEDIENTE] }, viewerRole);
    const ordenTodas = carpetas
      .filter((c) => !c.parentId)
      .sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }))
      .flatMap((c) => carpetasEnOrden(c.id, carpetas, true));
    docs = ordenarPorCarpeta(conTag.filter(ve), ordenTodas);
    tituloSugerido = fuente.tag;
  }

  if (docs.length === 0) return falla(422, "sin_papeles", "No hay papeles para armar el expediente.");
  if (docs.length > MAX_PAPELES_EXPEDIENTE) {
    return falla(
      422,
      "demasiados_papeles",
      `Son ${docs.length} papeles y el expediente arma hasta ${MAX_PAPELES_EXPEDIENTE}. Elige una carpeta más chica o menos papeles.`,
    );
  }
  const ahora = Date.now();
  const papeles: PapelDelPlan[] = docs.map((d) => ({
    id: d.id,
    nombre: d.name,
    carpeta: etiquetaCarpeta(d),
    tipo: tipoDePapel(d.mimeType, d.name),
    vence: venceEl(d.expiresAt),
    vencido: !!d.expiresAt && new Date(d.expiresAt).getTime() < ahora,
    bytes: d.size,
  }));
  const bytesImprimibles = papeles.filter((p) => p.tipo !== "no-imprimible").reduce((s, p) => s + p.bytes, 0);
  if (!papeles.some((p) => p.tipo !== "no-imprimible")) {
    return falla(422, "nada_imprimible", "Ninguno de estos papeles se puede unir en un PDF (son Word, Excel u otros). Pide los originales o súbelos en PDF.");
  }
  if (bytesImprimibles > MAX_MB_EXPEDIENTE * 1024 * 1024) {
    const mb = Math.round(bytesImprimibles / (1024 * 1024));
    return falla(413, "demasiado_pesado", `Los papeles pesan ${mb} MB y el expediente arma hasta ${MAX_MB_EXPEDIENTE} MB. Divídelo en dos.`);
  }
  const allowedRoles = rolesDelCombinado(
    docs.map((d) => ({ docAllowed: d.allowedRoles ?? [], cadena: rolesDeLaCadena(d.folderId, mapa) })),
  );
  return { ok: true, plan: { tituloSugerido, papeles, destinoId, bytesImprimibles, docs, allowedRoles } };
}

/** Baja los archivos de a pocos: 60 a la vez se comerían la memoria del servidor. */
async function bajarDeAPocos(rutas: (string | null)[], aLaVez = 4): Promise<(Uint8Array | null)[]> {
  const out: (Uint8Array | null)[] = new Array(rutas.length).fill(null);
  let i = 0;
  const trabajador = async () => {
    while (i < rutas.length) {
      const k = i++;
      const ruta = rutas[k];
      if (!ruta) continue;
      const buf = await downloadFromStorage(ruta).catch((err) => {
        logger.warn("documents.expediente.bajar_fallo", { err: String(err).slice(0, 160) });
        return null;
      });
      out[k] = buf ? new Uint8Array(buf) : null;
    }
  };
  await Promise.all(Array.from({ length: Math.min(aLaVez, rutas.length) }, trabajador));
  return out;
}

export type ExpedienteResultado =
  | { ok: true; document: DbDocument; paginas: number; hojasIndice: number; indice: FilaDelIndice[] }
  | Falla;

export async function armarExpediente(
  tenantId: string,
  fuente: FuenteExpediente,
  input: {
    titulo?: string;
    etiqueta?: string;
    /** Ficha de cliente/proveedor que lo pidió: esas fichas listan por la columna, no por etiqueta. */
    customerId?: string;
    supplierId?: string;
    actorId: string;
    viewerRole: string;
    ipAddress?: string;
  },
): Promise<ExpedienteResultado> {
  const r = await planInterno(tenantId, fuente, input.viewerRole);
  if (!r.ok) return r;
  const { plan } = r;
  const titulo = nombreDelExpediente((input.titulo?.trim() || plan.tituloSugerido).slice(0, 120));

  const [bytes, membrete] = await Promise.all([
    bajarDeAPocos(plan.docs.map((d, i) => (plan.papeles[i].tipo === "no-imprimible" ? null : d.storagePath))),
    MembreteDB.del(tenantId),
  ]);
  const fecha = new Date();
  const armado = await armarPdfExpediente({
    titulo,
    membrete,
    fecha,
    papeles: plan.papeles.map((p, i) => ({
      nombre: p.nombre,
      carpeta: p.carpeta,
      vence: p.vence,
      tipo: p.tipo,
      mimeType: plan.docs[i].mimeType,
      bytes: bytes[i],
    })),
  });

  const dia = fecha.toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const fileName = `${titulo.replace(/[^\w.-]+/g, "_").slice(0, 90)}_${dia}.pdf`;
  const tags = [TAG_EXPEDIENTE, ...(fuente.tipo === "tag" ? [fuente.tag] : []), ...(input.etiqueta ? [input.etiqueta] : [])];
  // Sólo se liga a la ficha si algún papel del plan ya es de ella: los papeles
  // salen del negocio, así un id de cliente ajeno no se cuela en la fila.
  const customerId = input.customerId && plan.docs.some((d) => d.customerId === input.customerId) ? input.customerId : undefined;
  const supplierId = input.supplierId && plan.docs.some((d) => d.supplierId === input.supplierId) ? input.supplierId : undefined;
  const draft = await DocumentsDB.create(tenantId, {
    folderId: plan.destinoId,
    name: titulo,
    originalName: fileName,
    mimeType: "application/pdf",
    size: armado.bytes.length,
    storagePath: "pending",
    category: "otros",
    tags: [...new Set(tags)],
    customerId,
    supplierId,
    uploadedById: input.actorId,
    viewerRole: input.viewerRole,
    allowedRoles: plan.allowedRoles,
  });

  const storagePath = buildStoragePath({ tenantId, documentId: draft.id, versionLabel: "v1", originalName: fileName });
  const up = await uploadToStorage(storagePath, armado.bytes, "application/pdf");
  if (!up.ok) {
    await DocumentsDB.hardDelete(tenantId, draft.id);
    return falla(502, "storage_upload_fail", "No se pudo guardar el expediente. Intenta de nuevo.");
  }
  await DocumentsDB.setStoragePath(tenantId, draft.id, storagePath);

  DocumentsDB.log(tenantId, {
    documentId: draft.id,
    actorId: input.actorId,
    action: "merge",
    metadata: {
      tipo: "expediente",
      fuente: fuente.tipo,
      sourceIds: plan.docs.map((d) => d.id),
      paginas: armado.paginas,
      fueraDelPdf: armado.indice.filter((f) => f.pagina === null).map((f) => f.nombre),
    },
    ipAddress: input.ipAddress,
  }).catch((err) => logger.warn("documents.expediente.audit_fail", { err: String(err) }));

  return {
    ok: true,
    document: { ...draft, storagePath },
    paginas: armado.paginas,
    hojasIndice: armado.hojasIndice,
    indice: armado.indice,
  };
}
