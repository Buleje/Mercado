import { useEffect, useSyncExternalStore } from "react";
import { logger } from "@/lib/logger";
import type { NombreTercero } from "@/lib/documentos/terceros-vinculo";
import { pedirTerceros } from "./use-terceros";

/**
 * Los nombres (y alias) de los terceros ligados, para las marcas del árbol y
 * «Vínculos con el sistema…». UNA petición para todas las filas: cada fila
 * que monta pide sólo si su clave falta, y la misma promesa se comparte. Una
 * clave que el servidor no devolvió no se vuelve a pedir hasta `refrescar…`.
 */

type Nombres = Readonly<Record<string, NombreTercero>>;

const VACIO: Nombres = {};
let nombres: Nombres = VACIO;
let pidiendo: Promise<void> | null = null;
const pedidas = new Set<string>();
const oyentes = new Set<() => void>();

function avisar(): void {
  for (const oir of oyentes) oir();
}

function pedir(): Promise<void> {
  if (pidiendo) return pidiendo;
  pidiendo = pedirTerceros<{ nombres?: Record<string, NombreTercero> }>({ solo: "nombres" })
    .then((r) => {
      nombres = r.nombres ?? VACIO;
      avisar();
    })
    .catch((err: unknown) => {
      // Sin nombres la marca igual se ve: el ⓘ dice el tipo («Comunidad o titular sin ficha»).
      logger.warn("[archivo.vinculos] no cargaron los nombres", { error: String(err) });
    })
    .finally(() => {
      pidiendo = null;
    });
  return pidiendo;
}

function suscribir(oir: () => void): () => void {
  oyentes.add(oir);
  return () => {
    oyentes.delete(oir);
  };
}

/** Tras ligar, quitar o renombrar: se vuelve a pedir todo. */
export function refrescarNombresVinculos(): Promise<void> {
  pedidas.clear();
  return pedir();
}

/** Lo que se acaba de ligar o renombrar se ve al instante, antes de que conteste el servidor. */
export function ponerNombreVinculo(clave: string, n: Partial<NombreTercero>): void {
  const previo = nombres[clave];
  nombres = { ...nombres, [clave]: { ...previo, ...n, nombre: n.nombre ?? previo?.nombre ?? "" } };
  avisar();
}

/** Los nombres conocidos; pide al servidor si falta alguna de `claves`. */
export function useNombresVinculos(claves: readonly string[]): Nombres {
  const actual = useSyncExternalStore(suscribir, () => nombres, () => VACIO);
  const firma = claves.join("|");
  useEffect(() => {
    if (!firma) return;
    const faltan = firma.split("|").filter((c) => !(c in nombres) && !pedidas.has(c));
    if (faltan.length === 0) return;
    for (const c of faltan) pedidas.add(c);
    void pedir();
  }, [firma]);
  return actual;
}
