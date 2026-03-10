export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from "next/server";
import { SettingsDB, type DbSettings } from "@/lib/jsondb";
import { logActivity } from "@/lib/activity-logger";
import { requireAdmin } from "@/lib/require-admin";

export async function GET() {
  try {
    return NextResponse.json(await SettingsDB.get());
  } catch (e) {
    console.error("[settings] GET error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json() as Partial<DbSettings>;
    if (body.mode && body.mode !== "whatsapp" && body.mode !== "checkout") {
      return NextResponse.json({ error: "mode must be 'whatsapp' or 'checkout'" }, { status: 400 });
    }
    const current = await SettingsDB.get();
    const updated: DbSettings = {
      ...current,
      ...(body.mode !== undefined && { mode: body.mode }),
      ...(body.businessName !== undefined && { businessName: body.businessName }),
      ...(body.businessPhone !== undefined && { businessPhone: body.businessPhone }),
      ...(body.businessAddress !== undefined && { businessAddress: body.businessAddress }),
      ...(body.logoUrl !== undefined && { logoUrl: body.logoUrl }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.hours !== undefined && { hours: body.hours }),
      ...(body.deliveryZone !== undefined && { deliveryZone: body.deliveryZone }),
      ...(body.businessLat !== undefined && { businessLat: body.businessLat }),
      ...(body.businessLon !== undefined && { businessLon: body.businessLon }),
      ...(body.yapeEnabled !== undefined && { yapeEnabled: body.yapeEnabled }),
      ...(body.yapeImage !== undefined && { yapeImage: body.yapeImage }),
      ...(body.yapeName !== undefined && { yapeName: body.yapeName }),
      ...(body.yapePhone !== undefined && { yapePhone: body.yapePhone }),
      ...(body.cashEnabled !== undefined && { cashEnabled: body.cashEnabled }),
      ...(body.navLinks !== undefined && { navLinks: body.navLinks }),
      ...(body.adminPassword !== undefined && { adminPassword: body.adminPassword }),
      ...(body.maintenanceMode !== undefined && { maintenanceMode: body.maintenanceMode }),
      ...(body.maintenanceMessage !== undefined && { maintenanceMessage: body.maintenanceMessage }),
      ...(body.adminBypassLogin !== undefined && { adminBypassLogin: body.adminBypassLogin }),
    };
    const changed = Object.keys(body).filter(k => k !== "adminPassword").join(", ");
    logActivity("Editar", "configuracion", `Configuración actualizada: ${changed || "general"}` ).catch(() => {});
    return NextResponse.json(await SettingsDB.set(updated));
  } catch (e) {
    console.error("[settings] PUT error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
