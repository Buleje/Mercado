"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { AvisosCorreoDeLaTienda, AvisosCorreoPatch, TipoAvisoCorreo } from "@/lib/avisos-correo-tipos";

const URL_API = "/api/admin/avisos-correo";

type Respuesta = { ok?: boolean; avisos?: AvisosCorreoDeLaTienda; error?: string; message?: string };
export type EstadoCarga = "cargando" | "listo" | "sin-permiso" | "error";

function mensajeAlGuardar(status: number, data: Respuesta): string {
  if (status === 403) return data.message ?? "Sólo el dueño o el administrador cambia los avisos por correo.";
  if (status === 401) return "Tu sesión venció. Vuelve a entrar.";
  if (status === 429) return "Muchos cambios seguidos: espera un minuto y vuelve a intentarlo.";
  if (status === 200) return "El servidor no confirmó el cambio: se dejó como estaba.";
  return `No se guardó el cambio (${status || "sin conexión"}).`;
}

/**
 * Avisos por correo de MI negocio (GET/PATCH `/api/admin/avisos-correo`, 24-10).
 * Cada interruptor cambia en pantalla al toque y vuelve atrás si el servidor no lo
 * guarda. 401/403 al cargar = `sin-permiso` (el bloque no se dibuja).
 */
export function useAvisosCorreoTienda() {
  const [avisos, setAvisos] = useState<AvisosCorreoDeLaTienda | null>(null);
  const [estado, setEstado] = useState<EstadoCarga>("cargando");
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  /** "general" o el tipo que se está guardando. */
  const [guardando, setGuardando] = useState<string | null>(null);
  const pedido = useRef(0);

  const cargar = useCallback(async () => {
    const n = ++pedido.current;
    setEstado("cargando");
    try {
      const res = await fetch(URL_API, { credentials: "include" });
      const data = (await res.json().catch(() => ({}))) as Respuesta;
      if (n !== pedido.current) return;
      if (res.status === 401 || res.status === 403) return setEstado("sin-permiso");
      if (!res.ok || !data.avisos) return setEstado("error");
      setAvisos(data.avisos);
      setEstado("listo");
    } catch {
      if (n === pedido.current) setEstado("error");
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const guardar = useCallback(
    async (patch: AvisosCorreoPatch, clave: string, optimista: (a: AvisosCorreoDeLaTienda) => AvisosCorreoDeLaTienda) => {
      if (!avisos || guardando) return;
      const antes = avisos;
      setAvisos(optimista(avisos));
      setGuardando(clave);
      setErrorGuardar(null);
      try {
        const res = await fetch(URL_API, {
          method: "PATCH",
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(patch),
        });
        const data = (await res.json().catch(() => ({}))) as Respuesta;
        if (!res.ok || !data.avisos) {
          setAvisos(antes);
          setErrorGuardar(mensajeAlGuardar(res.status, data));
          return;
        }
        setAvisos(data.avisos);
      } catch {
        setAvisos(antes);
        setErrorGuardar(mensajeAlGuardar(0, {}));
      } finally {
        setGuardando(null);
      }
    },
    [avisos, guardando],
  );

  const cambiarGeneral = useCallback(
    (pausado: boolean) => guardar({ pausado }, "general", (a) => ({ ...a, pausado })),
    [guardar],
  );

  const cambiarTipo = useCallback(
    (tipo: TipoAvisoCorreo, activo: boolean) =>
      guardar({ tipo, activo }, tipo, (a) => ({ ...a, tipos: a.tipos.map((t) => (t.tipo === tipo ? { ...t, activo } : t)) })),
    [guardar],
  );

  return { avisos, estado, errorGuardar, guardando, recargar: cargar, cambiarGeneral, cambiarTipo };
}
