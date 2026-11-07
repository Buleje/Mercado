"use client";

/**
 * El contenido de cada sub-vista de Sistema. Sin barra: la pone quien lo monta
 * (Configuración › Sistema o el hub suelto de `?tab=rendimiento`).
 */
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";
import type { SubvistaSistema } from "./subvistas-sistema";

const RendimientoModule = dynamic(() => import("@/components/admin/unified/RendimientoModule"), { loading: S });
const AuditTrailModule = dynamic(() => import("@/components/admin/AuditTrailModule"), { loading: S });
const ColasSistema = dynamic(() => import("./ColasSistema"), { loading: S });

export default function ContenidoSistema({ activa, preferencias }: {
  /** `null` = todavía no se sabe cuál se puede ver: esqueleto. */
  activa: SubvistaSistema | null;
  preferencias?: ReactNode;
}) {
  switch (activa) {
    case null: return <S />;
    case "preferencias": return <>{preferencias}</>;
    case "velocidad":
    case "historial":
    case "salud":
    case "soporte": return <RendimientoModule vista={activa} />;
    case "actividad": return <AuditTrailModule />;
    case "colas": return <ColasSistema />;
  }
}
