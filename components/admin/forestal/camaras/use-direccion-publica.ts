"use client";

/**
 * useDireccionPublica — a qué dirección tiene que mandar la cámara (ADR-456 §2).
 *
 * La pantalla armaba la dirección con `window.location.origin`: en la PC de
 * Brandon eso es `http://localhost:3000`, que una SIM 4G no alcanza nunca. La
 * dirección de verdad la da el servidor (`CAMARAS_URL_PUBLICA` o el túnel de
 * `npm run camaras:tunel`), y la del túnel cambia en cada reinicio: por eso se
 * vuelve a pedir con «Actualizar».
 *
 * Un 403 (el almacenero mira cámaras pero no las configura) no es un error de
 * la pantalla: simplemente no hay dirección que mostrarle.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  API_CAMARAS,
  direccionCopiable,
  estadoDireccion,
  type DireccionPublica,
  type EstadoDireccion,
} from "./camaras-ui";

export function useDireccionPublica() {
  const [dir, setDir] = useState<DireccionPublica | null>(null);
  const [cargando, setCargando] = useState(true);
  /* 403: quien mira no configura (almacenero). Sin dirección que dar, la
     pantalla no le avisa de un túnel que no le toca abrir. */
  const [sinPermiso, setSinPermiso] = useState(false);
  const ultima = useRef(0);

  const recargar = useCallback(async () => {
    const esta = ++ultima.current;
    setCargando(true);
    try {
      const r = await fetch(`${API_CAMARAS}/direccion`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = r.ok ? ((await r.json()) as DireccionPublica) : null;
      if (esta === ultima.current) {
        setDir(j);
        setSinPermiso(r.status === 403);
      }
    } catch {
      if (esta === ultima.current) setDir(null);
    } finally {
      if (esta === ultima.current) setCargando(false);
    }
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const estado: EstadoDireccion = useMemo(
    () => (sinPermiso ? { tipo: "pagina", base: origin } : estadoDireccion(dir, origin, cargando, process.env.NEXT_PUBLIC_BASE_URL ?? "")),
    [dir, origin, cargando, sinPermiso],
  );

  /** Lo que se copia en la cámara: siempre absoluta, el aparato no sabe de rutas. */
  const direccionParaCamara = useCallback(
    (token: string) => direccionCopiable(estado, token),
    [estado],
  );

  return { estado, recargar, direccionParaCamara };
}
