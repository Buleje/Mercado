import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { DocumentsDB } from "@/lib/db/documents.db";
import { MAX_CARPETAS_POR_ENLACE, TOKEN_ENLACE_CARPETA } from "@/lib/documentos/enlace-varias-carpetas";
import {
  MAX_LARGO_CLAVE, claveCoincide, cabeceraCookieEnlace, firmarCookieEnlace,
} from "@/lib/documentos/clave-enlace";

/**
 * POST /api/public/folders/varias — abre con clave uno o varios enlaces de
 * carpeta (`/c/<t1>?mas=<t2>,…`) en UN pedido (23-10, Brandon: «un enlace de
 * 10 carpetas con clave gastaba 11 de 20 aperturas y a la segunda recarga se
 * cortaba»).
 *
 * La clave llega en el CUERPO (nunca en la URL: quedaba en el historial y en
 * el log). Se prueba contra cada token; el que la acepta devuelve su lista y
 * deja su cookie de acceso (`lib/documentos/clave-enlace.ts`), con la que sus
 * archivos se ven y se bajan. Sólo carpetas del mismo negocio que la primera
 * viva, igual que la página.
 */
const Body = z.object({
  tokens: z.array(z.string().regex(TOKEN_ENLACE_CARPETA)).min(1).max(MAX_CARPETAS_POR_ENLACE),
  password: z.string().max(MAX_LARGO_CLAVE),
});

type Encontrada = NonNullable<Awaited<ReturnType<typeof DocumentsDB.findByFolderShareToken>>>;

export async function POST(req: NextRequest) {
  try {
    // El mismo tope que el listado público de una carpeta: abrir 10 cuesta 1.
    const rl = applyRateLimit(req, "MODERATE", "public:folder");
    if (rl) return rl;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    const tokens = [...new Set(parsed.data.tokens)];
    const { password } = parsed.data;

    const resueltas = await Promise.all(
      tokens.map(async (token) => {
        const [found, guardado] = await Promise.all([
          DocumentsDB.findByFolderShareToken(token),
          DocumentsDB.getFolderShareRawPassword(token),
        ]);
        return { token, found, guardado };
      }),
    );
    const vivas = resueltas.filter((x): x is { token: string; found: Encontrada; guardado: string | null } => x.found !== null);
    if (vivas.length === 0) return NextResponse.json({ error: "not_found_or_expired" }, { status: 404 });

    // Un enlace no mezcla negocios: sólo las del negocio de la primera viva.
    const negocio = vivas[0].found.tenantId;
    const juntas = vivas.filter((x) => x.found.tenantId === negocio);

    const abiertas = juntas.map((x) => ({ ...x, acepta: claveCoincide(x.guardado, password) }));
    const conClave = abiertas.filter((x) => x.guardado);
    if (conClave.length > 0 && !conClave.some((x) => x.acepta)) {
      return NextResponse.json({ error: "password_required", requirePassword: true }, { status: 401 });
    }

    const res = NextResponse.json({
      carpetas: abiertas.map(({ token, found, acepta }) =>
        acepta
          ? { token, estado: "abierta" as const, folder: { name: found.folder.name }, docs: found.docs, expiresAt: found.expiresAt, hasPassword: found.hasPassword }
          : { token, estado: "rechazada" as const },
      ),
    });
    res.headers.set("Cache-Control", "private, no-store");

    for (const x of conClave) {
      if (!x.acepta || !x.guardado) continue;
      const valor = firmarCookieEnlace("carpeta", x.token, x.guardado);
      if (valor) res.headers.append("Set-Cookie", cabeceraCookieEnlace("carpeta", x.token, valor));
      else logger.error("[public.folders.varias] sin AUTH_SECRET: la cookie de acceso no se pudo firmar");
      DocumentsDB.incrementFolderShareAccess(x.token).catch((err) =>
        logger.error("[public.folders.varias] contar acceso falló", { error: String(err) }),
      );
    }
    return res;
  } catch (e) {
    logger.error("[public.folders.varias] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
