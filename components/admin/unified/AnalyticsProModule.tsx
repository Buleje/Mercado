"use client";

import dynamic from "next/dynamic";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const AnalyticsBIModule = dynamic(
  () => import("@/components/admin/unified/AnalyticsBIModule"),
  { loading: S }
);

export default function AnalyticsProModule() {
  return <AnalyticsBIModule />;
}
