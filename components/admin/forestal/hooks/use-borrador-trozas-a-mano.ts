"use client";

/**
 * useBorradorTrozasAMano — las trozas anotadas a mano en «Despachar con guía»
 * sobreviven a que el modal se vuelva a montar (15-10: «si cambias el ancho con
 * el modal abierto vuelve a "Trayendo el plan…" y se pierden las trozas»).
 *
 * Medido: cambiar el ancho (1280↔400, en las dos entradas del modal) NO lo
 * remonta. Lo que lo remontaba era la recarga en caliente del servidor de
 * desarrollo mientras otro agente editaba; a un usuario le pasa lo mismo con
 * una recarga, con el navegador del celular que descarta la pestaña al girarlo
 * o al volver de otra app. El borrador cubre cualquier remonte.
 *
 * Vive en `sessionStorage` (la pestaña: se va al cerrarla), una clave por libro
 * —la carátula del LO-TH, o el primer plan—: los ids son de un solo negocio, así
 * que no cruza de tenant aunque varios compartan el origen (localhost, /t/<slug>).
 * Guarda el plan de la guía. Todo acceso va con try/catch: modo privado o cupo
 * lleno no rompen el modal, sólo no hay borrador. Se borra al registrar la guía,
 * al quitar todas las filas y con «Descartar borrador».
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trozaAManoSchema, type TrozaAMano } from "@/lib/forestal/loth-trozas-a-mano";
import type { PreparadoGuiaLoth } from "./use-preparado-guia-loth";
import type { TrozasAMano } from "./use-trozas-a-mano";

const PREFIJO = "bsm:despacho-guia:trozas-a-mano:";

export interface BorradorTrozasAMano {
  v: 1;
  planId: string | null;
  filas: TrozaAMano[];
  /** El primer N° de las trozas sin árbol (16-10, «Medir por foto»); sin él, 1. */
  desde?: number;
  guardadoAt: number;
}

/** Lo recuperado que sigue en la lista (las filas que el usuario no quitó). */
export interface BorradorRecuperado {
  filas: number;
  trozas: number;
  guardadoAt: number;
}

export function claveDelBorrador(prep: Pick<PreparadoGuiaLoth, "caratula" | "planes">): string {
  return PREFIJO + (prep.caratula?.id ?? prep.planes[0]?.id ?? "libro");
}

/** El borrador guardado, con cada fila revisada otra vez (una fila que ya no pasa se deja afuera). */
export function leerBorrador(clave: string): BorradorTrozasAMano | null {
  try {
    const crudo = window.sessionStorage.getItem(clave);
    if (!crudo) return null;
    const j = JSON.parse(crudo) as Partial<BorradorTrozasAMano> | null;
    if (!j || j.v !== 1 || !Array.isArray(j.filas)) return null;
    const filas = j.filas.flatMap((f) => {
      const r = trozaAManoSchema.safeParse(f);
      return r.success ? [r.data] : [];
    });
    if (filas.length === 0) return null;
    const desde = Number.isInteger(j.desde) && Number(j.desde) > 1 ? Number(j.desde) : undefined;
    return { v: 1, planId: typeof j.planId === "string" ? j.planId : null, filas, ...(desde ? { desde } : {}), guardadoAt: Number(j.guardadoAt) || 0 };
  } catch {
    return null; // sin almacenamiento o JSON roto: no hay borrador
  }
}

export function guardarBorrador(clave: string, b: BorradorTrozasAMano): void {
  try {
    window.sessionStorage.setItem(clave, JSON.stringify(b));
  } catch {
    /* modo privado o cupo lleno: el modal sigue, sin borrador */
  }
}

export function olvidarBorrador(clave: string): void {
  try {
    window.sessionStorage.removeItem(clave);
  } catch {
    /* sin almacenamiento: no había nada que olvidar */
  }
}

export function useBorradorTrozasAMano(opts: {
  prep: PreparadoGuiaLoth | null;
  /** `undefined` mientras el plan no se decidió (antes de que llegue `prep`). */
  planId: string | null | undefined;
  /** Estable (el setter de estado): al recuperar se vuelve al plan del borrador. */
  setPlanId: (id: string | null) => void;
  aMano: TrozasAMano;
  registrada: boolean;
}) {
  const { prep, planId, setPlanId, aMano, registrada } = opts;
  const { filas, agregar, quitar, desde, setDesde } = aMano;
  const clave = useMemo(() => (prep ? claveDelBorrador(prep) : null), [prep]);
  const intentado = useRef(false);
  const porMarcar = useRef(false);
  /** Hasta recuperar no se guarda: el primer render (lista vacía) borraría el borrador. */
  const [listo, setListo] = useState(false);
  const [recuperado, setRecuperado] = useState<{ guardadoAt: number; claves: ReadonlySet<number> | null } | null>(null);

  /* Recuperar una sola vez: con el plan ya decidido y la lista todavía vacía. */
  useEffect(() => {
    if (intentado.current || !clave || !prep || planId === undefined) return;
    intentado.current = true;
    const b = filas.length === 0 ? leerBorrador(clave) : null;
    if (b) {
      const planVive = b.planId === null || prep.planes.some((p) => p.id === b.planId);
      if (b.planId !== planId && planVive) setPlanId(b.planId);
      for (const f of b.filas) agregar(f);
      if (b.desde) setDesde(b.desde);
      porMarcar.current = true;
      setRecuperado({ guardadoAt: b.guardadoAt, claves: null });
    }
    setListo(true);
  }, [clave, prep, planId, filas.length, agregar, setPlanId, setDesde]);

  /* Las claves que recibieron las filas recuperadas (las pone `agregar`, en el render siguiente). */
  useEffect(() => {
    if (!porMarcar.current || filas.length === 0) return;
    porMarcar.current = false;
    const claves = new Set(filas.map((f) => f.key));
    setRecuperado((r) => (r ? { ...r, claves } : r));
  }, [filas]);

  /* Guardar en cada cambio; registrada o sin filas, se olvida. */
  useEffect(() => {
    if (!listo || !clave) return;
    if (registrada || filas.length === 0) {
      olvidarBorrador(clave);
      return;
    }
    guardarBorrador(clave, {
      v: 1,
      planId: planId ?? null,
      filas: filas.map(({ key: _key, ...t }) => t),
      ...(desde > 1 ? { desde } : {}),
      guardadoAt: Date.now(),
    });
  }, [listo, clave, registrada, filas, planId, desde]);

  const vivas = useMemo(
    () => (recuperado?.claves ? filas.filter((f) => recuperado.claves?.has(f.key)) : []),
    [recuperado, filas],
  );

  /** Quita las filas que vinieron del borrador (las anotadas después se quedan y pasan a ser el borrador). */
  const descartar = useCallback(() => {
    for (const f of vivas) quitar(f.key);
    setRecuperado(null);
    if (clave) olvidarBorrador(clave);
  }, [vivas, quitar, clave]);

  const resumen: BorradorRecuperado | null =
    vivas.length > 0 && recuperado
      ? { filas: vivas.length, trozas: vivas.reduce((a, f) => a + f.cantidad, 0), guardadoAt: recuperado.guardadoAt }
      : null;

  return { recuperado: resumen, descartar };
}

export type BorradorDelDespacho = ReturnType<typeof useBorradorTrozasAMano>;
