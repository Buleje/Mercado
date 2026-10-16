"use client";

/**
 * useDespachoGuiaLoth — el estado de «Despachar con guía» del Libro TH.
 *
 * Trae de una vez lo que la guía ya sabe (carátula, planes, trozas que no
 * salieron, los N° de guía ya usados con su titular y la última guía de cada
 * plan), arma los datos iniciales con `datosInicialesLoth` y registra guía +
 * despachos en un POST. La guía nueva hereda de la anterior del MISMO permiso
 * (FOR-2, 09-10; `guiaAnteriorDelDespacho`).
 *
 * La identidad sale del PLAN de las trozas: al cambiar de plan se vuelve a
 * sembrar, la selección se limpia y el talonario se recalcula (29-09-2026:
 * serie por región, `talonarioDelPlan`; N° de lista y llegada, en
 * `use-traslado-guia-loth`).
 *
 * Trozas a mano (15-10, `use-trozas-a-mano`): D1, D2, largo y cantidad. Van en
 * `piezas` con las del libro (detalle, lista y papeles las tratan igual), numeradas
 * con `piezasAMano` —la misma función del servidor—, y viajan con el plan de la guía
 * (sin plan = sin permiso: se asigna después en la tabla de guías). Con árbol del
 * censo (`use-arboles-a-mano`) numeran como el trozado («001-TOR-A») y el papel
 * registrado lleva el código que les dio el servidor (`codigosAMano`).
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
  type IdentidadDelTitulo,
  type TrozaDelLibro,
} from "@/lib/forestal/loth-guia-despacho";
import { guiaAnteriorDelDespacho, loCopiadoDelDespacho } from "@/lib/forestal/loth-guia-anterior";
import {
  conservarLoEscrito,
  mismoTalonario,
  sembradaParaElTraslado,
  talonarioDeOtroPlan,
  type TalonarioDeLaGuia,
} from "@/lib/forestal/loth-guia-cambio-de-plan";
import { hoyEnLima } from "@/lib/forestal/semana-de-registro";
import type { PaseAlCtp } from "@/lib/forestal/guia-th-al-ctp";
import { useNumeroGuiaLoth } from "./use-numero-guia-loth";
import { useTrasladoGuiaLoth } from "./use-traslado-guia-loth";
import { usePreparadoGuiaLoth } from "./use-preparado-guia-loth";
import { useTrozasAMano } from "./use-trozas-a-mano";
import { useEspeciesAMano, type CatalogoParaJuzgar } from "./use-especies-a-mano";
import { useArbolesAMano } from "./use-arboles-a-mano";
import { conCodigosDelServidor, piezasAMano, trozasDelLibroAMano } from "@/lib/forestal/loth-trozas-a-mano";

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

export function useDespachoGuiaLoth(opts: { onRegistrada?: () => void; catalogo?: CatalogoParaJuzgar } = {}) {
  const { onRegistrada } = opts;
  const { prep, cargando, errorCarga, cargar } = usePreparadoGuiaLoth();

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
  const previa = useMemo(
    () => (prep ? guiaAnteriorDelDespacho({ porPlan: prep.ultimasPorPlan, general: prep.ultimaGuia, generalNumero: prep.ultimaGuiaNumero }, planId) : null),
    [prep, planId],
  );
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
  /** Qué trajo de verdad la guía anterior al sembrar (la línea «Copiado de…»). */
  const [copiados, setCopiados] = useState<string[]>([]);
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const delLibro = useMemo(() => trozasDelPlan.filter((t) => elegidas.has(t.codigo)), [trozasDelPlan, elegidas]);
  const aMano = useTrozasAMano();
  /* La especie de cada troza a mano, juzgada como al registrar (catálogo + T7). */
  const especiesAMano = useEspeciesAMano({ catalogo: opts.catalogo, planId: planId ?? null, plan, filas: aMano.filas });
  /* El árbol de cada una (opcional), juzgado como al registrar (plan + especie del censo + T4). */
  const arbolesAMano = useArbolesAMano({ planId: planId ?? null, filas: aMano.filas });
  const piezasManuales = useMemo(
    () => trozasDelLibroAMano(piezasAMano(aMano.filas, delLibro.map((t) => t.codigo), arbolesAMano.porId), planId ?? null),
    [aMano.filas, delLibro, planId, arbolesAMano.porId],
  );
  const piezas = useMemo(() => [...delLibro, ...piezasManuales], [delLibro, piezasManuales]);
  /** El N° de lista y la llegada que se llenan solos (`use-traslado-guia-loth`). */
  const traslado = useTrasladoGuiaLoth({ datos, setDatos, talonario, trozas: piezas.length });

  /* Sembrar al llegar la identidad y cada vez que cambia el plan. La herencia
     de la guía anterior sólo completa lo vacío (`rellenarGuia` no pisa). Al
     CAMBIAR de plan se conserva lo escrito que no dicta el permiso, y el N°
     si el talonario es el mismo (`loth-guia-cambio-de-plan`, 15-10). */
  const sembradoPara = useRef<string | null | undefined>(undefined);
  const ultimaSiembra = useRef<(TalonarioDeLaGuia & { datos: GtfDatos }) | null>(null);
  const { sembrar: sembrarNumero } = numero;
  const { alSembrar } = traslado;
  useEffect(() => {
    if (!prep || !identidad || !talonario || !dueno || planId === undefined || sembradoPara.current === planId) return;
    sembradoPara.current = planId;
    const base = datosInicialesLoth(identidad, emision);
    const d = rellenarGuiaLoth(base, { ultimaGuia: previa?.datos ?? null, mismoPermiso: previa?.delPermiso, emision });
    const antes = ultimaSiembra.current;
    const ahora = { serie: talonario.serie, dueno, datos: d };
    ultimaSiembra.current = ahora;
    const final = antes ? conservarLoEscrito(d, datos, antes.datos) : d;
    setCopiados(previa ? loCopiadoDelDespacho(rellenarGuiaLoth(base, { ultimaGuia: null, emision }), d) : []);
    alSembrar(sembradaParaElTraslado(final, d));
    setDatos(final);
    setElegidas(new Set());
    if (!antes || !mismoTalonario(antes, ahora)) sembrarNumero(talonario);
  }, [prep, identidad, talonario, dueno, planId, emision, sembrarNumero, alSembrar, previa, datos]);

  /** El N° escrito a mano que se perdería al pasar a `otro` plan (otro talonario); `null` = nada se pierde. */
  const numeroQueSePierde = useCallback(
    (otro: string | null): string | null => {
      const actual = ultimaSiembra.current;
      if (!prep || !actual || !numero.escritoAMano) return null;
      return mismoTalonario(actual, talonarioDeOtroPlan(prep, otro)) ? null : numero.gtfNumber || numero.texto.trim();
    },
    [prep, numero.escritoAMano, numero.gtfNumber, numero.texto],
  );

  const gtfNumber = numero.gtfNumber;
  const repetida = numero.revision?.repetida ?? null;
  const faltan = useMemo(
    () => [
      ...faltantesDespachoLoth(datos, { gtfNumber, emision, trozas: piezas.length }),
      ...(repetida ? [{ seccion: "documento" as const, campo: "N° de GTF sin usar", motivo: `Ya va en la guía ${repetida.numero} de este titular` }] : []),
      ...especiesAMano.faltan,
      ...arbolesAMano.faltan,
    ],
    [datos, gtfNumber, emision, piezas.length, repetida, especiesAMano.faltan, arbolesAMano.faltan],
  );
  const guiasOrigen = useMemo(() => guiasParaOrigen(prep?.talonario.usadas ?? [], gtfNumber), [prep, gtfNumber]);

  /** «Rellenar con la libreta»: lo más usado del Directorio, sólo en lo vacío. */
  const rellenar = useCallback(
    (libreta: LibretaParaRellenar) => {
      setDatos((d) => rellenarGuiaLoth(d, { ultimaGuia: previa?.datos ?? null, mismoPermiso: previa?.delPermiso, emision, ...libreta }));
    },
    [previa, emision],
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
            trozas: delLibro.map((p) => p.codigo),
            /* Sólo las medidas: el volumen lo calcula el servidor. */
            aMano: aMano.filas.map(({ d1Cm, d2Cm, largoM, cantidad, especie, arbolId }) => ({
              d1Cm,
              d2Cm,
              largoM,
              cantidad,
              especie: especie ?? null,
              arbolId: arbolId ?? null,
            })),
            planId: planId ?? null,
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
          /** El código que quedó en la guía para cada troza a mano, en orden. */
          codigosAMano?: string[];
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
          piezas: [...delLibro, ...conCodigosDelServidor(piezasManuales, j.codigosAMano)],
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
    [enviando, faltan.length, identidad, gtfNumber, emision, piezas, delLibro, piezasManuales, aMano.filas, planId, datos, traslado.listas.texto, onRegistrada],
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
    numeroQueSePierde,
    plan,
    identidad,
    trozasDelPlan,
    elegidas,
    setElegidas,
    /** Las filas anotadas a mano (agregar / quitar) y sus trozas ya numeradas. */
    aMano,
    especiesAMano,
    arbolesAMano,
    piezasManuales,
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
    copiadaDe: previa && copiados.length ? { gtfNumber: previa.gtfNumber, delPermiso: previa.delPermiso, copiados } : null,
    registrar,
    enviando,
    error,
    pregunta,
    cancelarPregunta: () => setPregunta(null),
    registrada,
  };
}

export type DespachoGuiaLoth = ReturnType<typeof useDespachoGuiaLoth>;
