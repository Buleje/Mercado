import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { CarpetaAjenaError, DocumentsDB } from "@/lib/db/documents.db";
import {
  buildStoragePath,
  isMimeAllowed,
  uploadToStorage,
} from "@/lib/documents/storage";
import { aiCategorize } from "@/lib/documents/ai-categorize";
import { analyzeDocumentContent, isAnalyzableMime } from "@/lib/documents/analyze-document";
import { enColaDeAnalisis } from "@/lib/documents/cola-analisis";
import { correrCartero } from "@/lib/documentos/cartero-server";
import { precalcularMiniatura } from "@/lib/documents/precalcular-miniatura";
import { MAX_UPLOAD_SIZE } from "@/lib/types/documents";
import { resolverMime } from "@/lib/documents/tipos-archivo";
import { assertCsrf } from "@/lib/auth/csrf";
import { interpretarBusqueda, quitarVacias, type BusquedaInterpretada } from "@/lib/documentos/busqueda-natural";
import { leerCodigoDocumento } from "@/lib/documentos/codigo-documento";
import { rutaSensible } from "@/lib/documentos/enlaces-entidad";
import { downloadFromStorage } from "@/lib/documents/storage";
import { createHash } from "node:crypto";
import {
  leerMetadatos,
  resolverVinculo,
  ROLES_PAPEL_SENSIBLE,
  ROLES_VINCULO,
  unirTags,
  type DestinoVinculo,
} from "./vinculo-subida";


