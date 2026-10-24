"use client";

import { useMemo } from "react";
import { useMembrete } from "@/hooks/use-membrete";
import { useCodigoNegocio } from "@/hooks/use-codigo-negocio";
import { useTenant } from "@/contexts/tenant-context";
import { getVerticalConfig, type Industry } from "@/lib/verticals/registry";

/** Lo que el botón de identidad del encabezado muestra del negocio en sesión. */
export interface IdentidadNegocio {
  /** Nombre comercial › razón social › nombre registrado (ADR-514); sin dato, el rótulo del rubro. */
  nombre: string;
  /** Logo tal como se subió en Ajustes › Datos del negocio (o el del registro). `null` = va la inicial. */
  logoUrl: string | null;
  /** El tipo de negocio («Bodega / Minimarket»). */
  rubro: string;
  /** Qué significa el tipo de negocio (lo muestra la ventana «Tipo de negocio»). */
  rubroDetalle: string;
  ruc: string | null;
  /** ID de soporte (ADR-500). */
  codigo: string | null;
}

/**
 * Identidad del negocio para el cascarón del panel (Brandon 23-10: el logo, el
 * rubro y el usuario salen de la barra lateral al encabezado). Manda el
 * membrete (Ajustes › Datos del negocio, ADR-514); mientras llega —o si el rol
 * no lo puede leer— el nombre y el logo del tenant que ya trae el panel.
 */
export function useIdentidadNegocio(respaldo: { nombre?: string | null; logoUrl?: string | null }): IdentidadNegocio {
  const membrete = useMembrete();
  const codigo = useCodigoNegocio();
  const { industry } = useTenant();
  return useMemo(() => {
    const vertical = getVerticalConfig(industry as Industry | undefined);
    return {
      nombre: membrete?.nombre || respaldo.nombre || vertical.branding?.sidebarTitle || "Tu negocio",
      logoUrl: membrete?.logoUrl || respaldo.logoUrl || null,
      rubro: vertical.label,
      rubroDetalle: vertical.description,
      ruc: membrete?.ruc || null,
      codigo,
    };
  }, [membrete, codigo, industry, respaldo.nombre, respaldo.logoUrl]);
}
