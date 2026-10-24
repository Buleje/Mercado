"use client";

/**
 * «La guía llena la ficha» (Cubicador, Brandon 24-10): al salir del campo
 * «N° de GTF» busca la guía emitida y llena SOLO los campos vacíos de la ficha
 * (CCNN, permiso, placa, chofer, destino). Deja un aviso con «Deshacer».
 */
import { useCallback, useRef, useState } from "react";
import {
  llenarFichaDesdeGuia, revertirLlenado, type CampoLlenable, type GuiaParaFicha,
} from "@/lib/forestal/cubicacion-desde-guia";
import type { FichaCubicacion } from "@/lib/forestal/cubicacion-registro";
import type { DatosDeLaCubicacion } from "../cubicador-guardar-tipos";
import type { useLibretaDeLaFicha } from "./use-libreta-de-la-ficha";

type Libreta = ReturnType<typeof useLibretaDeLaFicha>;
type Actualizar = (fn: (d: DatosDeLaCubicacion) => DatosDeLaCubicacion) => void;

export type AvisoDeGuia =
  | { tipo: "buscando" }
  | { tipo: "no-esta"; numero: string }
  | { tipo: "error" }
  | { tipo: "llenado"; numero: string; campos: CampoLlenable[] }
  | { tipo: "nada-que-llenar"; numero: string };

export function useFichaDesdeGuia(datos: DatosDeLaCubicacion, actualizar: Actualizar, libreta: Libreta) {
  const [aviso, setAviso] = useState<AvisoDeGuia | null>(null);
  const ultimo = useRef("");
  const puso = useRef<Partial<FichaCubicacion> | null>(null);
  const turno = useRef(0);
  /* Siempre la ficha de ahora: la respuesta llega tarde y no debe pisar lo escrito mientras tanto. */
  const fichaAhora = useRef(datos.ficha);
  fichaAhora.current = datos.ficha;

  const buscar = useCallback(async (crudo: string) => {
    const numero = crudo.trim();
    if (!numero) { ultimo.current = ""; setAviso(null); return; }
    if (numero === ultimo.current) return;
    ultimo.current = numero;
    const mio = ++turno.current;
    puso.current = null;
    setAviso({ tipo: "buscando" });
    try {
      const r = await fetch(`/api/admin/forestal/gtf?gtfNumber=${encodeURIComponent(numero)}&ficha=1`, { credentials: "same-origin" });
      if (mio !== turno.current) return;
      if (r.status === 404) { setAviso({ tipo: "no-esta", numero }); return; }
      if (!r.ok) { ultimo.current = ""; setAviso({ tipo: "error" }); return; }
      const guia = ((await r.json()) as { guia?: GuiaParaFicha }).guia;
      if (mio !== turno.current) return;
      if (!guia) { setAviso({ tipo: "no-esta", numero }); return; }
      const { patch, campos } = llenarFichaDesdeGuia(fichaAhora.current, guia);
      if (campos.length === 0) { setAviso({ tipo: "nada-que-llenar", numero: guia.gtfNumber }); return; }
      /* Si la CCNN de la guía está en el Directorio, queda atada. */
      const parte = patch.comunidad ? libreta.buscar(libreta.comunidades, patch.comunidad) : null;
      if (parte) patch.comunidadParteId = parte.id;
      puso.current = patch;
      actualizar((d) => ({
        ...d,
        ficha: { ...d.ficha, ...Object.fromEntries(Object.entries(patch).filter(([k]) => !d.ficha[k as keyof FichaCubicacion]?.trim?.())) },
      }));
      setAviso({ tipo: "llenado", numero: guia.gtfNumber, campos });
    } catch {
      if (mio === turno.current) { ultimo.current = ""; setAviso({ tipo: "error" }); }
    }
  }, [actualizar, libreta]);

  const deshacer = useCallback(() => {
    const patch = puso.current;
    if (!patch) return;
    puso.current = null;
    actualizar((d) => ({ ...d, ficha: revertirLlenado(d.ficha, patch) }));
    setAviso(null);
  }, [actualizar]);

  return { aviso, buscar, deshacer };
}
