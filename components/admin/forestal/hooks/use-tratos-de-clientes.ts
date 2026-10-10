"use client";

/**
 * Los tratos de precio de VARIOS clientes a la vez (ADR-430) — los dueños de
 * un lote del cubicador.
 *
 * Un lote puede mezclar la madera de dos o tres dueños (aserrío por encargo),
 * y cada pieza se cotiza con el trato de SU dueño. `useTarifasCliente` lee de
 * a uno; esto pide el mismo endpoint una vez por cliente, sólo por los que
 * todavía no se leyeron, y los guarda mientras la pantalla vive.
 *
 * Un cliente cuya respuesta no llegó cuenta como «leyendo»: así el primer
 * render —antes de que salga el pedido— no se lee como «no tiene trato».
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EVENTO_TRATOS_CLIENTE, type DetalleTratosCliente } from "@/hooks/use-tarifas-cliente";
import { logger } from "@/lib/logger";
import type { TarifaCliente } from "@/lib/forestal/precio-cliente";

const URL_BASE = "/api/admin/forestal/tarifas-cliente";
/** Tope de clientes por lote: más que esto no es un lote, es un inventario. */
const MAX_CLIENTES = 20;

interface Lectura {
  tarifas: TarifaCliente[];
  error: string | null;
}

export function useTratosDeClientes(parteIds: readonly string[], opts: { activo?: boolean } = {}) {
  const activo = opts.activo !== false;
  const clave = useMemo(
    () => [...new Set(parteIds.map((x) => x.trim()).filter(Boolean))].sort().slice(0, MAX_CLIENTES).join("|"),
    [parteIds],
  );
  const [leidos, setLeidos] = useState<Record<string, Lectura>>({});
  const enCurso = useRef(new Set<string>());
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  const leer = useCallback(async (id: string) => {
    enCurso.current.add(id);
    try {
      const r = await fetch(`${URL_BASE}?parteId=${encodeURIComponent(id)}`, { credentials: "include", cache: "no-store" });
      if (!r.ok) throw new Error(`No se pudieron leer los precios del cliente (${r.status})`);
      const j = (await r.json()) as { tarifas?: TarifaCliente[] };
      if (vivo.current) setLeidos((prev) => ({ ...prev, [id]: { tarifas: (j.tarifas ?? []).filter((t) => t.parteId === id), error: null } }));
    } catch (e) {
      logger.warn("[tratos-de-clientes] lectura fallida", { parteId: id, error: String(e) });
      if (vivo.current) setLeidos((prev) => ({ ...prev, [id]: { tarifas: [], error: e instanceof Error ? e.message : String(e) } }));
    } finally {
      enCurso.current.delete(id);
    }
  }, []);

  useEffect(() => {
    if (!activo || !clave) return;
    for (const id of clave.split("|")) {
      if (!leidos[id] && !enCurso.current.has(id)) void leer(id);
    }
  }, [activo, clave, leidos, leer]);

  const ids = useMemo(() => (clave ? clave.split("|") : []), [clave]);
  const tratos = useMemo(() => {
    const m = new Map<string, TarifaCliente[]>();
    for (const id of ids) if (leidos[id]) m.set(id, leidos[id].tarifas);
    return m;
  }, [ids, leidos]);
  const cargando = activo && ids.some((id) => !leidos[id]);
  const errores = useMemo(() => ids.filter((id) => leidos[id]?.error), [ids, leidos]);

  /** Vuelve a leer todos: después de editar un trato en la ficha. */
  const recargar = useCallback(() => setLeidos({}), []);

  /* Un trato se guardó o se quitó en la ficha con esta pantalla abierta: se
     olvida ese cliente y el efecto de arriba lo vuelve a leer. */
  useEffect(() => {
    const alCambiar = (e: Event) => {
      const id = (e as CustomEvent<DetalleTratosCliente>).detail?.parteId;
      if (!id) return;
      setLeidos((prev) => {
        if (!(id in prev)) return prev;
        const resto = { ...prev };
        delete resto[id];
        return resto;
      });
    };
    window.addEventListener(EVENTO_TRATOS_CLIENTE, alCambiar);
    return () => window.removeEventListener(EVENTO_TRATOS_CLIENTE, alCambiar);
  }, []);

  return { tratos, cargando, errores, recargar };
}
