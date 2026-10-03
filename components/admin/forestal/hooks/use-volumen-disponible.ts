"use client";

/**
 * use-volumen-disponible — las cuatro pilas de madera de «Volumen disponible»
 * (Brandon 2026-10-03), sumadas sin contar dos veces la misma troza.
 *
 * Lee las MISMAS urls que las vistas de adentro (el patio, la foto del
 * depósito y los lotes del patio): `ctpGet` las junta, así que mirar «Trozas»
 * o «Productos» sola no vuelve a pedir nada. Las cuentas son las puras de
 * `lib/forestal/volumen-disponible` (con test).
 *
 * Se vuelve a leer cuando algo invalida el caché del libro (un despacho, un
 * apartado, un lote): los chips de arriba no pueden quedarse con la cifra de
 * antes mientras la vista de abajo ya muestra la nueva.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useContratoActivo } from "@/contexts/contrato-activo-context";
import { ctpGet, EVENTO_CTP_INVALIDADO, invalidacionToca } from "@/lib/forestal/ctp-fetch";
import { exportSheetsToExcel } from "@/lib/export-excel";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import type { LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import {
  clavePermiso,
  filasDeProductos,
  type CorridaDisponible,
} from "@/lib/forestal/productos-disponibles-resumen";
import {
  ETIQUETA_FUENTE,
  TODAS_LAS_FUENTES,
  entraPorPermiso,
  escribirFuentes,
  fuenteDeVistaVieja,
  leerFuentes,
  guiasPorRecepcionar,
  hojasDeVolumen,
  lotesConSobrante,
  opcionesDePermiso,
  partidasDeProductos,
  partidasDeTrozas,
  resumenVolumen,
  volumenPorGrupo,
  type FuenteVolumen,
  type FuentesPedidas,
} from "@/lib/forestal/volumen-disponible";
import { URL_LOTES_DEL_PATIO, urlDelPatio } from "./use-lotes-aserrio";
import { urlDeProductosDisponibles } from "./use-productos-disponibles";

export function useVolumenDisponible(
  period: CtpPeriod,
  fuentes: readonly FuenteVolumen[],
  permisos: readonly string[],
) {
  const { contratoFiltro, activo } = useContratoActivo();
  const [trozas, setTrozas] = useState<TrozaConsumible[]>([]);
  const [corridas, setCorridas] = useState<CorridaDisponible[]>([]);
  const [lotes, setLotes] = useState<LoteAserrio[]>([]);
  const [truncado, setTruncado] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /* Sólo escribe el último pedido: el patio entero (lento) no pisa al acotado. */
  const pedidoRef = useRef(0);

  const urls = useMemo(
    () => [urlDelPatio(contratoFiltro), urlDeProductosDisponibles(period, contratoFiltro), URL_LOTES_DEL_PATIO] as const,
    [period, contratoFiltro],
  );
  const recargar = useCallback(async () => {
    const pedido = ++pedidoRef.current;
    setCargando(true);
    /* Cada pila por su lado: si falla una, las otras igual se muestran y el
       error dice cuál faltó (una suma con una pila menos se avisa, no se calla). */
    const [rt, rp, rl] = await Promise.allSettled([
      ctpGet<{ trozas?: TrozaConsumible[]; truncado?: boolean }>(urls[0]),
      ctpGet<{ corridas?: CorridaDisponible[] }>(urls[1]),
      ctpGet<{ lotes?: LoteAserrio[] }>(urls[2]),
    ]);
    if (pedido !== pedidoRef.current) return;
    const fallas: string[] = [];
    if (rt.status === "fulfilled") {
      setTrozas(rt.value.trozas ?? []);
      setTruncado(rt.value.truncado === true);
    } else fallas.push(`el patio (${String(rt.reason instanceof Error ? rt.reason.message : rt.reason)})`);
    if (rp.status === "fulfilled") setCorridas(rp.value.corridas ?? []);
    else fallas.push(`los productos (${String(rp.reason instanceof Error ? rp.reason.message : rp.reason)})`);
    /* Los lotes sólo agregan estado y volumen apartado: sin ellos la pila de
       Lotes se cuenta igual, desde el patio. No es un error de la suma. */
    setLotes(rl.status === "fulfilled" ? (rl.value.lotes ?? []) : []);
    setError(fallas.length ? `No se pudo leer ${fallas.join(" ni ")}.` : null);
    setCargando(false);
  }, [urls]);

  useEffect(() => {
    void recargar();
  }, [recargar]);
  useEffect(() => {
    /* Sólo si se invalidó una de SUS urls: lo que escribe en cumplimiento o en
       jornadas no cambia ninguna pila y no tiene por qué releer el patio. */
    const alInvalidar = (e: Event) => {
      if (invalidacionToca(e, urls)) void recargar();
    };
    window.addEventListener(EVENTO_CTP_INVALIDADO, alInvalidar);
    return () => window.removeEventListener(EVENTO_CTP_INVALIDADO, alInvalidar);
  }, [recargar, urls]);

  /* Hoy, tomado en el navegador (en el server daría mismatch de hidratación). */
  const [ahora, setAhora] = useState<Date | null>(null);
  useEffect(() => setAhora(new Date()), [trozas, corridas]);

  const todas = useMemo(
    () => [...partidasDeTrozas(trozas), ...partidasDeProductos(filasDeProductos(corridas, ahora))],
    [trozas, corridas, ahora],
  );
  /** Las opciones de permiso salen de TODO: si se achicaran con el filtro, no se podría deshacer. */
  const opcionesPermiso = useMemo(() => opcionesDePermiso(todas), [todas]);
  const delPermiso = useMemo(
    () => todas.filter((p) => entraPorPermiso(p.permisoClave, permisos)),
    [todas, permisos],
  );
  /** Los chips dicen el m³ de CADA pila aunque no esté elegida: es lo que invita a sumarla. */
  const porPila = useMemo(() => resumenVolumen(delPermiso), [delPermiso]);
  const elegidas = useMemo(
    () => delPermiso.filter((p) => fuentes.includes(p.fuente)),
    [delPermiso, fuentes],
  );
  const resumen = useMemo(() => resumenVolumen(elegidas), [elegidas]);
  const porPermiso = useMemo(() => volumenPorGrupo(elegidas, "permiso"), [elegidas]);
  const porEspecie = useMemo(() => volumenPorGrupo(elegidas, "especie"), [elegidas]);

  const trozasDelPermiso = useMemo(
    () => trozas.filter((t) => entraPorPermiso(clavePermiso(t.permiso), permisos)),
    [trozas, permisos],
  );
  const filasLotes = useMemo(
    () => (ahora ? lotesConSobrante(trozasDelPermiso, lotes, ahora) : []),
    [trozasDelPermiso, lotes, ahora],
  );
  const filasRecepcion = useMemo(
    () => (ahora ? guiasPorRecepcionar(trozasDelPermiso, ahora) : []),
    [trozasDelPermiso, ahora],
  );

  const [descargando, setDescargando] = useState(false);
  const descargarExcel = useCallback(
    async (filtros: string[]): Promise<string | null> => {
      setDescargando(true);
      try {
        const hoy = new Date();
        await exportSheetsToExcel(
          hojasDeVolumen({
            resumen,
            fuentes,
            porPermiso,
            porEspecie,
            filtros,
            alcance: contratoFiltro ? (activo?.codigo ?? null) : null,
            ahora: hoy,
          }),
          `volumen-disponible-${fuentes.map((f) => ETIQUETA_FUENTE[f].toLowerCase().replace(/\s+/g, "-")).join("-")}-${hoy.toISOString().slice(0, 10)}`,
        );
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      } finally {
        setDescargando(false);
      }
    },
    [resumen, fuentes, porPermiso, porEspecie, contratoFiltro, activo],
  );

  return {
    cargando,
    /** Todavía no hay una cifra real: ni terminó la primera carga ni trajo algo. */
    sinDatosAun: cargando && trozas.length === 0 && corridas.length === 0,
    error,
    truncado,
    recargar,
    opcionesPermiso,
    porPila,
    resumen,
    porPermiso,
    porEspecie,
    filasLotes,
    filasRecepcion,
    descargarExcel,
    descargando,
    contratoFiltro,
    codigoPermisoActivo: activo?.codigo ?? null,
  };
}

