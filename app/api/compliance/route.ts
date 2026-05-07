import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";

export type ComplianceItem = {
  id: string; title: string; entity: string; category: "sunat" | "municipal" | "sanitario" | "seguridad";
  frequency: string; nextDue: string; status: "vigente" | "por-vencer" | "vencido" | "pendiente";
  lastFiled: string | null; description: string; documents: string[];
};

const PatchSchema = z.object({
  id: z.string(),
  status: z.enum(["vigente", "por-vencer", "vencido", "pendiente"]),
  nextDue: z.string().optional(),
  lastFiled: z.string().optional(),
});

const DEMO_ITEMS: ComplianceItem[] = [
  { id: "sunat-ruc", title: "Vigencia RUC", entity: "SUNAT", category: "sunat", frequency: "Anual", nextDue: "2026-12-31", status: "vigente", lastFiled: "2026-01-15", description: "Mantener el RUC activo y datos actualizados en SUNAT", documents: ["Ficha RUC"] },
  { id: "sunat-igv", title: "Declaración mensual IGV", entity: "SUNAT", category: "sunat", frequency: "Mensual", nextDue: "2026-04-15", status: "por-vencer", lastFiled: "2026-03-15", description: "Presentación PDT 621 o Formulario Virtual IGV/Renta", documents: ["PDT 621", "Libro de Compras", "Libro de Ventas"] },
  { id: "sunat-plame", title: "Declaración PLAME", entity: "SUNAT", category: "sunat", frequency: "Mensual", nextDue: "2026-04-20", status: "pendiente", lastFiled: "2026-03-20", description: "Planilla mensual de remuneraciones y retenciones", documents: ["PDT 601"] },
  { id: "municipal-licencia", title: "Licencia de Funcionamiento", entity: "Municipalidad de Yarinacocha", category: "municipal", frequency: "Anual", nextDue: "2026-06-30", status: "vigente", lastFiled: "2026-01-10", description: "Licencia municipal para operación del establecimiento comercial", documents: ["Resolución Municipal", "Recibo de pago"] },
  { id: "municipal-anuncio", title: "Autorización de Anuncio Publicitario", entity: "Municipalidad de Yarinacocha", category: "municipal", frequency: "Anual", nextDue: "2026-06-30", status: "vigente", lastFiled: "2026-01-10", description: "Autorización para letreros y publicidad exterior del local", documents: ["Autorización municipal"] },
  { id: "sanitario-carnet", title: "Carnet Sanitario del Personal", entity: "DIRESA Ucayali", category: "sanitario", frequency: "Anual", nextDue: "2026-03-28", status: "por-vencer", lastFiled: "2025-03-28", description: "Certificado de salud vigente para manipuladores de alimentos", documents: ["Carnet sanitario", "Análisis clínicos"] },
  { id: "sanitario-registro", title: "Registro Sanitario de Alimentos", entity: "DIGESA", category: "sanitario", frequency: "Quinquenal", nextDue: "2028-08-15", status: "vigente", lastFiled: "2023-08-15", description: "Registro sanitario de productos de elaboración propia", documents: ["Certificado DIGESA"] },
  { id: "defcivil-inspeccion", title: "Inspección Defensa Civil", entity: "INDECI / Municipalidad", category: "seguridad", frequency: "Anual", nextDue: "2025-12-31", status: "vencido", lastFiled: "2024-12-05", description: "Inspección técnica de seguridad en edificaciones (ITSE)", documents: ["Certificado ITSE", "Plan de evacuación"] },
  { id: "defcivil-extintores", title: "Recarga de Extintores", entity: "Empresa certificada", category: "seguridad", frequency: "Anual", nextDue: "2026-07-15", status: "vigente", lastFiled: "2025-07-15", description: "Mantenimiento y recarga de extintores contra incendios", documents: ["Certificado de recarga"] },
];

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const rows = await prisma.complianceItem.findMany({
      where: { tenantId: auth.tenantId },
      orderBy: { nextDue: "asc" },
    });
    if (rows.length === 0) throw new Error("empty");
    const items: ComplianceItem[] = rows.map((r) => ({
      id: r.id, title: r.title, entity: r.entity,
      category: r.category as ComplianceItem["category"],
      frequency: r.frequency, nextDue: r.nextDue.toISOString(),
      status: r.status as ComplianceItem["status"],
      lastFiled: r.lastFiled ? r.lastFiled.toISOString() : null,
      description: r.description, documents: (r.documents as string[]) ?? [],
    }));
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: DEMO_ITEMS, demo: true });
  }
}

export async function PATCH(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "compliance"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    await prisma.complianceItem.update({
      where: { id: parsed.data.id, tenantId: auth.tenantId },
      data: {
        status: parsed.data.status,
        ...(parsed.data.nextDue && { nextDue: new Date(parsed.data.nextDue) }),
        ...(parsed.data.lastFiled && { lastFiled: new Date(parsed.data.lastFiled) }),
      },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true, demo: true });
  }
}
