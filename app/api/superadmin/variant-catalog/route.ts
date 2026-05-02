import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { VariantCatalogDb } from "@/lib/db/variant-catalog.db";
import { logger } from "@/lib/logger";

const TemplateSchema = z
  .object({
    category: z.string().min(1).max(60),
    name: z.string().min(1).max(120),
    description: z.string().max(500).nullable().optional(),
    required: z.boolean().optional(),
    minSelect: z.number().int().min(0).max(20).optional(),
    maxSelect: z.number().int().min(1).max(20).optional(),
    position: z.number().int().min(0).optional(),
    isPublished: z.boolean().optional(),
  })
  .refine(
    (d) => (d.minSelect ?? 0) <= (d.maxSelect ?? 1),
    {
      message: "minSelect no puede ser mayor que maxSelect",
      path: ["minSelect"],
    },
  );

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const url = req.nextUrl;
  const category = url.searchParams.get("category") ?? undefined;
  const publishedOnly = url.searchParams.get("publishedOnly") === "1";

  try {
    const templates = await VariantCatalogDb.listTemplates({ category, publishedOnly });
    return NextResponse.json({ templates });
  } catch (error) {
    logger.error("variant-catalog.list.failed", { error: String(error) });
    return NextResponse.json({ error: "No se pudo cargar el catálogo" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch((err) => {
    logger.warn("[superadmin/variant-catalog] body parse fail", { error: String(err) });
    return null;
  });
  const parsed = TemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const template = await VariantCatalogDb.createTemplate(parsed.data);
    logger.info("variant-catalog.create", {
      actor: auth.username,
      templateId: template.id,
      category: template.category,
      name: template.name,
    });
    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    logger.error("variant-catalog.create.failed", { error: String(error) });
    return NextResponse.json({ error: "No se pudo crear" }, { status: 500 });
  }
}
