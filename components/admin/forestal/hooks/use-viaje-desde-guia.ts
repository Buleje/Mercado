"use client";

/**
 * «La guía llena el viaje» (Salidas, Brandon 28-10): al salir del campo «N° de
 * GTF de salida» (o con Enter) busca la guía y llena SÓLO la placa, el chofer
 * y el destino que estén vacíos. Deja un aviso con «Deshacer». Una respuesta
 * vieja no pisa lo escrito mientras tanto: se lee el borrador de AHORA.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { llenarViajeDesdeGuia, revertirViaje, type DatosLlenables } from "@/lib/forestal/cubicacion-salida-desde-guia";
import type { BorradorSalida } from "../cubicador-salidas-logica";
import { buscarGuiaParaFicha } from "./buscar-guia-para-ficha";
import type { AvisoDeGuia } from "./use-ficha-desde-guia";

type Actualizar = (fn: (b: BorradorSalida) => BorradorSalida) => void;

export function useViajeDesdeGuia(borrador: BorradorSalida, actualizar: Actualizar) {
  const [aviso, setAviso] = useState<AvisoDeGuia | null>(null);
  const ultimo = useRef("");
  const puso = useRef<Partial<DatosLlenables> | null>(null);
  const turno = useRef(0);
  const ahora = useRef(borrador);
  ahora.current = borrador;

  /* Otro viaje en el editor: el aviso del anterior ya no cuenta. */
  useEffect(() => {
    turno.current++;
    ultimo.current = "";
    puso.current = null;
    setAviso(null);
  }, [borrador.id]);

  const buscar = useCallback(async (crudo: string) => {
    const numero = crudo.trim();
    if (!numero) { ultimo.current = ""; setAviso(null); return; }
    if (numero === ultimo.current) return;
    ultimo.current = numero;
    const mio = ++turno.current;
    puso.current = null;
    setAviso({ tipo: "buscando" });
    try {
      const r = await buscarGuiaParaFicha(numero);
      if (mio !== turno.current) return;
      if (r.estado === "no-esta") { setAviso({ tipo: "no-esta", numero }); return; }
      if (r.estado === "error") { ultimo.current = ""; setAviso({ tipo: "error" }); return; }
      const { patch, campos } = llenarViajeDesdeGuia(ahora.current, r.guia);
      if (campos.length === 0) { setAviso({ tipo: "nada-que-llenar", numero: r.guia.gtfNumber }); return; }
      puso.current = patch;
      actualizar((b) => {
        const lleno = llenarViajeDesdeGuia(b, r.guia).patch;
        return { ...b, ...lleno };
      });
      setAviso({ tipo: "llenado", numero: r.guia.gtfNumber, campos });
    } catch {
      if (mio === turno.current) { ultimo.current = ""; setAviso({ tipo: "error" }); }
    }
  }, [actualizar]);

  const deshacer = useCallback(() => {
    const patch = puso.current;
    if (!patch) return;
    puso.current = null;
    actualizar((b) => revertirViaje(b, patch));
    setAviso(null);
  }, [actualizar]);

  return { aviso, buscar, deshacer };
}
