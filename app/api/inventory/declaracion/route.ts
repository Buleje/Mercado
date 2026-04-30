/* eslint-disable no-restricted-properties -- deuda existente: Product directo. Tenant-scoped via auth.tenantId. */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const sp = req.nextUrl.searchParams;
    const fechaStr = sp.get("fecha");
    const fecha = fechaStr ? new Date(fechaStr) : new Date();

    // Get all active products for the tenant
    const productos = await prisma.product.findMany({
      where: {
        tenantId: auth.tenantId,
        active: true,
        deletedAt: null,
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });

    // Group by category
    const porCategoria: Record<string, {
      categoria: string;
      productos: {
        id: number;
        sku: string;
        nombre: string;
        stock: number;
        costoPrecio: number;
        precioVenta: number;
        valorCosto: number;
        valorPrecio: number;
      }[];
      subtotalUnidades: number;
      subtotalCosto: number;
      subtotalPrecio: number;
    }> = {};

    let totalProductos = 0;
    let totalUnidades = 0;
    let totalValorCosto = 0;
    let totalValorPrecio = 0;

    for (const p of productos) {
      const stock = p.stock ?? 0;
      // TD-018: price y costPrice ahora son Decimal → convertir
      const priceNum = toNumOrZero(p.price);
      const costoRaw = toNumOrZero(p.costPrice);
      const costo = costoRaw || priceNum * 0.7;
      const valorCosto = stock * costo;
      const valorPrecio = stock * priceNum;

      if (!porCategoria[p.category]) {
        porCategoria[p.category] = {
          categoria: p.category,
          productos: [],
          subtotalUnidades: 0,
          subtotalCosto: 0,
          subtotalPrecio: 0,
        };
      }

      porCategoria[p.category].productos.push({
        id: p.id,
        sku: p.barcode ?? `SKU-${p.id}`,
        nombre: p.name,
        stock,
        costoPrecio: costo,
        precioVenta: priceNum,
        valorCosto,
        valorPrecio,
      });

      porCategoria[p.category].subtotalUnidades += stock;
      porCategoria[p.category].subtotalCosto += valorCosto;
      porCategoria[p.category].subtotalPrecio += valorPrecio;

      totalProductos++;
      totalUnidades += stock;
      totalValorCosto += valorCosto;
      totalValorPrecio += valorPrecio;
    }

    // Transformar a formato que el frontend espera: Record<string, ProductItem[]>
    const porCategoriaPlano: Record<string, { id: number; sku: string; name: string; stock: number; costPrice: number; price: number; categoryName: string }[]> = {};
    for (const [cat, val] of Object.entries(porCategoria)) {
      porCategoriaPlano[cat] = (val as any).productos.map((p: any) => ({
        id: String(p.id),
        sku: p.sku,
        name: p.nombre,
        stock: p.stock,
        costPrice: p.costoPrecio,
        price: p.precioVenta,
        categoryName: cat,
      }));
    }

    return NextResponse.json({
      fecha: fecha.toISOString(),
      categorias: Object.values(porCategoria),
      porCategoria: porCategoriaPlano,
      totalProductos,
      totalUnidades,
      valorCosto: Math.round(totalValorCosto * 100) / 100,
      valorPrecio: Math.round(totalValorPrecio * 100) / 100,
      resumen: {
        totalProductos,
        totalUnidades,
        totalValorCosto: Math.round(totalValorCosto * 100) / 100,
        totalValorPrecio: Math.round(totalValorPrecio * 100) / 100,
      },
    });
  } catch (e) {
    logger.error("[inventory/declaracion] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
