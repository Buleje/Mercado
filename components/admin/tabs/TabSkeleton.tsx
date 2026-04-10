"use client";

/**
 * components/admin/tabs/TabSkeleton.tsx
 *
 * Shared skeleton loader for lazy-loaded admin tabs.
 * Re-exports TabSpinner from _lib so both the TabRouter and the
 * new tab wrapper files in this folder can share the same visual.
 *
 * Part of TASK-003 — extracting sessions 4-7 into dynamic imports.
 */

export { TabSpinner as TabSkeleton } from "@/app/admin/_lib/tab-spinner";
export { TabSpinner } from "@/app/admin/_lib/tab-spinner";
