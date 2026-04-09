import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionPayload, SESSION } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import OnboardingWizard from "@/components/onboarding/OnboardingWizard";

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
