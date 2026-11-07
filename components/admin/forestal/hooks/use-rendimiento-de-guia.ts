"use client";

/**
 * Lo que declara la GTF de una cubicación guardada (Cubicador, 24-10): pide
 * `?volumen=1` (sumas por especie, nunca los items) al abrir «Ver detalle».
 * Una respuesta vieja no pisa a una más nueva si se cambia de guardada.
 */
import { useEffect, useState } from "react";
import type { VolumenDeGuia } from "@/lib/forestal/cubicacion-rendimiento-guia";

export type EstadoDeLaGuia =
  | { estado: "sin-guia" }
  | { estado: "cargando" }
  | { estado: "no-esta" }
  | { estado: "anulada"; numero: string }
  | { estado: "error" }
  | { estado: "lista"; numero: string; guia: VolumenDeGuia };

type Respuesta = { guia?: { gtfNumber: string; anulada: boolean } & Partial<VolumenDeGuia> };

export function useRendimientoDeGuia(gtfNumber: string | undefined): EstadoDeLaGuia {
  const numero = gtfNumber?.trim() ?? "";
  const [res, setRes] = useState<{ de: string; v: EstadoDeLaGuia } | null>(null);

  useEffect(() => {
    if (!numero) return;
    let vigente = true;
    fetch(`/api/admin/forestal/gtf?gtfNumber=${encodeURIComponent(numero)}&volumen=1`, { credentials: "same-origin" })
      .then(async (r): Promise<EstadoDeLaGuia> => {
        if (r.status === 404) return { estado: "no-esta" };
        if (!r.ok) return { estado: "error" };
        const g = ((await r.json()) as Respuesta).guia;
        if (!g) return { estado: "no-esta" };
        if (g.anulada) return { estado: "anulada", numero: g.gtfNumber };
        if (!g.tipo || !Array.isArray(g.volumenPorEspecie) || typeof g.m3Total !== "number") return { estado: "error" };
        return { estado: "lista", numero: g.gtfNumber, guia: { tipo: g.tipo, m3Total: g.m3Total, volumenPorEspecie: g.volumenPorEspecie } };
      })
      .catch((): EstadoDeLaGuia => ({ estado: "error" }))
      .then((v) => { if (vigente) setRes({ de: numero, v }); });
    return () => { vigente = false; };
  }, [numero]);

  if (!numero) return { estado: "sin-guia" };
  return res && res.de === numero ? res.v : { estado: "cargando" };
}