export type EstadoVolumenDisponible = ReturnType<typeof useVolumenDisponible>;

const MEMORIA_FUENTES = "ctp-volumen-disponible:fuentes";
const PARAM_FUENTES = "fuentes";

/**
 * De dónde salen las pilas al abrir: la URL manda (un link compartido abre lo
 * mismo), después el nombre viejo de la pestaña (`?vista=trozas-disponibles`,
 * que el libro todavía no reescribió en este render), después la memoria. Sin
 * nada, «Todo»: la pregunta del pedido es cuánto hay en general.
 */
function fuentesIniciales(): FuenteVolumen[] {
  if (typeof window === "undefined") return [...TODAS_LAS_FUENTES];
  const sp = new URLSearchParams(window.location.search);
  const deUrl = leerFuentes(sp.get(PARAM_FUENTES));
  if (deUrl) return deUrl;
  const vieja = fuenteDeVistaVieja(sp.get("vista") ?? "");
  if (vieja) return [vieja];
  try {
    const guardadas = leerFuentes(localStorage.getItem(MEMORIA_FUENTES));
    if (guardadas) return guardadas;
  } catch {
    // localStorage puede fallar (modo privado): sin memoria, sin bug.
  }
  return [...TODAS_LAS_FUENTES];
}

function escribirEnUrl(fuentes: readonly FuenteVolumen[]) {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get(PARAM_FUENTES) === escribirFuentes(fuentes)) return;
    url.searchParams.set(PARAM_FUENTES, escribirFuentes(fuentes));
    /* `replace`: cambiar de chip no es una página nueva para el «atrás». */
    window.history.replaceState(window.history.state, "", url.toString());
  } catch {
    // history no disponible
  }
}

/**
 * Las pilas elegidas: URL + memoria. `pedidas` = un salto desde otra pantalla
 * («Ver trozas disponibles →» de Consumos); se aplica una vez y se avisa con
 * `onPedidasUsadas` para que volver por el menú no lo repita.
 */
export function useFuentesElegidas(pedidas: FuentesPedidas | null, onPedidasUsadas?: () => void) {
  const [fuentes, setEstado] = useState<FuenteVolumen[]>(fuentesIniciales);
  const elegir = useCallback((f: FuenteVolumen[]) => {
    setEstado(f);
    try {
      localStorage.setItem(MEMORIA_FUENTES, escribirFuentes(f));
    } catch {
      // sin persistencia, sin bug
    }
    escribirEnUrl(f);
  }, []);
  /* El link queda copiable desde el primer render. */
  useEffect(() => {
    escribirEnUrl(fuentes);
    // Sólo al montar: después escribe `elegir`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const usadasRef = useRef(onPedidasUsadas);
  usadasRef.current = onPedidasUsadas;
  useEffect(() => {
    if (!pedidas) return;
    elegir(pedidas.fuentes);
    usadasRef.current?.();
  }, [pedidas, elegir]);
  return [fuentes, elegir] as const;
}
