"use client";

/**
 * La sub-vista activa de Sistema (`?sub=`) y las pestañas que esta persona ve.
 *
 * La usan Configuración › Sistema (`SistemaSubvistas`, con Preferencias) y el
 * hub suelto de `?tab=rendimiento|auditoria|colas` (`SistemaHubModule`, sin
 * Preferencias) mientras esos ids no pasen a ser alias (plan «panel
 * unificado», ola 2). Cada uno dibuja su barra; el contenido es el mismo
 * (`ContenidoSistema`).
 *
 * Cada sub-vista se ve sólo si su ORIGEN pasa (regla R2: rendimiento,
 * auditoría y colas son del plan Max). La URL se valida contra todas las que
 * existen, no contra las visibles: el rol llega después del primer render y,
 * si no, un `?sub=velocidad` se perdía antes de saber si se podía ver.
 */
import { useMemo } from "react";
import type { AdminTab } from "@/components/admin/shared/AdminTabBar";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { useContextoPermiso, useParamPedido } from "@/hooks/use-vistas-permitidas";
import {
  IDS_SUBVISTAS_SISTEMA, subvistaDeIdViejo, subvistasVisibles, type SubvistaSistema,
} from "./subvistas-sistema";

/** La memoria de la última sub-vista (`admin-last-tab-config-sistema`). */
export const MODULE_ID_SISTEMA = "config-sistema";

/** Estables: el hook de la URL las usa como dependencia. */
const IDS_SIN_PREFERENCIAS = IDS_SUBVISTAS_SISTEMA.filter((id) => id !== "preferencias");

export interface SubvistasSistemaEstado {
  tabs: AdminTab[];
  /** La que se dibuja; `null` mientras el rol no se confirma y la pedida todavía no pasa. */
  activa: SubvistaSistema | null;
  /** La que pide la URL o la memoria (para marcar la pestaña mientras se espera). */
  vista: SubvistaSistema;
  irA: (id: string) => void;
}

export function useSubvistasSistema(conPreferencias: boolean, forzada?: string): SubvistasSistemaEstado {
  const disponibles = conPreferencias ? IDS_SUBVISTAS_SISTEMA : IDS_SIN_PREFERENCIAS;
  const { vista, irA } = useSubvistaModulo<SubvistaSistema>(
    MODULE_ID_SISTEMA,
    disponibles,
    disponibles[0],
    subvistaDeIdViejo(forzada),
  );
  const ctx = useContextoPermiso();
  /* El `?sub=` que pidió el enlace: uno viejo (`?tab=colas`) abre su sección
     aunque la plantilla la esconda, si el plan y el rol la dejan. Se relee en
     cada navegación con Sistema montado: un enlace a `?tab=rendimiento` desde
     Actividad mostraba Preferencias. */
  const pedida = useParamPedido("sub");
  const visibles = useMemo(() => subvistasVisibles(ctx, conPreferencias, pedida), [ctx, conPreferencias, pedida]);
  const tabs = useMemo(
    // Sin íconos: con ellos las siete pestañas medían 778 px en una columna de
    // 684 (Configuración a 1280) y «Colas» quedaba escondida tras deslizar.
    () => visibles.map((s) => ({ id: s.id, label: s.label, title: s.hint })),
    [visibles],
  );
  // La pedida, si se ve; si no, la primera que se ve. Mientras el rol no se
  // confirma y la pedida todavía no pasa, se espera (no se salta a otra).
  const activa: SubvistaSistema | null = visibles.some((s) => s.id === vista)
    ? vista
    : ctx === null
      ? null
      : (visibles[0]?.id ?? null);
  return { tabs, activa, vista, irA };
}

