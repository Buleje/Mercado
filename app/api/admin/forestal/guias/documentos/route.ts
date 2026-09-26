import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { isSpecializationEnabled } from "@/lib/specializations";
import { withApiHandler } from "@/lib/api-handler";
import { CtpGuiaDocumentosDB } from "@/lib/db/ctp-guia-documentos.db";
import {
  guardarDocumentoDeGuia,
  prepararArchivo,
  quitarDocumentoDeGuia,
} from "@/lib/forestal/documentos-guia-server";
import {
  CASILLEROS_GUIA,
  CLAVES_CASILLERO,
  MAX_DOCS_POR_CASILLERO,
  PREFIJO_TAG_GTF,
  TOTAL_CASILLEROS,
  agruparPorCasillero,
  casillerosLlenos,
  llenosPorGuia,
} from "@/lib/forestal/documentos-guia";
import type { DbDocument } from "@/lib/types/documents";
import type { SessionPayload } from "@/lib/session";

/**
 * Documentos de una guía de ingreso (Libro CTP, ADR-438).
 *
 *   GET    ?gtf=<N°>           → los 6 casilleros con sus archivos
 *   GET    ?gtfs=<N°>,<N°>,…   → cuántos casilleros llenos tiene cada guía (fila de la tabla)
 *   POST   multipart gtf, casillero, file, reemplaza? → sube uno
 *   DELETE JSON { gtf, id }    → lo quita (papelera del Drive) — sólo admin/dueño
 *
 * Guard: sesión (admin/almacenero/dueño — el almacenero es quien recibe el
 * camión con los papeles) → CSRF en escrituras → rate limit del Drive → el
 * Libro CTP habilitado → la guía existe en ESTE tenant (si no, 404: no se
 * confirma nada de otro negocio). El tenant sale SIEMPRE de la sesión.
 * DELETE agrega un chequeo explícito (`soloAdminODueno`): `requireAdmin` deja
 * pasar a manager por el bypass de management-tier sin importar `ROLES` —
 * quitar un documento del expediente es un borrado real, no para un encargado.
 */

const ROLES = ["admin", "almacenero", "owner"] as const;
const gtfSchema = z.string().trim().min(1).max(60);

type Guard = { auth: SessionPayload } | { res: Response };

async function guard(req: NextRequest, escritura: boolean): Promise<Guard> {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return { res: auth };
  if (escritura) {
    const csrf = assertCsrf(req);
    if (csrf) return { res: csrf };
  }
  const rl = await applyRateLimit(req, escritura ? "DRIVE" : "DRIVE_READ", "forestal-guia-docs");
  if (rl) return { res: rl };
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"))) {
    return {
      res: NextResponse.json(
        {
          error: "specialization_disabled",
          message: "El Libro CTP no está habilitado para esta tienda.",
        },
        { status: 403 },
      ),
    };
  }
  return { auth };
}

const noEncontrada = () =>
  NextResponse.json(
    { error: "not_found", message: "No hay una guía con ese número." },
    { status: 404 },
  );
const ipDe = (req: NextRequest) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;

/** Lo que el modal necesita de cada archivo — sin la ruta del storage. */
function vista(d: DbDocument, gtf: string) {
  return {
    id: d.id,
    name: d.name,
    mimeType: d.mimeType,
    size: d.size,
    uploadedById: d.uploadedById,
    uploadedAt: d.uploadedAt,
    /* Archivado desde «Documento de la guía» antes de ADR-438: no tiene la
       etiqueta de máquina, se reconoció por las humanas. */
    legado: !d.tags.some((t) => t.toLowerCase().startsWith(PREFIJO_TAG_GTF)),
    src: `/api/admin/forestal/guias/documentos/ver?gtf=${encodeURIComponent(gtf)}&id=${encodeURIComponent(d.id)}`,
  };
}

export const GET = withApiHandler("forestal-guia-docs-get", async (req: NextRequest) => {
  const g = await guard(req, false);
  if ("res" in g) return g.res;
  const { auth } = g;
  const sp = req.nextUrl.searchParams;

  const lista = sp.get("gtfs");
  if (lista != null) {
    const gtfs = z
      .array(gtfSchema)
      .max(200)
      .safeParse([
        ...new Set(
          lista
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      ]);
    if (!gtfs.success)
      return NextResponse.json(
        { error: "invalid_query", issues: gtfs.error.issues },
        { status: 400 },
      );
    const docs = await CtpGuiaDocumentosDB.documentosDeGuias(auth.tenantId, gtfs.data, auth.role);
    return NextResponse.json({ llenos: llenosPorGuia(docs, gtfs.data), total: TOTAL_CASILLEROS });
  }

  const gtf = gtfSchema.safeParse(sp.get("gtf"));
  if (!gtf.success)
    return NextResponse.json({ error: "invalid_query", issues: gtf.error.issues }, { status: 400 });
  const guia = await CtpGuiaDocumentosDB.datosDeGuia(auth.tenantId, gtf.data);
  if (!guia) return noEncontrada();
  const docs = await CtpGuiaDocumentosDB.documentosDeGuias(
    auth.tenantId,
    [guia.gtfNumber],
    auth.role,
  );
  const grupos = agruparPorCasillero(docs, guia.gtfNumber);
  return NextResponse.json({
    gtf: guia.gtfNumber,
    llenos: casillerosLlenos(grupos),
    total: TOTAL_CASILLEROS,
    casilleros: CASILLEROS_GUIA.map((c) => ({
      ...c,
      docs: grupos[c.clave].map((d) => vista(d, guia.gtfNumber)),
    })),
  });
});

const postSchema = z.object({
  gtf: gtfSchema,
  casillero: z.enum(CLAVES_CASILLERO),
  reemplaza: z.preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.string().trim().min(1).max(40).nullable(),
  ),
});

