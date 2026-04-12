/**
 * @deprecated Usar `components/admin/finance/CashflowRollingTable.tsx`.
 * Este archivo queda como shim de compatibilidad para imports viejos.
 * El shape del API cambió en el item #11 del Master Roadmap (2026-04-10).
 */
"use client";

import CashflowRollingTable from "@/components/admin/finance/CashflowRollingTable";

export default function CashFlowRolling() {
  return <CashflowRollingTable />;
}
