"use client";

import dynamic from "next/dynamic";
import { BarChart3 } from "lucide-react";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const AnalyticsProDashboard = dynamic(
  () => import("@/components/admin/analytics/AnalyticsProDashboard"),
  { loading: S }
);

export default function AnalyticsProModule() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-extrabold text-gray-900 dark:text-foreground">Analytics Pro</h1>
        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">Avanzado</span>
      </div>
      <AnalyticsProDashboard />
    </div>
  );
}
