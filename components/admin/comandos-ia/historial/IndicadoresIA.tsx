"use client";

/**
 * «Indicadores» de «Lo que hizo la IA» (10-10): la tarjeta grande «IA este
 * mes» se volvió una cifra plegable en la fila de «Recibos» (Brandon: «compactar
 * para que la información central esté bien vista»). Plegado, el titular
 * (~22 letras) dice cuántas acciones y cuánto va del mes.
 *
 * Las cuentas salen de los MISMOS recibos que se listan abajo (los últimos 50
 * que trae la API), y la del mes, del mismo medidor que frena a la IA.
 */

import type { ReactNode } from "react";
import { ListChecks, PiggyBank, Undo2 } from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import { limaDateKey } from "@/lib/utils";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { TarjetaConsumoIA, useConsumoIA, useMedidorEnLaVista } from "../ConsumoIA";
import { usd, type ReciboIA } from "./use-recibos";

/** Lo que trae `/api/admin/comandos-ia/recibos` como máximo (ActivityLogDB.list limit 50). */
const TOPE_API = 50;

export function useIndicadoresIA({ recibos, listo }: { recibos: ReciboIA[]; listo: boolean }) {
  // Esta vista ya dice la cifra del mes: la franja del hub se calla mientras está.
  useMedidorEnLaVista();
  const consumo = useConsumoIA();

  const hoy = limaDateKey();
  const n = recibos.length;
  const deHoy = recibos.filter((r) => limaDateKey(r.createdAt) === hoy).length;
  const sinIa = recibos.filter((r) => !(r.costoIaUsd != null && r.costoIaUsd > 0)).length;
  const deshacibles = recibos.filter((r) => r.tipo === "precios" && !r.deshecho).length;

  const tarjetas: ReactNode[] = [];
  if (consumo) tarjetas.push(<TarjetaConsumoIA key="mes" d={consumo} />);
  tarjetas.push(
    <StatCard
      density="compact"
      key="acciones"
      label="Acciones"
      value={String(n)}
      icon={ListChecks}
      subValue={`${deHoy} hoy${n >= TOPE_API ? ` · las últimas ${TOPE_API}` : ""}`}
    />,
    <StatCard
      density="compact"
      key="sin-ia"
      label="Sin gastar IA"
      value={n ? `${sinIa} de ${n}` : "0"}
      icon={PiggyBank}
      subValue="Salieron con reglas: $0"
    />,
    <StatCard
      density="compact"
      key="deshacer"
      label="Se pueden deshacer"
      value={String(deshacibles)}
      icon={Undo2}
      subValue={deshacibles === 1 ? "Cambio de precios" : "Cambios de precios"}
    />,
  );

  const titular = consumo ? `${n} ${n === 1 ? "acción" : "acciones"} · ${usd(consumo.spentUsd)}` : `${n} · ${sinIa} sin IA`;

  return useKpisPlegables({
    claveMemoria: "comandos-ia-historial",
    tarjetas,
    resumen: listo ? titular : undefined,
    // Mientras lee el medidor (undefined) o los recibos, skeletons: un «0» de mentira se lee como dato.
    sinDatosAun: !listo || consumo === undefined,
    alto: "md",
    anchoFijo: true,
    compactoEnMovil: true,
  });
}
