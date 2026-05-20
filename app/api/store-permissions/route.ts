import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { StorePermissionsDB } from "@/lib/db/store-permissions.db";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

// Lista canónica de permisos (sincronizada con UI PERMISSION_LABELS)
const VALID_PERMISSIONS = [
  "view_orders",
  "edit_status",
  "view_prices",
  "manage_products",
  "view_analytics",
] as const;

const PermissionPostSchema = z.object({
  storeId: z.string().min(1, "storeId requerido"),
  userId: z.string().min(1, "userId requerido"),
  userType: z.string().min(1, "userType requerido").max(50),
  permissions: z
    .array(z.enum(VALID_PERMISSIONS))
    .min(1, "Se requiere al menos un permiso"),
});

type RowFromDb = {
  id: string;
  storeId: string;
  userId: string;
  userType: string;
  permissions: string;
  grantedBy: string;
  createdAt: Date;
  store: { id: string; name: string | null; tenantId: string } | null;
};

interface StorePermissionDto {
  id: string;
  storeId: string;
  storeName: string;
  userId: string;
  userType: string;
  userName: string;
  userEmail: string;
  permissions: string[];
  grantedBy: string;
  createdAt: Date;
}

async function decorate(rows: RowFromDb[]): Promise<StorePermissionDto[]> {
  if (rows.length === 0) return [];

  // Resolver nombres de usuarios: AdminUser tiene username + email opcional.
  // userType típico = "admin" | "cajero" | "delivery". userId puede ser admin
  // user id (cuid) o el id de un partner. Hacemos best-effort.
  const adminIds = rows
    .filter((r) => ["admin", "cajero"].includes(r.userType))
    .map((r) => r.userId);

  const partnerIds = rows
    .filter((r) => r.userType === "delivery")
    .map((r) => r.userId);

  // Audit project-wide 2026-05-19: migrado a StorePermissionsDB.resolveActors.
  const { admins, partners } = await StorePermissionsDB.resolveActors(adminIds, partnerIds);

  const adminMap = new Map(admins.map((a) => [a.id, a]));
  const partnerMap = new Map(partners.map((p) => [p.id, p]));

  return rows.map((r) => {
    let userName = r.userId;
    let userEmail = "";
    const a = adminMap.get(r.userId);
    if (a) {
      userName = a.name ?? a.username;
      userEmail = a.username; // AdminUser.username es la identidad pública (no hay email field)
    } else {
      const p = partnerMap.get(r.userId);
      if (p) {
        userName = p.name;
        userEmail = p.phone;
      }
    }
    return {
      id: r.id,
      storeId: r.storeId,
      storeName: r.store?.name ?? "—",
      userId: r.userId,
      userType: r.userType,
      userName,
      userEmail,
      permissions: r.permissions ? r.permissions.split(",").filter(Boolean) : [],
      grantedBy: r.grantedBy,
      createdAt: r.createdAt,
    };
  });
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get("storeId");

    // SECURITY: scope tenantId + storeId guard dentro de DB class.
    // Audit project-wide 2026-05-19: migrado a StorePermissionsDB.listForTenant.
    const rows = await StorePermissionsDB.listForTenant(auth.tenantId, {
      storeId: storeId ?? undefined,
    });
    const decorated = await decorate(rows as RowFromDb[]);
    return NextResponse.json(decorated);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error("[store-permissions] GET failed", { error: detail, tenantId: auth.tenantId });
    return NextResponse.json(
      {
        error: "Error del servidor",
        ...(process.env.NODE_ENV !== "production" ? { detail } : {}),
      },
      { status: 503 },
    );
  }
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "store-permissions"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const raw = await req.json();
    const parsed = PermissionPostSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }

    const { storeId, userId, userType, permissions } = parsed.data;

    // SECURITY: validar que la store es del tenant del admin
    // Audit project-wide 2026-05-19: migrado a StorePermissionsDB.
    const owned = await StorePermissionsDB.storeOwnedBy(auth.tenantId, storeId);
    if (!owned) {
      return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
    }

    const result = await StorePermissionsDB.upsert({
      storeId,
      userId,
      userType,
      permissions,
      grantedBy: auth.username,
    });

    logActivity(
      "Upsert",
      "storePermission",
      `Permisos actualizados para usuario ${userId} en tienda ${storeId}: ${permissions.join(", ")}`,
      result.id,
      auth.username
    ).catch((err) => logger.error("[store-permissions] activity log failed", { error: String(err) }));

    const [decorated] = await decorate([result as RowFromDb]);
    return NextResponse.json(decorated, { status: 201 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error("[store-permissions] POST failed", { error: detail, tenantId: auth.tenantId });
    return NextResponse.json(
      {
        error: "Error del servidor",
        ...(process.env.NODE_ENV !== "production" ? { detail } : {}),
      },
      { status: 503 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "store-permissions"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "id requerido como parámetro de consulta" },
        { status: 400 }
      );
    }

    // SECURITY 2026-05-05: scope tenant via Store nested.
    // Audit project-wide 2026-05-19: migrado a StorePermissionsDB.deleteForTenant.
    const existing = await StorePermissionsDB.deleteForTenant(auth.tenantId, id);
    if (!existing) {
      return NextResponse.json({ error: "Permiso no encontrado" }, { status: 404 });
    }

    logActivity(
      "Revocar",
      "storePermission",
      `Permiso revocado: usuario ${existing.userId} en tienda ${existing.storeId}`,
      id,
      auth.username
    ).catch((err) => logger.error("[store-permissions] activity log failed", { error: String(err) }));

    return NextResponse.json({ deleted: true });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error("[store-permissions] DELETE failed", { error: detail });
    return NextResponse.json(
      {
        error: "Error del servidor",
        ...(process.env.NODE_ENV !== "production" ? { detail } : {}),
      },
      { status: 503 },
    );
  }
}
