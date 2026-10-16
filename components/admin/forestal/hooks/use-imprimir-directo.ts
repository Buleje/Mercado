"use client";

/**
 * «Imprimir directo» desde una pantalla (16-10): manda el `.prn` por el cable
 * USB y, si no se puede, guarda el porqué y deja a mano las dos salidas
 * («Bajar el .prn», «Abrir en RawBT»). Lo usan la tarjeta de cada guía de la
 * cola y «Probar la impresora».
 */

import { useCallback, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import { abrirEnRawbt, avisoRecortados, bajarSalida, descargarBlob, imprimirDirecto } from "@/lib/forestal/gtf-cola-monte-imprimir";
import type { ArchivoSalida, MotivoUsb } from "@/lib/forestal/gtf-impresion-usb";

export type EstadoImpresion =
  | { tipo: "ok"; mensaje: string }
  | { tipo: "error"; motivo: MotivoUsb; mensaje: string; android: boolean };

export function useImprimirDirecto() {
  const [ocupado, setOcupado] = useState(false);
  const [estado, setEstado] = useState<EstadoImpresion | null>(null);
  /** «N valores no entran en su casillero…» (cabecera `X-Recortados` de la salida), o null. */
  const [recortes, setRecortes] = useState<string | null>(null);
  /* Lo último que se pidió: las salidas lo reusan sin volver a pedirlo al servidor. */
  const ultimo = useRef<{ url: string; nombre: string; archivo: ArchivoSalida | null } | null>(null);

  const imprimir = useCallback(async (url: string, nombre: string) => {
    setOcupado(true);
    setEstado(null);
    setRecortes(null);
    try {
      const r = await imprimirDirecto(url, nombre);
      ultimo.current = { url, nombre, archivo: r.archivo };
      setRecortes(avisoRecortados(r.archivo?.recortados));
      setEstado(
        r.ok
          ? { tipo: "ok", mensaje: `Listo: la hoja salió por ${r.impresora}. Revisa que cada valor caiga en su casillero.` }
          : { tipo: "error", motivo: r.motivo, mensaje: r.mensaje, android: r.android },
      );
    } catch (err) {
      logger.warn("[imprimir-directo] falló", { error: String(err) });
      ultimo.current = { url, nombre, archivo: null };
      setEstado({ tipo: "error", motivo: "fallo", mensaje: "No se pudo imprimir. Baja el .prn y prueba con la app de la impresora.", android: false });
    } finally {
      setOcupado(false);
    }
  }, []);

  /** El archivo de lo último que se pidió; si no se llegó a bajar, se baja ahora. */
  const archivo = useCallback(async (): Promise<ArchivoSalida | null> => {
    const u = ultimo.current;
    if (!u) return null;
    if (u.archivo) return u.archivo;
    const r = await bajarSalida(u.url, u.nombre);
    if (!r.ok) {
      setEstado({ tipo: "error", motivo: "bajada", mensaje: r.mensaje, android: false });
      return null;
    }
    u.archivo = { blob: r.blob, nombre: r.nombre, recortados: r.recortados };
    setRecortes(avisoRecortados(r.recortados));
    return u.archivo;
  }, []);

  const bajarPrn = useCallback(async () => {
    const a = await archivo();
    if (a) descargarBlob(a.blob, a.nombre);
  }, [archivo]);

  const abrirRawbt = useCallback(async () => {
    const a = await archivo();
    if (a) await abrirEnRawbt(a);
  }, [archivo]);

  const limpiar = useCallback(() => {
    setEstado(null);
    setRecortes(null);
  }, []);

  return { imprimir, ocupado, estado, recortes, bajarPrn, abrirRawbt, limpiar };
}

export type ImpresionDirecta = ReturnType<typeof useImprimirDirecto>;
