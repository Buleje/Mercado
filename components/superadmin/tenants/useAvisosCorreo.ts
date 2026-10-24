"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { AvisosCorreoDetalle, AvisosCorreoPatch } from "@/lib/avisos-correo-tipos";

type Respuesta = { ok?: boolean; avisos?: AvisosCorreoDetalle; error?: string };

function mensajeDeError(status: number, accion: "cargar" | "guardar"): string {
  // 200 sin `avisos`: el servidor contestó pero no confirmó el estado.
  if (status === 200) return accion === "cargar" ? "El servidor no devolvió los avisos." : "El servidor no confirmó el cambio: se dejó como estaba.";
  if (status === 404) return "Los avisos por correo de esta tienda todavía no están disponibles en el servidor.";
  if (status === 401 || status === 403) return "Tu sesión de superadmin venció. Vuelve a entrar.";
  if (status === 423) return "Abre tu candado de credenciales y vuelve a intentarlo.";
  return accion === "cargar" ? `No se pudieron cargar los avisos (${status || "sin conexión"}).` : `No se guardó el cambio (${status || "sin conexión"}).`;
}

/**
 * Avisos por correo de una tienda (GET/PATCH `/api/superadmin/tenants/<slug>/avisos-correo`).
 * Cada interruptor cambia en pantalla al toque y vuelve atrás si el servidor no lo guarda.
 * `recargarCon` = cualquier valor que, al cambiar, vuelve a pedir el estado (el correo editado).
 */
export function useAvisosCorreo(slug: string, onUpdated?: () => void, recargarCon?: unknown) {
  const [avisos, setAvisos] = useState<AvisosCorreoDetalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  /** "general" o el tipo que se está guardando. */
  const [guardando, setGuardando] = useState<string | null>(null);
  // Una carga vieja no pisa a la nueva (cambio de tienda o recarga rápida).
  const pedido = useRef(0);

  const cargar = useCallback(async () => {
    const n = ++pedido.current;
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/superadmin/tenants/${encodeURIComponent(slug)}/avisos-correo`, { credentials: "include" });
      const data = (await res.json().catch(() => ({}))) as Respuesta;
      if (n !== pedido.current) return;
      if (!res.ok || !data.avisos) setError(mensajeDeError(res.status, "cargar"));
      else setAvisos(data.avisos);
    } catch {
      if (n === pedido.current) setError(mensajeDeError(0, "cargar"));
    } finally {
      if (n === pedido.current) setCargando(false);
    }
  }, [slug]);

  useEffect(() => {
    void cargar();
  }, [cargar, recargarCon]);

  const guardar = useCallback(
    async (patch: AvisosCorreoPatch, clave: string, optimista: (a: AvisosCorreoDetalle) => AvisosCorreoDetalle) => {
      if (!avisos || guardando) return;
      const antes = avisos;
      setAvisos(optimista(avisos));
      setGuardando(clave);
      setErrorGuardar(null);
      try {
        const res = await fetch(`/api/superadmin/tenants/${encodeURIComponent(slug)}/avisos-correo`, {
          method: "PATCH",
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(patch),
        });
        const data = (await res.json().catch(() => ({}))) as Respuesta;
        if (!res.ok || !data.avisos) {
          setAvisos(antes);
          setErrorGuardar(mensajeDeError(res.status, "guardar"));
          return;
        }
        setAvisos(data.avisos);
        onUpdated?.();
      } catch {
        setAvisos(antes);
        setErrorGuardar(mensajeDeError(0, "guardar"));
      } finally {
        setGuardando(null);
      }
    },
    [avisos, guardando, slug, onUpdated],
  );

  const cambiarGeneral = useCallback(
    (pausado: boolean) => guardar({ pausado }, "general", (a) => ({ ...a, pausado, activos: pausado ? 0 : a.activos })),
    [guardar],
  );

  const cambiarTipo = useCallback(
    (tipo: AvisosCorreoDetalle["tipos"][number]["tipo"], activo: boolean) =>
      guardar({ tipo, activo }, tipo, (a) => ({ ...a, tipos: a.tipos.map((x) => (x.tipo === tipo ? { ...x, activo } : x)) })),
    [guardar],
  );

  return { avisos, cargando, error, errorGuardar, guardando, recargar: cargar, cambiarGeneral, cambiarTipo };
}

export type AvisosCorreoEstadoHook = ReturnType<typeof useAvisosCorreo>;
