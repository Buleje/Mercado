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
 * Las cuatro pilas (`volumen-disponible-cuerpo`): UNA pila elegida → su
 * detalle completo; dos o más → la vista SUMADA, con sus apartados «Por
 * permiso | Por especie | Por troza».
 *
 * «Por troza» era una pestaña de arriba (compactación 17-10) y desde el 19-10
 * es el tercer apartado (Brandon: «la pestaña Por troza se pasará a la pestaña
 * Volumen al lado de Por especie, y cambiará según lo puesto en Por permiso»):
 * el mismo `CtpTrozasView` —ficha con ‹ ›, D1/D2, «Sin título», plan del día,
 * escáner—, recortado por las pilas, el permiso y la especie elegidos.
 *
 * `?sub=` sigue siendo el contrato de la URL: `volumen` = las tablas,
 * `por-troza` = el apartado. Así los links viejos, `?vista=trozas`, la tecla
 * `g t` y los QR impresos (`urlFichaDeTroza`) caen en él sin migrar nada.
 */

import { useState } from "react";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import type { FuentesPedidas } from "@/lib/forestal/volumen-disponible";
import { usePestanaInterna } from "./hooks/use-pestana-interna";
import { SUBS_DISPONIBLES, subPedidoPorVistaVieja, type SubDisponibles } from "./ctp-vistas-fusionadas";
import VolumenDisponibleCuerpo from "./volumen-disponible-cuerpo";

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
  /* Pedir una pila es mirar el volumen: gana sobre el apartado recordado. */
  const { sub, irA } = usePestanaInterna<SubDisponibles>({
    moduleId: "ctp-disponibles",
    validas: SUBS_DISPONIBLES,
    porDefecto: "volumen",
    forzada: fuentesPedidas ? "volumen" : forzada,
    pedido,
  });

  return (
    <VolumenDisponibleCuerpo
      period={period}
      onIr={onIr}
      fuentesPedidas={fuentesPedidas}
      onFuentesUsadas={onFuentesUsadas}
      onAbrirLote={onAbrirLote}
      porTroza={sub === "por-troza"}
      onPorTroza={(si) => irA(si ? "por-troza" : "volumen")}
    />
  );
}
