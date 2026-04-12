import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { catalogPeru, CATALOG_CATEGORIES } from "@/data/catalog-peru";

// ── Validación con safeParse (nunca .parse()) ───────────────────────────────

const ImportCatalogSchema = z.object({
  categories: z
    .array(z.string().min(1))
    .min(1, "Debe seleccionar al menos una categoría"),
});

/**
 * POST /api/onboarding/import-catalog
 *
 * Importa productos del catálogo peruano pre-cargado.
 * Filtra por categorías seleccionadas y crea en batch.
 * Requiere rol admin. tenantId como primer parámetro de aislamiento.
 */
export async function POST(req: NextRequest) {
  // ── Auth: solo admin puede importar catálogo ────────────────────────────
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const tenantId = auth.tenantId;

  // ── Parsear body con safeParse ──────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Cuerpo de solicitud inválido" },
      { status: 400 },
    );
  }

  const parsed = ImportCatalogSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Datos inválidos",
        issues: parsed.error.flatten().fieldErrors,
        availableCategories: [...CATALOG_CATEGORIES],
      },
      { status: 400 },
    );
  }

  const { categories } = parsed.data;

  // ── Validar que las categorías solicitadas existan en el catálogo ───────
  const validCategories = new Set<string>(CATALOG_CATEGORIES as readonly string[]);
  const invalidCategories = categories.filter((c) => !validCategories.has(c));
  if (invalidCategories.length > 0) {
    return NextResponse.json(
      {
        error: `Categorías no válidas: ${invalidCategories.join(", ")}`,
        availableCategories: [...CATALOG_CATEGORIES],
      },
      { status: 400 },
    );
  }

  // ── Filtrar productos del catálogo por categorías seleccionadas ─────────
  const selectedCategories = new Set(categories);
  const productsToImport = catalogPeru.filter((p) =>
    selectedCategories.has(p.category),
  );

  if (productsToImport.length === 0) {
    return NextResponse.json(
      { error: "No se encontraron productos para las categorías seleccionadas" },
      { status: 400 },
    );
  }

  // ── Evitar duplicados: obtener nombres existentes del tenant ────────────
  const existingProducts = await prisma.product.findMany({
    where: { tenantId, deletedAt: null },
    select: { name: true },
  });
  const existingNames = new Set(
    existingProducts.map((p) => p.name.toLowerCase()),
  );

  const newProducts = productsToImport.filter(
    (p) => !existingNames.has(p.name.toLowerCase()),
  );

  if (newProducts.length === 0) {
    return NextResponse.json({
      message: "Todos los productos ya existen en tu tienda",
      imported: 0,
      skipped: productsToImport.length,
    });
  }

  // ── Crear productos en batch ────────────────────────────────────────────
  try {
    const result = await prisma.product.createMany({
      data: newProducts.map((p) => ({
        tenantId,
        name: p.name,
        category: p.category,
        price: p.suggestedPrice,
        unit: p.unit,
        image: "",
        active: true,
        stock: 0,
        ...(p.barcode ? { barcode: p.barcode } : {}),
      })),
      skipDuplicates: true,
    });

    return NextResponse.json(
      {
        message: `Se importaron ${result.count} productos exitosamente`,
        imported: result.count,
        skipped: productsToImport.length - newProducts.length,
        categories: categories,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[import-catalog] Error al importar:", err);
    return NextResponse.json(
      { error: "Error al importar productos. Intenta de nuevo." },
      { status: 500 },
    );
  }
}

/**
 * GET /api/onboarding/import-catalog
 *
 * Retorna las categorías disponibles y el conteo de productos por categoría.
 * Útil para la UI de selección de categorías.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  // Contar productos por categoría del catálogo
  const categoryCounts: Record<string, number> = {};
  for (const cat of CATALOG_CATEGORIES) {
    categoryCounts[cat] = catalogPeru.filter((p) => p.category === cat).length;
  }

  // Contar cuántos ya tiene el tenant para mostrar en la UI
  const tenantId = auth.tenantId;
  const existingProducts = await prisma.product.findMany({
    where: { tenantId, deletedAt: null },
    select: { name: true },
  });
  const existingNames = new Set(
    existingProducts.map((p) => p.name.toLowerCase()),
  );

  const alreadyImported: Record<string, number> = {};
  for (const cat of CATALOG_CATEGORIES) {
    alreadyImported[cat] = catalogPeru.filter(
      (p) =>
        p.category === cat && existingNames.has(p.name.toLowerCase()),
    ).length;
  }

  return NextResponse.json({
    totalProducts: catalogPeru.length,
    categories: (CATALOG_CATEGORIES as readonly string[]).map((cat) => ({
      name: cat,
      available: categoryCounts[cat] ?? 0,
      alreadyImported: alreadyImported[cat] ?? 0,
    })),
  });
}
