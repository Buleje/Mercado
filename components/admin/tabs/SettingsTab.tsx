"use client";

/**
 * components/admin/tabs/SettingsTab.tsx
 *
 * Lazy-loaded wrapper for the SettingsModule.
 * Not ssr:false — settings form is safe to pre-render.
 *
 * Part of TASK-003 — sessions 4-7 extraction.
 */

import dynamic from "next/dynamic";
import { TabSkeleton } from "./TabSkeleton";

const SettingsTab = dynamic(
  () => import("@/components/admin/SettingsModule"),
  { loading: () => <TabSkeleton /> },
);

export default SettingsTab;
