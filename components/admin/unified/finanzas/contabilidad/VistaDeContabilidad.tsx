"use client";

/** Qué sección de Contabilidad se dibuja en cada `?vista=` (cada una carga aparte). */
import dynamic from "next/dynamic";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

const LibroDiario = dynamic(() => import("./LibroDiario"), { loading: S });
const LibroMayor = dynamic(() => import("./LibroMayor"), { loading: S });
const BalanceComprobacion = dynamic(() => import("./BalanceComprobacion"), { loading: S });
const EstadosFinancieros = dynamic(() => import("./EstadosFinancieros"), { loading: S });
const MesesYCierre = dynamic(() => import("./MesesYCierre"), { loading: S });
const PlanYAjustes = dynamic(() => import("./PlanYAjustes"), { loading: S });

export default function VistaDeContabilidad({ vista }: { vista: string }) {
  switch (vista) {
    case "diario": return <LibroDiario />;
    case "mayor": return <LibroMayor />;
    case "comprobacion": return <BalanceComprobacion />;
    case "estados": return <EstadosFinancieros />;
    case "meses": return <MesesYCierre />;
    case "plan-cuentas": return <PlanYAjustes />;
    default: return null;
  }
}
