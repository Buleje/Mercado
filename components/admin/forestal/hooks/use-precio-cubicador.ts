"use client";

/**
 * El precio del lote del cubicador (ADR-430): el modo, lo puesto a mano y el
 * trato de cada dueño del Directorio, en un solo lugar.
 *
 * - **A mano**: el de la especie y el tipo si se puso (28-10), si no el de la
 *   especie, si no el general.
 * - **Aserrío / Venta**: cada pieza con dueño del Directorio usa el trato de
 *   ESE cliente para ese servicio (`precioDePieza`); lo que su trato no cubre
 *   —y las piezas sin dueño o con un dueño escrito a mano— va al precio a mano.
 *
 * Los precios a mano se leen en el INICIALIZADOR, no en un efecto: con la
 * carga en un efecto, el efecto que persiste corría primero y escribía `{}`
 * sobre lo guardado (medido en julio: los Resúmenes liquidaban todo el lote al
 * precio general). Se guardan por libreta (`espacio`), como el lote.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import { claveGrupo } from "@/lib/forestal/cubicacion-salidas";
import type { TipoComercial } from "@/lib/forestal/cubicacion-tipo";
import type { PreciosAManoDeGuardada } from "@/lib/forestal/precios-de-guardada";
import { slugKey } from "@/lib/forestal/sembrar-reparto";
import { hoyEnLima } from "@/lib/forestal/semana-de-registro";
import type { GrupoEspecies } from "@/lib/forestal/precio-cliente";
import {
  desglosePorPrecio,
  esModoPrecio,
  hayPrecioVariable,
  precioDePieza,
  type ContextoPrecio,
  type ModoPrecio,
} from "@/lib/forestal/precio-de-pieza";
import { useTratosDeClientes } from "./use-tratos-de-clientes";

const leer = (clave: string): string | null => {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
};
const guardar = (clave: string, valor: string) => {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    /* cuota llena o modo privado: el precio sigue en pantalla */
  }
};

/** Sin precios por especie y tipo: una sola referencia, para no rehacer el contexto en cada render. */
const SIN_PRECIOS: Readonly<Record<string, string>> = Object.freeze({});

/** La especie de una clave `claveGrupo` («tornillo|Corta» → «tornillo»). */
const especieDeClave = (clave: string) => clave.slice(0, clave.lastIndexOf("|"));

