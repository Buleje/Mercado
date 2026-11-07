"use client";

/**
 * Los datos del «Margen del camión» (Cubicador › Ver detalle, 24-10): las
 * cubicaciones comerciales de ESTA guardada (`?ref=`, venta y compra del
 * mismo lote) y las compras de su comunidad (`?parte=`; sin la ficha de la
 * comunidad, todas las compras), más lo que el usuario elige o escribe. La
 * cuenta la arma `armarMargen` (pura). Lo único que escribe es el precio de
 * compra por PT anotado a mano (24-10): es un dato del dueño en ESTA guardada,
 * no mueve plata; al abrir otra vez sale elegido (`armarMargenGuardado`), salvo
 * que el lote ya tenga su compra registrada: ésa manda y el anotado es respaldo.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import { cruzarConGuia } from "@/lib/forestal/cubicacion-rendimiento-guia";
import {
  armarMargen, armarMargenGuardado, guardadaParaMargen, precioGuardado, rendimientoDelCruce,
  type ComercialParaMargen, type EleccionDeCompra, type MargenArmado, type RendimientoParaConvertir,
} from "@/lib/forestal/cubicacion-margen";
import { jsonPost, pedir, RUTA_CUBICACIONES_TROZAS } from "./use-cubicaciones-trozas";
import type { EstadoDeLaGuia } from "./use-rendimiento-de-guia";
import type { PiezasDeLaGuia } from "../cubicador-detalle-rendimiento";

const leerLista = (j: unknown): ComercialParaMargen[] => {
  const arr = ((j ?? {}) as { cubicaciones?: unknown }).cubicaciones;
  return Array.isArray(arr) ? (arr as ComercialParaMargen[]) : [];
};

type Comerciales =
  | { estado: "cargando" }
  | { estado: "error"; mensaje: string }
  | { estado: "lista"; deLaRef: ComercialParaMargen[]; deLaComunidad: ComercialParaMargen[] };

/** Las dos listas en paralelo; una respuesta vieja no pisa la de otra guardada. */
function useComercialesDelCamion(refId: string, parteId: string | undefined): Comerciales {
  const clave = `${refId}|${parteId ?? ""}`;
  const [res, setRes] = useState<{ de: string; v: Comerciales } | null>(null);
  useEffect(() => {
    let vigente = true;
    const q = (extra: string) => `${RUTA_CUBICACIONES_TROZAS}?material=todas&${extra}`;
    void Promise.all([
      pedir(q(`ref=${encodeURIComponent(refId)}`), {}, leerLista),
      pedir(q(parteId ? `parte=${encodeURIComponent(parteId)}&conBeneficiario=1` : ""), {}, leerLista),
    ]).then(([ref, comunidad]): void => {
      if (!vigente) return;
      const v: Comerciales = !ref.ok
        ? { estado: "error", mensaje: ref.status === 403 ? "Tu rol no ve las cuentas de madera." : ref.mensaje }
        : !comunidad.ok
          ? { estado: "error", mensaje: comunidad.mensaje }
          : { estado: "lista", deLaRef: ref.data, deLaComunidad: comunidad.data };
      setRes({ de: `${refId}|${parteId ?? ""}`, v });
    });
    return () => { vigente = false; };
  }, [refId, parteId]);
  return res && res.de === clave ? res.v : { estado: "cargando" };
}

/** El rendimiento de la GTF para pasar m³ de troza a PT, o lo que falta para tenerlo. */
function rendimientoDe(guia: EstadoDeLaGuia, c: CubicacionRegistro, deLaGuia?: PiezasDeLaGuia): RendimientoParaConvertir {
  switch (guia.estado) {
    case "sin-guia": return { falta: "falta el rendimiento: esta cubicación no tiene GTF" };
    case "cargando": return { falta: "todavía estoy leyendo la guía" };
    case "no-esta": return { falta: `falta el rendimiento: no encuentro la GTF ${c.gtfNumber ?? ""} entre las emitidas` };
    case "anulada": return { falta: `falta el rendimiento: la GTF ${guia.numero} está anulada` };
    case "error": return { falta: "no pude leer la guía ahora" };
    /* Todas las guardadas de la GTF (otros camiones): un camión solo contra toda la guía rendía la mitad. */
    case "lista": return deLaGuia
      ? rendimientoDelCruce(guia.numero, cruzarConGuia(guia.guia, deLaGuia.piezas), deLaGuia.cubicaciones.length)
      : rendimientoDelCruce(guia.numero, cruzarConGuia(guia.guia, c.piezas, c.especie));
  }
}

