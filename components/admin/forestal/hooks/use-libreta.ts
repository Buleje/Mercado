"use client";

/**
 * El estado de la ventana de la libreta (`LibretaModal`): qué categoría se ve,
 * qué se buscó, en qué orden, cuál está elegida y —a 400 px— si se ve la lista
 * o la ficha.
 *
 * El orden elegido y las marcas de «usado» se recuerdan en el navegador, por
 * negocio. El Directorio anota el uso recién al REGISTRAR la guía (una elegida
 * en una guía que no se emitió no sube en el ranking); la marca local hace que
 * «Recientes» ya la ponga arriba en la próxima guía del día.
 */

import { useCallback, useMemo, useState } from "react";
import { claveBusqueda, normalizarDocumento, normalizarPlaca, type Parte, type Vehiculo } from "@/lib/forestal/directorio";
import {
  categoriaDelBloque,
  categoriasVisibles,
  coincide,
  defCategoria,
  entradasDeCategoria,
  ordenarLibreta,
  type BloqueLibreta,
  type CategoriaLibreta,
  type EntradaLibreta,
  type MarcasDeUso,
  type OrdenLibreta,
  type ValorParte,
} from "@/lib/forestal/libreta";

/** Lo que la guía ya tiene escrito del vehículo. */
export interface VehiculoDeLaGuia {
  placa: string;
  placaRemolque?: string;
  marca: string;
  tipo: string;
}

const MAX_MARCAS = 300;

function slug(): string {
  try {
    return window.localStorage.getItem("active-tenant-slug") ?? "main";
  } catch {
    return "main";
  }
}

function leer<T>(clave: string, valido: (v: unknown) => v is T, porDefecto: T): T {
  try {
    const crudo = window.localStorage.getItem(clave);
    if (!crudo) return porDefecto;
    const v: unknown = JSON.parse(crudo);
    return valido(v) ? v : porDefecto;
  } catch {
    return porDefecto;
  }
}

function escribir(clave: string, v: unknown) {
  try {
    window.localStorage.setItem(clave, JSON.stringify(v));
  } catch {
    /* Modo privado o cuota llena: la libreta sigue andando sin recordar. */
  }
}

const esOrden = (v: unknown): v is OrdenLibreta => v === "recientes" || v === "usados" || v === "az";
const esMarcas = (v: unknown): v is Record<string, string> =>
  typeof v === "object" && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === "string");

/** La que coincide con lo ya escrito en el bloque: se abre con ella elegida. */
function preseleccion(
  entradas: EntradaLibreta[],
  borradorParte: ValorParte | undefined,
  borradorVehiculo: VehiculoDeLaGuia | undefined,
): string | null {
  const doc = normalizarDocumento(borradorParte?.docNumero ?? "");
  const nombre = claveBusqueda(borradorParte?.nombre ?? "");
  const placa = normalizarPlaca(borradorVehiculo?.placa ?? "");
  const hallada = entradas.find((e) =>
    e.tipo === "vehiculo"
      ? Boolean(placa) && normalizarPlaca(e.vehiculo.placa) === placa
      : (Boolean(doc) && e.parte.docNumero === doc) || (Boolean(nombre) && claveBusqueda(e.parte.nombre) === nombre),
  );
  return hallada?.id ?? null;
}

export function useLibreta({
  bloque,
  partes,
  vehiculos,
  borradorParte,
  borradorVehiculo,
}: {
  bloque: BloqueLibreta;
  /** `null`: esta pantalla no tiene las partes a mano (sólo vehículos). */
  partes: readonly Parte[] | null;
  vehiculos: readonly Vehiculo[] | null;
  borradorParte?: ValorParte;
  borradorVehiculo?: VehiculoDeLaGuia;
}) {
  const claves = useMemo(() => {
    const s = slug();
    return { orden: `buleje-libreta-orden-${s}`, marcas: `buleje-libreta-uso-${s}` };
  }, []);
  const delBloque = categoriaDelBloque(bloque);
  const [categoria, setCategoria] = useState<CategoriaLibreta>(delBloque);
  const [q, setQ] = useState("");
  const [orden, setOrdenEstado] = useState<OrdenLibreta>(() => leer(claves.orden, esOrden, "recientes"));
  const [marcas, setMarcas] = useState<MarcasDeUso>(() => leer(claves.marcas, esMarcas, {}));
  const [elegidaId, setElegidaId] = useState<string | null>(() =>
    preseleccion(entradasDeCategoria(delBloque, partes, vehiculos), borradorParte, borradorVehiculo),
  );
  const [vistaMovil, setVistaMovil] = useState<"lista" | "ficha">("lista");

  const visibles = useMemo(() => categoriasVisibles(bloque, partes, vehiculos), [bloque, partes, vehiculos]);
  /** Cuántas hay en cada categoría con lo buscado: la cifra de cada pestaña. */
  const secciones = useMemo(
    () =>
      visibles.map((c) => ({
        clave: c,
        rotulo: defCategoria(c).rotulo,
        cuenta: entradasDeCategoria(c, partes, vehiculos).filter((e) => coincide(e, q)).length,
      })),
    [visibles, partes, vehiculos, q],
  );
  const lista = useMemo(
    () => ordenarLibreta(entradasDeCategoria(categoria, partes, vehiculos).filter((e) => coincide(e, q)), orden, marcas),
    [categoria, partes, vehiculos, q, orden, marcas],
  );
  /* Derivada, sin efecto: si lo elegido no está en esta categoría o en lo
     buscado, la ficha muestra la primera de la lista. */
  const elegida = lista.find((e) => e.id === elegidaId) ?? lista[0] ?? null;
  /** Con la búsqueda vacía en esta categoría, dónde sí hay: «hay 2 en Propietarios». */
  const enOtra = lista.length === 0 && q ? secciones.find((s) => s.clave !== categoria && s.cuenta > 0) ?? null : null;

  const setOrden = useCallback(
    (o: OrdenLibreta) => {
      setOrdenEstado(o);
      escribir(claves.orden, o);
    },
    [claves],
  );

  /**
   * «Usar»: la marca local que sube a la entrada en «Recientes». Se escribe en
   * el momento, no dentro del `setState`: usar cierra la ventana en el mismo
   * gesto, y el actualizador de un componente que se desmonta no corre.
   */
  const marcarUso = useCallback(
    (id: string) => {
      const nuevas = Object.fromEntries(
        Object.entries({ ...marcas, [id]: new Date().toISOString() })
          .sort(([, a], [, b]) => b.localeCompare(a))
          .slice(0, MAX_MARCAS),
      );
      escribir(claves.marcas, nuevas);
      setMarcas(nuevas);
    },
    [claves, marcas],
  );

  const elegir = useCallback((id: string, abrirFicha = false) => {
    setElegidaId(id);
    if (abrirFicha) setVistaMovil("ficha");
  }, []);

  const cambiarCategoria = useCallback((c: CategoriaLibreta) => {
    setCategoria(c);
    setVistaMovil("lista");
  }, []);

  return {
    categoria,
    delBloque,
    cambiarCategoria,
    secciones,
    q,
    setQ,
    orden,
    setOrden,
    marcas,
    marcarUso,
    lista,
    elegida,
    elegir,
    enOtra,
    vistaMovil,
    setVistaMovil,
  };
}

export type EstadoLibreta = ReturnType<typeof useLibreta>;
