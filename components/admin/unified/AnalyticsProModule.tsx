"use client";

import dynamic from "next/dynamic";

import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

const AnalyticsBIModule = dynamic(
  () => import("@/components/admin/unified/AnalyticsBIModule"),
  { loading: S }
);

export default function AnalyticsProModule() {
  return <AnalyticsBIModule />;
}
