"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchSuperadmin } from "@/lib/superadmin/fetch-auth";

/** Espeja `GET /api/superadmin/totp/status`. */
export interface EstadoDosPasos {
  usuario: string;
  activo: boolean;
  desde: string | null;
  pendiente: boolean;
}

export interface Alta {
  secret: string;
  otpauthUrl: string;
}

const MENSAJES: Record<string, string> = {
  invalid_token: "Código incorrecto o vencido: usa el que muestra tu app en este momento.",
  no_secret: "Vuelve a empezar: toca «Activar 2 pasos».",
  datos_invalidos: "El código son 6 números.",
  user_not_found: "Tu usuario de superadmin no está en la base: créalo antes de activar.",
  totp_required: "Ya tienes 2 pasos activos.",
};

async function mensajeDeError(res: Response): Promise<string> {
  if (res.status === 429) return "Demasiados intentos: espera 5 minutos y vuelve a probar.";
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return (body?.error && MENSAJES[body.error]) || `No se pudo completar (HTTP ${res.status}).`;
}

export function useDosPasos() {
  const [estado, setEstado] = useState<EstadoDosPasos | null>(null);
  const [alta, setAlta] = useState<Alta | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const res = await fetchSuperadmin("/api/superadmin/totp/status");
    if (!res.ok) {
      setError(await mensajeDeError(res));
      return;
    }
    setEstado((await res.json()) as EstadoDosPasos);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** Paso 1: genera la clave y el QR. Todavía NO activa nada (eso lo hace el código). */
  const empezar = useCallback(async () => {
    setOcupado(true);
    setError(null);
    try {
      const res = await fetchSuperadmin("/api/superadmin/totp/enroll", { method: "POST" });
      if (!res.ok) {
        setError(await mensajeDeError(res));
        return;
      }
      setAlta((await res.json()) as Alta);
    } finally {
      setOcupado(false);
    }
  }, []);

  /** Paso 2: el primer código válido de la app activa los 2 pasos. */
  const confirmar = useCallback(
    async (codigo: string): Promise<boolean> => {
      setOcupado(true);
      setError(null);
      try {
        const res = await fetchSuperadmin("/api/superadmin/totp/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: codigo }),
        });
        if (!res.ok) {
          setError(await mensajeDeError(res));
          return false;
        }
        setAlta(null);
        await cargar();
        return true;
      } finally {
        setOcupado(false);
      }
    },
    [cargar],
  );

  const cancelar = useCallback(() => {
    setAlta(null);
    setError(null);
  }, []);

  return { estado, alta, ocupado, error, empezar, confirmar, cancelar };
}
