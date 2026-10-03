"use client";

/**
 * use-anexo-al-libro — el estado del Anexo 04 guardado de UN permiso de la
 * Distribución (Fase 5): sin guardar → guardado (sin pasar al libro) → en el
 * libro (despacho #N, GTF X).
 *
 *  · El anexo se halla por contenido (`anexoGuardadoDelPermiso`): sus medidas
 *    son las que la Distribución arma hoy para ese permiso.
 *  · Si ya tiene despachos atados se pregunta al servidor (`?anexoId=`), que
 *    mira cuáles siguen vivos: uno anulado vuelve a «sin pasar al libro».
 *  · Lo que se guarda en el modal del Anexo 04 llega solo: ese guardado avisa
 *    con `EVENTO_ANEXO_GUARDADO` y la bandeja se relee (sin sondear), y también
 *    al volver a la pestaña. `recargar()` lo hace a pedido.
 *
 * Los m³ y los números salen del servidor; acá no se calcula nada.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMiRol } from "@/hooks/use-mi-rol";
import { EVENTO_ANEXO_GUARDADO, useAnexosEmitidos } from "@/hooks/use-anexos-emitidos";
import { anexoGuardadoDelPermiso } from "@/lib/forestal/anexo-del-permiso-guardado";
import type { AnexoEmitido } from "@/lib/forestal/anexo04-registro";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import type { RespuestaAnexo } from "@/lib/db/forest-ctp-guia-desde-anexo.db";

const URL_A_DESPACHO = "/api/admin/forestal/anexos/a-despacho";

export type EstadoAnexoDelPermiso =
  | { tipo: "cargando" }
  | { tipo: "sin_guardar" }
  | { tipo: "guardado"; anexo: AnexoEmitido; sinGuia: boolean }
  | { tipo: "reemplazado"; anexo: AnexoEmitido }
  | { tipo: "en_libro"; anexo: AnexoEmitido; lineas: number[] | null };

/** Quiénes pasan un anexo al libro: lo mismo que exige la ruta (ADR-437). */
export const puedePasarAlLibro = (rol: string | null): boolean => rol === "admin" || rol === "owner";

export function useAnexoAlLibro(piezas: readonly PiezaCubicada[]) {
  const [token, setToken] = useState(0);
  const { lista, cargando } = useAnexosEmitidos(token);
  const rol = useMiRol();
  const recargar = useCallback(() => setToken((t) => t + 1), []);

  const anexo = useMemo(() => anexoGuardadoDelPermiso(piezas, lista), [piezas, lista]);
  const conDespachos = (anexo?.despachoIds?.length ?? 0) > 0;
  const idAnexo = anexo?.id ?? null;

  /* El estado real del libro de ese anexo (sólo admin y dueño pueden preguntarlo). */
  const [libro, setLibro] = useState<{ id: string; r: RespuestaAnexo | null } | null>(null);
  useEffect(() => {
    if (!idAnexo || !conDespachos || !puedePasarAlLibro(rol)) return;
    let vivo = true;
    fetch(`${URL_A_DESPACHO}?anexoId=${encodeURIComponent(idAnexo)}`, { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<RespuestaAnexo>) : null))
      .then((r) => { if (vivo) setLibro({ id: idAnexo, r }); })
      /* Sin respuesta se cree a la bandeja: «en el libro», sin el N° de línea. */
      .catch(() => { if (vivo) setLibro({ id: idAnexo, r: null }); });
    return () => { vivo = false; };
  }, [idAnexo, conDespachos, rol, token]);

  /* Lo que se guarda en el modal del Anexo 04 llega por el evento; al volver a
     la pestaña también se relee (pudo pasarse al libro desde otra). */
  useEffect(() => {
    const alVolver = () => { if (document.visibilityState === "visible") recargar(); };
    window.addEventListener(EVENTO_ANEXO_GUARDADO, recargar);
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      window.removeEventListener(EVENTO_ANEXO_GUARDADO, recargar);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [recargar]);

  const estado = useMemo<EstadoAnexoDelPermiso>(() => {
    if (cargando && lista.length === 0) return { tipo: "cargando" };
    if (!anexo) return { tipo: "sin_guardar" };
    if (anexo.reemplazadoPor && !conDespachos) return { tipo: "reemplazado", anexo };
    if (conDespachos) {
      if (rol === null) return { tipo: "cargando" };
      if (!puedePasarAlLibro(rol)) return { tipo: "en_libro", anexo, lineas: null };
      if (libro?.id !== anexo.id) return { tipo: "cargando" };
      if (libro.r === null) return { tipo: "en_libro", anexo, lineas: null };
      if (libro.r.estado === "registrado") return { tipo: "en_libro", anexo, lineas: libro.r.despachos.map((d) => d.lineNo) };
    }
    return { tipo: "guardado", anexo, sinGuia: !anexo.gtf?.trim() };
  }, [cargando, lista.length, anexo, conDespachos, libro, rol]);

  return { estado, rol, puedePasar: puedePasarAlLibro(rol), recargar };
}
