"use client";

/**
 * use-nav-visibility — Hook reactivo para leer visibilidad de enlaces
 * configurada desde superadmin/stores → tab Navegación.
 *
 * Se resuscribe a cambios de localStorage + evento custom
 * `buleje:nav-visibility-changed` para re-render sin refresh.
 */

import { useEffect, useState } from "react";
import {
  readNavVisibility,
  subscribeNavVisibility,
  NAV_LINK_CATALOG,
  type NavScope,
  type NavVisibilityMap,
} from "@/lib/nav-visibility";

/**
 * Default determinístico SSR-safe basado en `defaultVisible` del catálogo.
 * Sin esto el hook arrancaba con `{}` y el filtro `!== false` dejaba pasar
 * TODOS los links → flash visible de "En vivo / Recetas" en modo tiendas-only
 * hasta que el effect leía localStorage.
 */
function getDefaultMap(scope: NavScope): NavVisibilityMap {
  return Object.fromEntries(
    NAV_LINK_CATALOG[scope].map((l) => [l.id, l.defaultVisible !== false]),
  );
}

export function useNavVisibility(scope: NavScope): NavVisibilityMap {
  // SSR + initial render usa los defaults del catálogo (no `{}`).
  // Tras hidratar el effect lee localStorage y aplica overrides reales.
  const [map, setMap] = useState<NavVisibilityMap>(() => getDefaultMap(scope));

  useEffect(() => {
    const sync = () => setMap(readNavVisibility()[scope]);
    sync();
    const unsub = subscribeNavVisibility(sync);
    return unsub;
  }, [scope]);

  return map;
}
