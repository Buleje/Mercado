import "server-only";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { getPlatformSession, maybeRotateToken, PLATFORM_SESSION } from "@/lib/superadmin-session";
import SuperAdminShell from "@/components/superadmin/SuperAdminShell";

export const metadata = {
  title: "Platform Admin — Buleje SaaS",
  robots: "noindex, nofollow",
};

export default async function SuperAdminLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  const session = token ? await getPlatformSession(token) : null;

  // No session → render solo los children (ej. /login). El proxy.ts
  // se encarga de redirigir si alguien intenta acceder a rutas protegidas.
  if (!session || !token) {
    return <>{children}</>;
  }

  // Detect if token rotation is needed (past halfway of 8h lifetime)
  // Cookie writing happens in the client shell via a Server Action
  const freshToken = await maybeRotateToken(token);

  return (
    <SuperAdminShell username={session.username} freshToken={freshToken}>
      {children}
    </SuperAdminShell>
  );
}
