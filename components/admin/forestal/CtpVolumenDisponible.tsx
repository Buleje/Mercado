"use client";

/**
 * «Volumen disponible» — cuánta madera hay para trabajar (Brandon 2026-10-03).
 *
 * Pedido: «unificá Trozas y Productos disponibles en una sola pestaña, con
 * chips para cambiar de formato: trozas, productos, el volumen que sobra en los
 * lotes y el de los ingresos por recepcionar; y una opción que sume todo para
 * saber cuánto se puede aprovechar. Que se filtre por permiso y que se puedan
 * elegir solo 2, 3 o 4».
 *
 * Dos pestañas internas desde la compactación del libro (17-10, plan
 * `.claude/autonomo/ctp-compactar/plan.md`):
 *   · Volumen: las cuatro pilas (`volumen-disponible-cuerpo`). UNA pila
 *     elegida → su detalle completo; dos o más → la vista SUMADA.
 *   · Por troza: el patio pieza por pieza, que era la vista «Trozas»
 *     (`CtpTrozasView`): ficha con ‹ ›, D1/D2 desde SERFOR y «Anotar», los
 *     indicadores, «Sin título», el filtro tipo Excel en cada columna y ahora
 *     también «Días en el patio» y ≈pt, que sólo tenía la tabla de aquí.
 * Las dos leen el mismo patio; cada pestaña monta el componente de antes.
 */

import { useState } from "react";
import { Axe, Trees } from "@buleje/design-system/icons";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import type { FuentesPedidas } from "@/lib/forestal/volumen-disponible";
import CtpTrozasView from "./CtpTrozasView";
import PestanasDeVista, { type PestanaDeVista } from "./PestanasDeVista";
import { usePestanaInterna } from "./hooks/use-pestana-interna";
import { SUBS_DISPONIBLES, subPedidoPorVistaVieja, type SubDisponibles } from "./ctp-vistas-fusionadas";
import VolumenDisponibleCuerpo from "./volumen-disponible-cuerpo";

const PESTANAS: readonly PestanaDeVista<SubDisponibles>[] = [
  { id: "volumen", label: "Volumen", icon: Trees, hint: "Las cuatro pilas: trozas, lotes, por recepcionar y productos" },
  {
    id: "por-troza",
    label: "Por troza",
    icon: Axe,
    hint: "El patio pieza por pieza: su ficha, D1/D2, días en el patio y el plan del día",
  },
];

export default function CtpVolumenDisponible({
  period,
  onIr,
  fuentesPedidas = null,
  onFuentesUsadas,
  onAbrirLote,
  pedido = null,
}: {
  period: CtpPeriod;
  onIr?: (vista: string) => void;
  /** Un salto desde otra pantalla que pide una pila («Ver trozas disponibles →»). */
  fuentesPedidas?: FuentesPedidas | null;
  onFuentesUsadas?: () => void;
  /** Clic en un lote de aserrío: abre su historia (Lotes › Historia del lote). */
  onAbrirLote?: (loteId: string) => void;
  /** Un salto del libro a una pestaña (`irA("trozas")` estando ya en esta vista). */
  pedido?: { sub: string; n: number } | null;
}) {
  /* La URL vieja (`?vista=trozas`) se lee UNA vez, al montar. */
  const [forzada] = useState(() => subPedidoPorVistaVieja("disponibles"));
  /* Pedir una pila es mirar el volumen: gana sobre la pestaña recordada. */
  const { sub, irA } = usePestanaInterna<SubDisponibles>({
    moduleId: "ctp-disponibles",
    validas: SUBS_DISPONIBLES,
    porDefecto: "volumen",
    forzada: fuentesPedidas ? "volumen" : forzada,
    pedido,
  });

  return (
    <PestanasDeVista
      prefijo="ctp-disponibles"
      etiqueta="Pestañas de Volumen disponible"
      items={PESTANAS}
      activa={sub}
      onCambiar={irA}
    >
      {sub === "volumen" && (
        <VolumenDisponibleCuerpo
          period={period}
          onIr={onIr}
          fuentesPedidas={fuentesPedidas}
          onFuentesUsadas={onFuentesUsadas}
          onAbrirLote={onAbrirLote}
        />
      )}
      {sub === "por-troza" && <CtpTrozasView />}
    </PestanasDeVista>
  );
}
