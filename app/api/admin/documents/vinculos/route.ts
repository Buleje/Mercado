import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { DocumentsDB } from "@/lib/db/documents.db";
import { VinculosCarpetaDB, desdeYPor } from "@/lib/db/vinculos-carpeta.db";
import { leerVinculo, vinculosDeCarpeta } from "@/lib/documentos/terceros-vinculo";
import { TOPE_ALIAS } from "@/lib/documentos/vinculos-sistema";
import { logger } from "@/lib/logger";

/**
 * «Vínculos con el sistema…» de una carpeta del Archivo (Brandon 24-10).
 *
 * GET `?carpeta=<id>` → `{ registro, alias, puedeEditar }`
 *   · `registro[clave] = { desde, por }`: el último «ligar» que quedó en el
 *     registro (sin fila = ligado antes del 24-10, «sin registro»).
 *   · `alias[clave]`: cómo lo llama el negocio, sólo de los vínculos de ESA carpeta.
 *   · 404 si el rol no ve la carpeta (por toda la cadena: candado de dueño).
 * PUT `{ clave, alias | null }` → pone o quita el alias de un tercero. Dueño,
 *   admin o encargado, y sólo si el tercero está ligado a una carpeta que ve.
 *
 * Ligar, quitar y re-ligar NO pasan por acá: son etiquetas y van por
 * `folders/bulk` (que filtra por rol y deja el registro).
 */

/** Los que cambian vínculos y alias. `requireAdmin` ya deja pasar a manager con admin/owner; se dice explícito. */
const ROLES_GESTION = ["admin", "owner", "manager"] as const;
const GESTION = new Set<string>([...ROLES_GESTION, "superadmin"]);

const Carpeta = z.string().trim().min(1).max(64);
const Clave = z.string().trim().toLowerCase().min(3).max(80).refine((c) => leerVinculo(c) !== null, "no es un vínculo");
/** Control, bidi (U+202E invierte el texto) y ancho cero: un `\u0000` daba 500 (seguridad 24-10). */
const RAROS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/;
const PutBody = z
  .object({
    clave: Clave,
    alias: z.string().trim().max(TOPE_ALIAS).refine((a) => !RAROS.test(a), "caracteres no permitidos").nullable(),
  })
  .strict();

export async function GET(req: NextRequest) {
  try {
    const rl = applyRateLimit(req, "GENEROUS", "documents:vinculos");
    if (rl) return rl;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;
    const parsed = Carpeta.safeParse(req.nextUrl.searchParams.get("carpeta") ?? "");
    if (!parsed.success) return NextResponse.json({ error: "invalid_query" }, { status: 400 });

    const carpeta = (await DocumentsDB.listFolders(auth.tenantId, auth.role)).find((f) => f.id === parsed.data);
    if (!carpeta) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const [historial, alias] = await Promise.all([
      VinculosCarpetaDB.historial(auth.tenantId, carpeta.id),
      VinculosCarpetaDB.aliasDe(auth.tenantId, vinculosDeCarpeta(carpeta)),
    ]);
    return NextResponse.json({ registro: desdeYPor(historial), alias, puedeEditar: GESTION.has(auth.role) });
  } catch (e) {
    logger.error("[documents.vinculos] get error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const rl = applyRateLimit(req, "MODERATE", "documents:vinculos:alias");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req, ROLES_GESTION);
    if (auth instanceof NextResponse) return auth;

    const body: unknown = await req.json().catch((err: unknown) => {
      logger.warn("[documents.vinculos] cuerpo sin JSON", { err: String(err) });
      return {};
    });
    const parsed = PutBody.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    const { clave, alias } = parsed.data;

    // Sólo un tercero ligado a una carpeta que el rol VE: no se renombra lo que no se ve.
    const carpetas = await DocumentsDB.listFolders(auth.tenantId, auth.role);
    if (!carpetas.some((f) => vinculosDeCarpeta(f).includes(clave))) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const guardado = await VinculosCarpetaDB.ponerAlias(auth.tenantId, clave, alias);
    logger.info("[documents.vinculos] alias", { tenantId: auth.tenantId, clave, conAlias: guardado !== null, actor: auth.username });
    return NextResponse.json({ ok: true, clave, alias: guardado });
  } catch (e) {
    logger.error("[documents.vinculos] put error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
