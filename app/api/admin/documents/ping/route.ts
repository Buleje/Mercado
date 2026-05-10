import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { DocumentsDB } from "@/lib/db/documents.db";

/**
 * Health-check del módulo Documentos v2.
 * Verifica que las tablas Prisma estén accesibles y devuelve métricas básicas.
 * Útil para monitoreo y diagnóstico rápido cuando el módulo no responde.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const [docs, folders] = await Promise.all([
      DocumentsDB.list(auth.tenantId),
      DocumentsDB.listFolders(auth.tenantId),
    ]);

    return NextResponse.json({
      ok: true,
      tenantId: auth.tenantId,
      counts: {
        documents: docs.length,
        folders: folders.length,
        favorites: docs.filter((d) => d.favorite).length,
      },
      totalSize: docs.reduce((s, d) => s + d.size, 0),
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
