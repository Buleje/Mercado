"use client";

/**
 * CtpCompliancePanel — la vista «Cumplimiento» del Libro CTP (ADR-124/127).
 *
 * Dos pestañas (compactación del libro, 17-10: «unificar pestañas que tienen
 * casi la misma función»):
 *  · «Chequeo del período» — ¿puedo cerrar? (`CtpCumplimientoChequeo`);
 *  · «Cerrar el mes» — lo que era la vista Cierre: el asistente y el historial
 *    (`CtpCumplimientoCerrar`). El veredicto del chequeo lleva acá.
 *
 * `?vista=cierre` (una URL o un aviso viejos) abre «Cerrar el mes».
 */

import { useState } from "react";
import { ClipboardCheck, Lock } from "@buleje/design-system/icons";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import CtpCumplimientoCerrar from "./CtpCumplimientoCerrar";
import CtpCumplimientoChequeo from "./CtpCumplimientoChequeo";
import PestanasDeVista, { type PestanaDeVista } from "./PestanasDeVista";
import type { CtpIngresosFiltroRapido } from "./ctp-shared";
import { SUBS_CUMPLIMIENTO, subPedidoPorVistaVieja, type SubCumplimiento } from "./ctp-vistas-fusionadas";
import { usePestanaInterna } from "./hooks/use-pestana-interna";

const PESTANAS: readonly PestanaDeVista<SubCumplimiento>[] = [
  {
    id: "chequeo",
    label: "Chequeo del período",
    icon: ClipboardCheck,
    hint: "El puntaje, lo que impide cerrar y lo que está en orden — los mismos números del Excel del libro",
  },
  {
    id: "cerrar",
    label: "Cerrar el mes",
    icon: Lock,
    hint: "Revisa el mes, ciérralo (congela costos y bloquea el acta) y el historial para reabrir",
  },
];

export default function CtpCompliancePanel({
  period,
  onNavigate,
  pedido = null,
}: {
  period: CtpPeriod;
  /** Salta a la vista donde se resuelve una alerta, con el filtro del caso ya puesto. */
  onNavigate: (vista: string, filtro?: CtpIngresosFiltroRapido) => void;
  /** La pestaña que pide el libro estando YA en Cumplimiento (ver `usePestanaInterna`). */
  pedido?: { sub: string; n: number } | null;
}) {
  /* La URL vieja (`?vista=cierre`) se lee UNA vez, al montar: después el libro la reescribe. */
  const [forzada] = useState(() => subPedidoPorVistaVieja("cumplimiento"));
  const { sub, irA } = usePestanaInterna<SubCumplimiento>({
    moduleId: "ctp-cumplimiento",
    validas: SUBS_CUMPLIMIENTO,
    porDefecto: "chequeo",
    forzada,
    pedido,
  });

  return (
    <PestanasDeVista prefijo="ctp-cumplimiento" etiqueta="Pestañas de Cumplimiento" items={PESTANAS} activa={sub} onCambiar={irA}>
      {sub === "chequeo" ? (
        <CtpCumplimientoChequeo period={period} onNavigate={onNavigate} onCerrar={() => irA("cerrar")} />
      ) : (
        <CtpCumplimientoCerrar onIr={onNavigate} />
      )}
    </PestanasDeVista>
  );
}
