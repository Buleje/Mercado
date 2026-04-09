import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/superadmin/notifications — Últimas actividades relevantes para el superadmin
 * Retorna las últimas entradas del activity log que son relevantes a nivel de plataforma
 */
export async function GET(req: NextRequest) {
  // Verificar sesión de plataforma
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const session = await getPlatformSession(token);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? "20"), 50);

  try {
    const notifications = await prisma.activityLog.findMany({
      where: {
        OR: [
          { entity: "superadmin" },
          { action: { in: ["login_success", "login_failed", "2fa_challenge", "2fa_failed", "logout"] } },
          { entity: "tenant" },
          { entity: "order", action: "create" },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        action: true,
        entity: true,
        detail: true,
        user: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ data: notifications });
  } catch {
    // DB not available — return empty
    return NextResponse.json({ data: [] });
  }
}