export const POST = withApiHandler("forestal-guia-docs-post", async (req: NextRequest) => {
  const g = await guard(req, true);
  if ("res" in g) return g.res;
  const { auth } = g;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "invalid_body", message: "Manda el archivo como multipart/form-data." },
      { status: 400 },
    );
  }
  const campos = postSchema.safeParse({
    gtf: form.get("gtf"),
    casillero: form.get("casillero"),
    reemplaza: form.get("reemplaza"),
  });
  if (!campos.success)
    return NextResponse.json(
      { error: "invalid_body", issues: campos.error.issues },
      { status: 400 },
    );
  const file = form.get("file");
  if (!(file instanceof File))
    return NextResponse.json(
      { error: "sin_archivo", message: "No llegó ningún archivo." },
      { status: 400 },
    );

  const { gtf, casillero, reemplaza } = campos.data;
  const guia = await CtpGuiaDocumentosDB.datosDeGuia(auth.tenantId, gtf);
  if (!guia) return noEncontrada();

  /* Reemplazar sólo algo del MISMO casillero de la MISMA guía. */
  let viejo: DbDocument | null = null;
  if (reemplaza) {
    const r = await CtpGuiaDocumentosDB.documentoDeGuia(
      auth.tenantId,
      reemplaza,
      guia.gtfNumber,
      auth.role,
    );
    if (!r || r.casillero !== casillero) {
      return NextResponse.json(
        { error: "not_found", message: "El archivo a reemplazar ya no está en ese casillero." },
        { status: 404 },
      );
    }
    viejo = r.doc;
  } else {
    const ya = agruparPorCasillero(
      await CtpGuiaDocumentosDB.documentosDeGuias(auth.tenantId, [guia.gtfNumber], auth.role),
      guia.gtfNumber,
    );
    if (ya[casillero].length >= MAX_DOCS_POR_CASILLERO) {
      return NextResponse.json(
        {
          error: "casillero_lleno",
          message: `Ese casillero ya tiene ${MAX_DOCS_POR_CASILLERO} archivos: junta las hojas en un PDF o quita alguno.`,
        },
        { status: 409 },
      );
    }
  }

  const archivo = await prepararArchivo(file);
  if (!archivo.ok)
    return NextResponse.json(
      { error: archivo.error, message: archivo.message },
      { status: archivo.status },
    );

  const doc = await guardarDocumentoDeGuia({
    tenantId: auth.tenantId,
    user: auth.username ?? "unknown",
    role: auth.role,
    guia,
    casillero,
    archivo,
    nombreOriginal: file.name || "archivo",
    ip: ipDe(req),
    reemplaza: viejo,
  });
  if (!doc)
    return NextResponse.json(
      { error: "upload_failed", message: "No se pudo guardar el archivo. Prueba de nuevo." },
      { status: 502 },
    );
  return NextResponse.json({ documento: vista(doc, guia.gtfNumber), casillero }, { status: 201 });
});

const deleteSchema = z.object({ gtf: gtfSchema, id: z.string().trim().min(1).max(40) });

export const DELETE = withApiHandler("forestal-guia-docs-delete", async (req: NextRequest) => {
  const g = await guard(req, true);
  if ("res" in g) return g.res;
  const { auth } = g;
  /* `guard()` deja pasar a admin/almacenero/owner por `requireAdmin(ROLES)` —
     y a manager SIEMPRE, por el bypass de management-tier (`lib/require-admin.ts`)
     que ignora `ROLES` para ese rol. Quitar un documento del expediente
     (factura, GTF…) es un borrado real: sólo admin y dueño, igual que la
     plata de la guía (mismo helper que `guias/plata/route.ts`). Sin este
     chequeo, un encargado podía vaciar el expediente que pide una
     fiscalización. */
  const rol = soloAdminODueno(auth.role);
  if (rol) return rol;
  const body = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!body.success)
    return NextResponse.json({ error: "invalid_body", issues: body.error.issues }, { status: 400 });

  const guia = await CtpGuiaDocumentosDB.datosDeGuia(auth.tenantId, body.data.gtf);
  if (!guia) return noEncontrada();
  const r = await CtpGuiaDocumentosDB.documentoDeGuia(
    auth.tenantId,
    body.data.id,
    guia.gtfNumber,
    auth.role,
  );
  if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const ok = await quitarDocumentoDeGuia(
    auth.tenantId,
    r.doc.id,
    auth.username ?? "unknown",
    { gtfNumber: guia.gtfNumber, casillero: r.casillero },
    ipDe(req),
  );
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, casillero: r.casillero });
});