const ListQuery = z.object({
  folderId: z.string().nullable().optional(),
  category: z.string().optional(),
  q: z.string().optional(),
  tags: z.string().optional(), // CSV
  excluir: z.string().optional(), // CSV — deja fuera lo que tenga alguno de estos tags
  favorite: z.enum(["1", "0", "true", "false"]).optional(),
  customerId: z.string().optional(),
  orderId: z.string().optional(),
  supplierId: z.string().optional(),
  // ADR-119 — "por vencer": documentos que vencen dentro de N días (def. 30).
  expiring: z.coerce.number().int().min(1).max(365).optional(),
  // ADR-119 — búsqueda semántica IA (expande la query antes de buscar).
  semantic: z.enum(["1", "true"]).optional(),
  // Vista "Papelera": sólo documentos soft-deleted.
  deleted: z.enum(["1", "true"]).optional(),
  // Sólo contar: con `tags`, devuelve `{ conteo }` (total, bytes y por etiqueta) en vez de la lista.
  conteo: z.enum(["1", "true"]).optional(),
  // Tope de filas: el buscador del panel pide unas pocas, no el drive entero.
  limite: z.coerce.number().int().min(1).max(50).optional(),
  // ADR-516 — «Código pendiente de poner»: con código y sin marcar en el físico.
  // Con `conteo`, devuelve `{ codigoPendiente: { pendientes, atrasados } }`.
  codigoPendiente: z.enum(["1", "true"]).optional(),
});

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "DRIVE_READ", "documents:list");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const params = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = ListQuery.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query", issues: parsed.error.issues }, { status: 400 });
  }
  const f = parsed.data;

  // ADR-119 — vista "Por vencer": atajo dedicado, ignora el resto de filtros.
  if (f.expiring) {
    // Filtrado por rol como el listado (antes devolvía el OCR de lo restringido).
    const expiring = await DocumentsDB.listExpiring(auth.tenantId, f.expiring, auth.role);
    return NextResponse.json({ documents: expiring });
  }

  // ADR-516 — la cifra de la cabecera: cuántos códigos faltan poner en el físico.
  if (f.conteo && f.codigoPendiente) {
    const codigoPendiente = await DocumentsDB.conteoCodigoPendiente(auth.tenantId, auth.role);
    return NextResponse.json({ codigoPendiente });
  }

  // «Escondidas N fotos de las cámaras»: contar sin traer las fotos.
  if (f.conteo) {
    const etiquetas = f.tags?.split(",").map((t) => t.trim()).filter(Boolean) ?? [];
    const conteo = await DocumentsDB.contarPorTags(auth.tenantId, etiquetas, auth.role);
    return NextResponse.json({ conteo });
  }

  // «Buscar como hablas»: lo que es fecha, tipo, origen o carpeta pasa a filtro
  // y sólo lo que queda se busca como texto (todas las palabras). Las carpetas
  // se piden únicamente si quedó alguna palabra que podría nombrar a una.
  let interp: BusquedaInterpretada | undefined;
  // ADR-516 — «DOC-000123» / «doc 123» / «#123» es un código, no una frase: va
  // tal cual (la interpretación se comía el «doc»). Un número pelado sigue
  // interpretándose («2026» es el año del papel); si queda como texto, la
  // lista lo cruza igual con el código.
  const esCodigo = leerCodigoDocumento(f.q) != null && !/^\s*\d+\s*$/.test(f.q ?? "");
  if (f.q?.trim() && !esCodigo) {
    interp = interpretarBusqueda(f.q);
    if (interp.necesitaCarpetas) {
      const carpetas = await DocumentsDB.carpetasParaBuscar(auth.tenantId, auth.role);
      interp = interpretarBusqueda(f.q, { carpetas });
    }
  }
  // Una frase que es toda relleno («de la», «lo que llegó») no busca nada: la
  // vista normal (la pantalla avisa «escribe algo más concreto»). Buscar «de» Y
  // «la» como subcadena traía 35 de 436 papeles sin ningún criterio.
  const textoLibre = interp ? interp.texto.trim() : esCodigo ? f.q?.trim() : undefined;

  // ADR-119 — búsqueda semántica: la IA expande SÓLO las palabras que sobran
  // (sin relleno) y se OR-ean. «vencidos» con IA ya no le manda nada.
  let qAny: string[] | undefined;
  let semanticTerms: string[] | undefined;
  if (f.semantic && textoLibre && !esCodigo) {
    const { expandSearchTerms } = await import("@/lib/documents/ai-search");
    qAny = quitarVacias(await expandSearchTerms(textoLibre));
    if (qAny.length === 0) qAny = undefined;
    semanticTerms = qAny;
  }

  // La vista general esconde las fotos de las cámaras; si las pidió («fotos de
  // las cámaras»), esa etiqueta deja de esconderse.
  const pedidas = new Set(interp?.grupos.flatMap((g) => g.etiquetas ?? []) ?? []);
  const sinTags = f.excluir?.split(",").map((s) => s.trim()).filter((s) => s && !pedidas.has(s));

  const deletedOnly = f.deleted === "1" || f.deleted === "true";
  const docs = await DocumentsDB.list(auth.tenantId, {
    // En la papelera no aplicamos folder (mostramos TODO lo eliminado del tenant).
    folderId: deletedOnly ? undefined : f.folderId === "null" ? null : f.folderId,
    category: f.category,
    q: qAny ? undefined : textoLibre || undefined,
    qAny,
    vence: interp?.vence,
    subido: interp?.subido,
    folderIds: interp?.carpetas,
    grupos: interp?.grupos.length ? interp.grupos : undefined,
    tags: f.tags?.split(",").map((s) => s.trim()).filter(Boolean),
    sinTags,
    favorite: f.favorite ? f.favorite === "1" || f.favorite === "true" : interp?.favoritos ? true : undefined,
    customerId: f.customerId,
    orderId: f.orderId,
    supplierId: f.supplierId,
    deletedOnly,
    limite: f.limite,
    codigoPendiente: f.codigoPendiente ? true : undefined,
    // El texto indexado sólo se manda cuando hay una búsqueda escrita: es lo
    // único que lo usa del lado del cliente (resaltar la coincidencia y
    // ordenar por relevancia). Abrir el drive es el caso común y ahí no hace
    // falta ni un byte de contenido.
    // Sólo con texto libre: «vencidos» o «de ayer» son filtros y no resaltan nada.
    conTextoCompleto: Boolean(textoLibre) || Boolean(qAny?.length),
  }, auth.role);

  return NextResponse.json({
    documents: docs,
    ...(semanticTerms ? { semanticTerms } : {}),
    // Lo que se entendió de la búsqueda (chips «Entendí: …»); campo nuevo y opcional.
    ...(interp ? { entendi: interp.entendi.map(({ tipo, texto }) => ({ tipo, texto })) } : {}),
  });
}

