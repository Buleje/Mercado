"use client";

/**
 * app/admin/_hooks/useAdminTabs.ts
 *
 * Hook que centraliza el estado de la tab activa del panel admin.
 * Extraído de app/admin/page.tsx (Paso 4 del refactor — ver
 * docs/refactor-giant-files-plan.md).
 *
 * Estado y lógica:
 *  - `tab`            → tab activa (tipo `Tab`)
 *  - `setTab`         → setter directo (uso interno o de tests)
 *  - `navigateTab`    → setter "público": actualiza URL (?tab=&hash) +
 *                       persiste en localStorage + registra en `addRecent`
 *
 * Inicialización (en orden de prioridad):
 *  1. Query string `?tab=...`
 *  2. Hash `#...`
 *  3. localStorage `admin_active_tab`
 *  4. Default `"vendor-dashboard"`
 *
 * En todos los casos pasa por `resolverDestino` (ADR-490,
 * `lib/admin/destino-tab.ts`): par con vista → alias → pestaña conocida, el
 * MISMO orden para la URL, el hash, `admin_active_tab` y `navigateTab` (antes
 * la URL migraba primero y `navigateTab` validaba primero). Un alias reescribe
 * la URL a `?tab=<destino>&vista=<vista>` con `replaceState` y conserva el
 * resto de los parámetros (`?lote=`, `?cliente=`…); un id que no existe avisa
 * con `logger.warn` y cae en Inicio.
 *
 * Uso:
 * ```tsx
 * const { addRecent } = useFavoritesAndRecent();
 * const { tab, setTab, navigateTab } = useAdminTabs(addRecent);
 * ```
 */

import { useCallback, useEffect, useState } from "react";
import type { Tab } from "../_lib/tabs.types";
import { useTabFrequency } from "./useTabFrequency";
import { PARAMS_DE_VISTA } from "@/hooks/use-vista-modulo";
import { destinoDeUrl, resolverDestino, urlConDestino } from "@/lib/admin/destino-tab";
import { logger } from "@/lib/logger";

export interface UseAdminTabsResult {
  tab: Tab;
  setTab: (id: Tab) => void;
  /** `vista` = sub-vista del módulo destino; `sub` = la del módulo ANIDADO
   *  adentro (Contratos dentro de Documentos, el drive y sus modos). Las usa el
   *  buscador para aterrizar en el destino exacto, no en la puerta del módulo. */
  navigateTab: (id: Tab, vista?: string, sub?: string) => void;
  topTabs: (n: number) => string[];
}

const INICIO: Tab = "vendor-dashboard";

/** Un id roto en un aviso se abre muchas veces: se avisa una vez por id y por carga. */
const yaAvisados = new Set<string>();
function avisarDesconocido(id: string, fuente: string): void {
  if (yaAvisados.has(id)) return;
  yaAvisados.add(id);
  logger.warn("[admin] pestaña que no existe: cae en Inicio", { id, fuente });
}

/**
 * `history.state` sin lo de Next: con `__NA` adentro, el `replaceState`
 * parcheado de Next 16 no sincroniza `useSearchParams` (memoria
 * `historial-marca-y-navigation-api`); las marcas propias (`bsmFichaDesde`)
 * se conservan.
 */
const CLAVES_DE_NEXT = new Set(["__NA", "__PRIVATE_NEXTJS_INTERNALS_TREE", "_N"]);
function estadoPropio(): Record<string, unknown> | null {
  const estado: unknown = window.history.state;
  if (!estado || typeof estado !== "object") return null;
  const propias = Object.entries(estado).filter(([clave]) => !CLAVES_DE_NEXT.has(clave));
  return propias.length > 0 ? Object.fromEntries(propias) : null;
}

interface TabResuelto {
  tab: Tab;
  /** URL corregida (el pedido era un alias), o `null` si no hay que tocarla. */
  url: string | null;
}

