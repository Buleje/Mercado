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
import { ListChecks, PiggyBank, Undo2, type LucideIcon } from "@buleje/design-system/icons";
import { limaDateKey } from "@/lib/utils";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { TarjetaConsumoIA, useConsumoIA, useMedidorEnLaVista } from "../ConsumoIA";
import { usd, type ReciboIA } from "./use-recibos";

/** Lo que trae `/api/admin/comandos-ia/recibos` como máximo (ActivityLogDB.list limit 50). */
const TOPE_API = 50;

function Cifra({ etiqueta, valor, detalle, icono: Icono }: { etiqueta: string; valor: string; detalle: string; icono: LucideIcon }) {
  return (
    <div className="flex h-full flex-col gap-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3">
      <span className="flex items-center justify-between gap-2 text-sm font-semibold text-[var(--text-secondary)]">
        {etiqueta}
        <Icono className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
      </span>
      <span className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">{valor}</span>
      <span className="text-sm text-[var(--text-secondary)]">{detalle}</span>
    </div>
  );
}

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
    <Cifra
      key="acciones"
      etiqueta="Acciones"
      valor={String(n)}
      icono={ListChecks}
      detalle={`${deHoy} hoy${n >= TOPE_API ? ` · las últimas ${TOPE_API}` : ""}`}
    />,
    <Cifra
      key="sin-ia"
      etiqueta="Sin gastar IA"
      valor={n ? `${sinIa} de ${n}` : "0"}
      icono={PiggyBank}
      detalle="Salieron con reglas: $0"
    />,
    <Cifra
      key="deshacer"
      etiqueta="Se pueden deshacer"
      valor={String(deshacibles)}
      icono={Undo2}
      detalle={deshacibles === 1 ? "Cambio de precios" : "Cambios de precios"}
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
