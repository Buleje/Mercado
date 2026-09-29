"use client";

/**
 * useDespachoGuiaLoth — el estado de «Despachar con guía» del Libro TH.
 *
 * Trae de una vez lo que la guía ya sabe (carátula, planes, trozas que no
 * salieron, los N° de guía ya usados con su titular y la última guía), arma los
 * datos iniciales con `datosInicialesLoth` y registra guía + despachos en un POST.
 *
 * La identidad sale del PLAN de las trozas: al cambiar de plan se vuelve a
 * sembrar, la selección se limpia y el talonario se recalcula (29-09-2026:
 * serie por región, `talonarioDelPlan`; N° de lista y llegada, en
 * `use-traslado-guia-loth`).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { gtfDatosVacio, type GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import type { ParteGuardada, VehiculoGuardado } from "@/lib/forestal/gtf-autocompletar";
import {
  datosInicialesLoth,
  faltantesDespachoLoth,
  guiasParaOrigen,
  identidadDelTitulo,
  rellenarGuiaLoth,
  talonarioDelPlan,
  type CaratulaParaGuia,
  type GtfUsadaLoth,
  type IdentidadDelTitulo,
  type PermisoParaGuia,
  type PlanParaGuia,
  type TrozaDelLibro,
} from "@/lib/forestal/loth-guia-despacho";
import { hoyEnLima } from "@/lib/forestal/semana-de-registro";
import type { PaseAlCtp, PlantaPropia } from "@/lib/forestal/guia-th-al-ctp";
import { useNumeroGuiaLoth } from "./use-numero-guia-loth";
import { useTrasladoGuiaLoth } from "./use-traslado-guia-loth";

export interface PreparadoGuiaLoth {
  caratula: (CaratulaParaGuia & { id: string }) | null;
  planes: (PlanParaGuia & { id: string; isActive: boolean })[];
  permisos: Record<string, PermisoParaGuia | null>;
  trozas: TrozaDelLibro[];
  /** Los N° que ya gastaron un talonario (este libro + guías de SERFOR guardadas), con su dueño. */
  talonario: { usadas: GtfUsadaLoth[] };
  ultimaGuia: GtfDatos | null;
  /** La planta propia (Ficha del CTP) si el negocio lleva Libro CTP: una guía a ese RUC pasa allá. */
  ctpPropio: PlantaPropia | null;
}

export interface RegistradaLoth {
  gtfNumber: string;
  gtfDate: string;
  lineas: number;
  volumenM3: number;
  datos: GtfDatos;
  piezas: TrozaDelLibro[];
  titular: string;
  /** Qué pasó en el Libro CTP del negocio (la guía quedó para recibirla, o por qué no). */
  ctp: PaseAlCtp | null;
}

export interface LibretaParaRellenar {
  destinatario?: ParteGuardada | null;
  transportista?: ParteGuardada | null;
  conductor?: ParteGuardada | null;
  vehiculo?: VehiculoGuardado | null;
}

