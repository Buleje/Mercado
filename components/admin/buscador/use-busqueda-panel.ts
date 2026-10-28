"use client";

/**
 * Lo que encuentra el buscador del panel (⌘K) para lo que se escribió:
 *   - comandos («Nueva venta», «Cobrar a Juan»: M04), sólo los de pestañas y
 *     vistas que este rol ve (la misma regla que la barra);
 *   - módulos, vistas y secciones, con el mismo filtro;
 *   - lugares que abriste hace poco y coinciden (M06), máx. 3;
 *   - de `/api/search`: la bodega (productos, clientes, pedidos, proveedores),
 *     el aserradero (guías, Anexos 04, trozas, permisos, lotes, Directorio) y
 *     el personal; el servidor ya recorta por rol y acá se descarta lo que
 *     lleva a una pestaña que este negocio no muestra;
 *   - papeles del Archivo (`use-papeles-del-archivo`), sólo si este rol ve el Archivo.
 * Lo local sale al toque; lo remoto, 300 ms después de dejar de escribir.
 * «cobrar a Juan» busca «Juan» en el servidor: así aparece también su ficha.
 */

import { useEffect, useMemo, useState } from "react";
import { logger } from "@/lib/logger";
import { useContextoPermiso } from "@/hooks/use-vistas-permitidas";
import { useRecientes } from "@/hooks/use-recientes-panel";
import { entradaDeUrl, recienteCoincide, type Reciente } from "@/lib/admin/recientes-panel";
import { leerContadorDeUso } from "@/hooks/use-uso-de-pestanas";
import { inicioDelBuscador, type MasUsada } from "@/lib/admin/mas-usadas";
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
import { GRUPO_DEL_TIPO, type GrupoRemoto, type TipoRemoto } from "@/lib/admin/busqueda-remota";
import { ICONOS_COMANDO } from "./iconos-comandos";
import { usePapelesDelArchivo } from "./use-papeles-del-archivo";
import {
  MODULE_INDEX,
  SIN_RESULTADOS,
  etiquetaDeTab,
  nivelDeNombre,
  searchModules,
  type GroupedResults,
  type SearchResult,
} from "./indice-modulos";

export type GrupoBusqueda = keyof GroupedResults;

/** Regla 20-10: nombre que coincide → acciones → lo abierto hace poco → el resto. */
const ORDEN_NORMAL: GrupoBusqueda[] = [
  "modulos", "acciones", "recientes", "guias", "anexos", "permisos", "trozas", "lotes", "trabajadores", "partes",
  "papeles", "relacionados", "productos", "clientes", "pedidos", "proveedores",
];
/** «cobrar a Juan», «nueva cotización»: lo que se pide HACER va primero. */
const ORDEN_ACCION: GrupoBusqueda[] = [
  "acciones", "clientes", "trabajadores", "recientes", "papeles", "modulos", "relacionados", "productos", "pedidos", "proveedores",
  "guias", "anexos", "permisos", "trozas", "lotes", "partes",
];

/** Campo vacío. */
const ORDEN_INICIO: GrupoBusqueda[] = ["masUsadas", "recientes"];

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

type Remotos = Pick<GroupedResults, GrupoRemoto>;

const GRUPOS_REMOTOS = [...new Set(Object.values(GRUPO_DEL_TIPO))];

/**
 * Los resultados del servidor por grupo (hasta 5 + la fila de apoyo). Un
 * resultado con `href` a una pestaña que este negocio no muestra (plan,
 * plantilla, especialidad) no se ofrece: llevaría a una pestaña vacía.
 */
function agruparRemotos(lista: readonly SearchResult[], ctx: ReturnType<typeof useContextoPermiso>): Remotos {
  const grupos = Object.fromEntries(GRUPOS_REMOTOS.map((g) => [g, [] as SearchResult[]])) as unknown as Remotos;
  for (const r of lista) {
    const g = GRUPO_DEL_TIPO[r.type as TipoRemoto];
    if (!g || !visibleEnElPanel(r, ctx)) continue;
    if (grupos[g].filter((x) => !x.sinContar).length < 5 || r.sinContar) grupos[g].push(r);
  }
  /* Una fila de apoyo («Ver la asistencia») sola, sin resultados, no se ofrece. */
  for (const g of GRUPOS_REMOTOS) if (grupos[g].every((x) => x.sinContar)) grupos[g] = [];
  return grupos;
}

function visibleEnElPanel(r: SearchResult, ctx: ReturnType<typeof useContextoPermiso>): boolean {
  if (!ctx || !r.href) return true;
  const p = new URL(r.href, "http://panel.local").searchParams;
  const tab = p.get("tab");
  return !tab || destinoPermitido(ctx, tab, p.get("vista") ?? undefined, p.get("sub") ?? undefined);
}

