import "server-only";
import { Suspense, type ReactNode } from "react";
import { cookies } from "next/headers";
import { getPlatformSession, maybeRotateToken, PLATFORM_SESSION } from "@/lib/superadmin-session";
import SuperAdminShell from "@/components/superadmin/SuperAdminShell";

export const metadata = {
  title: "Platform Admin — Buleje SaaS",
  robots: "noindex, nofollow",
};

/**
 * Dynamic auth gate: reads cookies (uncached per-request data).
 * Rendered inside a <Suspense> boundary whose fallback is the bare children,
 * so every page under /superadmin still has a valid static prerender shell
 * under cacheComponents: true (Next 16). At runtime the gate either:
 *   - renders the children bare (no session → e.g. /login), or
 *   - wraps the children with <SuperAdminShell> (authenticated chrome).
 * See ADR-019.
 */
async function SuperAdminAuthGate({ children }: { children: ReactNode }) {
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

export default function SuperAdminLayout({ children }: { children: ReactNode }) {
  // The fallback MUST include children so the static prerender shell of every
  // nested route (/superadmin/login, /superadmin/dashboard, …) has real
  // content to render. Without this, cacheComponents would report the whole
  // subtree as "uncached data outside of <Suspense>".
  return (
    <Suspense fallback={<>{children}</>}>
      <SuperAdminAuthGate>{children}</SuperAdminAuthGate>
    </Suspense>
  );
}
