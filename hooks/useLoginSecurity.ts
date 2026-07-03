"use client";

import { useState, useEffect, useCallback, type KeyboardEvent } from "react";

/**
 * useLoginSecurity — UX de seguridad compartida por los logins (admin, superadmin,
 * delivery): aviso de Bloq Mayús, cuenta regresiva ante 429 (rate limit/lockout,
 * donde recargar NO ayuda) y mensajes de error honestos por status HTTP en vez
 * del engañoso "contraseña incorrecta" para todo.
 */
export function useLoginSecurity() {
  const [capsLock, setCapsLock] = useState(false);
  const [retryAfter, setRetryAfter] = useState(0);

  // Tick del countdown del bloqueo.
  useEffect(() => {
    if (retryAfter <= 0) return;
    const t = setInterval(() => setRetryAfter((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [retryAfter]);

  /** Handler onKeyDown/onKeyUp del input de contraseña. */
  const onPasswordKey = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === "function") {
      setCapsLock(e.getModifierState("CapsLock"));
    }
  }, []);

  /** Arranca la cuenta regresiva desde el header `Retry-After` de un 429. */
  const startRetryFromResponse = useCallback((res: Response) => {
    setRetryAfter(Number(res.headers.get("Retry-After")) || 60);
  }, []);

  /**
   * Mensaje honesto según el status. Devuelve `null` para 429 → el caller debe
   * mostrar el countdown (no un texto estático).
   */
  const messageForStatus = useCallback(
    (status: number): string | null => {
      if (status === 429) return null;
      if (status === 400) return "Completá tu usuario y contraseña.";
      if (status === 401 || status === 403) {
        return capsLock
          ? "Usuario o contraseña incorrectos. Ojo: Bloq Mayús está activado."
          : "Usuario o contraseña incorrectos.";
      }
      if (status >= 500) return "El servidor tuvo un problema. Reintentá en unos segundos.";
      return "No se pudo iniciar sesión.";
    },
    [capsLock],
  );

  /** Mensaje para errores de red (fetch rechazado): distingue offline. */
  const networkErrorMessage = useCallback(
    () =>
      typeof navigator !== "undefined" && !navigator.onLine
        ? "Sin conexión. Revisá tu internet e intentá de nuevo."
        : "No se pudo conectar con el servidor. Reintentá.",
    [],
  );

  /** Formatea segundos → "m:ss". */
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return {
    capsLock,
    retryAfter,
    onPasswordKey,
    startRetryFromResponse,
    messageForStatus,
    networkErrorMessage,
    mmss,
  };
}
