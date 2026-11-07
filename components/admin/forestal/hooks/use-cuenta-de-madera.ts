"use client";

/**
 * La cuenta del lote de madera (aserrada, PT) en UN solo lugar (24-10).
 *
 * Antes vivía dentro de «Cuenta ▾» (`CuentaDeMadera`). El modal «Guardar
 * cubicación» también sube el lote a la cuenta de una persona, y dos copias de
 * este estado serían dos caminos de plata: uno no se enteraría de lo que el
 * otro acaba de guardar y un segundo «Guardar» crearía otra cubicación del
 * mismo lote. Lo leen los dos desde `ProveedorCuentaDeMadera`.
 *
 * Qué guarda: lo que este lote ya tiene en una cuenta (lista del servidor +
 * lo recién hecho que la lista todavía no trae), qué ventana está abierta y
 * los precios sugeridos para Valorizar. El modelo y el servidor son los del
 * patio de trozas (ADR-478/483/484); el monto lo calcula el servidor.
 */
import { useCallback, useMemo, useState } from "react";
import { useMiRol } from "@/hooks/use-mi-rol";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import {
  cubicacionVigente, esDelCubicador, loteCambio, mezclarDelLote, preciosSugeridosMadera, vistaPreviaMadera,
} from "@/lib/forestal/cubicacion-madera-cuenta";
import type { ActionToast } from "../cubicador-toasts";
import { useCubicacionesTrozas, type CubicacionTrozas } from "./use-cubicaciones-trozas";

export interface EntradaCuentaDeMadera {
  /** Sin cuenta (dentro de «Producir sin lote»): no pide nada al servidor. */
  activo: boolean;
  rows: PiezaCubicada[];
  especieDelLote: string | null;
  /** El id del lote en el Cubicador (null = todavía sin guardar). */
  refId: string | null;
  precioDe: (p: PiezaCubicada) => number;
  precioGeneral: number;
  avisar: (t: Omit<ActionToast, "id" | "exiting">) => void;
}

export function useCuentaDeMadera({ activo, rows, especieDelLote, refId, precioDe, precioGeneral, avisar }: EntradaCuentaDeMadera) {
  const rol = useMiRol();
  const puedeAplicar = rol === "admin" || rol === "owner" || rol === "superadmin";
  /** «Guardar en la cuenta» (la ventana corta del menú). */
  const [guardando, setGuardando] = useState(false);
  const [viendoLista, setViendoLista] = useState(false);
  /** La cubicación comercial abierta en Valorizar. */
  const [abierta, setAbierta] = useState<string | null>(null);
  /* Lo que esta pantalla acaba de guardar/aplicar/anular/borrar y la lista
     todavía no trae: sin esto, un segundo «Guardar» con la lista vieja creaba
     otra cubicación del mismo lote. */
  const [locales, setLocales] = useState<CubicacionTrozas[]>([]);
  const [borradas, setBorradas] = useState<ReadonlySet<string>>(() => new Set());

  const { lista, error, recargar } = useCubicacionesTrozas({ material: "aserrada", ref: refId ?? undefined }, activo && !!refId);
  /* Con la lista caída NO se decide: «no hay ninguna» crearía un duplicado. */
  const delLote = useMemo(
    () => (error ? null : mezclarDelLote(lista, locales, borradas, refId)),
    [error, lista, locales, borradas, refId],
  );
  const vigente = cubicacionVigente(delLote);
  /* El borrador propio se puede actualizar; el del despacho se abre allá. */
  const borrador = vigente?.estado === "borrador" && esDelCubicador(vigente) ? vigente : null;
  const vista = useMemo(() => vistaPreviaMadera(rows, especieDelLote), [rows, especieDelLote]);
  /* Se editó el lote después de guardarlo: cobrar ahora cobraría las medidas viejas. */
  const cambio = !!borrador && loteCambio(vista, borrador);
  const sugeridos = useMemo(
    () => preciosSugeridosMadera(rows, especieDelLote, precioDe, precioGeneral),
    [rows, especieDelLote, precioDe, precioGeneral],
  );

  const recordar = useCallback((c: CubicacionTrozas) => {
    setLocales((prev) => [c, ...prev.filter((x) => x.id !== c.id)]);
    recargar();
  }, [recargar]);
  const olvidar = useCallback((id: string) => {
    setBorradas((prev) => new Set(prev).add(id));
    recargar();
  }, [recargar]);

  /** Quedó en la cuenta: se recuerda, se avisa y el dueño o el admin sigue a Valorizar. */
  const alGuardar = useCallback((c: CubicacionTrozas) => {
    setGuardando(false);
    recordar(c);
    avisar({
      tono: "success",
      msg: `Guardada como ${c.codigo}`,
      detail: c.personaNombre ? `A la cuenta de ${c.personaNombre}` : undefined,
    });
    /* El precio ya viene del cubicador. */
    if (puedeAplicar) setAbierta(c.id);
  }, [recordar, avisar, puedeAplicar]);

  return {
    activo,
    puedeAplicar,
    rows,
    especieDelLote,
    delLote,
    /** No se pudo ver si el lote ya está en una cuenta: no se guarda a ciegas. */
    error,
    recargar,
    vigente,
    borrador,
    cambio,
    sugeridos,
    guardando,
    setGuardando,
    viendoLista,
    setViendoLista,
    abierta,
    setAbierta,
    recordar,
    olvidar,
    alGuardar,
  };
}

export type CuentaDeMaderaEstado = ReturnType<typeof useCuentaDeMadera>;