export type MargenDelCamionEstado =
  | { estado: "cargando" }
  | { estado: "error"; mensaje: string }
  | ({
      estado: "lista";
      /** La compra con la que quedó: la que eligió el usuario o la que manda lo guardado. */
      eleccion: EleccionDeCompra;
      /** Hay precio a mano guardado pero manda la compra del lote. */
      respaldo: boolean;
    } & MargenArmado);

const leerGuardada = (j: unknown): CubicacionRegistro | null => ((j ?? {}) as { cubicacion?: CubicacionRegistro }).cubicacion ?? null;

/** Guardar o borrar (`null`) el precio de compra por PT anotado en la guardada. */
function useAnotarCompraAMano(id: string, onGuardada?: (c: CubicacionRegistro) => void) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const anotar = useCallback(async (precioPt: number | null): Promise<boolean> => {
    setGuardando(true);
    setError(null);
    const r = await pedir(
      `/api/admin/forestal/cubicaciones?id=${encodeURIComponent(id)}`,
      jsonPost("PATCH", { compraAMano: precioPt === null ? null : { precioPt } }),
      leerGuardada,
    );
    setGuardando(false);
    if (!r.ok || !r.data) {
      setError(r.ok ? "No se pudo guardar el precio." : r.mensaje);
      return false;
    }
    onGuardada?.(r.data);
    return true;
  }, [id, onGuardada]);
  return { guardando, error, anotar };
}

export function useMargenDelCamion(c: CubicacionRegistro, guia: EstadoDeLaGuia, deLaGuia?: PiezasDeLaGuia, onGuardada?: (c: CubicacionRegistro) => void) {
  const parteId = c.ficha?.comunidadParteId?.trim() || undefined;
  const comerciales = useComercialesDelCamion(c.id, parteId);
  /* Mientras el usuario no elija, manda lo guardado (`armarMargenGuardado`, la misma
     regla del mes): la compra del lote; si no hay, el precio anotado; si no, la que calza. */
  const [tocada, setEleccion] = useState<EleccionDeCompra | null>(null);
  const [precioAMano, setPrecioAMano] = useState(() => precioGuardado(c.compraAMano));
  const { guardando, error: errorAlAnotar, anotar } = useAnotarCompraAMano(c.id, onGuardada);
  /* Borrar el anotado vuelve a la compra que calza sola. */
  const borrarAnotado = useCallback(async () => {
    if (!(await anotar(null))) return;
    setEleccion("");
    setPrecioAMano("");
  }, [anotar]);
  const rendimiento = useMemo(() => rendimientoDe(guia, c, deLaGuia), [guia, c, deLaGuia]);

  const resultado = useMemo((): MargenDelCamionEstado => {
    if (comerciales.estado !== "lista") return comerciales;
    const entrada = { guardada: guardadaParaMargen(c), deLaRef: comerciales.deLaRef, deLaComunidad: comerciales.deLaComunidad, comunidadParteId: parteId, precioAMano, rendimiento };
    return tocada === null
      ? { estado: "lista", ...armarMargenGuardado(entrada) }
      : { estado: "lista", ...armarMargen({ ...entrada, eleccion: tocada }), eleccion: tocada, respaldo: false };
  }, [comerciales, c, parteId, tocada, precioAMano, rendimiento]);
  const eleccion: EleccionDeCompra = resultado.estado === "lista" ? resultado.eleccion : (tocada ?? "");

  return {
    resultado, conComunidad: !!parteId, eleccion, setEleccion, precioAMano, setPrecioAMano,
    anotado: c.compraAMano ?? null, guardando, errorAlAnotar, anotar, borrarAnotado,
  };
}
