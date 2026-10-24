import { useEffect, useState } from "react";
import { logger } from "@/lib/logger";
import type { TipoTercero } from "@/lib/documentos/terceros-vinculo";
import type { TerceroEnElSistema } from "@/lib/documentos/tercero-en-el-sistema";

export interface NombreLigado {
  clave: string;
  tipo: TipoTercero;
  nombre: string;
}

const URL_RESUMEN = "/api/admin/documents/terceros/resumen";

async function pedir<T>(carpetaId: string, clave: string, nivel: "nombre" | "todo", signal?: AbortSignal): Promise<T> {
  const q = new URLSearchParams({ clave, carpeta: carpetaId, ...(nivel === "nombre" ? { nivel } : {}) });
  const r = await fetch(`${URL_RESUMEN}?${q.toString()}`, { credentials: "include", signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}

/**
 * Los nombres no cambian mientras miras: se piden una vez por carpeta y clave
 * (el panel se vuelve a montar al girar la tableta o ensanchar). Si falla, se
 * borra para que el próximo intento vuelva a pedir.
 */
const nombres = new Map<string, Promise<NombreLigado | null>>();

function pedirNombre(carpetaId: string, clave: string): Promise<NombreLigado | null> {
  const k = `${carpetaId}|${clave}`;
  let p = nombres.get(k);
  if (!p) {
    p = pedir<NombreLigado>(carpetaId, clave, "nombre").catch((err: unknown) => {
      nombres.delete(k);
      logger.warn("[documentos.esenciales] no trajo el nombre del tercero ligado", { error: String(err) });
      return null;
    });
    nombres.set(k, p);
  }
  return p;
}

/** Los nombres de los terceros ligados a la carpeta (`null` mientras carga o si no se encontró). */
export function useNombresLigados(carpetaId: string, claves: readonly string[]): Record<string, NombreLigado | null | undefined> {
  const firma = `${carpetaId}|${claves.join(",")}`;
  const [estado, setEstado] = useState<{ firma: string; nombres: Record<string, NombreLigado | null> }>({ firma: "", nombres: {} });
  useEffect(() => {
    let vivo = true;
    const lista = firma.split("|")[1]?.split(",").filter(Boolean) ?? [];
    void Promise.all(lista.map((c) => pedirNombre(carpetaId, c).then((n) => [c, n] as const))).then((pares) => {
      if (vivo) setEstado({ firma, nombres: Object.fromEntries(pares) });
    });
    return () => {
      vivo = false;
    };
  }, [carpetaId, firma]);
  return estado.firma === firma ? estado.nombres : {};
}

/** Lo que el tercero tiene en los otros módulos: se pide al abrir el plegable (el contenido se monta al abrir). */
export function useTerceroEnElSistema(carpetaId: string, clave: string) {
  const [intento, setIntento] = useState(0);
  const firma = `${carpetaId}|${clave}|${intento}`;
  const [estado, setEstado] = useState<{ firma: string; dato: TerceroEnElSistema | null; fallo: boolean }>({ firma: "", dato: null, fallo: false });
  useEffect(() => {
    const corte = new AbortController();
    pedir<TerceroEnElSistema>(carpetaId, clave, "todo", corte.signal)
      .then((dato) => setEstado({ firma, dato, fallo: false }))
      .catch((err: unknown) => {
        if (corte.signal.aborted) return;
        logger.warn("[documentos.esenciales] no trajo lo del tercero en el sistema", { error: String(err) });
        setEstado({ firma, dato: null, fallo: true });
      });
    return () => corte.abort();
  }, [carpetaId, clave, firma]);
  const actual = estado.firma === firma;
  return {
    dato: actual ? estado.dato : null,
    cargando: !actual,
    fallo: actual && estado.fallo,
    reintentar: () => setIntento((n) => n + 1),
  };
}
