import { Suspense } from "react";
import { RegistrationForm } from "@/components/marketing/RegistrationForm";
import { type PlanId } from "@/lib/plans";
import { LoadingSpinner } from "@/components/LoadingSpinner";

// ─── Tipos ────────────────────────────────────────────────────
interface PageProps {
  searchParams: Promise<{ plan?: string }>;
}

// ─── Server Component — lee searchParams y pasa initialPlan ──
export default async function RegistroPage({ searchParams }: PageProps) {
  const params    = await searchParams;
  const planParam = params.plan as PlanId | undefined;
  const validPlans: PlanId[] = ["free", "pro", "business", "enterprise"];
  const initialPlan: PlanId  = planParam && validPlans.includes(planParam) ? planParam : "free";

  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    }>
      <RegistrationForm initialPlan={initialPlan} />
    </Suspense>
  );
}