export async function POST(req: NextRequest) {
  // DRIVE y no STRICT: cada archivo es un request y el drive recibe carpetas
  // enteras — con 10 cada 15 min el importador moría al décimo (ADR-306).
  const rl = await applyRateLimit(req, "DRIVE", "documents:upload");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "no_file" }, { status: 400 });

    if (file.size > MAX_UPLOAD_SIZE) {
      return NextResponse.json(
        { error: "too_large", maxBytes: MAX_UPLOAD_SIZE },
        { status: 413 }
      );
    }
    // El navegador deja en blanco (u octet-stream) todo lo que su tabla no
    // conoce: HEIC del iPhone, .ods de LibreOffice, un .dwg. Guardar ESO hace
    // que después el drive no sepa ni qué ícono poner. Se resuelve por extensión.
    const mime = resolverMime(file.name, file.type);
    // El NOMBRE importa: la extensión es la que decide qué hace el sistema
    // operativo al abrirlo, y es más difícil de disfrazar que el MIME.
    if (!isMimeAllowed(mime, file.name)) {
      return NextResponse.json({ error: "mime_not_allowed", mime }, { status: 415 });
    }

    // ADR-524 §3.1: carpeta por ruta, categoría, etiquetas, vencimiento,
    // vínculo y `siExiste`. Todo opcional: sin ellos, la subida de siempre.
    const meta = leerMetadatos(form);
    if (!meta.ok) return NextResponse.json(meta.body, { status: meta.status });
    const m = meta.data;

    // El vínculo se verifica ANTES de subir: una entidad de otro negocio es un
    // 404 y no deja un archivo huérfano en el Drive.
    let destino: DestinoVinculo | null = null;
    if (m.vinculo) {
      if (!ROLES_VINCULO.includes(auth.role)) {
        return NextResponse.json(
          { error: "forbidden", message: "Solo el dueño o el administrador cuelgan papeles de fichas, trámites y alquileres." },
          { status: 403 },
        );
      }
      destino = await resolverVinculo(auth.tenantId, m.vinculo);
      if (!destino) {
        return NextResponse.json(
          { error: "not_found", message: "Ya no existe a qué colgar el papel en este negocio." },
          { status: 404 },
        );
      }
    }

    // ADR-524 S4: «Trámites/…», «Alquileres/…» y «Socios y familia/…» nacen con
    // candado aunque no venga vínculo, y solo los suben dueño y administrador.
    const porRuta = rutaSensible(m.ruta);
    if (porRuta && !ROLES_VINCULO.includes(auth.role)) {
      return NextResponse.json(
        { error: "forbidden", message: "Solo el dueño o el administrador suben papeles a Trámites, Alquileres o Socios y familia." },
        { status: 403 },
      );
    }
    const candado = !!destino?.sensible || porRuta;

    const folderIdRaw = form.get("folderId");
    let folderId =
      folderIdRaw && folderIdRaw !== "null" && folderIdRaw !== ""
        ? String(folderIdRaw)
        : null;
    // `carpetaRuta` gana sobre `folderId`: se crea lo que falte desde la raíz
    // (idempotente, hereda los roles de la carpeta madre).
    if (m.ruta) {
      const { idPorRuta } = await DocumentsDB.createFolderTree(
        auth.tenantId,
        { parentId: null, rutas: [m.ruta], ...(porRuta ? { rolesRaizNueva: [...ROLES_PAPEL_SENSIBLE] } : {}) },
        auth.role,
      );
      folderId = idPorRuta[m.ruta] ?? null;
    }

    const originalName = file.name || "archivo";
    const tagsDelPedido = unirTags(m.tags, destino?.tag);

    const buffer = Buffer.from(await file.arrayBuffer());

    // `siExiste: "saltar"`: mismo nombre, mismos bytes Y mismo contenido (sha256)
    // en esa carpeta = ya está (reintento de un lote). Se le aplican igual los
    // datos y el vínculo. Dos escaneos distintos con el mismo nombre y peso se
    // suben los dos (R7): el hash solo se calcula cuando nombre+peso coinciden.
    if (m.saltarSiExiste) {
      const enCarpeta = await DocumentsDB.listNamesInFolders(auth.tenantId, [folderId], auth.role);
      const candidato = (enCarpeta[folderId ?? ""] ?? []).find((d) => d.name === originalName && d.size === file.size);
      const actual = candidato ? await DocumentsDB.getById(auth.tenantId, candidato.id, auth.role) : null;
      const guardado = actual?.storagePath ? await downloadFromStorage(actual.storagePath) : null;
      if (actual && guardado && sha256(guardado) === sha256(buffer)) {
        // El candado se pone solo si el papel no tenía roles: nunca se abren ni se pisan los que ya tiene.
        const sinRoles = (actual.allowedRoles ?? []).length === 0;
        if (m.category || tagsDelPedido.length || m.expiresAt || (candado && sinRoles)) {
          await DocumentsDB.update(auth.tenantId, actual.id, {
            ...(m.category ? { category: m.category } : {}),
            ...(tagsDelPedido.length ? { tags: unirTags(actual.tags, tagsDelPedido) } : {}),
            ...(m.expiresAt ? { expiresAt: m.expiresAt } : {}),
            ...(candado && sinRoles ? { allowedRoles: [...ROLES_PAPEL_SENSIBLE] } : {}),
          });
        }
        const vinculado = destino ? await aplicarVinculo(destino, actual.id, originalName, auth.username, auth.tenantId) : false;
        return NextResponse.json({ duplicado: true, id: actual.id, vinculado });
      }
    }

    // 1) Crear row con storagePath temporal (lo necesitamos para el path estable)
    // `viewerRole`: una carpeta con roles que este rol no ve se responde 404
    // `folder_not_found`, igual que una que no existe (no se confirma que esté).
    const draft = await DocumentsDB.create(auth.tenantId, {
      folderId,
      name: originalName,
      originalName,
      mimeType: mime,
      size: file.size,
      storagePath: "pending",
      uploadedById: auth.username,
      viewerRole: auth.role,
      // Papel de ficha/trámite/alquiler o de una carpeta sensible: nace con candado de dueños.
      ...(candado ? { allowedRoles: [...ROLES_PAPEL_SENSIBLE] } : {}),
    });

    const storagePath = buildStoragePath({
      tenantId: auth.tenantId,
      documentId: draft.id,
      versionLabel: "v1",
      originalName,
    });

    const up = await uploadToStorage(storagePath, buffer, mime);
    if (!up.ok) {
      await DocumentsDB.hardDelete(auth.tenantId, draft.id);
      return NextResponse.json({ error: "storage_fail", detail: up.error }, { status: 502 });
    }

    // 2) Actualizar con storagePath real + heurística inicial
    const heur = await aiCategorize({
      filename: originalName,
      mimeType: mime,
      size: file.size,
      textSnippet: mime.startsWith("text/") ? buffer.slice(0, 4096).toString("utf8") : undefined,
    });

    // Una sola escritura: la categoría y la ruta del archivo se guardan juntas.
    // Eran dos viajes a la base por archivo, y en un import de 400 eso se nota.
    const category = m.category ?? heur.category;
    const tags = unirTags(heur.tags, tagsDelPedido);
    const updated = await DocumentsDB.update(auth.tenantId, draft.id, {
      storagePath,
      category,
      tags,
      ...(m.expiresAt ? { expiresAt: m.expiresAt } : {}),
      aiCategory: heur.source === "ai" ? heur.category : undefined,
      aiTags: heur.source === "ai" ? heur.tags : undefined,
    });
    const vinculado = destino ? await aplicarVinculo(destino, draft.id, originalName, auth.username, auth.tenantId) : false;

    DocumentsDB.log(auth.tenantId, {
      documentId: draft.id,
      actorId: auth.username,
      action: "upload",
      metadata: { mime, size: file.size, source: heur.source },
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    }).catch((err) => logger.warn("documents.audit.upload_fail", { err: String(err) }));

    // Auto-análisis de contenido (fire-and-forget): los PDFs/texto se indexan solos
    // para que el asistente los pueda leer sin apretar "Analizar con IA".
    if (isAnalyzableMime(mime)) {
      // En cola: subir una carpeta de 30 fotos disparaba 30 análisis a la vez
      // y con un modelo local eso tumba la máquina (ver `cola-analisis`).
      // `after`: en Vercel la función puede congelarse apenas sale la respuesta
      // y el análisis (OCR incluido) quedaba a medias hasta el cron nocturno.
      after(() =>
        enColaDeAnalisis(draft.id, () =>
          analyzeDocumentContent(auth.tenantId, draft.id, auth.username, auth.role),
        ).catch((err) => logger.warn("documents.autoanalyze_fail", { err: String(err) })),
      );
    } else {
      // Sin texto que leer: el cartero mira sólo el nombre del archivo («Cubicación Ronal.xlsx»).
      const decidirDueno = () =>
        correrCartero(auth.tenantId, draft.id).catch((err) =>
          logger.error("[cartero] papel sin texto: decidir el dueño falló", { error: String(err) }),
        );
      try {
        after(decidirDueno);
      } catch {
        void decidirDueno(); // fuera de una petición de Next (pruebas) no hay after(): igual fire-and-forget
      }
    }

    // La carita del archivo se dibuja ahora, no cuando alguien abra la carpeta.
    // Sin esto, quien sube los archivos es justamente quien paga el render de
    // todos ellos al volver a la grilla.
    precalcularMiniatura(storagePath, originalName, mime, file.size).catch((err) =>
      logger.warn("documents.miniatura.precalculo_fail", { err: String(err) }),
    );

    return NextResponse.json({
      document: {
        ...(updated ?? draft),
        storagePath,
        category,
        tags,
      },
      ai: { source: heur.source, suggestedCategory: heur.category, suggestedTags: heur.tags },
      vinculado,
    });
  } catch (err) {
    // `folderId` de otro negocio (o inexistente): 404, nunca un documento
    // colgado de la carpeta de otro tenant. Se corta antes de subir el archivo.
    if (err instanceof CarpetaAjenaError) {
      return NextResponse.json({ error: "folder_not_found" }, { status: 404 });
    }
    logger.error("documents.upload.exception", { err: String(err) });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

/**
 * Efecto del vínculo (ADR-524): ficha → adjunto, requisito → «hay», alquiler
 * sin contrato → contrato, pago → comprobante. Si falla, el archivo queda
 * subido y atado por el tag: se responde `vinculado: false` y se loguea.
 */
async function aplicarVinculo(
  destino: DestinoVinculo,
  documentId: string,
  rotulo: string,
  user: string,
  tenantId: string,
): Promise<boolean> {
  try {
    return await destino.aplicar(documentId, rotulo, user);
  } catch (err) {
    logger.error("[documents.upload] vínculo falló", { error: String(err), tenantId, tipo: destino.tipo, documentId });
    return false;
  }
}

function sha256(b: Buffer): string {
  return createHash("sha256").update(b).digest("hex");
}
