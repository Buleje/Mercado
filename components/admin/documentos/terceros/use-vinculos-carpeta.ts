import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";

/**
 * Lo que «Vínculos con el sistema…» pide al servidor de UNA carpeta: desde
 * cuándo y quién ligó cada tercero, sus alias y si el rol puede cambiarlos.
 * Ligar y quitar no pasan por acá (son etiquetas: `folders/bulk`).
 */

const URL_VINCULOS = "/api/admin/documents/vinculos";

export interface DatosVinculos {
  registro: Record<string, { desde: string; por: string }>;
  alias: Record<string, string>;
  puedeEditar: boolean;
}

/** `firma` = las etiquetas de la carpeta: si cambian (ligar, quitar), se vuelve a pedir. */
export function useVinculosCarpeta(carpetaId: string, firma: string) {
  const [estado, setEstado] = useState<{ clave: string; dato: DatosVinculos | null; fallo: boolean }>({ clave: "", dato: null, fallo: false });
  const [intento, setIntento] = useState(0);
  const clave = `${carpetaId}|${firma}|${intento}`;

  useEffect(() => {
    const corte = new AbortController();
    fetch(`${URL_VINCULOS}?${new URLSearchParams({ carpeta: carpetaId }).toString()}`, { credentials: "include", signal: corte.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const dato = (await r.json()) as DatosVinculos;
        setEstado({ clave, dato, fallo: false });
      })
      .catch((err: unknown) => {
        if (corte.signal.aborted) return;
        logger.warn("[archivo.vinculos] no cargó el registro", { error: String(err) });
        setEstado({ clave, dato: null, fallo: true });
      });
    return () => corte.abort();
  }, [carpetaId, clave]);

  /** Pone (o quita con null) el alias. Devuelve lo que quedó guardado. */
  const ponerAlias = useCallback(async (claveVinculo: string, alias: string | null): Promise<string | null> => {
    const r = await fetch(URL_VINCULOS, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...csrfHeaders() },
      body: JSON.stringify({ clave: claveVinculo, alias }),
    });
    if (!r.ok) throw new Error(r.status === 403 ? "Tu rol no puede cambiar el nombre." : "No se pudo guardar el nombre. Prueba de nuevo.");
    const cuerpo = (await r.json()) as { alias: string | null };
    setEstado((e) => {
      if (!e.dato) return e;
      const resto = { ...e.dato.alias };
      if (cuerpo.alias) resto[claveVinculo] = cuerpo.alias;
      else delete resto[claveVinculo];
      return { ...e, dato: { ...e.dato, alias: resto } };
    });
    return cuerpo.alias;
  }, []);

  const actual = estado.clave === clave;
  // Tras ligar o quitar se relee SIN esqueleto: lo de antes queda a la vista hasta que llega lo nuevo.
  const mismaCarpeta = estado.clave.startsWith(`${carpetaId}|`);
  const dato = actual || mismaCarpeta ? estado.dato : null;
  return {
    dato,
    cargando: !actual && !dato,
    fallo: actual && estado.fallo,
    reintentar: () => setIntento((n) => n + 1),
    ponerAlias,
  };
}
