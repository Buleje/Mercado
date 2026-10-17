"use client";

/**
 * CabeceraSeccion — la fila del título de cada sección del plan (ADR-497):
 * título + ⓘ, en qué quedó el guardado y un «⋯» con las versiones anteriores
 * y lo que la vista agregue (plantillas, imprimir…). Una sola fila, igual en
 * las siete vistas.
 */
import { useState, type ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { History, MoreHorizontal } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useSeccionPlan } from "@/hooks/use-plan-empresa";
import type { SeccionPlan } from "@/lib/planificacion/secciones";
import { HistorialSeccion } from "./HistorialSeccion";
import { IndicadorGuardado } from "./IndicadorGuardado";

interface Props {
  seccion: SeccionPlan;
  titulo: string;
  /** Qué va acá, en una línea (dentro del ⓘ). */
  ayuda: ReactNode;
  ejemplo?: ReactNode;
  /** Acciones de la vista que van en el «⋯» antes de «Versiones anteriores». */
  acciones?: MenuAccion[];
  /** Lo de uso constante (el botón «Agregar»), a la derecha. */
  children?: ReactNode;
}

export function CabeceraSeccion({ seccion, titulo, ayuda, ejemplo, acciones = [], children }: Props) {
  const s = useSeccionPlan(seccion);
  const [historial, setHistorial] = useState(false);
  const menu: MenuAccion[] = [
    ...acciones,
    {
      id: "historial",
      label: "Versiones anteriores",
      hint: "Ver quién cambió esta sección y volver a una versión",
      icon: History,
      onSelect: () => setHistorial(true),
      disabled: s.version === 0,
    },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <CardTitle>{titulo}</CardTitle>
        <InfoTip what={ayuda} example={ejemplo} />
      </div>
      <IndicadorGuardado {...s} className="mr-auto" />
      {children}
      <ActionMenu label="Más opciones" icon={MoreHorizontal} actions={menu} soloIcono size="md" />
      <HistorialSeccion seccion={seccion} titulo={titulo} abierto={historial} onCerrar={() => setHistorial(false)} />
    </div>
  );
}
