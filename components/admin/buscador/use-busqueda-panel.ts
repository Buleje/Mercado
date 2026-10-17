"use client";

/**
 * Lo que encuentra el buscador del panel (⌘K) para lo que se escribió:
 *   - comandos («Nueva venta», «Cobrar a Juan»: M04), sólo los de pestañas y
 *     vistas que este rol ve (la misma regla que la barra);
 *   - módulos, vistas y secciones, con el mismo filtro;
 *   - lugares que abriste hace poco y coinciden (M06), máx. 3;
 *   - productos, clientes y pedidos de `/api/search`.
 * Lo local sale al toque; lo remoto, 300 ms después de dejar de escribir.
 * «cobrar a Juan» busca «Juan» en el servidor: así aparece también su ficha.
 */

import { useEffect, useMemo, useState } from "react";
import { logger } from "@/lib/logger";
import { useContextoPermiso } from "@/hooks/use-vistas-permitidas";
import { useRecientes } from "@/hooks/use-recientes-panel";
import { recienteCoincide, type Reciente } from "@/lib/admin/recientes-panel";
import {
  buscarComandos,
  comandoConPersona,
  comandoPermitido,
  consultaRemota,
  destinoDeComando,
  destinoPermitido,
  esConsultaDeAccion,
  hrefDeComando,
  type ComandoPanel,
} from "@/lib/admin/comandos-panel";
import { ICONOS_COMANDO } from "./iconos-comandos";
import {
  SIN_RESULTADOS,
  etiquetaDeTab,
  searchModules,
  type GroupedResults,
  type SearchResult,
} from "./indice-modulos";

export type GrupoBusqueda = keyof GroupedResults;

const ORDEN_NORMAL: GrupoBusqueda[] = ["recientes", "modulos", "acciones", "productos", "clientes", "pedidos"];
/** «cobrar a Juan», «nueva cotización»: lo que se pide HACER va primero. */
const ORDEN_ACCION: GrupoBusqueda[] = ["acciones", "clientes", "recientes", "modulos", "productos", "pedidos"];

function resultadoDeComando(c: ComandoPanel, persona?: string): SearchResult {
  const verbo = c.accion.split(" ")[0];
  return {
    id: `accion-${c.id}${persona ? `-${persona}` : ""}`,
    type: "accion",
    title: persona ? `${verbo} a ${persona}` : c.accion,
    subtitle: destinoDeComando(c, etiquetaDeTab),
    entidad: c.entidad,
    tab: c.tab,
    href: hrefDeComando(c, persona),
    evento: c.evento,
    icono: ICONOS_COMANDO[c.icono],
  };
}

function resultadoDeReciente(r: Reciente): SearchResult {
  return {
    id: `reciente-${r.href}`,
    type: "reciente",
    title: r.titulo,
    subtitle: r.camino || "Abierto hace poco",
    entidad: r.tipo ?? undefined,
    href: r.href,
  };
}

interface RespuestaBusqueda {
  results?: SearchResult[];
}

type Remotos = Pick<GroupedResults, "productos" | "clientes" | "pedidos">;

function localesDe(
  q: string,
  ctx: ReturnType<typeof useContextoPermiso>,
  recientes: readonly Reciente[],
): Pick<GroupedResults, "acciones" | "modulos" | "recientes"> {
  const conPersona = comandoConPersona(q);
  const permitidos = buscarComandos(q, (c) => comandoPermitido(ctx, c));
  const acciones = [
    ...(conPersona && comandoPermitido(ctx, conPersona.comando) ? [resultadoDeComando(conPersona.comando, conPersona.persona)] : []),
    ...permitidos.map((c) => resultadoDeComando(c)),
  ].slice(0, 6);
  const modulos = searchModules(q, ctx ? (tab, vista, sub) => destinoPermitido(ctx, tab, vista, sub) : undefined);
  const vistos = recientes.filter((r) => recienteCoincide(r, q)).slice(0, 3).map(resultadoDeReciente);
  return { acciones, modulos, recientes: vistos };
}

export function useBusquedaPanel(open: boolean) {
  const [query, setQuery] = useState("");
  /** Lo que trajo el servidor y para qué consulta: mientras llega lo nuevo, queda lo anterior. */
  const [remotos, setRemotos] = useState<{ q: string; grupos: Remotos } | null>(null);
  const ctx = useContextoPermiso();
  const { recientes } = useRecientes();
  const q = query.trim();

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setRemotos(null);
  }, [open]);

  /* Lo local se calcula al dibujar, no en un efecto con setState: el contexto
     de permisos puede cambiar de identidad en cada render y un efecto que
     dependiera de él se realimentaba («Maximum update depth», 17-10). */
  const locales = useMemo(() => (q.length < 2 ? null : localesDe(q, ctx, recientes)), [q, ctx, recientes]);

  useEffect(() => {
    if (q.length < 2) {
      setRemotos(null);
      return;
    }
    let vigente = true;
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(consultaRemota(q))}`)
        .then((r) => (r.ok ? (r.json() as Promise<RespuestaBusqueda>) : { results: [] }))
        .catch((err: unknown) => {
          logger.warn("[buscador] /api/search falló", { error: String(err) });
          return { results: [] } as RespuestaBusqueda;
        })
        .then((res) => {
          /* Una respuesta vieja no pisa a la nueva. */
          if (!vigente) return;
          const lista = res.results ?? [];
          const de = (tipo: SearchResult["type"]) => lista.filter((r) => r.type === tipo).slice(0, 5);
          setRemotos({ q, grupos: { productos: de("producto"), clientes: de("cliente"), pedidos: de("pedido") } });
        });
    }, 300);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [q]);

  const grouped: GroupedResults = locales ? { ...SIN_RESULTADOS, ...remotos?.grupos, ...locales } : SIN_RESULTADOS;
  const loading = locales !== null && remotos?.q !== q;
  const orden = esConsultaDeAccion(query) ? ORDEN_ACCION : ORDEN_NORMAL;
  return { query, setQuery, grouped, loading, orden };
}
