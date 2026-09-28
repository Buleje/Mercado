"use client";

/**
 * useDespachoGuiaLoth — el estado de «Despachar con guía» del Libro TH.
 *
 * Trae de una vez lo que la guía ya sabe (carátula, planes, trozas que no
 * salieron, el N° que sigue en el talonario y la última guía), arma los datos
 * iniciales con `datosInicialesLoth` y registra guía + despachos en un POST.
 *
 * La identidad del título sale del PLAN de las trozas: al cambiar de plan se
 * vuelve a sembrar (una guía ampara un solo título) y la selección se limpia.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { gtfDatosVacio, type GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import type { ParteGuardada, VehiculoGuardado } from "@/lib/forestal/gtf-autocompletar";
import {
  datosInicialesLoth,
  faltantesDespachoLoth,
  identidadDelTitulo,
  rellenarGuiaLoth,
  type CaratulaParaGuia,
  type IdentidadDelTitulo,
  type PermisoParaGuia,
  type PlanParaGuia,
  type TrozaDelLibro,
} from "@/lib/forestal/loth-guia-despacho";
import { hoyEnLima } from "@/lib/forestal/semana-de-registro";

export interface PreparadoGuiaLoth {
  caratula: (CaratulaParaGuia & { id: string }) | null;
  planes: (PlanParaGuia & { id: string; isActive: boolean })[];
  permisos: Record<string, PermisoParaGuia | null>;
  trozas: TrozaDelLibro[];
  talonario: { propuesta: string | null; ultimo: { numero: string; fecha: string | null } | null };
  ultimaGuia: GtfDatos | null;
}

export interface RegistradaLoth {
  gtfNumber: string;
  gtfDate: string;
  lineas: number;
  volumenM3: number;
  datos: GtfDatos;
  piezas: TrozaDelLibro[];
  titular: string;
}

export interface LibretaParaRellenar {
  destinatario?: ParteGuardada | null;
  transportista?: ParteGuardada | null;
  conductor?: ParteGuardada | null;
  vehiculo?: VehiculoGuardado | null;
}

export function useDespachoGuiaLoth(opts: { onRegistrada?: () => void } = {}) {
  const { onRegistrada } = opts;
  const [prep, setPrep] = useState<PreparadoGuiaLoth | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      const r = await fetch("/api/admin/forestal/loth/despacho-guia", { credentials: "include", cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as Partial<PreparadoGuiaLoth> & { message?: string };
      if (!r.ok) throw new Error(j.message ?? `No se pudo preparar la guía (${r.status})`);
      setPrep({
        caratula: j.caratula ?? null,
        planes: j.planes ?? [],
        permisos: j.permisos ?? {},
        trozas: j.trozas ?? [],
        talonario: j.talonario ?? { propuesta: null, ultimo: null },
        ultimaGuia: j.ultimaGuia ?? null,
      });
    } catch (e) {
      setErrorCarga(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** Planes con trozas para despachar. */
  const planesConTrozas = useMemo(() => {
    if (!prep) return [];
    const ids = new Set(prep.trozas.map((t) => t.planId));
    return prep.planes.filter((p) => ids.has(p.id));
  }, [prep]);
  const hayTrozasSinPlan = useMemo(() => Boolean(prep?.trozas.some((t) => !t.planId)), [prep]);

  /** El plan de la guía: el activo con trozas, o el primero con trozas. `null` = trozas sin plan. */
  const [planElegido, setPlanElegido] = useState<string | null | undefined>(undefined);
  const planId: string | null | undefined =
    planElegido !== undefined
      ? planElegido
      : prep
        ? ((planesConTrozas.find((p) => p.isActive) ?? planesConTrozas[0])?.id ?? null)
        : undefined;

  const plan = useMemo(() => prep?.planes.find((p) => p.id === planId) ?? null, [prep, planId]);
  const identidad: IdentidadDelTitulo | null = useMemo(
    () =>
      prep && planId !== undefined
        ? identidadDelTitulo({ caratula: prep.caratula, plan, permiso: planId ? (prep.permisos[planId] ?? null) : null })
        : null,
    [prep, plan, planId],
  );
  const trozasDelPlan = useMemo(
    () => (prep && planId !== undefined ? prep.trozas.filter((t) => (t.planId ?? null) === planId) : []),
    [prep, planId],
  );

  const [emision, setEmision] = useState(hoyEnLima);
  const [gtfNumber, setGtfNumber] = useState("");
  const [datos, setDatos] = useState<GtfDatos>(gtfDatosVacio);
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());

  /* Sembrar al llegar la identidad y cada vez que cambia el plan. La herencia
     de la guía anterior sólo completa lo vacío (`rellenarGuia` no pisa). */
  const sembradoPara = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!prep || !identidad || planId === undefined || sembradoPara.current === planId) return;
    sembradoPara.current = planId;
    setDatos(rellenarGuiaLoth(datosInicialesLoth(identidad, emision), { ultimaGuia: prep.ultimaGuia, emision }));
    setElegidas(new Set());
    setGtfNumber((n) => n || prep.talonario.propuesta || "");
  }, [prep, identidad, planId, emision]);

  const piezas = useMemo(() => trozasDelPlan.filter((t) => elegidas.has(t.codigo)), [trozasDelPlan, elegidas]);
  const faltan = useMemo(
    () => faltantesDespachoLoth(datos, { gtfNumber, emision, trozas: piezas.length }),
    [datos, gtfNumber, emision, piezas.length],
  );

  /** «Rellenar con la libreta»: lo más usado del Directorio, sólo en lo vacío. */
  const rellenar = useCallback(
    (libreta: LibretaParaRellenar) => {
      setDatos((d) => rellenarGuiaLoth(d, { ultimaGuia: prep?.ultimaGuia ?? null, emision, ...libreta }));
    },
    [prep, emision],
  );

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** El servidor preguntó por un N° que se adelanta al talonario. */
  const [salto, setSalto] = useState<string | null>(null);
  const [registrada, setRegistrada] = useState<RegistradaLoth | null>(null);

  const registrar = useCallback(
    async (confirmarSalto = false) => {
      if (enviando || faltan.length > 0 || !identidad) return;
      setEnviando(true);
      setError(null);
      try {
        const r = await fetch("/api/admin/forestal/loth/despacho-guia", {
          method: "POST",
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            gtfNumber: gtfNumber.trim(),
            gtfDate: emision,
            trozas: piezas.map((p) => p.codigo),
            titularName: identidad.titular || null,
            gtfDatos: datos,
            confirmarSalto,
          }),
        });
        const j = (await r.json().catch(() => ({}))) as { error?: string; message?: string; lineas?: number; volumenM3?: number };
        if (r.status === 409 && j.error === "salto") {
          setSalto(j.message ?? "El número se adelanta al talonario.");
          return;
        }
        if (!r.ok) throw new Error(j.message ?? `No se pudo registrar (${r.status})`);
        setSalto(null);
        setRegistrada({
          gtfNumber: gtfNumber.trim(),
          gtfDate: emision,
          lineas: j.lineas ?? piezas.length,
          volumenM3: j.volumenM3 ?? 0,
          datos,
          piezas,
          titular: identidad.titular,
        });
        onRegistrada?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setEnviando(false);
      }
    },
    [enviando, faltan.length, identidad, gtfNumber, emision, piezas, datos, onRegistrada],
  );

  return {
    cargando,
    errorCarga,
    recargar: cargar,
    prep,
    planesConTrozas,
    hayTrozasSinPlan,
    planId: planId ?? null,
    setPlanId: (id: string | null) => setPlanElegido(id),
    plan,
    identidad,
    trozasDelPlan,
    elegidas,
    setElegidas,
    piezas,
    emision,
    setEmision,
    gtfNumber,
    setGtfNumber,
    datos,
    setDatos,
    faltan,
    rellenar,
    registrar,
    enviando,
    error,
    salto,
    cancelarSalto: () => setSalto(null),
    registrada,
  };
}

export type DespachoGuiaLoth = ReturnType<typeof useDespachoGuiaLoth>;
