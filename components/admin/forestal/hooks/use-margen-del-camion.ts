"use client";

/**
 * Los datos del «Margen del camión» (Cubicador › Ver detalle, 24-10): las
 * cubicaciones comerciales de ESTA guardada (`?ref=`, venta y compra del
 * mismo lote) y las compras de su comunidad (`?parte=`; sin la ficha de la
 * comunidad, todas las compras), más lo que el usuario elige o escribe. La
 * cuenta la arma `armarMargen` (pura). SÓLO LECTURA: no escribe nada, y el
 * precio escrito a mano vive en la ventana (no se guarda).
 */
import { useEffect, useMemo, useState } from "react";
import type { CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import { cruzarConGuia } from "@/lib/forestal/cubicacion-rendimiento-guia";
import {
  armarMargen, rendimientoDelCruce, type ComercialParaMargen, type EleccionDeCompra, type MargenArmado, type RendimientoParaConvertir,
} from "@/lib/forestal/cubicacion-margen";
import { pedir, RUTA_CUBICACIONES_TROZAS } from "./use-cubicaciones-trozas";
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
  | ({ estado: "lista" } & MargenArmado);

export function useMargenDelCamion(c: CubicacionRegistro, guia: EstadoDeLaGuia, deLaGuia?: PiezasDeLaGuia) {
  const parteId = c.ficha?.comunidadParteId?.trim() || undefined;
  const comerciales = useComercialesDelCamion(c.id, parteId);
  const [eleccion, setEleccion] = useState<EleccionDeCompra>("");
  const [precioAMano, setPrecioAMano] = useState("");
  const rendimiento = useMemo(() => rendimientoDe(guia, c, deLaGuia), [guia, c, deLaGuia]);

  const resultado = useMemo((): MargenDelCamionEstado => {
    if (comerciales.estado !== "lista") return comerciales;
    return {
      estado: "lista",
      ...armarMargen({
        guardada: { id: c.id, gtfNumber: c.gtfNumber, valor: c.valor, pt: c.totales.pieTablar },
        deLaRef: comerciales.deLaRef,
        deLaComunidad: comerciales.deLaComunidad,
        comunidadParteId: parteId,
        eleccion,
        precioAMano,
        rendimiento,
      }),
    };
  }, [comerciales, c.id, c.gtfNumber, c.valor, c.totales.pieTablar, parteId, eleccion, precioAMano, rendimiento]);

  return { resultado, conComunidad: !!parteId, eleccion, setEleccion, precioAMano, setPrecioAMano };
}
