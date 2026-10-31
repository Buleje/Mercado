"use client";

/**
 * useLothChequeoCorreo — la vista previa del correo del chequeo del Libro TH
 * (`GET /api/admin/forestal/loth/chequeo/correo`): el asunto, el HTML y a qué
 * correo llega. Sólo lee: no envía ni marca nada como avisado.
 */

import { useCallback, useEffect, useState } from "react";

export interface VistaCorreoChequeo {
  asunto: string;
  html: string;
  /** Enmascarado («b•••@gmail.com»); `null` = el negocio no tiene correo. */
  destino: string | null;
  /** El celular del dueño para el WhatsApp, enmascarado («+51 9•• ••• 123»); `null` = no hay. */
  celular: string | null;
  /** ¿Hay cuenta de WhatsApp (del negocio o del servidor) para mandarlo? */
  whatsappListo: boolean;
  /** ¿Saldría mañana a las 7:00? */
  sale: boolean;
  /** Por qué no sale (falta el correo, apagado, ya avisado, nada que avisar). */
  motivo: string | null;
  avisos: number;
  nuevos: number;
  sinLeer: string[];
  hoy: string;
  /** Configuración › Datos del negocio (Avisos por correo). */
  urlAvisos: string;
}

export function useLothChequeoCorreo() {
  const [vista, setVista] = useState<VistaCorreoChequeo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async (senal?: AbortSignal) => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/forestal/loth/chequeo/correo", { credentials: "include", signal: senal });
      const d = (await res.json().catch(() => ({}))) as Partial<VistaCorreoChequeo> & { message?: string; error?: string };
      if (!res.ok) throw new Error(d.message ?? (res.status === 403 ? "Sólo el dueño o el administrador ven el correo." : `No se pudo armar el correo (HTTP ${res.status}).`));
      setVista(d as VistaCorreoChequeo);
    } catch (err) {
      if (senal?.aborted) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!senal?.aborted) setCargando(false);
    }
  }, []);

  useEffect(() => {
    const ctl = new AbortController();
    void cargar(ctl.signal);
    return () => ctl.abort();
  }, [cargar]);

  return { vista, error, cargando, recargar: () => void cargar() };
}
