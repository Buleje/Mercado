"use client";

/**
 * «Probar recepción» (2026-10-05): le pide al servidor que mande a la dirección
 * pública de la cámara un aviso con el formato real de Hikvision, en modo
 * prueba (no se guarda nada), y devuelve qué llegó paso por paso.
 *
 * Una respuesta de otra cámara no se muestra en ésta: si se cambia de cámara
 * mientras viaja, se descarta.
 */

import { useCallback, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { ResultadoRecepcion } from "@/lib/camaras/recepcion";
import { API_CAMARAS } from "./camaras-ui";

export function useProbarRecepcion(camaraId: string | null) {
  const [probando, setProbando] = useState(false);
  const [resultado, setResultado] = useState<{ camaraId: string; r: ResultadoRecepcion } | null>(
    null,
  );
  const [error, setError] = useState<{ camaraId: string; texto: string } | null>(null);
  const ultima = useRef(0);

  const probar = useCallback(async () => {
    if (!camaraId) return;
    const esta = ++ultima.current;
    setProbando(true);
    setError(null);
    try {
      const r = await fetch(`${API_CAMARAS}/${encodeURIComponent(camaraId)}/recepcion`, {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders(),
      });
      const j = (await r.json().catch(() => null)) as
        | (ResultadoRecepcion & { ok?: boolean; error?: string })
        | null;
      if (esta !== ultima.current) return;
      if (!r.ok || !j) {
        const texto =
          r.status === 429
            ? "Muchas pruebas seguidas: espera 5 minutos."
            : r.status === 403
              ? "Solo admin o dueño puede probar la recepción."
              : `No se pudo probar (el servidor respondió ${r.status}).`;
        setError({ camaraId, texto });
        return;
      }
      setResultado({ camaraId, r: j });
    } catch {
      if (esta === ultima.current)
        setError({ camaraId, texto: "No se pudo probar: revisa tu conexión." });
    } finally {
      if (esta === ultima.current) setProbando(false);
    }
  }, [camaraId]);

  return {
    probar,
    probando,
    resultado: resultado && resultado.camaraId === camaraId ? resultado.r : null,
    error: error && error.camaraId === camaraId ? error.texto : null,
  };
}
