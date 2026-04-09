import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { GuiasRemisionDB } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit-logger";

const GuiaItemSchema = z.object({
  descripcion: z.string().min(1).max(500),
  cantidad: z.number().positive(),
  unidad: z.string().max(20).optional().default("NIU"),
  productoId: z.string().optional(),
  pesoUnitario: z.number().nonnegative().optional(),
});

const CreateGuiaSchema = z.object({
  orderId: z.string().optional(),
  motivoTraslado: z.string().min(1).max(100),
  fechaTraslado: z.string().min(10),
  destinatarioNombre: z.string().min(1).max(200),
  destinatarioRuc: z.string().max(20).optional(),
  destinatarioDireccion: z.string().min(1).max(500),
  transportistaRuc: z.string().max(20).optional(),
  transportistaNombre: z.string().max(200).optional(),
  vehiculoPlaca: z.string().max(20).optional(),
  conductorNombre: z.string().max(200).optional(),
  conductorDni: z.string().max(8).optional(),
  bultos: z.number().int().nonnegative().optional(),
  documentoRef: z.string().max(200).optional(),
  puntoPartida: z.string().min(1).max(500),
  puntoLlegada: z.string().min(1).max(500),
  items: z.array(GuiaItemSchema).optional(),
  pesoBruto: z.number().nonnegative().optional(),
  notas: z.string().max(2000).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const sp = req.nextUrl.searchParams;
    const data = await GuiasRemisionDB.getAll(auth.tenantId, {
      status: sp.get("status") ?? undefined,
      orderId: sp.get("orderId") ?? undefined,
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
      transportistaRuc: sp.get("transportistaRuc") ?? undefined,
      puntoLlegada: sp.get("puntoLlegada") ?? undefined,
      vehiculoPlaca: sp.get("vehiculoPlaca") ?? undefined,
      search: sp.get("search") ?? undefined,
    });
    return NextResponse.json(data);
  } catch (e) {
    console.error("[guias-remision] GET error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const raw = await req.json();
  const parsed = CreateGuiaSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const data = parsed.data;

  try {
    // If orderId provided and no items, load items from the order
    let items = data.items ?? [];
    if (data.orderId && items.length === 0) {
      const orderItems = await prisma.orderItem.findMany({
        where: { orderId: data.orderId },
      });
      items = orderItems.map((oi) => ({
        descripcion: oi.name,
        cantidad: oi.quantity,
        unidad: oi.unit || "NIU",
        productoId: oi.productId ? String(oi.productId) : undefined,
      }));
    }

    if (items.length === 0) {
      return NextResponse.json(
        { error: "Se requiere al menos un item" },
        { status: 400 }
      );
    }

    const numero = await GuiasRemisionDB.siguienteNumero(auth.tenantId);

    // Calculate total weight if items have pesoUnitario
    const pesoTotal = items.reduce((sum, i) => {
      return sum + (i.pesoUnitario ? i.pesoUnitario * i.cantidad : 0);
    }, 0);

    const guia = await GuiasRemisionDB.create(auth.tenantId, {
      numero,
      orderId: data.orderId,
      motivoTraslado: data.motivoTraslado,
      fechaTraslado: new Date(data.fechaTraslado),
      destinatarioNombre: data.destinatarioNombre,
      destinatarioRuc: data.destinatarioRuc,
      destinatarioDireccion: data.destinatarioDireccion,
      transportistaRuc: data.transportistaRuc,
      transportistaNombre: data.transportistaNombre,
      vehiculoPlaca: data.vehiculoPlaca,
      conductorNombre: data.conductorNombre,
      conductorDni: data.conductorDni,
      bultos: data.bultos,
      documentoRef: data.documentoRef,
      puntoPartida: data.puntoPartida,
      puntoLlegada: data.puntoLlegada,
      pesoTotal: pesoTotal > 0 ? pesoTotal : undefined,
      pesoBruto: data.pesoBruto,
      notas: data.notas,
      createdBy: auth.username,
      items,
    });

    logAudit({
      req,
      action: "CREATE",
      entity: "Order",
      entityId: guia.id,
      detail: `Guía de remisión ${numero} creada para ${data.destinatarioNombre}`,
      user: auth.username,
      tenantId: auth.tenantId,
    });

    return NextResponse.json(guia, { status: 201 });
  } catch (e) {
    console.error("[guias-remision] POST error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
