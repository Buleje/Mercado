"use client";

/**
 * LothCompliancePanel — la vista «Cumplimiento» del Libro de Operaciones TH.
 *
 * Dos pestañas (compactación del libro, 17-10: «unir lo que se repite», como
 * el CTP en `CtpCompliancePanel`):
 *  · «Chequeo del libro» — ¿resiste una fiscalización? (`LothCumplimientoChequeo`);
 *  · «Cerrar el mes» — lo que era la vista Cierre: cerrar un período y el
 *    historial para reabrir (`LothCierrePanel`).
 *
 * `?vista=cierre` (una URL o un aviso viejos) abre «Cerrar el mes». Se lee UNA
 * vez, al montar: después el libro reescribe la URL.
 */

import { useState } from "react";
import { ClipboardCheck, Lock } from "@buleje/design-system/icons";
import type { LothNavTarget } from "@/lib/forestal/loth-compliance";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import type { ActaCaratula } from "@/lib/forestal/loth-acta-cierre-print";
import LothCierrePanel from "./LothCierrePanel";
import LothCumplimientoChequeo from "./LothCumplimientoChequeo";
import PestanasDeVista, { type PestanaDeVista } from "./PestanasDeVista";
import { SUBS_CUMPLIMIENTO_TH, type SubCumplimientoTh } from "./loth-vistas-fusionadas";
import { usePestanaInterna } from "./hooks/use-pestana-interna";

const PESTANAS: readonly PestanaDeVista<SubCumplimientoTh>[] = [
  {
    id: "chequeo",
    label: "Chequeo del libro",
    icon: ClipboardCheck,
    hint: "El puntaje, lo que hay que corregir antes de una fiscalización y lo que está en orden",
  },
  {
    id: "cerrar",
    label: "Cerrar el mes",
    icon: Lock,
    hint: "Cierra un mes (sus líneas quedan inmutables) y el historial para reabrir",
  },
];

/** La vista vieja `cierre` pide la pestaña «Cerrar el mes». */
function subPorVistaVieja(): SubCumplimientoTh | undefined {
  if (typeof window === "undefined") return undefined;
  return new URLSearchParams(window.location.search).get("vista") === "cierre" ? "cerrar" : undefined;
}

export default function LothCompliancePanel({
  totalLineas,
  onNavigate,
  reloadSignal,
  pedido = null,
  entries,
  caratula,
  etiquetasPlan,
}: {
  totalLineas: number;
  onNavigate: (target: LothNavTarget) => void;
  /** Se incrementa tras cada escritura del libro → gatilla refetch. */
  reloadSignal?: number;
  /** La pestaña que pide el libro estando YA en Cumplimiento (ver `usePestanaInterna`). */
  pedido?: { sub: string; n: number } | null;
  /** «Cerrar el mes»: el libro completo, la foto del mes que se está por congelar. */
  entries?: LothEntryDTO[];
  caratula?: ActaCaratula | null;
  /** `planId` → «PMFI 123», para decir de qué permiso es el saldo. */
  etiquetasPlan?: ReadonlyMap<string, string>;
}) {
  const [forzada] = useState(subPorVistaVieja);
  const { sub, irA } = usePestanaInterna<SubCumplimientoTh>({
    moduleId: "loth-cumplimiento",
    validas: SUBS_CUMPLIMIENTO_TH,
    porDefecto: "chequeo",
    forzada,
    pedido,
  });

  return (
    <PestanasDeVista prefijo="loth-cumplimiento" etiqueta="Pestañas de Cumplimiento" items={PESTANAS} activa={sub} onCambiar={irA}>
      {sub === "chequeo" ? (
        <LothCumplimientoChequeo totalLineas={totalLineas} onNavigate={onNavigate} reloadSignal={reloadSignal} />
      ) : (
        <LothCierrePanel entries={entries} caratula={caratula} etiquetasPlan={etiquetasPlan} />
      )}
    </PestanasDeVista>
  );
}
