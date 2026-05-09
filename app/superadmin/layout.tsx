import "server-only";
import { Suspense, type ReactNode } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPlatformSession, maybeRotateToken, PLATFORM_SESSION } from "@/lib/superadmin-session";
import SuperAdminShell from "@/components/superadmin/SuperAdminShell";
import MotionProvider from "@/components/MotionProvider";

export const metadata = {
  title: "Platform Admin — Buleje SaaS",
  robots: "noindex, nofollow",
};

/**
 * Minimal loading skeleton that mirrors SuperAdminShell's visual structure
 * so users see a sidebar + content area instead of bare unstyled content
 * while the auth gate resolves in the Suspense boundary.
 */
function SuperAdminSkeleton() {
  return (
    <div className="flex h-screen bg-[var(--surface-canvas)] text-[var(--text-primary)]">
      {/* Sidebar skeleton */}
      <aside className="hidden lg:flex w-56 flex-col border-r border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 gap-3">
        <div className="h-8 w-28 rounded-lg bg-[var(--surface-sunken)] animate-pulse mb-4" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-8 w-full rounded-lg bg-[var(--surface-sunken)] animate-pulse" />
        ))}
      </aside>
      {/* Content skeleton */}
      <div className="flex-1 flex flex-col">
        <div className="h-14 border-b border-[var(--rule-base)] bg-[var(--surface-raised)]" />
        <div className="flex-1 p-6 space-y-4">
          <div className="h-8 w-48 bg-[var(--surface-sunken)] rounded-lg animate-pulse" />
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-28 bg-[var(--surface-sunken)] rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Dynamic auth gate: reads cookies (uncached per-request data).
 * Rendered inside a <Suspense> boundary whose fallback is the bare children,
 * so every page under /superadmin still has a valid static prerender shell
 * under cacheComponents: true (Next 16). At runtime the gate either:
 *   - redirects to /superadmin/login (no session on protected pages), or
 *   - renders the children bare (on /login page itself), or
 *   - wraps the children with <SuperAdminShell> (authenticated chrome).
 * See ADR-019.
 */
async function SuperAdminAuthGate({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const token = cookieStore.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  const ua = headerStore.get("user-agent");
  const session = token ? await getPlatformSession(token, { ua }) : null;

  // No session → for login page render bare, for other pages redirect
  if (!session || !token) {
    const pathname = headerStore.get("x-next-pathname") ?? headerStore.get("x-invoke-path") ?? "";
    const isLoginPage = pathname === "/superadmin/login" || pathname.startsWith("/superadmin/login/");
    if (!isLoginPage) {
      redirect("/superadmin/login");
    }
    return <>{children}</>;
  }

  // Detect if token rotation is needed (past halfway of 8h lifetime, or
  // refresh `lastSeen` for idle timeout). Cookie writing happens in the
  // client shell via a Server Action.
  const freshToken = await maybeRotateToken(token, { ua });

  return (
    <SuperAdminShell username={session.username} freshToken={freshToken}>
      {children}
    </SuperAdminShell>
  );
}

export default function SuperAdminLayout({ children }: { children: ReactNode }) {
  return (
    <MotionProvider>
      <Suspense fallback={<SuperAdminSkeleton />}>
        <SuperAdminAuthGate>{children}</SuperAdminAuthGate>
      </Suspense>
    </MotionProvider>
  );
}
