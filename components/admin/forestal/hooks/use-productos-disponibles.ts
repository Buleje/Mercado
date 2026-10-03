"use client";

/**
 * use-productos-disponibles — todo lo que la pestaña «Productos disponibles»
 * necesita (rediseño 2026-09-27, mismo formato que Trozas disponibles).
 *
 * Lee la foto del depósito (`/ctp?disponibles=1`, con `?contratoId=` si «Solo
 * este permiso» está prendido) SIEMPRE con lo marcado como usado: va aparte en
 * su indicador y su columna, nunca sumado. Antes se pedía sólo con un tilde y,
 * con la pantalla vacía, se hacía un SEGUNDO pedido para poder decir por qué
 * estaba vacía; ahora el mismo pedido trae las dos cosas.
 *
 * Filtro CRUZADO: elegir un permiso acota especies, productos, paquetes,
 * indicadores y gráficos. Cada tabla de grupos se cuenta sin SU propio filtro
 * (`excepto`), para poder cambiar de permiso desde la tabla de permisos.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useContratoActivo } from "@/contexts/contrato-activo-context";
import { applyCtpPeriodParams, type CtpPeriod } from "@/lib/forestal/ctp-period";
import { ctpGet, invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { conContratoId } from "@/lib/forestal/contrato-filtro";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import { exportSheetsToExcel } from "@/lib/export-excel";
import { resumenDeEdad } from "@/lib/forestal/edad-del-patio";
import { guardarEscuadriaDePaquete, type EscuadriaAGuardar } from "@/lib/forestal/escuadria-guardar";
import { alCambiarApartados } from "@/lib/forestal/apartados-evento";
import {
  leerBorradorDeReproceso,
  olvidarBorradorDeReproceso,
  olvidarTodosLosReprocesos,
  pendientesDeReproceso,
  type BorradorDeReproceso,
} from "@/lib/forestal/reproceso-borrador";
import {
  FILTRO_PRODUCTOS_VACIO,
  filasALaVista,
  filasDeProductos,
  ETIQUETA_AVISO_PRODUCTO,
  cuentaDeAvisos,
  facetasDeProductos,
  filtrarProductos,
  mismoValorDeFiltro,
  paquetesComoSeVen,
  pilaProductoEspecie,
  porGrupo,
  resumenProductos,
  type ClaveAvisoProducto,
  type CorridaDisponible,
  type FiltroProductos,
} from "@/lib/forestal/productos-disponibles-resumen";
import {
  filtrosEnTexto as filtrosEnTextoLib,
  hojasDeProductos,
  nombreArchivoProductos,
} from "@/lib/forestal/productos-disponibles-excel";
import { siguienteOrden, type CampoOrden, type Orden } from "@/lib/forestal/disponibles-orden";
import { productLabel } from "../ctp-shared";


/** Los filtros puestos, escritos como se leen (chips y hoja «Qué se exportó»). */
export const filtrosEnTexto = (f: FiltroProductos) => filtrosEnTextoLib(f, productLabel);

type CampoLista = "permiso" | "especie" | "producto" | "tramos";

/**
 * La foto del depósito, SIEMPRE con lo marcado usado. Una sola fuente de la url:
 * «Volumen disponible» pide la misma y `ctpGet` las junta en un pedido.
 */
export function urlDeProductosDisponibles(period: CtpPeriod, contratoFiltro: string | null): string {
  const qs = conContratoId(
    applyCtpPeriodParams(new URLSearchParams({ disponibles: "1" }), period),
    contratoFiltro,
  );
  qs.set("incluirUsados", "1");
  return `/api/admin/forestal/ctp?${qs}`;
}

/** Recorte que impone la pestaña que contiene a esta vista (permiso elegido arriba). */
export type RecorteCorridas = (c: CorridaDisponible) => boolean;

