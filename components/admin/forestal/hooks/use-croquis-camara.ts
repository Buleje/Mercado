"use client";

/**
 * La cámara del módulo Cámaras que corresponde a una zona de seguridad del
 * croquis (03-10). Lee la lista una vez (solo lectura, `limite=1` para no
 * traer capturas) y busca la de nombre parecido con `camaraParecida`. Sin
 * permiso, sin cámaras o sin coincidencia: `camara` null y la ficha muestra
 * solo el enlace al módulo — nunca una cámara adivinada.
 */

import { useEffect, useState } from "react";
import { logger } from "@/lib/logger";
import { camaraParecida } from "@/lib/forestal/croquis-componentes";

export interface CamaraDelModulo { id: string; nombre: string; lugar: string | null }

export function useCroquisCamara(nombreZona: string | null) {
  const [camaras, setCamaras] = useState<CamaraDelModulo[] | null>(null);

  useEffect(() => {
    if (!nombreZona || camaras) return;
    let vivo = true;
    fetch("/api/admin/camaras?limite=1", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) return [];
        const j = (await r.json().catch(() => ({}))) as { camaras?: { id?: unknown; nombre?: unknown; lugar?: unknown }[] };
        return (j.camaras ?? [])
          .filter((c) => typeof c.id === "string" && typeof c.nombre === "string")
          .map((c) => ({ id: c.id as string, nombre: c.nombre as string, lugar: typeof c.lugar === "string" ? c.lugar : null }));
      })
      .then((lista) => { if (vivo) setCamaras(lista); })
      .catch((err) => {
        logger.warn("[croquis] no se pudo leer la lista de cámaras", { error: String(err) });
        if (vivo) setCamaras([]);
      });
    return () => { vivo = false; };
  }, [nombreZona, camaras]);

  return {
    cargando: !!nombreZona && camaras == null,
    camara: nombreZona && camaras ? camaraParecida(nombreZona, camaras) : null,
    total: camaras?.length ?? 0,
  };
}
