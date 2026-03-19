import { HeroSkeleton, StatsSkeleton, SectionSkeleton } from "@/components/LoadingSkeleton";

export default function StoreLoading() {
  return (
    <div className="min-h-screen">
      <HeroSkeleton />
      <section className="py-12 sm:py-16 bg-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <StatsSkeleton />
        </div>
      </section>
      <section className="py-20 sm:py-28 bg-white dark:bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionSkeleton />
        </div>
      </section>
    </div>
  );
}
