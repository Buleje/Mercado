"use client";

import dynamic from "next/dynamic";

/** Gráfico de Notas de crédito, cargado aparte (sin SSR). */
export const NotasCreditoChart = dynamic(() => import("../NotasCreditoChart"), {
  ssr: false,
  loading: () => (
    <div className="h-48 animate-pulse bg-[var(--surface-sunken)] rounded-xl" />
  ),
});
