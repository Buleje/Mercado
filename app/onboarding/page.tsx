import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionPayload, SESSION } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import OnboardingWizard from "@/components/onboarding/OnboardingWizard";

export default async function OnboardingPage() {
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