/**
 * El tab que dicta la URL (query o hash), o `null` si la URL no dice nada.
 *
 * Vive aparte de `resolveInitialTab` porque el historial NO puede caer a
 * localStorage: al volver atrás a Inicio (URL sin `?tab=`), el "último tab
 * guardado" es justamente el módulo que se está dejando, y el atrás no hacía
 * nada visible.
 */
function tabDesdeUrl(): TabResuelto | null {
  if (typeof window === "undefined") return null;
  const leido = destinoDeUrl(window.location.href);
  if (!leido) return null;
  if (leido.destino) return { tab: leido.destino.tab, url: leido.url };
  // Un ?tab explícito que no existe va a Inicio, NO al último tab guardado:
  // caer en localStorage abría "cualquier cosa" según la sesión anterior, y
  // el mismo link llevaba a cada persona a un lugar distinto.
  avisarDesconocido(leido.crudo, leido.fuente === "query" ? "?tab=" : "#");
  return { tab: INICIO, url: null };
}

function resolveInitialTab(): TabResuelto {
  if (typeof window === "undefined") return { tab: INICIO, url: null };

  const deLaUrl = tabDesdeUrl();
  if (deLaUrl) return deLaUrl;

  // 3. localStorage — "retomar último tab". Brandon 2026-05-28: SOLO en
  // desktop. En mobile, abrir `/admin` directo (sin ?tab ni #hash) debe llevar
  // SIEMPRE a Inicio (vendor-dashboard) — el dueño quiere ver caja/pedidos/
  // alertas primero, no el último módulo donde quedó (ej. Chat IA). Los deep
  // links (?tab=) y el hash siguen respetándose arriba.
  const isMobile = window.innerWidth < 768;
  if (!isMobile) {
    try {
      const saved = localStorage.getItem("admin_active_tab");
      if (saved) {
        const destino = resolverDestino(saved);
        // Guardado antes de que su pestaña pasara a ser una vista: la vista
        // tiene que llegar a la URL para que el módulo la abra.
        if (destino) return { tab: destino.tab, url: destino.vista ? urlConDestino(window.location.href, destino, saved) : null };
        avisarDesconocido(saved, "admin_active_tab");
      }
    } catch {
      // localStorage no disponible (modo privado, SSR, etc.)
    }
  }

  return { tab: INICIO, url: null };
}

/**
 * Al abrir un alias, el destino se escribe en la URL ANTES de que el módulo
 * se dibuje (así su `useVistaModulo` lee la vista que trae el alias), y una
 * vuelta después se reafirma: Next 16 reescribe la entrada inicial con SU url
 * (la del alias) en el primer commit y recién después parchea `history`.
 */
let reafirmarAlMontar = false;

function escribirAlDibujar(url: string): void {
  try {
    // `history.state` tal cual: durante el render, el parche de Next no debe
    // despachar nada (con `__NA` adentro lo deja pasar sin tocar su router).
    window.history.replaceState(window.history.state, "", url);
    reafirmarAlMontar = true;
  } catch {
    // history no disponible — el tab igual se abre
  }
}

function resolverAlMontar(): Tab {
  const inicial = resolveInitialTab();
  if (inicial.url) escribirAlDibujar(inicial.url);
  return inicial.tab;
}

