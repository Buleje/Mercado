"use client";

/**
 * components/admin/tabs/AuditTab.tsx
 *
 * Lazy-loaded wrapper for the AuditTrailModule.
 * ssr:false because audit log relies on window time formatting
 * and filter state persisted to localStorage.
 *
 * Part of TASK-003 — sessions 4-7 extraction.
 */

import dynamic from "next/dynamic";
import { TabSkeleton } from "./TabSkeleton";

const AuditTab = dynamic(
  () => import("@/components/admin/AuditTrailModule"),
  { loading: () => <TabSkeleton />, ssr: false },
);

export default AuditTab;
