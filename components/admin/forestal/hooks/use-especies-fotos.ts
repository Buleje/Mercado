"use client";

/**
 * La biblioteca de fotos de especies, cargada una vez por pantalla.
 *
 * Devuelve el índice ya armado: quien la usa resuelve por fila en O(1) y no
 * vuelve a normalizar el nombre en cada render. Un fallo al cargar NO es un
 * error de la pantalla — la foto es una ayuda, y una tabla de ingresos que no
 * abre porque no pudo traer miniaturas sería peor que una sin fotos.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { indexarFotos, type FotoEspecie } from "@/lib/forestal/especies-fotos";

export function useEspeciesFotos() {
  const [fotos, setFotos] = useState<FotoEspecie[]>([]);
  const [cargando, setCargando] = useState(true);

  const recargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetch("/api/admin/forestal/especies-fotos", { credentials: "include" });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { fotos?: FotoEspecie[] };
      setFotos(d.fotos ?? []);
    } catch {
      // Sin fotos se sigue trabajando: la tabla muestra el nombre, como antes.
      setFotos([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const indice = useMemo(() => indexarFotos(fotos), [fotos]);
  return { fotos, indice, cargando, recargar };
}
