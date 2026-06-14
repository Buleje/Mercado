import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * Notas internas del superadmin sobre un tenant (CRM · bundle C). Solo plataforma.
 * GET  /api/superadmin/tenants/[slug]/notes
 * POST /api/superadmin/tenants/[slug]/notes  { body }
 *
 * Raw SQL (no `prisma.platformTenantNote`) para no depender de reiniciar el dev
 * server tras `prisma generate` — la tabla ya existe (migración aplicada).
 */

const createSchema = z.object({ body: z.string().min(1).max(4000) });

type NoteRow = { id: string; tenantId: string; body: string; author: string; createdAt: Date };

async function resolveTenantId(slug: string): Promise<string | null> {
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM "Tenant" WHERE slug = $1 LIMIT 1`,
    slug,
  );
  return rows[0]?.id ?? null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;
  const { slug } = await params;
  try {
    const tenantId = await resolveTenantId(slug);
    if (!tenantId) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    const notes = await prisma.$queryRawUnsafe<NoteRow[]>(
      `SELECT id, "tenantId", body, author, "createdAt" FROM "PlatformTenantNote"
       WHERE "tenantId" = $1 ORDER BY "createdAt" DESC LIMIT 100`,
      tenantId,
    );
    return NextResponse.json({ notes });
  } catch (e) {
    logger.error("[superadmin/notes] list error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;
  const { slug } = await params;
  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const tenantId = await resolveTenantId(slug);
    if (!tenantId) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    const id = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "PlatformTenantNote" (id, "tenantId", body, author, "createdAt")
       VALUES ($1, $2, $3, $4, NOW())`,
      id,
      tenantId,
      parsed.data.body.trim(),
      auth.username,
    );
    const rows = await prisma.$queryRawUnsafe<NoteRow[]>(
      `SELECT id, "tenantId", body, author, "createdAt" FROM "PlatformTenantNote" WHERE id = $1`,
      id,
    );
    return NextResponse.json({ note: rows[0] }, { status: 201 });
  } catch (e) {
    logger.error("[superadmin/notes] create error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
