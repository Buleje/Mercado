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
  type NavScope,
  type NavVisibilityMap,
} from "@/lib/nav-visibility";

export function useNavVisibility(scope: NavScope): NavVisibilityMap {
  // SSR-safe default: todos visibles. El primer effect sincroniza con real.
  const [map, setMap] = useState<NavVisibilityMap>({});

  useEffect(() => {
    const sync = () => setMap(readNavVisibility()[scope]);
    sync();
    const unsub = subscribeNavVisibility(sync);
    return unsub;
  }, [scope]);

  return map;
}
