"use client";

/**
 * use-anexos-emitidos — la bandeja de ANEXOS N° 04 emitidos del tenant.
 *
 * Vive acá arriba y no dentro del panel porque la lista tiene DOS usos: mostrar
 * la bandeja y alimentar el checklist (N° repetido, volumen ya amparado por
 * otra emisión de la misma guía). Si el fetch viviera en el panel, el checklist
 * no vería nada hasta que alguien lo desplegara — justo el aviso que más
 * importa antes de firmar.
 */
import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { AnexoEmitido } from "@/lib/forestal/anexo04-registro";

export function useAnexosEmitidos(token: number): {
  lista: AnexoEmitido[];
  cargando: boolean;
  /** Borra del historial; devuelve false si el servidor no pudo. */
  quitar: (id: string) => Promise<boolean>;
} {
  const [lista, setLista] = useState<AnexoEmitido[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    fetch("/api/admin/forestal/anexos", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { anexos: [] }))
      .then((j: { anexos?: AnexoEmitido[] }) => { if (vivo) setLista(j.anexos ?? []); })
      // Sin bandeja el modal sigue sirviendo para emitir: es contexto, no un requisito.
      .catch(() => { if (vivo) setLista([]); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [token]);

  const quitar = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/admin/forestal/anexos?id=${encodeURIComponent(id)}`, {
        method: "DELETE", credentials: "include", headers: csrfHeaders(),
      });
      if (!r.ok) return false;
      setLista((prev) => prev.filter((a) => a.id !== id));
      return true;
    } catch {
      return false;
    }
  }, []);

  return { lista, cargando, quitar };
}
