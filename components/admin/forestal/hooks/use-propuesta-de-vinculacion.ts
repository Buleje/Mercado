"use client";

/**
 * La propuesta de vinculación de una corrida, lista para mostrar.
 *
 * Junta las dos puntas: los códigos que se anotaron al cubicar ESA corrida
 * (`codigos-de-corrida`, una libreta del navegador) y el patio
 * (`/trozas/patio`), y deja que la función pura arme la propuesta.
 *
 * Si no hay códigos anotados NO pide el patio: traerse cinco mil piezas para
 * descubrir que no había nada que proponer es pagar la lectura por nada. Y si
 * la lectura falla, la pantalla lo dice y se sigue eligiendo la madera a mano —
 * una propuesta es una ayuda, no un requisito para vincular.
 *
 * Tampoco propone nada a una corrida que YA tiene materia prima atribuida: eso
 * no sería completar un origen que falta, sería cambiarle el rendimiento a un
 * asiento declarado (ADR-364), que es justo lo que `revisarVinculacion`
 * bloquea dos líneas más abajo. Ofrecer trozas ahí sería ofrecer un error.
 */

import { useEffect, useState } from "react";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import { logger } from "@/lib/logger";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { codigosRecordados } from "@/lib/forestal/codigos-de-corrida";
import { proponerVinculacion, type PropuestaVinculacion } from "@/lib/forestal/propuesta-de-vinculacion";

const API = "/api/admin/forestal/trozas/patio";

export interface EstadoPropuesta {
  propuesta: PropuestaVinculacion | null;
  cargando: boolean;
  error: string | null;
}

export function usePropuestaDeVinculacion(corrida: {
  id: string;
  especie: string | null;
  producidoM3: number;
  tieneMateriaPrima: boolean;
}): EstadoPropuesta {
  const { id, especie, producidoM3, tieneMateriaPrima } = corrida;
  const [estado, setEstado] = useState<EstadoPropuesta>({ propuesta: null, cargando: false, error: null });

  useEffect(() => {
    const codigos = tieneMateriaPrima ? [] : codigosRecordados(id);
    if (codigos.length === 0) {
      setEstado({ propuesta: null, cargando: false, error: null });
      return;
    }
    let vivo = true;
    setEstado({ propuesta: null, cargando: true, error: null });
    ctpGet<{ trozas?: TrozaConsumible[] }>(API)
      .then((r) => {
        if (!vivo) return;
        setEstado({
          propuesta: proponerVinculacion({ especie, producidoM3 }, codigos, r.trozas ?? []),
          cargando: false,
          error: null,
        });
      })
      .catch((err: unknown) => {
        logger.warn("[propuesta-vinculacion] no se pudo leer el patio", { error: String(err) });
        if (!vivo) return;
        setEstado({
          propuesta: null,
          cargando: false,
          error: "No se pudieron leer las trozas del patio para armar la propuesta.",
        });
      });
    return () => {
      vivo = false;
    };
  }, [id, especie, producidoM3, tieneMateriaPrima]);

  return estado;
}