/** ¿Este rol ve el Archivo? Sin ctx confirmado, no (nada se pide a ciegas). Un boolean: el ctx cambia de identidad. */
function veElArchivo(ctx: ReturnType<typeof useContextoPermiso>): boolean {
  return !!ctx && destinoPermitido(ctx, "documentos", "drive");
}

function localesDe(
  q: string,
  ctx: ReturnType<typeof useContextoPermiso>,
  recientes: readonly Reciente[],
): Pick<GroupedResults, "acciones" | "modulos" | "recientes" | "relacionados"> {
  const conPersona = comandoConPersona(q);
  const permitidos = buscarComandos(q, (c) => comandoPermitido(ctx, c));
  const acciones = [
    ...(conPersona && comandoPermitido(ctx, conPersona.comando) ? [resultadoDeComando(conPersona.comando, conPersona.persona)] : []),
    ...permitidos.map((c) => resultadoDeComando(c)),
  ].slice(0, 6);
  const todos = searchModules(q, ctx ? (tab, vista, sub) => destinoPermitido(ctx, tab, vista, sub) : undefined);
  const modulos = todos.filter((m) => nivelDeNombre(m.title, q) > 0).slice(0, 5);
  const relacionados = todos.filter((m) => nivelDeNombre(m.title, q) === 0).slice(0, 3);
  const vistos = recientes.filter((r) => recienteCoincide(r, q)).slice(0, 3).map(resultadoDeReciente);
  return { acciones, modulos, relacionados, recientes: vistos };
}

/** Con el campo vacío: «Más usadas» y los recientes que no salieron arriba (Brandon 24-10). */
function inicioDe(ctx: ReturnType<typeof useContextoPermiso>, recientes: readonly Reciente[]): Pick<GroupedResults, "masUsadas" | "recientes"> {
  if (!ctx || typeof window === "undefined") return { masUsadas: [], recientes: [] };
  const aca = entradaDeUrl(window.location.pathname + window.location.search, etiquetaDeTab)?.href ?? null;
  const permitido = (href: string) => {
    const q = new URL(href, window.location.origin).searchParams;
    const tab = q.get("tab");
    return tab ? destinoPermitido(ctx, tab, q.get("vista") ?? undefined) : true;
  };
  const { usadas, recientes: vistos } = inicioDelBuscador(leerContadorDeUso(), recientes, etiquetaDeTab, aca, permitido);
  const deUsada = (m: MasUsada): SearchResult => ({
    id: `usada-${m.href}`,
    type: "modulo",
    title: m.titulo,
    subtitle: m.camino || "Módulo",
    href: m.href,
    icono: MODULE_INDEX.find((x) => x.tab === m.tab)?.icon,
  });
  return { masUsadas: usadas.map(deUsada), recientes: vistos.map(resultadoDeReciente) };
}

export function useBusquedaPanel(open: boolean) {
  const [query, setQuery] = useState("");
  /** Lo que trajo el servidor y para qué consulta: mientras llega lo nuevo, queda lo anterior. */
  const [remotos, setRemotos] = useState<{ q: string; lista: SearchResult[] } | null>(null);
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

  /* Campo vacío: se lee al volver a vaciarse o al cambiar los recientes (el contador vive en el navegador). */
  const vacio = query === "";
  const inicio = useMemo(() => (vacio ? inicioDe(ctx, recientes) : null), [vacio, ctx, recientes]);

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
          setRemotos({ q, lista: res.results ?? [] });
        });
    }, 300);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [q]);

  /* Se agrupa al dibujar: el contexto de permisos puede llegar después que la respuesta. */
  const gruposRemotos = useMemo(() => (remotos ? agruparRemotos(remotos.lista, ctx) : null), [remotos, ctx]);

  const archivoVisible = veElArchivo(ctx);
  const papeles = usePapelesDelArchivo(q, archivoVisible);
  /* Mientras llegan los nuevos quedan los anteriores (como los remotos), sin el «Buscar … en el Archivo»: ése lleva lo escrito. */
  const filasDePapeles = papeles ? (papeles.q === q ? papeles.filas : papeles.filas.filter((f) => !f.sinContar)) : [];

  const grouped: GroupedResults = locales
    ? { ...SIN_RESULTADOS, ...gruposRemotos, ...locales, papeles: filasDePapeles }
    : inicio
      ? { ...SIN_RESULTADOS, ...inicio }
      : SIN_RESULTADOS;
  const loading = locales !== null && (remotos?.q !== q || (archivoVisible && papeles?.q !== q));
  const orden = vacio ? ORDEN_INICIO : esConsultaDeAccion(query) ? ORDEN_ACCION : ORDEN_NORMAL;
  return { query, setQuery, grouped, loading, orden };
}
