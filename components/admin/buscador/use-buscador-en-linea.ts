"use client";

/**
 * El buscador de la cabecera, EN LÍNEA (Brandon 20-10: «quita este modal de
 * buscar en todo el panel y solo el campo de buscar módulos ahí mismo se pueda
 * buscar sin que aparezca otro modal»): se escribe en el campo y los
 * resultados salen pegados debajo. Lo que encuentra es lo mismo que la ventana
 * de antes (`useBusquedaPanel`: comandos, módulos, recientes, productos,
 * clientes y pedidos); acá vive sólo el teclado, la selección y a dónde lleva
 * cada resultado.
 *
 *  - ↑/↓ mueven la selección, Enter abre (Ctrl/⌘+Enter, en otra pestaña).
 *  - Esc: primero cierra la lista; con la lista cerrada, borra lo escrito; con
 *    el campo vacío, suelta el foco (y en celular pliega el campo).
 *  - Ctrl/⌘+K enfoca el campo desde cualquier lado (aunque estés escribiendo
 *    en otro), salvo con una ventana encima: ahí el campo está detrás.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import { flushSync } from "react-dom";
import { destinoDelResultado } from "@/lib/admin/destino-busqueda";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { hayModalEncima } from "@/lib/keyboard-guards";
import { EVENTO_ENFOCAR_BUSCADOR } from "./enfocar-buscador";
import type { SearchResult } from "./indice-modulos";
import { useBusquedaPanel } from "./use-busqueda-panel";

export type NavegarAlModulo = (tab: string, vista?: string, sub?: string) => void;

/** La ruta de un resultado: la suya (comando, reciente) o la de su ficha o módulo. */
export function hrefDe(r: SearchResult): string | null {
  if (r.href) return r.href;
  return r.action ? null : destinoDelResultado(r)?.href ?? null;
}

/** Lo mismo que hacía `onNavigate` de la ventana: `navigateTab(tab, vista, sub)` (lo escucha el panel). */
const navegarPorEvento: NavegarAlModulo = (tab, vista, sub) => {
  window.dispatchEvent(new CustomEvent("admin:navigate", { detail: { tab, vista, sub } }));
};

export function useBuscadorEnLinea(onNavigate: NavegarAlModulo = navegarPorEvento) {
  const { query, setQuery, grouped, loading, orden } = useBusquedaPanel(true);
  /** La lista se ve (si hay 2 letras o más). */
  const [abierto, setAbierto] = useState(false);
  /** Celular: el campo está desplegado sobre la cabecera. */
  const [expandido, setExpandido] = useState(false);
  const [seleccion, setSeleccion] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const raizRef = useRef<HTMLDivElement>(null);

  const planos = useMemo(() => orden.flatMap((g) => grouped[g]), [orden, grouped]);
  const buscando = query.trim().length >= 2;
  const mostrarLista = abierto && buscando;
  /** La selección nunca apunta fuera de la lista (llegan resultados del servidor y cambia el largo). */
  const activo = planos.length === 0 ? -1 : Math.min(seleccion, planos.length - 1);

  const escribir = useCallback(
    (texto: string) => {
      setQuery(texto);
      setSeleccion(0);
      setAbierto(true);
    },
    [setQuery],
  );

  /** Terminar: vacío, cerrado, sin foco y plegado (después de elegir). */
  const soltar = useCallback(() => {
    setQuery("");
    setSeleccion(0);
    setAbierto(false);
    setExpandido(false);
    inputRef.current?.blur();
  }, [setQuery]);

  /* Desplegar y enfocar en el MISMO gesto: el celular sólo abre el teclado si
     el foco llega dentro del toque, así que el campo se dibuja antes (flushSync). */
  const enfocar = useCallback(() => {
    flushSync(() => {
      setExpandido(true);
      setAbierto(true);
    });
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const plegar = useCallback(() => {
    setAbierto(false);
    setExpandido(false);
  }, []);

  const elegir = useCallback(
    (r: SearchResult) => {
      soltar();
      if (r.action) {
        r.action();
        return;
      }
      if (r.href) {
        irAEnlace(r.href);
        if (r.evento) window.dispatchEvent(new CustomEvent(r.evento));
        return;
      }
      /* Un producto, cliente o pedido abre SU ficha si ya abre por enlace
         (sin recargar: el video de las cámaras sigue); si no, su módulo. */
      const destino = destinoDelResultado(r);
      if (!destino) return;
      if (destino.abreFicha) irAEnlace(destino.href);
      else onNavigate(destino.tab, r.vista, r.sub);
    },
    [soltar, onNavigate],
  );

  const alTeclear = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!buscando) return;
      e.preventDefault();
      if (!mostrarLista) {
        setAbierto(true);
        return;
      }
      const paso = e.key === "ArrowDown" ? 1 : -1;
      setSeleccion(Math.max(0, Math.min(activo + paso, planos.length - 1)));
      return;
    }
    if (e.key === "Enter") {
      const r = mostrarLista ? planos[activo] : undefined;
      if (!r) return;
      e.preventDefault();
      const href = hrefDe(r);
      if ((e.ctrlKey || e.metaKey) && href) {
        window.open(href, "_blank", "noopener");
        return;
      }
      elegir(r);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (mostrarLista) setAbierto(false);
      else if (query) setQuery("");
      else {
        plegar();
        inputRef.current?.blur();
      }
    }
  };

  /* El foco salió del buscador (Tab, clic en otro lado): se cierra la lista y,
     en celular, se pliega. Lo escrito queda para cuando vuelvas. */
  const alSalirDelFoco = (e: FocusEvent<HTMLDivElement>) => {
    const siguiente = e.relatedTarget as Node | null;
    if (siguiente && raizRef.current?.contains(siguiente)) return;
    /* Un toque en un resultado puede soltar el foco ANTES de su clic (Safari no
       enfoca enlaces): se espera un instante para no quitar la lista bajo el dedo. */
    window.setTimeout(() => {
      if (!raizRef.current?.contains(document.activeElement)) plegar();
    }, 150);
  };

  /* Un clic fuera (en algo que no toma el foco) también cierra. */
  useEffect(() => {
    if (!abierto && !expandido) return;
    const fuera = (e: PointerEvent) => {
      if (raizRef.current && !raizRef.current.contains(e.target as Node)) plegar();
    };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [abierto, expandido, plegar]);

  /* Ctrl/⌘+K y el pedido de los atajos del panel (`enfocarBuscadorPanel`). */
  useEffect(() => {
    const atajo = (e: globalThis.KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "k") return;
      if (hayModalEncima(raizRef.current)) return;
      e.preventDefault();
      enfocar();
    };
    /* Puede llegar desde un efecto (el puente de `AdminGlobalModals`): flushSync
       ahí no vale, así que se enfoca en la vuelta siguiente. */
    const pedido = () => {
      window.setTimeout(() => {
        if (!hayModalEncima(raizRef.current)) enfocar();
      }, 0);
    };
    window.addEventListener("keydown", atajo);
    window.addEventListener(EVENTO_ENFOCAR_BUSCADOR, pedido);
    return () => {
      window.removeEventListener("keydown", atajo);
      window.removeEventListener(EVENTO_ENFOCAR_BUSCADOR, pedido);
    };
  }, [enfocar]);

  return {
    query,
    grouped,
    orden,
    loading,
    planos,
    activo,
    mostrarLista,
    expandido,
    inputRef,
    raizRef,
    escribir,
    abrirLista: () => setAbierto(true),
    limpiar: () => escribir(""),
    enfocar,
    plegar,
    soltar,
    elegir,
    alTeclear,
    alSalirDelFoco,
    setSeleccion,
  };
}
