import { useCallback, useEffect, useMemo, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import {
  armarTerceros, vinculosDeCarpeta,
  type NombreTercero, type TerceroVinculado, type TipoTercero, type UsoCarpeta,
} from "@/lib/documentos/terceros-vinculo";

/**
 * Datos de la pestaña «Terceros» del Archivo. Las carpetas y los papeles ya los
 * trae el Archivo (filtrados por rol y candado); acá se pide sólo lo que el
 * cliente no sabe: el NOMBRE de cada tercero (la etiqueta guarda el id) y las
 * aperturas de los últimos 90 días por carpeta («lo más usado»).
 */

const URL_TERCEROS = "/api/admin/documents/terceros";

export class ErrorTerceros extends Error {
  constructor(readonly status: number, mensaje: string) {
    super(mensaje);
  }
}

/** GET al endpoint de terceros con la sesión y el CSRF del panel. */
export async function pedirTerceros<T>(params: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const r = await fetch(`${URL_TERCEROS}${qs ? `?${qs}` : ""}`, { credentials: "include", headers: csrfHeaders() });
  let cuerpo: { error?: string } & Record<string, unknown> = {};
  try {
    cuerpo = await r.json();
  } catch (err) {
    logger.warn("[archivo.terceros] respuesta sin JSON", { status: r.status, error: String(err) });
  }
  if (!r.ok) {
    const mensaje = r.status === 403
      ? "Sólo el dueño o un administrador pueden vincular carpetas."
      : typeof cuerpo.error === "string" && cuerpo.error !== "Internal error" ? cuerpo.error : "No se pudo cargar. Prueba de nuevo.";
    throw new ErrorTerceros(r.status, mensaje);
  }
  return cuerpo as T;
}

export interface Candidato extends NombreTercero {
  tipo: TipoTercero;
  id: string;
  clave: string;
}

export const buscarCandidatos = (tipo: TipoTercero, buscar: string) =>
  pedirTerceros<{ candidatos: Candidato[] }>({ tipo, buscar }).then((r) => r.candidatos ?? []);

export const pedirNombres = () =>
  pedirTerceros<{ nombres: Record<string, NombreTercero>; uso: Record<string, UsoCarpeta> }>();

export function useTerceros(carpetas: readonly DbDocumentFolder[], docs: readonly DbDocument[]) {
  const [nombres, setNombres] = useState<Record<string, NombreTercero>>({});
  const [uso, setUso] = useState<Record<string, UsoCarpeta>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [turno, setTurno] = useState(0);

  // Se vuelve a pedir cuando cambian los vínculos (vincular/desvincular), no
  // con cada papel que entra: los nombres dependen sólo de las etiquetas.
  const firma = useMemo(
    () => [...new Set(carpetas.flatMap((c) => vinculosDeCarpeta(c)))].sort().join("|"),
    [carpetas],
  );

  useEffect(() => {
    let vivo = true;
    pedirNombres()
      .then((r) => {
        if (!vivo) return;
        setNombres(r.nombres ?? {});
        setUso(r.uso ?? {});
        setError(null);
      })
      .catch((err: unknown) => {
        if (!vivo) return;
        // Sin nombres la pestaña igual sirve: cada tercero sale «sin ficha».
        logger.warn("[archivo.terceros] no cargaron los nombres", { error: String(err) });
        setError(err instanceof Error ? err.message : "No se pudo cargar.");
      })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [firma, turno]);

  const terceros: TerceroVinculado[] = useMemo(
    () => armarTerceros({ carpetas, docs: docs.filter((d) => !d.deletedAt), nombres, uso }),
    [carpetas, docs, nombres, uso],
  );

  const recargar = useCallback(() => setTurno((n) => n + 1), []);
  return { terceros, nombres, cargando, error, recargar };
}
