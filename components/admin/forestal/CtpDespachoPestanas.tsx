"use client";

/**
 * Libro CTP › Despacho — Despachos · Lotes comerciales y QR (plan «panel
 * unificado», F34; Brandon 2026-10-09: «dentro de Libro CTP › Despacho»).
 *
 * Los lotes comerciales (`forestal-lotes`, ADR-136) habían salido del menú el
 * 09-09 y sólo se llegaba por URL o por el QR. Un lote empaqueta corridas que
 * salen por despacho: su casa es al lado de los despachos. Se monta el MISMO
 * `ForestLotesModule` (sin su cabina) y `?lote=` sigue abriendo la ficha.
 *
 * Se ve sólo para quien veía los lotes (permiso por ORIGEN, regla R2: la
 * especialización `spec:forestal:lotes`, el plan, la plantilla y el rol).
 *
 * Guías emitidas (compactación 17-10) era una vista aparte con un botón «Ir a
 * Despacho»: cada guía ES un despacho, así que vive como sección de acá.
 */

import { isValidElement, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { FileText, Layers, Truck } from "@buleje/design-system/icons";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import { LoadingSpinner } from "@/components/ui-system/LoadingSpinner";
import { useContextoPermiso, usePermisoDe } from "@/hooks/use-vistas-permitidas";
import PestanasDeVista, { type PestanaDeVista } from "./PestanasDeVista";
import { usePestanaInterna } from "./hooks/use-pestana-interna";
import { SUBS_DESPACHO, type SubDespacho } from "./ctp-vistas-fusionadas";
import CtpGuiasEmitidasView from "./CtpGuiasEmitidasView";

const cargando = (
  <div className="flex h-48 items-center justify-center">
    <LoadingSpinner size={32} />
  </div>
);
const ForestLotesModule = dynamic(() => import("./ForestLotesModule"), { ssr: false, loading: () => cargando });

const PESTANAS: readonly PestanaDeVista<SubDespacho>[] = [
  { id: "despachos", label: "Despachos", icon: Truck, hint: "Lo que sale de la planta con su guía y su origen" },
  { id: "guias", label: "Guías emitidas", icon: FileText, hint: "Las GTF de salida del CTP y cuáles quedaron a medio llenar" },
  { id: "lotes-qr", label: "Lotes comerciales y QR", icon: Layers, hint: "Corridas agrupadas en un lote con código, grado, certificado y QR" },
];

/** Un enlace a la ficha de un lote (`?lote=`) sin pestaña abre la de los lotes. */
function subPorFichaDeLote(): SubDespacho | undefined {
  if (typeof window === "undefined") return undefined;
  return new URLSearchParams(window.location.search).get("lote") ? "lotes-qr" : undefined;
}

/** El período de la vista de despachos, mientras el libro no lo pase aparte. */
function periodoDe(despachos: ReactNode): CtpPeriod | undefined {
  return isValidElement<{ period?: CtpPeriod }>(despachos) ? despachos.props.period : undefined;
}

export default function CtpDespachoPestanas({
  despachos,
  pedido,
  period,
}: {
  /** La vista de despachos de siempre (la arma el libro, con sus presets). */
  despachos: ReactNode;
  pedido: { sub: string; n: number } | null;
  /** El período del libro (Guías emitidas). Sin él, el de `despachos`. */
  period?: CtpPeriod;
}) {
  const ctx = useContextoPermiso();
  const verLotes = usePermisoDe(["forestal-lotes"]);
  const [forzada] = useState(subPorFichaDeLote);
  const { sub, irA } = usePestanaInterna<SubDespacho>({
    moduleId: "ctp-despacho",
    validas: SUBS_DESPACHO,
    porDefecto: "despachos",
    forzada,
    pedido,
  });

  const items = verLotes ? PESTANAS : PESTANAS.filter((p) => p.id !== "lotes-qr");
  const activa: SubDespacho = sub === "lotes-qr" && ctx !== null && !verLotes ? "despachos" : sub;
  const periodo = period ?? periodoDe(despachos);

  return (
    <PestanasDeVista prefijo="ctp-despacho" etiqueta="Pestañas de Despacho" items={items} activa={activa} onCambiar={irA}>
      {activa === "despachos" && despachos}
      {activa === "guias" && periodo && <CtpGuiasEmitidasView period={periodo} />}
      {activa === "lotes-qr" && (ctx === null ? cargando : <ForestLotesModule embebido />)}
    </PestanasDeVista>
  );
}