export function useAdminTabs(addRecent: (id: Tab) => void): UseAdminTabsResult {
  const [tab, setTab] = useState<Tab>(resolverAlMontar);
  const { trackTab, getTopTabs } = useTabFrequency();

  useEffect(() => {
    if (!reafirmarAlMontar) return;
    const t = window.setTimeout(() => {
      reafirmarAlMontar = false;
      try {
        // `replaceState` con estado propio: ya con el parche de Next puesto,
        // sincroniza `useSearchParams` con la URL corregida.
        window.history.replaceState(estadoPropio(), "", destinoDeUrl(window.location.href)?.url ?? window.location.href);
      } catch {
        // history no disponible
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  const navigateTab = useCallback(
    (pedido: Tab, vistaPedida?: string, subPedido?: string) => {
      // El mismo alias que resuelve la URL al cargar (`inicio` → Inicio). Sin
      // esto, navegar a un id viejo dejaba el panel en blanco: el router no
      // tiene rama para él (08-10, candado de `a-medida` → «inicio»). Un id que
      // no existe ya no deja el panel en blanco: avisa y va a Inicio.
      let destino = resolverDestino(pedido, vistaPedida);
      if (!destino) {
        avisarDesconocido(pedido, "navigateTab");
        destino = { tab: INICIO };
      }
      const id = destino.tab;
      const vista = destino.vista;
      // El `sub` pedido es de la vista pedida: si el alias cambió la vista, no aplica.
      const sub = vista === (vistaPedida || undefined) ? (destino.sub ?? subPedido) : destino.sub;
      setTab(id);
      try {
        localStorage.setItem("admin_active_tab", id);
      } catch {
        // localStorage no disponible — ignorar
      }
      // Persiste en URL hash + search param para deep-linking y reload.
      try {
        const url = new URL(window.location.href);
        const enUrl = url.searchParams.get("tab");
        // Comparar módulos, no ids: `?tab=inicio` YA es Inicio.
        const tabActual = enUrl ? (resolverDestino(enUrl)?.tab ?? enUrl) : null;
        url.searchParams.set("tab", id);
        // La sub-vista pertenece al módulo que se está dejando: si viaja, el
        // módulo nuevo recibe un `?vista=` que no es suyo (ver useVistaModulo).
        // Salvo que el destino traiga la suya —el buscador manda a una vista
        // concreta— en cuyo caso esa gana.
        //
        // Se limpian TODOS los niveles, no sólo `vista`: un `?sub=` del módulo
        // anidado que quedara huérfano sobreviviría al salto y le impondría una
        // vista al que viene.
        if (tabActual !== id) for (const p of PARAMS_DE_VISTA) url.searchParams.delete(p);
        if (vista) url.searchParams.set("vista", vista);
        if (sub) url.searchParams.set("sub", sub);
        url.hash = id;
        /**
         * `pushState` y no `replaceState`: con replace, saltar de módulo NUNCA
         * dejaba entrada en el historial, así que el botón «atrás» del
         * navegador (y el gesto del trackpad, y Alt+←) se saltaba el panel
         * entero y salía al sitio anterior. En un panel de 133 módulos, volver
         * a donde estabas es de las cosas que más se hacen.
         *
         * Si es el MISMO tab se reemplaza: hacer click en el módulo en el que
         * ya estás no debe llenar el historial de entradas iguales.
         */
        if (tabActual === id) {
          window.history.replaceState(null, "", url.toString());
        } else {
          window.history.pushState(null, "", url.toString());
        }
      } catch {
        // window.history no disponible — ignorar
      }
      addRecent(id);
      trackTab(id);
    },
    [addRecent, trackTab],
  );

  /**
   * Atrás/adelante del navegador → sincronizar el tab con la URL.
   *
   * Sin esto, `pushState` sería peor que el estado anterior: la URL cambiaría
   * al ir atrás pero la pantalla seguiría mostrando el módulo viejo. `popstate`
   * sólo dispara en navegaciones del historial, no en las nuestras.
   *
   * Resuelve SÓLO desde la URL, nunca desde localStorage: `admin_active_tab`
   * guarda el último módulo visitado, así que volver a una entrada sin `?tab=`
   * (Inicio) reabría justo el módulo del que venías. El historial manda.
   */
  useEffect(() => {
    const onPop = () => {
      const deLaUrl = tabDesdeUrl();
      // `irAEnlace` escribe el `?tab=` del enlace tal cual: si era un alias,
      // la entrada queda con el id de hoy y su vista.
      if (deLaUrl?.url) {
        try {
          window.history.replaceState(estadoPropio(), "", deLaUrl.url);
        } catch {
          // history no disponible
        }
      }
      setTab(deLaUrl?.tab ?? INICIO);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return { tab, setTab, navigateTab, topTabs: getTopTabs };
}
