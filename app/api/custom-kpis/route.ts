import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";

export type KpiTrendPoint = { date: string; value: number };
export type CustomKpi = {
  id: string; name: string; description: string; formula: string;
  currentValue: number; target: number; unit: string;
  trend: "up" | "down" | "flat"; changePercent: number;
  period: string; category: string; color: string;
  history: KpiTrendPoint[];
};

const KpiSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(300).default(""),
  formula: z.string().max(200).default(""),
  target: z.number().default(0),
  unit: z.string().max(20).default("S/"),
  category: z.string().max(50).default("Ventas"),
  color: z.string().max(50).default("bg-[var(--data-success-500)]"),
});

const SEED_KPIS: CustomKpi[] = [
  {
    id: "kpi-ticket", name: "Ticket Promedio", description: "Valor promedio por venta",
    formula: "total_ventas / num_transacciones", currentValue: 54.20, target: 60,
    unit: "S/", trend: "up", changePercent: 6.3, period: "Hoy",
    category: "Ventas", color: "bg-[var(--data-success-500)]",
    history: Array.from({ length: 7 }, (_, i) => ({ date: `día ${i + 1}`, value: 48 + Math.random() * 12 })),
  },
  {
    id: "kpi-conversion", name: "Tasa de Conversión", description: "Visitantes que compran",
    formula: "ventas / visitas * 100", currentValue: 68, target: 75,
    unit: "%", trend: "up", changePercent: 4.1, period: "Esta semana",
    category: "Ventas", color: "bg-[var(--data-success-500)]",
    history: Array.from({ length: 7 }, (_, i) => ({ date: `día ${i + 1}`, value: 62 + Math.random() * 10 })),
  },
  {
    id: "kpi-rotacion", name: "Rotación de Inventario", description: "Veces que el stock se renueva al mes",
    formula: "costo_ventas / inventario_promedio", currentValue: 4.2, target: 5,
    unit: "veces", trend: "flat", changePercent: 0.5, period: "Este mes",
    category: "Inventario", color: "bg-[var(--data-warning-500)]",
    history: Array.from({ length: 7 }, (_, i) => ({ date: `sem ${i + 1}`, value: 3.8 + Math.random() * 0.8 })),
  },
  {
    id: "kpi-satisfaccion", name: "Satisfacción Cliente", description: "Puntuación promedio de reseñas",
    formula: "suma_ratings / num_reviews", currentValue: 4.6, target: 4.8,
    unit: "pts", trend: "up", changePercent: 2.2, period: "Último mes",
    category: "Clientes", color: "bg-violet-500",
    history: Array.from({ length: 7 }, (_, i) => ({ date: `sem ${i + 1}`, value: 4.3 + Math.random() * 0.5 })),
  },
];

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const rows = await prisma.customKpi.findMany({
      where: { tenantId: auth.tenantId },
      orderBy: { createdAt: "asc" },
    });
    if (rows.length === 0) throw new Error("empty");
    const kpis: CustomKpi[] = rows.map((r) => ({
      id: r.id, name: r.name, description: r.description ?? "",
      formula: r.formula ?? "", currentValue: r.currentValue ?? 0,
      target: r.target ?? 0, unit: r.unit ?? "S/",
      trend: (r.trend as CustomKpi["trend"]) ?? "flat",
      changePercent: r.changePercent ?? 0, period: r.period ?? "Hoy",
      category: r.category ?? "Ventas", color: r.color ?? "bg-[var(--data-success-500)]",
      history: (r.history as KpiTrendPoint[]) ?? [],
    }));
    return NextResponse.json({ kpis });
  } catch {
    return NextResponse.json({ kpis: SEED_KPIS, demo: true });
  }
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "custom-kpis"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const parsed = KpiSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const row = await prisma.customKpi.create({
      data: { ...parsed.data, tenantId: auth.tenantId, currentValue: 0, trend: "flat", changePercent: 0, period: "Hoy", history: [] },
    });
    return NextResponse.json({ id: row.id }, { status: 201 });
  } catch {
    return NextResponse.json({ id: `k${Date.now()}`, demo: true }, { status: 201 });
  }
}

export async function PUT(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "custom-kpis"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const { id, ...rest } = body;
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  const parsed = KpiSchema.partial().safeParse(rest);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    await prisma.customKpi.update({ where: { id, tenantId: auth.tenantId }, data: parsed.data });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true, demo: true });
  }
}

export async function DELETE(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "custom-kpis"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  try {
    await prisma.customKpi.delete({ where: { id, tenantId: auth.tenantId } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true, demo: true });
  }
}
