"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EVENTO_ANEXO_GUARDADO, useAnexosEmitidos } from "@/hooks/use-anexos-emitidos";
import { anexoGuardadoDelPermiso } from "@/lib/forestal/anexo-del-permiso-guardado";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import { leerGtfDatos, type GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { datosParaSerfor, type DatoSerfor } from "@/lib/forestal/recorrido-pantalla";
import type { EstadoRecorrido } from "@/lib/forestal/recorrido-permiso";
import { logger } from "@/lib/logger";

/**
 * use-datos-para-serfor — junta lo que ya existe para llenar la GTF de salida
 * en el sistema de SERFOR (la guía se emite allá; acá sólo se copia):
 *  · el Anexo 04 guardado del bloque (por su id del paso «Anexo 04» o, si no,
 *    por contenido y permiso, igual que «Del anexo al libro»);
 *  · la última guía emitida, el mismo molde que propone «Emitir GTF» (ADR-371):
 *    destinatario, transportista y vehículo. Se marca como «de tu última guía».
 * Nada se calcula ni se inventa: lo que no está queda vacío.
 */

const URL_MOLDE = "/api/admin/forestal/ctp/guias-emitidas?ultimaCompleta=1";

export function useDatosParaSerfor(
  estado: EstadoRecorrido | null,
  piezas: readonly PiezaCubicada[],
  activo: boolean,
): { datos: DatoSerfor[]; cargando: boolean; recargar: () => void } {
  /* Se relee al guardarse un anexo (el modal del Anexo 04 avisa con el evento) y con «Volver a leer». */
  const [token, setToken] = useState(0);
  const recargar = useCallback(() => setToken((t) => t + 1), []);
  useEffect(() => {
    window.addEventListener(EVENTO_ANEXO_GUARDADO, recargar);
    return () => window.removeEventListener(EVENTO_ANEXO_GUARDADO, recargar);
  }, [recargar]);
  const { lista, cargando: leyendoAnexos } = useAnexosEmitidos(token);
  const [ultima, setUltima] = useState<GtfDatos | null>(null);
  const [leyendoMolde, setLeyendoMolde] = useState(true);

  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    fetch(URL_MOLDE, { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ ultima?: unknown }>) : null))
      .then((j) => {
        if (vivo) setUltima(j?.ultima && typeof j.ultima === "object" ? leerGtfDatos(j.ultima) : null);
      })
      .catch((err: unknown) => logger.error("[recorrido] leer la última guía falló", { error: String(err) }))
      .finally(() => {
        if (vivo) setLeyendoMolde(false);
      });
    return () => {
      vivo = false;
    };
  }, [activo]);

  const idAnexo = estado?.pasos.find((p) => p.paso === "anexo")?.ids[0] ?? null;
  const permiso = estado?.permiso ?? null;
  const anexo = useMemo(
    () => (idAnexo ? lista.find((a) => a.id === idAnexo) : undefined) ?? anexoGuardadoDelPermiso(piezas, lista, permiso),
    [idAnexo, lista, piezas, permiso],
  );

  const datos = useMemo(
    () =>
      estado
        ? datosParaSerfor({
            permiso,
            especie: estado.especie,
            producidoM3: estado.producidoM3,
            producidoPt: estado.producidoPt,
            anexo: anexo ?? null,
            ultima,
          })
        : [],
    [estado, permiso, anexo, ultima],
  );

  return { datos, cargando: leyendoMolde || (leyendoAnexos && lista.length === 0), recargar };
}
