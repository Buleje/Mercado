"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { CorreosPlataformaDetalle, CorreosPlataformaPatch, TipoCorreoPlataforma } from "@/lib/avisos-correo-plataforma-tipos";

type Respuesta = Partial<CorreosPlataformaDetalle> & { ok?: boolean; error?: string };

function mensajeDeError(status: number, accion: "cargar" | "guardar"): string {
  if (status === 401 || status === 403) return "Tu sesión de superadmin venció. Vuelve a entrar.";
  return accion === "cargar" ? `No se pudieron cargar los correos (${status || "sin conexión"}).` : `No se guardó el cambio (${status || "sin conexión"}).`;
}

function comoDetalle(d: Respuesta): CorreosPlataformaDetalle | null {
  return d.ok && Array.isArray(d.tipos) ? (d as CorreosPlataformaDetalle) : null;
}

/**
 * Correos de la plataforma (GET/PATCH `/api/superadmin/avisos-correo-plataforma?correo=`).
 * `correo` vacío = el de la plataforma. Los interruptores cambian al toque y vuelven si el servidor no guarda.
 */
export function useCorreosPlataforma(correo: string) {
  const [datos, setDatos] = useState<CorreosPlataformaDetalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  const pedido = useRef(0);
  const url = `/api/superadmin/avisos-correo-plataforma${correo.trim() ? `?correo=${encodeURIComponent(correo.trim())}` : ""}`;

  const cargar = useCallback(async () => {
    const n = ++pedido.current;
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(url, { credentials: "include" });
      const json = (await res.json().catch(() => ({}))) as Respuesta;
      if (n !== pedido.current) return;
      const d = res.ok ? comoDetalle(json) : null;
      if (d) setDatos(d);
      else setError(mensajeDeError(res.status, "cargar"));
    } catch {
      if (n === pedido.current) setError(mensajeDeError(0, "cargar"));
    } finally {
      if (n === pedido.current) setCargando(false);
    }
  }, [url]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const guardar = useCallback(
    async (patch: CorreosPlataformaPatch, clave: string, optimista: (d: CorreosPlataformaDetalle) => CorreosPlataformaDetalle) => {
      if (!datos || guardando) return;
      const antes = datos;
      setDatos(optimista(datos));
      setGuardando(clave);
      setErrorGuardar(null);
      try {
        const res = await fetch(url, {
          method: "PATCH",
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(patch),
        });
        const d = res.ok ? comoDetalle((await res.json().catch(() => ({}))) as Respuesta) : null;
        if (!d) {
          setDatos(antes);
          setErrorGuardar(mensajeDeError(res.status, "guardar"));
          return;
        }
        setDatos(d);
      } catch {
        setDatos(antes);
        setErrorGuardar(mensajeDeError(0, "guardar"));
      } finally {
        setGuardando(null);
      }
    },
    [datos, guardando, url],
  );

  const cambiarGeneral = useCallback(
    (pausado: boolean) => guardar({ pausado }, "general", (d) => ({ ...d, pausado })),
    [guardar],
  );
  const cambiarTipo = useCallback(
    (tipo: TipoCorreoPlataforma, activo: boolean) =>
      guardar({ tipo, activo }, tipo, (d) => ({ ...d, tipos: d.tipos.map((x) => (x.tipo === tipo ? { ...x, activo } : x)) })),
    [guardar],
  );

  return { datos, cargando, error, errorGuardar, guardando, recargar: cargar, cambiarGeneral, cambiarTipo };
}
