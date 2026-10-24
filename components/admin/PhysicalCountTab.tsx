"use client";

/**
 * Conteo físico › Manual: escribes lo que contaste producto por producto, ves
 * las diferencias y aplicas los ajustes. Se guarda en este navegador (un conteo
 * por día). El estado vive en `conteo/use-conteo-manual.ts`; cada pantalla, en
 * `conteo/ManualVistas.tsx`.
 */
import { ManualContando, ManualHistorial, ManualInicio, ManualReconciliar } from "@/components/admin/inventario/conteo/ManualVistas";
import { useConteoManual } from "@/components/admin/inventario/conteo/use-conteo-manual";

export default function PhysicalCountTab() {
  const m = useConteoManual();
  if (m.view === "counting" && m.session) return <ManualContando m={m} />;
  if (m.view === "reconcile" && m.session) return <ManualReconciliar m={m} />;
  if (m.view === "history") return <ManualHistorial m={m} />;
  return <ManualInicio m={m} />;
}
