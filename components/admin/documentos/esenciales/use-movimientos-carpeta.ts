import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import type { MovimientoCarpeta } from "@/lib/documentos/movimientos-carpeta";

interface Pagina {
  movimientos: MovimientoCarpeta[];
  siguiente: string | null;
}

type Estado = { clave: string; lista: MovimientoCarpeta[]; siguiente: string | null; cargando: boolean; fallo: boolean };

async function pedirPagina(carpetaId: string, antes: string | null, signal?: AbortSignal): Promise<Pagina> {
  const qs = antes ? `?antes=${encodeURIComponent(antes)}` : "";
  const r = await fetch(`/api/admin/documents/folders/${encodeURIComponent(carpetaId)}/movimientos${qs}`, { credentials: "include", signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const cuerpo = (await r.json()) as Partial<Pagina>;
  return {
    movimientos: Array.isArray(cuerpo.movimientos) ? cuerpo.movimientos : [],
    siguiente: typeof cuerpo.siguiente === "string" ? cuerpo.siguiente : null,
  };
}

/**
 * Los movimientos de la carpeta (y sus subcarpetas) para el panel de
 * Esenciales: 20 por página, «Ver más» con el cursor que da el servidor.
 * `marca` cambia cuando cambian los papeles (subir, mover, borrar): vuelve a
 * pedir la primera página. Una respuesta de otra carpeta no pisa la vigente.
 */
export function useMovimientosCarpeta(carpetaId: string, marca: string) {
  const [intento, setIntento] = useState(0);
  const clave = `${carpetaId}:${marca}:${intento}`;
  const [estado, setEstado] = useState<Estado>({ clave, lista: [], siguiente: null, cargando: true, fallo: false });
  const [masCargando, setMasCargando] = useState(false);
  const vigente = useRef(clave);
  useEffect(() => { vigente.current = clave; }, [clave]);

  useEffect(() => {
    const corte = new AbortController();
    setEstado((e) => ({ clave, lista: e.clave.startsWith(`${carpetaId}:`) ? e.lista : [], siguiente: null, cargando: true, fallo: false }));
    pedirPagina(carpetaId, null, corte.signal)
      .then((p) => setEstado({ clave, lista: p.movimientos, siguiente: p.siguiente, cargando: false, fallo: false }))
      .catch((err: unknown) => {
        if (corte.signal.aborted) return;
        logger.warn("[documentos.esenciales] no trajo los movimientos", { error: String(err) });
        setEstado({ clave, lista: [], siguiente: null, cargando: false, fallo: true });
      });
    return () => corte.abort();
  }, [carpetaId, clave]);

  const verMas = useCallback(async () => {
    if (!estado.siguiente || masCargando) return;
    const desde = estado.clave;
    setMasCargando(true);
    try {
      const p = await pedirPagina(carpetaId, estado.siguiente);
      if (vigente.current !== desde) return;
      setEstado((e) => (e.clave === desde ? { ...e, lista: [...e.lista, ...p.movimientos], siguiente: p.siguiente } : e));
    } catch (err) {
      logger.warn("[documentos.esenciales] no trajo más movimientos", { error: String(err) });
    } finally {
      setMasCargando(false);
    }
  }, [carpetaId, estado.clave, estado.siguiente, masCargando]);

  const actual = estado.clave === clave;
  return {
    movimientos: actual || estado.clave.startsWith(`${carpetaId}:`) ? estado.lista : [],
    cargando: !actual || estado.cargando,
    fallo: actual && estado.fallo,
    hayMas: actual && !!estado.siguiente,
    masCargando,
    verMas,
    reintentar: () => setIntento((n) => n + 1),
  };
}