export function useProductosDisponibles(period: CtpPeriod, recorte?: RecorteCorridas) {
  const { contratoFiltro, activo } = useContratoActivo();
  const [corridas, setCorridas] = useState<CorridaDisponible[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Lo que pasó tras una acción: se dice arriba, no en un toast que se va. */
  const [nota, setNota] = useState<string | null>(null);
  const pedidoRef = useRef(0);

  const recargar = useCallback(async () => {
    const pedido = ++pedidoRef.current;
    setCargando(true);
    try {
      const r = await ctpGet<{ corridas?: CorridaDisponible[] }>(
        urlDeProductosDisponibles(period, contratoFiltro),
      );
      if (pedido !== pedidoRef.current) return;
      setCorridas(r.corridas ?? []);
      setError(null);
    } catch (e) {
      if (pedido !== pedidoRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (pedido === pedidoRef.current) setCargando(false);
    }
  }, [period, contratoFiltro]);

  useEffect(() => {
    void recargar();
  }, [recargar]);
  /* Una reserva liberada o extendida desde la campana de avisos. */
  useEffect(() => alCambiarApartados(() => void recargar()), [recargar]);

  /* Hoy, tomado en el navegador: calcularlo en el server daría otro día y un
     mismatch de hidratación. Hasta que monte, la edad dice «—». */
  const [ahora, setAhora] = useState<Date | null>(null);
  useEffect(() => setAhora(new Date()), []);

  const filas = useMemo(
    () => filasDeProductos(recorte ? corridas.filter(recorte) : corridas, ahora),
    [corridas, ahora, recorte],
  );

  const [filtro, setFiltro] = useState<FiltroProductos>(FILTRO_PRODUCTOS_VACIO);
  const poner = useCallback(
    <K extends keyof FiltroProductos>(campo: K, valor: FiltroProductos[K]) =>
      setFiltro((f) => ({ ...f, [campo]: valor })),
    [],
  );
  const limpiar = useCallback(() => setFiltro(FILTRO_PRODUCTOS_VACIO), []);
  const quitar = useCallback(
    (campo: keyof FiltroProductos) =>
      setFiltro((f) => ({ ...f, [campo]: FILTRO_PRODUCTOS_VACIO[campo] })),
    [],
  );
  /** Clic en una fila o una barra: la elige sola; otro clic la suelta. */
  const alternar = useCallback((campo: CampoLista, valor: string) => {
    setFiltro((f) => {
      const actual = f[campo] as readonly string[];
      const puesto = actual.some((v) => mismoValorDeFiltro(campo, v, valor));
      return { ...f, [campo]: puesto ? actual.filter((v) => !mismoValorDeFiltro(campo, v, valor)) : [valor] };
    });
  }, []);

  const filtradas = useMemo(() => filtrarProductos(filas, filtro), [filas, filtro]);
  const sin = useCallback(
    (c: keyof FiltroProductos) => filtrarProductos(filas, filtro, c),
    [filas, filtro],
  );
  const basePermiso = useMemo(() => sin("permiso"), [sin]);
  const baseEspecie = useMemo(() => sin("especie"), [sin]);
  const baseProducto = useMemo(() => sin("producto"), [sin]);
  const baseTramo = useMemo(() => sin("tramos"), [sin]);

  const resumen = useMemo(() => resumenProductos(filtradas, ahora), [filtradas, ahora]);
  const grupos = useMemo(
    () => ({
      permiso: porGrupo(basePermiso, "permiso"),
      especie: porGrupo(baseEspecie, "especie"),
      producto: porGrupo(baseProducto, "producto"),
    }),
    [basePermiso, baseEspecie, baseProducto],
  );
  const pila = useMemo(() => pilaProductoEspecie(baseProducto), [baseProducto]);
  const edad = useMemo(
    () =>
      resumenDeEdad(
        baseTramo.filter((f) => f.estado !== "usado").map((f) => ({ dias: f.dias, volumenM3: f.m3Libro })),
      ),
    [baseTramo],
  );
  /** La tabla de paquetes: lo usado sólo si el filtro de estado lo pide. */
  const aLaVista = useMemo(() => filasALaVista(filtradas, filtro.estado), [filtradas, filtro.estado]);
  /* El aviso tildado y el orden de «Paquete por paquete» viven acá: el Excel
     baja la tabla TAL COMO SE VE, igual que el CSV (revisión 27-09). */
  const [orden, setOrden] = useState<Orden>({ by: "edad", dir: "asc" });
  const onOrdenar = useCallback((c: CampoOrden) => setOrden((o) => siguienteOrden(o, c)), []);
  const [aviso, setAviso] = useState<ClaveAvisoProducto | null>(null);
  const cuentasAvisos = useMemo(() => cuentaDeAvisos(aLaVista), [aLaVista]);
  const paquetesVistos = useMemo(
    () => paquetesComoSeVen(aLaVista, aviso, orden, productLabel),
    [aLaVista, aviso, orden],
  );

  /* Las opciones de cada autofiltro salen de TODO lo leído, con su peso: si se
     achicaran con el filtro puesto, no se podría deshacer desde la cabecera. */
  const facetas = useMemo(() => facetasDeProductos(filas), [filas]);

  /* Reproceso sugerido por la distribución (ADR-404): una cola que se consume
     de a uno. `sessionStorage` no existe en el server: se lee en un efecto. */
  const [sugerido, setSugerido] = useState<BorradorDeReproceso | null>(null);
  const [pendientes, setPendientes] = useState(0);
  useEffect(() => {
    setSugerido(leerBorradorDeReproceso());
    setPendientes(pendientesDeReproceso());
  }, []);
  const avanzarCola = useCallback(() => {
    setSugerido(olvidarBorradorDeReproceso());
    setPendientes(pendientesDeReproceso());
  }, []);
  const descartarCola = useCallback(() => {
    olvidarTodosLosReprocesos();
    setSugerido(null);
    setPendientes(0);
  }, []);

  const [desmarcando, setDesmarcando] = useState<string | null>(null);
  /** Desmarcar no pide motivo: volver a mostrar lo sacado por error no se justifica igual que sacarlo. */
  const desmarcar = useCallback(
    async (c: CorridaDisponible) => {
      setDesmarcando(c.id);
      try {
        const r = await fetch("/api/admin/forestal/ctp", {
          method: "PATCH",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify({ id: c.id, action: "marcar_usado", usado: false }),
        });
        if (!r.ok) {
          const data = (await leerJson(r)) as { message?: string; error?: string } | null;
          throw new Error(data?.message ?? data?.error ?? `El servidor respondió ${r.status}`);
        }
        invalidarCtp("/forestal/ctp");
        setNota(`Corrida N° ${c.lineNo ?? "—"} vuelve a Productos disponibles.`);
        await recargar();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setDesmarcando(null);
      }
    },
    [recargar],
  );

  /** Escribe la escuadría del paquete; si el servidor rechaza, el modal muestra el error tal cual. */
  const guardarEscuadria = useCallback(
    async (medidas: EscuadriaAGuardar, alGuardar?: () => void) => {
      await guardarEscuadriaDePaquete(medidas);
      alGuardar?.();
      setNota(`Escuadría guardada: ${medidas.espesorCm} × ${medidas.anchoCm} cm · ${medidas.largoM} m.`);
      await recargar();
    },
    [recargar],
  );

  const [descargando, setDescargando] = useState(false);
  /** UN archivo: una hoja por tabla de la pantalla y «Qué se exportó». */
  const descargarExcel = useCallback(async (): Promise<string | null> => {
    setDescargando(true);
    try {
      const hoy = ahora ?? new Date();
      await exportSheetsToExcel(
        hojasDeProductos({
          filas: filtradas,
          paquetes: paquetesVistos,
          ahora: hoy,
          filtros: [
            ...filtrosEnTexto(filtro).map((c) => `${c.label}: ${c.texto}`),
            ...(aviso ? [`Paquetes: sólo «${ETIQUETA_AVISO_PRODUCTO[aviso]}»`] : []),
          ],
          alcance: contratoFiltro ? (activo?.codigo ?? null) : null,
          etiquetaProducto: productLabel,
        }),
        nombreArchivoProductos(hoy),
      );
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    } finally {
      setDescargando(false);
    }
  }, [ahora, filtradas, paquetesVistos, filtro, aviso, contratoFiltro, activo]);

  return {
    cargando,
    error,
    setError,
    nota,
    setNota,
    recargar,
    ahora,
    corridas,
    filas,
    filtradas,
    aLaVista,
    /** La tabla de paquetes tal como se ve (aviso + orden). */
    paquetesVistos,
    orden,
    onOrdenar,
    aviso,
    setAviso,
    cuentasAvisos,
    filtro,
    poner,
    limpiar,
    quitar,
    alternar,
    resumen,
    grupos,
    /** Las bases de cada tabla de grupos (sin su propio filtro), para abrir el detalle de una fila. */
    bases: { permiso: basePermiso, especie: baseEspecie, producto: baseProducto },
    pila,
    edad,
    facetas,
    sugerido,
    pendientes,
    avanzarCola,
    descartarCola,
    desmarcar,
    desmarcando,
    guardarEscuadria,
    descargarExcel,
    descargando,
    contratoFiltro,
    codigoPermisoActivo: activo?.codigo ?? null,
  };
}

export type EstadoProductosDisponibles = ReturnType<typeof useProductosDisponibles>;
