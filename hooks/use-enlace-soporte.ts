"use client";

import { useEffect, useState } from "react";
import { cachedJson } from "@/lib/client-cache-fetch";
import { logger } from "@/lib/logger";
import { useTenant } from "@/contexts/tenant-context";
import { useCodigoNegocio } from "@/hooks/use-codigo-negocio";
import { enlaceSoporte } from "@/lib/soporte/enlace-soporte";

/**
 * Enlace «Escribir a soporte» del panel: número de soporte del ajuste de
 * plataforma (`support.whatsappNumber`, lo edita el superadmin) o, si no hay,
 * el de `lib/legal.ts`; nombre del negocio e ID de la sesión.
 */
export function useEnlaceSoporte(): string {
  const { branding } = useTenant();
  const codigo = useCodigoNegocio();
  const [numero, setNumero] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    void cachedJson<{ config?: { support?: { whatsappNumber?: string | null } } }>("/api/platform-config/public", 60_000).then((d) => {
      if (vivo) setNumero(d?.config?.support?.whatsappNumber ?? null);
    }).catch((err: unknown) => logger.warn("[soporte] platform-config falló; uso el número de legal", { error: String(err) }));
    return () => {
      vivo = false;
    };
  }, []);
  return enlaceSoporte({ negocio: branding.name, codigo, numero });
}
