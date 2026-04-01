import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";

// Re-export types for server-side consumers
export type { PlanId, TenantRow, CommissionRow, PlatformSettings } from "./superadmin-types";
export { DEFAULT_SETTINGS, PLAN_LABELS } from "./superadmin-types";

// ─── Auth helpers ──────────────────────────────────────────────────────────────

/**
 * Para API routes (Route Handlers).
 * Lee la cookie del request, valida la sesión.
 * Retorna { ok: true, username } o un NextResponse 401.
 */
export async function requirePlatformAPI(
  req: NextRequest,
): Promise<{ ok: true; username: string } | NextResponse> {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const session = await getPlatformSession(token);
  if (!session) {
    return NextResponse.json({ error: "Sesión inválida o expirada" }, { status: 401 });
  }
  return { ok: true, username: session.username };
}

/**
 * Para Server Components / layouts (App Router).
 * Lee la cookie via next/headers, valida la sesión.
 * Redirige a /superadmin/login si no es válida.
 * Retorna { username } si es válida.
 */
export async function requirePlatformPage(): Promise<{ username: string }> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) {
    redirect("/superadmin/login");
  }
  const session = await getPlatformSession(token);
  if (!session) {
    redirect("/superadmin/login");
  }
  return { username: session.username };
}
