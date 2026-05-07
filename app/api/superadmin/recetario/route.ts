import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

const CreateRecetaSchema = z.object({
  tenantId: z.string().min(1),
  nombre: z.string().min(1).max(200),
  descripcion: z.string().max(2000).optional(),
  emoji: z.string().max(10).optional(),
  tiempoMinutos: z.number().int().positive().optional(),
  porciones: z.number().int().positive().optional(),
  dificultad: z.enum(["Facil", "Media", "Dificil"]).optional(),
  categoria: z.string().max(100).optional(),
  pasosJson: z.string().optional(),
  imageUrl: z.string().url().max(2000).optional().or(z.literal("")),
  activa: z.boolean().optional(),
});

// GET /api/superadmin/recetario — list all recipes across all tenants
export async function GET(req: NextRequest) {
  try {
    const session = await requirePlatform(req);
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const sp = req.nextUrl.searchParams;
    const search = sp.get("search") ?? undefined;

    const recetas = await prisma.receta.findMany({
      where: {
        ...(search
          ? { nombre: { contains: search, mode: "insensitive" as const } }
          : {}),
      },
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        ingredientes: {
          include: {
            producto: {
              select: { id: true, name: true, price: true, image: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const result = recetas.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      tenantName: r.tenant.name,
      tenantSlug: r.tenant.slug,
      nombre: r.nombre,
      descripcion: r.descripcion,
      emoji: r.emoji,
      tiempoMinutos: r.tiempoMinutos,
      porciones: r.porciones,
      dificultad: r.dificultad,
      categoria: r.categoria,
      pasosJson: r.pasosJson,
      imageUrl: r.imageUrl,
      costoTotal: Number(r.costoTotal),
      activa: r.activa,
      ingredientesCount: r.ingredientes.length,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));

    return NextResponse.json({ recetas: result });
  } catch (e) {
    logger.error("[superadmin/recetario] GET error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// POST /api/superadmin/recetario — create a new recipe
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "GENEROUS", "superadmin-recetario"); if (_rl) return _rl;
  try {
    const session = await requirePlatform(req);
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const raw = await req.json().catch((err) => { logger.error("[superadmin/recetario] parse JSON body failed", { error: String(err) }); return null; });
    if (!raw) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    const parsed = CreateRecetaSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Datos invalidos",
          issues: parsed.error.issues.map((i) => i.message),
        },
        { status: 400 },
      );
    }

    const receta = await prisma.receta.create({
      data: {
        tenantId: parsed.data.tenantId,
        nombre: parsed.data.nombre,
        descripcion: parsed.data.descripcion ?? null,
        emoji: parsed.data.emoji ?? null,
        tiempoMinutos: parsed.data.tiempoMinutos ?? null,
        porciones: parsed.data.porciones ?? null,
        dificultad: parsed.data.dificultad ?? null,
        categoria: parsed.data.categoria ?? null,
        pasosJson: parsed.data.pasosJson ?? null,
        imageUrl: parsed.data.imageUrl || null,
        activa: parsed.data.activa ?? true,
      },
    });

    return NextResponse.json(
      {
        id: receta.id,
        nombre: receta.nombre,
        message: "Receta creada",
      },
      { status: 201 },
    );
  } catch (e) {
    logger.error("[superadmin/recetario] POST error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
