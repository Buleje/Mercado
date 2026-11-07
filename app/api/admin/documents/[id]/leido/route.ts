import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { DocumentsDB } from "@/lib/db/documents.db";

type Ctx = { params: Promise<{ id: string }> };

/** Hasta acá viaja el texto: sirve para reconocer el papel, no para leerlo entero. */
const TOPE_TEXTO = 2000;
const TOPE_DATOS = 12;
const TOPE_DATO = 200;

/** Una fila de «leyó el texto» por persona y papel en esta ventana (por instancia). */
const VENTANA_RASTRO_MS = 10 * 60 * 1000;
const ultimoRastro = new Map<string, number>();

/** ¿Toca anotar este acceso? Recuerda el último por tenant+persona+papel. */
function tocaAnotar(clave: string, ahora: number): boolean {
  const previo = ultimoRastro.get(clave);
  if (previo !== undefined && ahora - previo < VENTANA_RASTRO_MS) return false;
  if (ultimoRastro.size >= 1000) {
    for (const [k, t] of ultimoRastro) if (ahora - t >= VENTANA_RASTRO_MS) ultimoRastro.delete(k);
    if (ultimoRastro.size >= 1000) ultimoRastro.clear();
  }
  ultimoRastro.set(clave, ahora);
  return true;
}

/**
 * GET /api/admin/documents/[id]/leido — lo que el sistema leyó de un papel:
 * el comienzo de su texto (OCR o capa de texto) y los datos clave que sacó la
 * IA («Titular: …», «Fecha de caducidad: …»).
 *
 * Lo pide el detalle del papel en Esenciales al ELEGIRLO, que no es abrirlo:
 * por eso no anota una «vista» (el GET del documento sí, y contaría como
 * apertura en «Lo que más abres»). Pero leer el texto de un DNI o un contrato
 * es un acceso a datos personales (Ley 29733): queda como `read_text` («leyó
 * el texto»), que el historial muestra y `vistasPorDocumento` no cuenta. Uno
 * por persona y papel cada `VENTANA_RASTRO_MS`: ir y volver entre papeles no
 * llena el historial. La lista del drive no trae el texto a propósito (pesa):
 * esto lo trae de a uno, cuando se mira.
 * Mismo permiso que abrirlo: `getById` con el rol (candado por carpeta).
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const rl = await applyRateLimit(req, "DRIVE_READ", "documents:leido");
    if (rl) return rl;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;
    const doc = await DocumentsDB.getById(auth.tenantId, id, auth.role);
    if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const texto = doc.ocrText?.trim() ?? "";
    const crudos = doc.ocrMetadata?.keyFacts;
    const datos = Array.isArray(crudos)
      ? crudos
          .filter((d): d is string => typeof d === "string" && d.trim().length > 0)
          .slice(0, TOPE_DATOS)
          .map((d) => d.trim().slice(0, TOPE_DATO))
      : [];

    // Sólo si hubo algo que leer: «leyó el texto» de un papel sin texto sería falso.
    if ((texto || datos.length > 0) && tocaAnotar(`${auth.tenantId}:${auth.username}:${doc.id}`, Date.now())) {
      DocumentsDB.log(auth.tenantId, {
        documentId: doc.id,
        actorId: auth.username,
        action: "read_text",
        metadata: { caracteres: Math.min(texto.length, TOPE_TEXTO), datos: datos.length },
      }).catch((err) => logger.error("[documents.leido] el rastro de lectura falló", { error: String(err) }));
    }

    return NextResponse.json(
      { texto: texto ? texto.slice(0, TOPE_TEXTO) : null, largo: texto.length, datos },
      // Siempre no-store: el candado puede venir de una carpeta de la cadena, no del papel.
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    logger.error("[documents.leido] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
