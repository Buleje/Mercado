"use client";

/**
 * components/admin/tabs/InventoryTab.tsx
 *
 * Lazy-loaded wrapper for the Inventario/Almacenes unified module.
 * ssr:false because the underlying module uses client-only libs
 * (drag-drop, barcode scanner, window APIs).
 *
 * Part of TASK-003 — sessions 4-7 extraction.
 */

import dynamic from "next/dynamic";
import { TabSkeleton } from "./TabSkeleton";

const InventoryTab = dynamic(
  () => import("@/components/admin/unified/InventarioAlmacenesModule"),
  { loading: () => <TabSkeleton />, ssr: false },
);

export default InventoryTab;
