import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const sp = req.nextUrl.searchParams;
    const tipo = sp.get("tipo") ?? undefined;
    const search = sp.get("search") ?? undefined;
    const from = sp.get("from") ?? undefined;
    const to = sp.get("to") ?? undefined;

    const dateFilter: Record<string, Date> = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to + "T23:59:59");

    const hasDateFilter = Object.keys(dateFilter).length > 0;

    const results: Array<{
      id: string;
      tipo: string;
      numero: string;
      cliente: string;
      ruc?: string;
      total: number;
      fecha: string;
      estado: string;
      fuente: string;
    }> = [];

    // 1. Ventas con comprobante (boleta, factura, cotizacion, proforma)
    if (!tipo || ["boleta", "factura", "cotizacion", "proforma"].includes(tipo)) {
      const ventas = await prisma.sale.findMany({
        where: {
          tenantId: auth.tenantId,
          comprobanteTipo: tipo ? tipo : { not: "ticket" },
          ...(hasDateFilter ? { createdAt: dateFilter } : {}),
          ...(search
            ? {
                OR: [
                  { comprobanteNumero: { contains: search, mode: "insensitive" as const } },
                  { customerPhone: { contains: search, mode: "insensitive" as const } },
                ],
              }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          comprobanteTipo: true,
          comprobanteNumero: true,
          comprobanteRuc: true,
          customerPhone: true,
          total: true,
          createdAt: true,
        },
      });

      for (const v of ventas) {
        results.push({
          id: v.id,
          tipo: v.comprobanteTipo || "ticket",
          numero: v.comprobanteNumero || v.id.substring(0, 8),
          cliente: v.customerPhone || "Sin cliente",
          ruc: v.comprobanteRuc ?? undefined,
          // TD-018: v.total es Decimal
          total: toNumOrZero(v.total),
          fecha: v.createdAt.toISOString(),
          estado: "emitido",
          fuente: "venta",
        });
      }
    }

    // 2. Cotizaciones (del módulo de cotizaciones)
    if (!tipo || tipo === "cotizacion") {
      try {
        const cotizaciones = await prisma.cotizacion.findMany({
          where: {
            tenantId: auth.tenantId,
            ...(hasDateFilter ? { createdAt: dateFilter } : {}),
            ...(search
              ? {
                  OR: [
                    { numero: { contains: search, mode: "insensitive" as const } },
                    { clienteNombre: { contains: search, mode: "insensitive" as const } },
                  ],
                }
              : {}),
          },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            numero: true,
            clienteNombre: true,
            total: true,
            status: true,
            createdAt: true,
          },
        });
        for (const c of cotizaciones) {
          results.push({
            id: c.id,
            tipo: "cotizacion",
            numero: c.numero,
            cliente: c.clienteNombre,
            total: Number(c.total),
            fecha: c.createdAt.toISOString(),
            estado: c.status.toLowerCase(),
            fuente: "cotizacion",
          });
        }
      } catch {
        // Model might not exist yet
      }
    }

    // 3. Guías de Remisión
    if (!tipo || tipo === "grr") {
      try {
        const guias = await prisma.guiaRemision.findMany({
          where: {
            tenantId: auth.tenantId,
            ...(hasDateFilter ? { createdAt: dateFilter } : {}),
            ...(search
              ? {
                  OR: [
                    { numero: { contains: search, mode: "insensitive" as const } },
                    { destinatarioNombre: { contains: search, mode: "insensitive" as const } },
                  ],
                }
              : {}),
          },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            numero: true,
            destinatarioNombre: true,
            status: true,
            createdAt: true,
          },
        });
        for (const g of guias) {
          results.push({
            id: g.id,
            tipo: "grr",
            numero: g.numero,
            cliente: g.destinatarioNombre,
            total: 0,
            fecha: g.createdAt.toISOString(),
            estado: g.status.toLowerCase(),
            fuente: "guia",
          });
        }
      } catch {
        // Model might not exist yet
      }
    }

    // 4. Notas de Crédito
    if (!tipo || tipo === "nc") {
      try {
        const ncs = await prisma.notaCredito.findMany({
          where: {
            tenantId: auth.tenantId,
            ...(hasDateFilter ? { createdAt: dateFilter } : {}),
            ...(search
              ? { numero: { contains: search, mode: "insensitive" as const } }
              : {}),
          },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            numero: true,
            total: true,
            status: true,
            createdAt: true,
          },
        });
        for (const nc of ncs) {
          results.push({
            id: nc.id,
            tipo: "nc",
            numero: nc.numero,
            cliente: "-",
            total: Number(nc.total),
            fecha: nc.createdAt.toISOString(),
            estado: nc.status.toLowerCase(),
            fuente: "nc",
          });
        }
      } catch {
        // Model might not exist yet
      }
    }

    // Ordenar por fecha desc
    results.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

    // KPIs del mes
    const mesActual = new Date();
    mesActual.setDate(1);
    mesActual.setHours(0, 0, 0, 0);

    const boletasMes = results.filter(
      (r) => r.tipo === "boleta" && new Date(r.fecha) >= mesActual
    ).length;
    const facturasMes = results.filter(
      (r) => r.tipo === "factura" && new Date(r.fecha) >= mesActual
    ).length;
    const totalFacturado = results
      .filter(
        (r) =>
          ["boleta", "factura"].includes(r.tipo) &&
          new Date(r.fecha) >= mesActual
      )
      .reduce((s, r) => s + r.total, 0);
    const hoy = new Date().toISOString().split("T")[0];
    const docsHoy = results.filter((r) => r.fecha.startsWith(hoy)).length;

    return NextResponse.json({
      documentos: results,
      kpis: { boletasMes, facturasMes, totalFacturado, docsHoy },
    });
  } catch (e) {
    console.error("[documentos-emitidos] GET error:", e);
    return NextResponse.json({
      documentos: [],
      kpis: { boletasMes: 0, facturasMes: 0, totalFacturado: 0, docsHoy: 0 },
    });
  }
}