/** Lee `-precios-especie` (y `-precios-especie-tipo`) sin confiar en su forma. */
export function leerPreciosEspecie(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Lo que guarda el cubicador del precio, leído como lo lee él (Resúmenes lo reusa). */
export function leerPreciosGuardados(espacio = "") {
  const modo = leer(slugKey(`${espacio}-modo-precio`));
  const fecha = leer(slugKey(`${espacio}-precio-fecha`)) ?? "";
  return {
    precioPt: leer(slugKey(`${espacio}-precio`)) ?? "",
    preciosEspecie: leerPreciosEspecie(leer(slugKey(`${espacio}-precios-especie`))),
    /** Especie × tipo (`claveGrupo`) → texto. Le gana al de la especie (28-10). */
    preciosEspecieTipo: leerPreciosEspecie(leer(slugKey(`${espacio}-precios-especie-tipo`))),
    modo: esModoPrecio(modo) ? modo : ("manual" as ModoPrecio),
    /** El día del lote con que el cubicador eligió los tratos; `""` = no se guardó. */
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : "",
  };
}

/** Lo que el cubicador guarda del precio: lo que hace falta para valorizar. */
export type PreciosGuardados = ReturnType<typeof leerPreciosGuardados>;

/**
 * El resolver de precio del lote, de sólo lectura: el MISMO para el cubicador
 * y para Resúmenes, que lee el lote desde otra pestaña. Pide los tratos de los
 * dueños del Directorio sólo si el modo los usa.
 */
export function useResolverDePrecio(
  rows: readonly PiezaCubicada[],
  guardados: Pick<PreciosGuardados, "modo" | "precioPt" | "preciosEspecie" | "fecha"> & Partial<Pick<PreciosGuardados, "preciosEspecieTipo">>,
  grupos: readonly GrupoEspecies[],
  cargandoGrupos = false,
) {
  const { modo, precioPt, preciosEspecie, fecha, preciosEspecieTipo = SIN_PRECIOS } = guardados;
  const clientes = useMemo(
    () => [...new Set(rows.map((r) => r.duenoParteId).filter((id): id is string => Boolean(id)))],
    [rows],
  );
  const lectura = useTratosDeClientes(clientes, { activo: modo !== "manual" });

  const general = Number(precioPt) || 0;
  const ctx = useMemo<ContextoPrecio>(
    () => ({
      modo,
      aMano: { general, porEspecie: preciosEspecie, porEspecieTipo: preciosEspecieTipo },
      tratos: lectura.tratos,
      grupos,
      fecha: fecha || hoyEnLima(),
    }),
    [modo, general, preciosEspecie, preciosEspecieTipo, lectura.tratos, grupos, fecha],
  );

  const precioDe = useCallback((r: PiezaCubicada) => precioDePieza(r, ctx).precioPt, [ctx]);
  const conValor = useMemo(() => rows.some((r) => precioDe(r) > 0), [rows, precioDe]);
  const precioVariable = useMemo(() => hayPrecioVariable(rows, ctx), [rows, ctx]);
  const valorLote = useMemo(() => rows.reduce((a, r) => a + r.pieTablar * precioDe(r), 0), [rows, precioDe]);

  /* Con un trato por grupo, sin los grupos no se sabe el precio. */
  const usaGrupos = [...lectura.tratos.values()].some((ts) => ts.some((t) => t.grupos.length > 0));
  const calculando = modo !== "manual" && clientes.length > 0 && (lectura.cargando || (usaGrupos && cargandoGrupos));

  return {
    general,
    ctx,
    precioDe,
    conValor,
    precioVariable,
    valorLote,
    calculando,
    /** Clientes del lote cuyo trato no se pudo leer: sus piezas van al precio a mano. */
    erroresTrato: lectura.errores,
    clientes,
    recargarTratos: lectura.recargar,
  };
}

export function usePrecioCubicador({
  espacio = "",
  rows,
  fecha,
  grupos,
  cargandoGrupos = false,
}: {
  espacio?: string;
  rows: readonly PiezaCubicada[];
  /** El día del lote (`AAAA-MM-DD`): elige la versión vigente de cada trato. */
  fecha: string;
  grupos: readonly GrupoEspecies[];
  cargandoGrupos?: boolean;
}) {
  const [inicial] = useState(() => leerPreciosGuardados(espacio));
  const [precioPt, setPrecioPt] = useState(inicial.precioPt);
  const [preciosEspecie, setPreciosEspecie] = useState<Record<string, string>>(inicial.preciosEspecie);
  /* Se carga en el inicializador como los demás: un efecto que lo leyera
     correría DESPUÉS del que persiste y escribiría `{}` encima. */
  const [preciosEspecieTipo, setPreciosEspecieTipo] = useState<Record<string, string>>(inicial.preciosEspecieTipo);
  const [modo, setModo] = useState<ModoPrecio>(inicial.modo);

  useEffect(() => guardar(slugKey(`${espacio}-precio`), precioPt), [espacio, precioPt]);
  useEffect(() => guardar(slugKey(`${espacio}-precios-especie`), JSON.stringify(preciosEspecie)), [espacio, preciosEspecie]);
  useEffect(() => guardar(slugKey(`${espacio}-precios-especie-tipo`), JSON.stringify(preciosEspecieTipo)), [espacio, preciosEspecieTipo]);
  useEffect(() => guardar(slugKey(`${espacio}-modo-precio`), modo), [espacio, modo]);
  /* Resúmenes lee el mismo lote y tiene que elegir el MISMO trato: sin la fecha
     del lote, usaría la de hoy y podría caer en otra versión. */
  useEffect(() => guardar(slugKey(`${espacio}-precio-fecha`), fecha), [espacio, fecha]);

  const resolver = useResolverDePrecio(rows, { modo, precioPt, preciosEspecie, preciosEspecieTipo, fecha }, grupos, cargandoGrupos);
  const desglose = useMemo(() => desglosePorPrecio(rows, resolver.ctx), [rows, resolver.ctx]);

  const cambiarPrecioEspecie = useCallback((especie: string, texto: string) => {
    const k = especie.trim().toLowerCase();
    if (!k) return;
    setPreciosEspecie((p) => ({ ...p, [k]: texto }));
  }, []);
  /** El precio de UNA especie y UN tipo; vacío = vuelve al de la especie. */
  const cambiarPrecioEspecieTipo = useCallback((especie: string, tipo: TipoComercial, texto: string) => {
    if (!especie.trim()) return;
    const k = claveGrupo(especie, tipo);
    setPreciosEspecieTipo((p) => {
      if (texto.trim()) return { ...p, [k]: texto };
      if (!(k in p)) return p;
      const { [k]: _fuera, ...resto } = p;
      return resto;
    });
  }, []);
  /** «Limpiar»: los de cada especie y los de cada tipo; queda el general. */
  const limpiarPreciosEspecie = useCallback(() => {
    setPreciosEspecie({});
    setPreciosEspecieTipo({});
  }, []);
  /**
   * Reabrir una guardada (`preciosAManoDeGuardada`): SUS especies quedan con
   * los precios de ese día —los de cada tipo también, y los tipos que ese día
   * no tenían precio propio se borran—; las demás especies no se tocan.
   */
  const reponerPreciosDeEspecies = useCallback(({ especies, porEspecie, porEspecieTipo }: PreciosAManoDeGuardada) => {
    const suyas = new Set(especies);
    setPreciosEspecie((p) => {
      const n = { ...p };
      for (const k of suyas) n[k] = porEspecie[k] ?? "";
      return n;
    });
    setPreciosEspecieTipo((p) => ({
      ...Object.fromEntries(Object.entries(p).filter(([k]) => !suyas.has(especieDeClave(k)))),
      ...porEspecieTipo,
    }));
  }, []);

  return {
    ...resolver,
    modo,
    setModo,
    precioPt,
    setPrecioPt,
    preciosEspecie,
    cambiarPrecioEspecie,
    preciosEspecieTipo,
    cambiarPrecioEspecieTipo,
    limpiarPreciosEspecie,
    reponerPreciosDeEspecies,
    desglose,
  };
}

export type PrecioCubicador = ReturnType<typeof usePrecioCubicador>;
