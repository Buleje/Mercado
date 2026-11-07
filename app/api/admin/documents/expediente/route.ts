import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { CarpetaAjenaError } from "@/lib/db/documents.db";
import { armarExpediente, planearExpediente, type FuenteExpediente } from "@/lib/documents/armar-expediente";
import { MAX_PAPELES_EXPEDIENTE } from "@/lib/documents/expediente-indice";

/**
 * POST /api/admin/documents/expediente — «Armar expediente» (22-10): una
 * carpeta (con o sin subcarpetas), una selección o una etiqueta → UN PDF con
 * portada, índice y pie de página, guardado como documento nuevo.
 * Con `soloPlan: true` no arma: devuelve qué papeles entrarían (el modal lo
 * muestra antes de armar). Nada entra si quien lo pide no lo puede ver.
 */
const Body = z
  .object({
    folderId: z.string().min(1).max(64).optional(),
    incluirSubcarpetas: z.boolean().optional(),
    // Tope holgado: pasado MAX_PAPELES_EXPEDIENTE el plan responde con un motivo claro, no un 400 mudo.
    ids: z.array(z.string().min(1).max(64)).min(1).max(MAX_PAPELES_EXPEDIENTE * 5).optional(),
    tag: z.string().trim().min(1).max(80).optional(),
    titulo: z.string().max(120).optional(),
    /** Etiqueta extra para el PDF armado (la de la ficha que lo pidió). */
    etiqueta: z.string().trim().min(1).max(80).optional(),
    /** Ficha de cliente/proveedor que lo pidió: el PDF queda ligado a ella. */
    customerId: z.string().min(1).max(64).optional(),
    supplierId: z.string().min(1).max(64).optional(),
    soloPlan: z.boolean().optional(),
  })
  .refine((b) => [b.folderId, b.ids, b.tag].filter((x) => x !== undefined).length === 1, {
    message: "Indica una carpeta, una lista de papeles o una etiqueta (sólo una).",
  });

/** El 400 también se lee en el modal: con 301+ papeles elegidos decía sólo «invalid_body». */
function motivoDelCuerpo(issues: readonly z.core.$ZodIssue[]): string {
  if (issues.some((i) => i.code === "too_big" && i.path[0] === "ids")) {
    return `Elegiste demasiados papeles: el expediente arma hasta ${MAX_PAPELES_EXPEDIENTE}. Elige menos.`;
  }
  if (issues.some((i) => i.code === "too_big" && i.path[0] === "titulo")) return "El título es muy largo: hasta 120 letras.";
  // Los mensajes propios (refine) ya están en castellano; los de Zod, no.
  const propio = issues.find((i) => i.code === "custom");
  return propio?.message ?? "No se entendió el pedido. Recarga la página y vuelve a intentar.";
}

export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "DRIVE_READ", "documents:expediente");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", mensaje: motivoDelCuerpo(parsed.error.issues), issues: parsed.error.issues }, { status: 400 });
  }
  const b = parsed.data;
  const fuente: FuenteExpediente = b.folderId
    ? { tipo: "carpeta", folderId: b.folderId, incluirSubcarpetas: b.incluirSubcarpetas ?? true }
    : b.ids
      ? { tipo: "ids", ids: b.ids }
      : { tipo: "tag", tag: b.tag ?? "" };

  if (b.soloPlan) {
    const plan = await planearExpediente(auth.tenantId, fuente, auth.role);
    if (!plan.ok) return NextResponse.json({ error: plan.error, mensaje: plan.mensaje }, { status: plan.status });
    return NextResponse.json(plan.plan);
  }

  // Armar baja y une archivos: el mismo tope que «Combinar en un PDF».
  const rlArmar = await applyRateLimit(req, "STRICT", "documents:expediente-armar");
  if (rlArmar) return rlArmar;
  try {
    const r = await armarExpediente(auth.tenantId, fuente, {
      titulo: b.titulo,
      etiqueta: b.etiqueta,
      customerId: b.customerId,
      supplierId: b.supplierId,
      actorId: auth.username,
      viewerRole: auth.role,
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    });
    if (!r.ok) return NextResponse.json({ error: r.error, mensaje: r.mensaje }, { status: r.status });
    return NextResponse.json({ document: r.document, paginas: r.paginas, hojasIndice: r.hojasIndice, indice: r.indice });
  } catch (e) {
    // Carpeta de destino de otro negocio o que el rol no ve: 404 como en el resto del Archivo.
    if (e instanceof CarpetaAjenaError) return NextResponse.json({ error: "folder_not_found", mensaje: "No se encontró la carpeta." }, { status: 404 });
    throw e;
  }
}
