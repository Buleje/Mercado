"use client";

/**
 * Libro CTP › Tablero — una vista, cinco pestañas internas (plan «panel
 * unificado», F31, ola 2 — 2026-10-10).
 *
 * Antes eran cinco lugares: Tablero (Control), Reportes, Análisis y
 * Rentabilidad (Gestión) y el Rendimiento del aserradero (Herramientas). Las
 * cinco contestan «¿cómo viene la planta?» desde el mismo libro, así que viven
 * juntas: Movimiento · Producción · Tendencias · Margen · Rendimiento. Cada
 * pestaña monta el MISMO componente de antes (nada se copió ni se recalcula).
 *
 * Rendimiento venía de Herramientas: se ve sólo para quien veía Herramientas
 * (permiso por ORIGEN, regla R2 — especialización, plan, plantilla y rol).
 */

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { BarChart3, Coins, FileBarChart, Gauge, TrendingUp } from "@buleje/design-system/icons";
import { LoadingSpinner } from "@/components/ui-system/LoadingSpinner";
import { useContextoPermiso, usePermisoDe } from "@/hooks/use-vistas-permitidas";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import CtpTableroControl from "./CtpTableroControl";
import CtpReportesView from "./CtpReportesView";
import CtpAnalisis from "./CtpAnalisis";
import CtpRentabilidadPanel from "./CtpRentabilidadPanel";
import PestanasDeVista, { type PestanaDeVista } from "./PestanasDeVista";
import { usePestanaInterna } from "./hooks/use-pestana-interna";
import { SUBS_TABLERO, subPedidoPorVistaVieja, type SubTablero } from "./ctp-vistas-fusionadas";

const cargando = (
  <div className="flex h-48 items-center justify-center">
    <LoadingSpinner size={32} />
  </div>
);
/* Trae recharts y el simulador: se baja sólo al abrir la pestaña (como en Herramientas). */
const RendimientoAserradero = dynamic(() => import("./RendimientoAserradero"), { ssr: false, loading: () => cargando });

const PESTANAS: readonly PestanaDeVista<SubTablero>[] = [
  { id: "movimiento", label: "Movimiento", icon: BarChart3, hint: "Las cuatro secciones del libro en el tiempo: entró, fue a la sierra, salió de producto, se despachó" },
  { id: "produccion", label: "Producción", icon: FileBarChart, hint: "Reportes: la producción por semanas, mes o rango; PT por dueño de la madera, permiso y especie" },
  { id: "tendencias", label: "Tendencias", icon: TrendingUp, hint: "Análisis: reorden de materia prima y tendencias de 6 meses" },
  { id: "margen", label: "Margen", icon: Coins, hint: "Rentabilidad: venta − costo de lo vendido" },
  { id: "rendimiento", label: "Rendimiento", icon: Gauge, hint: "Por especie y por corrida, tu rango, la plata por PT y el simulador" },
];

/** Pestañas que no leen el período del libro: con el selector visible parecería que no hace nada. */
export const SUBS_TABLERO_SIN_PERIODO: readonly SubTablero[] = ["produccion", "tendencias", "rendimiento"];

export default function CtpTableroPestanas({
  period,
  onIr,
  pedido,
  onSub,
}: {
  period: CtpPeriod;
  onIr: (vista: string) => void;
  pedido: { sub: string; n: number } | null;
  onSub: (sub: SubTablero) => void;
}) {
  const ctx = useContextoPermiso();
  const verRendimiento = usePermisoDe(["forestal-herramientas"]);
  /* La URL vieja (`?vista=reportes`) se lee UNA vez, al montar: después el libro la reescribe. */
  const [forzada] = useState(() => subPedidoPorVistaVieja("tablero"));
  const { sub, irA } = usePestanaInterna<SubTablero>({
    moduleId: "ctp-tablero",
    validas: SUBS_TABLERO,
    porDefecto: "movimiento",
    forzada,
    pedido,
  });

  const items = verRendimiento ? PESTANAS : PESTANAS.filter((p) => p.id !== "rendimiento");
  /* Llegó a Rendimiento sin permiso de Herramientas: ve el Movimiento (la URL no abre lo que la barra no ofrece). */
  const sinRendimiento = sub === "rendimiento" && ctx !== null && !verRendimiento;
  const activa: SubTablero = sinRendimiento ? "movimiento" : sub;

  /* El libro esconde su selector de período en las pestañas que no lo leen. */
  const onSubRef = useRef(onSub);
  onSubRef.current = onSub;
  useEffect(() => {
    onSubRef.current(activa);
  }, [activa]);

  return (
    <PestanasDeVista prefijo="ctp-tablero" etiqueta="Pestañas del Tablero" items={items} activa={activa} onCambiar={irA}>
      {activa === "movimiento" && <CtpTableroControl period={period} onIr={onIr} />}
      {activa === "produccion" && <CtpReportesView onIr={onIr} />}
      {activa === "tendencias" && <CtpAnalisis />}
      {activa === "margen" && <CtpRentabilidadPanel period={period} />}
      {activa === "rendimiento" && (ctx === null ? cargando : <RendimientoAserradero />)}
    </PestanasDeVista>
  );
}
