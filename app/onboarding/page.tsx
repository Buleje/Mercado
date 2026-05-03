import { Suspense } from "react";
import dynamic from "next/dynamic";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionPayload, SESSION } from "@/lib/session";
import { prisma } from "@/lib/prisma";

// Lazy: OnboardingWizard arrastra framer-motion (~80KB gz) al bundle
// inicial de /onboarding. Como es ruta exclusiva del wizard, splittear
// no afecta UX (loading.tsx cubre el momento) y libera el bundle base.
const OnboardingWizard = dynamic(
  () => import("@/components/onboarding/OnboardingWizard"),
);

// Next 16 cacheComponents: la lógica async (cookies + prisma + redirect) debe
// estar bajo un Suspense boundary para permitir partial prerendering del shell.
// La página exporta un componente síncrono que wrap el gate async.
// Ver ADR-019 (ampliación 4x, 2026-04-09).
async function OnboardingGate() {
  // 1. Verify session
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION.COOKIE_NAME)?.value;

  if (!token) {
    redirect("/admin/login");
  }

  const session = await getSessionPayload(token);
  if (!session) {
    redirect("/admin/login");
  }

  // 2. Check if onboarding already completed
  try {
    // eslint-disable-next-line no-restricted-properties -- onboarding gate read-only, refactor a lib/db/admin-users.db.ts pendiente
    const user = await prisma.adminUser.findFirst({
      where: {
        username: session.username,
        tenantId: session.tenantId,
      },
      select: { onboardingCompletedAt: true },
    });

    if (user?.onboardingCompletedAt) {
      redirect("/admin");
    }
  } catch {
    // If DB query fails, let user proceed with onboarding
  }

  // 3. Render wizard
  return <OnboardingWizard />;
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-pulse text-sm text-muted">
            Preparando configuración inicial…
          </div>
        </div>
      }
    >
      <OnboardingGate />
    </Suspense>
  );
}
