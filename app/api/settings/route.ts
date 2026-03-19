export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from "next/server";
import { SettingsDB, type DbSettings } from "@/lib/jsondb";
import { logActivity } from "@/lib/activity-logger";
import { requireAdmin } from "@/lib/require-admin";
import { hash } from "bcryptjs";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const settings = await SettingsDB.get();
    // Never expose credentials or security toggles to public callers
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { adminPassword: _pw, adminBypassLogin: _bypass, ...publicSettings } = settings as DbSettings & { adminPassword?: string; adminBypassLogin?: boolean };
    return NextResponse.json(publicSettings, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (e) {
    logger.error("[settings] GET error", { err: e instanceof Error ? e.message : String(e) });
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
      // Hash the admin password with bcrypt before persisting (never store plaintext)
      ...(body.adminPassword !== undefined && body.adminPassword !== "" && {
        adminPassword: await hash(body.adminPassword, 12),
      }),
      ...(body.maintenanceMode !== undefined && { maintenanceMode: body.maintenanceMode }),
      ...(body.maintenanceMessage !== undefined && { maintenanceMessage: body.maintenanceMessage }),
      // adminBypassLogin is permanently disabled — this toggle must never be re-enabled via API
      ...(body.homepageContent !== undefined && { homepageContent: body.homepageContent }),
      ...(body.comboTemplates !== undefined && { comboTemplates: body.comboTemplates }),
    };
    const changed = Object.keys(body).filter(k => k !== "adminPassword").join(", ");
    const requestId = req.headers.get("x-request-id") ?? undefined;
    logActivity("Editar", "configuracion", `Configuración actualizada: ${changed || "general"}`, undefined, "admin", requestId).catch(() => {});
    return NextResponse.json(await SettingsDB.set(updated));
  } catch (e) {
    logger.error("[settings] PUT error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