/** Lo que el servidor preguntó antes de grabar el N° (409): se confirma o se corrige. */
export interface PreguntaNumero {
  tipo: "salto" | "serie";
  mensaje: string;
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
        talonario: { usadas: j.talonario?.usadas ?? [] },
        ultimaGuia: j.ultimaGuia ?? null,
        ctpPropio: j.ctpPropio ?? null,
      });
    } catch (e) {
      setErrorCarga(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, []);
  useEffect(() => void cargar(), [cargar]);

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

  /** De quién es el talonario: el titular del plan, su título y el plan. */
  const dueno = useMemo(
    () => (identidad ? { titular: identidad.titular, permiso: identidad.tituloHabilitante, planId: planId ?? null } : null),
    [identidad, planId],
  );
  /** El talonario del plan: serie de su región, el que sigue de ESTE titular y sus listas. */
  const talonario = useMemo(
    () => (prep && dueno && identidad ? talonarioDelPlan({ ubigeo: identidad, dueno }, prep.talonario.usadas) : null),
    [prep, dueno, identidad],
  );
  const numero = useNumeroGuiaLoth(talonario, dueno);

  const [emision, setEmision] = useState(hoyEnLima);
  const [datos, setDatos] = useState<GtfDatos>(gtfDatosVacio);
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const piezas = useMemo(() => trozasDelPlan.filter((t) => elegidas.has(t.codigo)), [trozasDelPlan, elegidas]);
  /** El N° de lista y la llegada que se llenan solos (`use-traslado-guia-loth`). */
  const traslado = useTrasladoGuiaLoth({ datos, setDatos, talonario, trozas: piezas.length });

  /* Sembrar al llegar la identidad y cada vez que cambia el plan. La herencia
     de la guía anterior sólo completa lo vacío (`rellenarGuia` no pisa). */
  const sembradoPara = useRef<string | null | undefined>(undefined);
  const { sembrar: sembrarNumero } = numero;
  const { alSembrar } = traslado;
  useEffect(() => {
    if (!prep || !identidad || !talonario || planId === undefined || sembradoPara.current === planId) return;
    sembradoPara.current = planId;
    const d = rellenarGuiaLoth(datosInicialesLoth(identidad, emision), { ultimaGuia: prep.ultimaGuia, emision });
    alSembrar(d);
    setDatos(d);
    setElegidas(new Set());
    sembrarNumero(talonario);
  }, [prep, identidad, talonario, planId, emision, sembrarNumero, alSembrar]);

  const gtfNumber = numero.gtfNumber;
  const repetida = numero.revision?.repetida ?? null;
  const faltan = useMemo(
    () => [
      ...faltantesDespachoLoth(datos, { gtfNumber, emision, trozas: piezas.length }),
      ...(repetida ? [{ seccion: "documento" as const, campo: "N° de GTF sin usar", motivo: `Ya va en la guía ${repetida.numero} de este titular` }] : []),
    ],
    [datos, gtfNumber, emision, piezas.length, repetida],
  );
  const guiasOrigen = useMemo(() => guiasParaOrigen(prep?.talonario.usadas ?? [], gtfNumber), [prep, gtfNumber]);

  /** «Rellenar con la libreta»: lo más usado del Directorio, sólo en lo vacío. */
  const rellenar = useCallback(
    (libreta: LibretaParaRellenar) => {
      setDatos((d) => rellenarGuiaLoth(d, { ultimaGuia: prep?.ultimaGuia ?? null, emision, ...libreta }));
    },
    [prep, emision],
  );

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** El servidor preguntó por el N° (se adelanta al talonario, o es de otra región). */
  const [pregunta, setPregunta] = useState<PreguntaNumero | null>(null);
  const confirmados = useRef({ salto: false, serie: false });
  const [registrada, setRegistrada] = useState<RegistradaLoth | null>(null);

  const registrar = useCallback(
    async (confirmar?: PreguntaNumero["tipo"]) => {
      if (enviando || faltan.length > 0 || !identidad) return;
      if (confirmar) confirmados.current[confirmar] = true;
      setEnviando(true);
      setError(null);
      /* El (35) va como se imprime: un N° por hoja. */
      const enviados: GtfDatos = { ...datos, guia: { ...datos.guia, listaTrozasNro: traslado.listas.texto } };
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
            gtfDatos: enviados,
            confirmarSalto: confirmados.current.salto,
            confirmarSerie: confirmados.current.serie,
          }),
        });
        const j = (await r.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
          lineas?: number;
          volumenM3?: number;
          ctp?: PaseAlCtp;
        };
        if (r.status === 409 && (j.error === "salto" || j.error === "serie_de_otra_region")) {
          setPregunta({ tipo: j.error === "salto" ? "salto" : "serie", mensaje: j.message ?? "Revisa el N° de la guía." });
          return;
        }
        if (!r.ok) throw new Error(j.message ?? `No se pudo registrar (${r.status})`);
        setPregunta(null);
        setRegistrada({
          gtfNumber: gtfNumber.trim(),
          gtfDate: emision,
          lineas: j.lineas ?? piezas.length,
          volumenM3: j.volumenM3 ?? 0,
          datos: enviados,
          piezas,
          titular: identidad.titular,
          ctp: j.ctp ?? null,
        });
        onRegistrada?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setEnviando(false);
      }
    },
    [enviando, faltan.length, identidad, gtfNumber, emision, piezas, datos, traslado.listas.texto, onRegistrada],
  );

  /* Cambiar el N° invalida lo que se confirmó del anterior. */
  useEffect(() => {
    confirmados.current = { salto: false, serie: false };
    setPregunta(null);
  }, [gtfNumber]);

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
    talonario,
    numero,
    gtfNumber,
    setGtfNumber: numero.usarNumero,
    datos,
    setDatos,
    setPunto: traslado.setPunto,
    usarLlegadaDelDestinatario: traslado.usarLlegadaDelDestinatario,
    listas: traslado.listas,
    hojas: traslado.hojas,
    propuestaListas: traslado.propuestaListas,
    setListaTexto: traslado.setListaTexto,
    guiasOrigen,
    faltan,
    rellenar,
    registrar,
    enviando,
    error,
    pregunta,
    cancelarPregunta: () => setPregunta(null),
    registrada,
  };
}

export type DespachoGuiaLoth = ReturnType<typeof useDespachoGuiaLoth>;
