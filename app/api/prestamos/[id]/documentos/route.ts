import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PrestamosDB } from "@/lib/db/prestamos.db";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";

const AddDocSchema = z.object({
  nombre: z.string().min(1).max(200),
  tipo: z.string().max(50).optional(),
  url: z.string().url().max(2000),
});

// GET /api/prestamos/[id]/documentos — list documents
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const existing = await PrestamosDB.getById(id);
    if (!existing || existing.tenantId !== auth.tenantId) {
      return NextResponse.json({ error: "Préstamo no encontrado" }, { status: 404 });
    }

    const docs = await PrestamosDB.listDocumentos(id);
    return NextResponse.json(docs);
  } catch (e) {
    logger.error("[prestamos/id/documentos] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// POST /api/prestamos/[id]/documentos — add document link
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const raw = await req.json();
    const parsed = AddDocSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }

    const existing = await PrestamosDB.getById(id);
    if (!existing || existing.tenantId !== auth.tenantId) {
      return NextResponse.json({ error: "Préstamo no encontrado" }, { status: 404 });
    }

    const doc = await PrestamosDB.addDocumento(id, {
      nombre: parsed.data.nombre,
      tipo: parsed.data.tipo ?? "otro",
      url: parsed.data.url,
    });

    logActivity(
      "Documento", "prestamo",
      `Documento "${parsed.data.nombre}" adjuntado a préstamo ${id.slice(-6)}`,
      id, auth.username,
    ).catch(() => {});

    return NextResponse.json(doc, { status: 201 });
  } catch (e) {
    logger.error("[prestamos/id/documentos] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
