"use client";

/**
 * components/admin/tabs/ReportsTab.tsx
 *
 * Lazy-loaded wrapper for the Analytics Pro module (Reports session).
 * Dynamic re-export so any consumer (page.tsx, TabRouter) gets the
 * same chunked module + shared TabSkeleton loader without touching
 * the underlying unified module file.
 *
 * Part of TASK-003 — sessions 4-7 extraction.
 */

import dynamic from "next/dynamic";
import { TabSkeleton } from "./TabSkeleton";

const ReportsTab = dynamic(
  () => import("@/components/admin/unified/AnalyticsProModule"),
  { loading: () => <TabSkeleton />, ssr: false },
);

export default ReportsTab;
